import {appendSerializedAssets} from "../serialization"
import { EditorFeature } from "."
import { DOMEditor } from "../domeditor"
import {isLoadWidgetsMessage, loadWidgetsMessage, type LoadWidgetsMessage} from "../editor-bridge"
import {packageCdnUrl, packageInsertionItems, packageTestTimeout, packageWidgetSchemaDefinitions, resolvePackageExport, WebWriterPackageRegistry, type PackageTestCase, type PackageTestResult, type WebWriterPackage} from "../packages"
import {Schema} from "../schema"
import {LOCAL_PACKAGE_ROUTE_PREFIX} from "../local-package-worker"
import {packageImportMapScript, packageModuleEntries, runtimeDocumentBaseURL, type PackageDependencyPlan} from "../package-dependencies"

const escapeHTMLAttribute = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")

export class DependencyFeature extends EditorFeature {
  private readonly packageRegistry = new WebWriterPackageRegistry()
  private widgetAssets: HTMLElement[] = []
  private widgetPackages: WebWriterPackage[] = []
  private dependencyPlan: PackageDependencyPlan | null = null
  private widgetLoadSequence = 0
  private readonly pendingAssetCancellations = new Set<() => void>()

  actions = {
    [loadWidgetsMessage]: (message: LoadWidgetsMessage) => this.loadWidgets(message),
    runPackageTest: ({scriptUrl, styleUrl}: {type: "runPackageTest", scriptUrl: string, styleUrl?: string}) => (
      this.runPackageTest(scriptUrl, styleUrl)
    ),
  }

  /** Runs a package's `./tests/*` module in a separate frame and collects its
   * `test-update` events. The frame keeps test fixtures out of the edited
   * document; like widget scripts, test code is trusted package code on the
   * editor's origin, so local package resources resolve. */
  runPackageTest(scriptUrl: string, styleUrl?: string, timeout = packageTestTimeout): Promise<PackageTestResult> {
    const url = new URL(scriptUrl, runtimeDocumentBaseURL())
    if(!/^https?:$/.test(url.protocol)) throw new TypeError("Package tests must load over HTTP(S)")
    const nonce = escapeHTMLAttribute(this.editor.trustedScriptNonce)
    const token = crypto.randomUUID()
    const importMap = this.dependencyPlan?.map ? packageImportMapScript(document, this.dependencyPlan.map).outerHTML.replace("<script", `<script nonce="${nonce}"`) : ""
    const frame = document.createElement("iframe")
    frame.setAttribute("aria-hidden", "true")
    frame.tabIndex = -1
    frame.style.cssText = "position: fixed; width: 800px; height: 600px; left: -10000px; top: 0; border: 0"
    frame.srcdoc = `<!doctype html><html><head>${importMap}
<script nonce="${nonce}">
for(const type of ["test-update", "error", "unhandledrejection"]) window.addEventListener(type, event => {
  const detail = type === "test-update" ? event.detail : {type: "error", message: String(event.reason ?? event.message ?? event.error)}
  parent.postMessage({token: "${token}", detail: JSON.parse(JSON.stringify(detail ?? null))}, self.origin)
})
document.addEventListener("error", event => {
  if(event.target instanceof HTMLScriptElement) parent.postMessage({token: "${token}", detail: {type: "error", message: "The test module failed to load: " + event.target.src}}, self.origin)
}, true)
</script>
${styleUrl ? `<link rel="stylesheet" nonce="${nonce}" href="${escapeHTMLAttribute(styleUrl)}">` : ""}
<script nonce="${nonce}" type="module" src="${escapeHTMLAttribute(url.href)}"></script>
</head><body><div id="mocha"></div></body></html>`
    return new Promise(resolve => {
      const tests = new Map<string, PackageTestCase>()
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (status: PackageTestResult["status"], error?: string) => {
        clearTimeout(timer)
        window.removeEventListener("message", onMessage)
        frame.remove()
        const cases = [...tests.values()]
        resolve({status: status === "passed" && cases.some(test => !test.passed) ? "failed" : status, tests: cases, ...(error ? {error} : {})})
      }
      const onMessage = (event: MessageEvent) => {
        if(event.source !== frame.contentWindow || event.data?.token !== token) return
        const detail = event.data.detail as Record<string, unknown> | null
        if(detail?.type === "afterOne" && typeof detail.id === "string") {
          tests.set(detail.id, {
            id: detail.id,
            path: Array.isArray(detail.path) ? detail.path.map(String) : [detail.id],
            passed: detail.passed === true,
            ...(typeof detail.duration === "number" ? {duration: detail.duration} : {}),
            ...(detail.timedOut === true ? {timedOut: true} : {}),
          })
        }
        else if(detail?.type === "afterAll") finish("passed")
        else if(detail?.type === "error" && !tests.size) finish("error", String(detail.message))
      }
      window.addEventListener("message", onMessage)
      timer = setTimeout(() => finish("timeout"), timeout)
      this.editor.addAppendix(frame)
    })
  }

  constructor(editor: DOMEditor) {
    super(editor)
  }

  /** Adds runtime resources required by the detached authored document. */
  appendSerializedAssets(root: Document) {
    appendSerializedAssets(root, this.widgetPackages, this.dependencyPlan?.map)
  }

  get packageDependencyPlan() { return this.dependencyPlan }

  /** Packages whose widgets are currently loaded. */
  get installedPackages(): readonly WebWriterPackage[] { return this.widgetPackages }

  /** Resolves pinned widget-package assets and mounts them in the iframe. */
  async loadWidgets(message: LoadWidgetsMessage) {
    if(!isLoadWidgetsMessage(message)) throw new TypeError("Invalid load-widgets message")

    const sequence = ++this.widgetLoadSequence
    // A newer request supersedes any asset barrier from the previous request.
    // Resolve those waits so an old action cannot remain pending forever.
    this.pendingAssetCancellations.forEach(cancel => cancel())
    this.pendingAssetCancellations.clear()
    const suppliedPackages = new Map((message.packages ?? []).map(pkg => [`${pkg.name}@${pkg.version}`, pkg]))
    const widgetReferences = [...new Map(message.widgets.map(widget => [
      `${widget.name}@${widget.version}`,
      widget,
    ])).values()]
    const packages = await Promise.all(widgetReferences.map(widget => (
      suppliedPackages.get(`${widget.name}@${widget.version}`) ?? this.packageRegistry.getPackage(widget)
    )))
    if(sequence !== this.widgetLoadSequence) return
    const entries = packageModuleEntries(packages)
    if(entries.length && !message.importMap) throw new Error("Import-map packages require a resolved map before widget loading")
    const plan: PackageDependencyPlan = {entries, map: message.importMap ?? null}
    globalThis.DOMEDITOR_PACKAGE_ITEMS = packageInsertionItems(packages)
    const widgetDefinitions = packageWidgetSchemaDefinitions(packages)
    this.editor.schema = new Schema()
    this.editor.schema.extendWidgets(widgetDefinitions)
    this.editor.features.widget.refresh()
    // Old cached metadata can still infer CSS that a wildcard export never
    // published. Only that inferred CSS is optional; explicit assets must load.
    const inferredStyles = new Set(packages.flatMap(pkg => Object.entries(pkg.manifest?.exports ?? {}).flatMap(([exportName, target]) => {
      const resolved = resolvePackageExport(target)
      return exportName.startsWith("./widgets/") && resolved?.endsWith(".*")
        ? [packageCdnUrl(pkg.name, pkg.version, resolved.slice(0, -1) + "css")]
        : []
    })))

    this.widgetAssets.forEach(element => element.remove())
    const importMap = plan.map ? packageImportMapScript(document, plan.map, true) : null
    if(importMap) importMap.nonce = this.editor.trustedScriptNonce
    const styles = [...new Set(packages.flatMap(pkg => pkg.styles))].map(href => {
      const link = document.createElement("link")
      link.rel = "stylesheet"
      link.href = href
      link.nonce = this.editor.trustedScriptNonce
      link.classList.add("◆", "◆editor-only")
      return link
    })
    const scripts = [...new Set(packages.flatMap(pkg => pkg.scripts))].map(src => {
      const script = document.createElement("script")
      script.type = "module"
      script.src = src
      // Package bundles are an explicit trusted-code boundary. The editor
      // frame's nonce admits these resources while blocking authored scripts.
      script.nonce = this.editor.trustedScriptNonce
      script.classList.add("◆", "◆editor-only")
      return script
    })
    this.widgetPackages = packages
    this.dependencyPlan = plan
    this.widgetAssets = [...(importMap ? [importMap] : []), ...styles, ...scripts]
    const assetLoads = this.widgetAssets.map(element => {
      if(element === importMap) return Promise.resolve()
      const url = element instanceof HTMLLinkElement ? element.href : (element as HTMLScriptElement).src
      const local = new URL(url, runtimeDocumentBaseURL()).pathname.startsWith(LOCAL_PACKAGE_ROUTE_PREFIX)
      return new Promise<void>((resolve, reject) => {
        let settled = false
        const settle = (callback: () => void) => {
          if(settled) return
          settled = true
          this.pendingAssetCancellations.delete(cancel)
          callback()
        }
        const cancel = () => settle(resolve)
        this.pendingAssetCancellations.add(cancel)
        element.addEventListener("load", () => settle(resolve), {once: true})
        element.addEventListener("error", () => settle(() => {
          if(element instanceof HTMLLinkElement && inferredStyles.has(url)) resolve()
          else reject(new Error(
            `${local ? "Local package" : "Package"} ${element instanceof HTMLLinkElement ? "stylesheet" : "script"} failed to load: ${url}`,
          ))
        }), {once: true})
      })
    })
    // Import maps must register before any module in this graph is fetched.
    if(importMap) document.head.prepend(importMap)
    document.head.append(...styles, ...scripts)
    await Promise.all(assetLoads)
    if(sequence !== this.widgetLoadSequence) return
    this.editor.features.insertion.menu.requestUpdate()
  }

  enable() {
    if(this.isEnabled) return
    super.enable()
  }

  disable() {
    if(!this.isEnabled) return
    this.widgetLoadSequence++
    this.pendingAssetCancellations.forEach(cancel => cancel())
    this.pendingAssetCancellations.clear()
    this.widgetAssets.forEach(element => element.remove())
    this.widgetAssets = []
    this.widgetPackages = []
    this.dependencyPlan = null
    globalThis.DOMEDITOR_PACKAGE_ITEMS = []
    super.disable()
  }
}
