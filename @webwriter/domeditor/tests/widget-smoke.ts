import {DomEditor} from "../src/components/dom-editor"
import {WebWriterPackageRegistry, type WebWriterPackage} from "../src/packages"
import {initializeEditorMessage, loadWidgetsMessage} from "../src/editor-bridge"
import type {DOMEditor} from "../src/domeditor"

const registry = new WebWriterPackageRegistry()
const status = document.querySelector<HTMLElement>("#status")!
const stage = document.querySelector<HTMLElement>("#stage")!
const report = document.querySelector<HTMLElement>("#report")!
const results = document.querySelector<HTMLElement>("#results")!
const params = new URLSearchParams(location.search)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const records: object[] = []
let availablePackages: WebWriterPackage[] = []
// Components marked uninsertable need their documented parent context.
const fixtures: Record<string, string> = {
  "@webwriter/quiz": `<webwriter-quiz>
    <webwriter-task><webwriter-task-prompt slot="prompt"><p>Complete the sentence.</p></webwriter-task-prompt>
      <webwriter-task-hint slot="hint"><p>A primary color.</p></webwriter-task-hint>
      <webwriter-cloze><p>The sky is <webwriter-cloze-gap>blue</webwriter-cloze-gap>.</p></webwriter-cloze>
      <webwriter-task-explainer slot="explainer"><p>Blue is a primary color.</p></webwriter-task-explainer>
    </webwriter-task>
    <webwriter-task><webwriter-task-prompt slot="prompt"><p>Match the pairs.</p></webwriter-task-prompt>
      <webwriter-pairing><webwriter-pairing-item><p>One</p></webwriter-pairing-item><webwriter-pairing-item><p>1</p></webwriter-pairing-item></webwriter-pairing>
    </webwriter-task>
  </webwriter-quiz>`,
  "@webwriter/branching-scenario": `<webwriter-branching-scenario>
    <webwriter-gamebook-page id="start"><p>Start</p><webwriter-gamebook-button></webwriter-gamebook-button><webwriter-gamebook-branch-button></webwriter-gamebook-branch-button></webwriter-gamebook-page>
    <webwriter-gamebook-popup id="popup"><p>Details</p></webwriter-gamebook-popup>
    <webwriter-gamebook-branch id="branch"></webwriter-gamebook-branch>
  </webwriter-branching-scenario>`,
}

function record(name: string, detail: object) {
  records.push({name, ...detail})
  const row = document.createElement("tr")
  const label = document.createElement("td")
  label.textContent = name
  const value = document.createElement("td")
  value.textContent = JSON.stringify(detail, (key, value) => key === "html" || key === "bounds" || key === "embeds" ? undefined : value)
  row.append(label, value)
  results.append(row)
  report.textContent = JSON.stringify(records, null, 2)
}

async function mount(pkg: WebWriterPackage) {
  // Use the real editor frame bootstrap/CSP without a connected application,
  // saved documents, installed-package preferences, or a backend session.
  const app = new DomEditor() as unknown as {
    editorSrcdoc: string, bridgeNonce: string, installedPackages: WebWriterPackage[],
    editorDocument: Document, currentPreviewHTML(): string,
  }
  const additional = (params.get("also") ?? "").split(",").map(name => `@webwriter/${name}`)
  const packages = [pkg, ...availablePackages.filter(candidate => additional.includes(candidate.name) && candidate.name !== pkg.name)]
  app.installedPackages = packages
  const frame = document.createElement("iframe")
  frame.title = pkg.label
  frame.sandbox.add("allow-scripts", "allow-same-origin")
  frame.srcdoc = app.editorSrcdoc
  const loaded = new Promise(resolve => frame.addEventListener("load", resolve, {once: true}))
  stage.replaceChildren(frame)
  await loaded
  const win = frame.contentWindow! as Window & {editor: DOMEditor}
  win.document.documentElement.lang = "en"
  const errors: string[] = []
  win.addEventListener("error", event => errors.push(event.error?.stack ?? event.message))
  win.addEventListener("unhandledrejection", event => errors.push(String(event.reason?.stack ?? event.reason)))
  win.document.addEventListener("securitypolicyviolation", event => errors.push(`CSP ${event.violatedDirective}: ${event.blockedURI} (${event.sourceFile}:${event.lineNumber})`))
  win.postMessage({type: initializeEditorMessage, bridgeNonce: app.bridgeNonce, syncUrl: `ws://127.0.0.1:1234/widget-smoke-${crypto.randomUUID()}`}, location.origin)
  for(let attempt = 0; !win.editor && attempt < 300; attempt++) await delay(50)
  if(!win.editor) throw new Error("Editor initialization timed out")
  let timer: ReturnType<typeof setTimeout>
  try {
    await Promise.race([
      win.editor.features.dependency.loadWidgets({
        type: loadWidgetsMessage,
        widgets: packages.map(({name, version}) => ({name, version})),
        packages,
      }),
      new Promise((_, reject) => {timer = setTimeout(() => reject(new Error("Package load timed out")), 30_000)}),
    ])
  }
  finally { clearTimeout(timer!) }
  app.editorDocument = win.document
  return {app, frame, win, errors}
}

async function run() {
  records.length = 0
  results.replaceChildren()
  status.textContent = "Loading catalog…"
  availablePackages = await registry.search()
  const catalog = availablePackages.filter(pkg => !params.get("package") || pkg.name === `@webwriter/${params.get("package")}`)
  for(const pkg of catalog) {
    status.textContent = `Loading ${pkg.name}@${pkg.version}`
    let context: Awaited<ReturnType<typeof mount>>
    try { context = await mount(pkg) }
    catch(error) { record(pkg.name, {loadError: String(error)}); continue }
    const {win, errors} = context
    const missing = pkg.members.filter(member => member.kind === "widget" && !win.customElements.get(member.tagName!)).map(member => member.tagName)
    record(`${pkg.name}@${pkg.version}`, {widgets: pkg.members.filter(member => member.kind === "widget").length, tags: pkg.members.filter(member => member.kind === "widget").map(member => member.tagName), missing, errors: errors.splice(0)})
    const members = pkg.members.filter(member => member.insertable && (!params.get("member") || member.exportName.includes(params.get("member")!)))
    const cases = (params.has("default") ? members.slice(0, 1) : members).map(member => ({
      name: member.exportName,
      html: () => member.kind === "snippet" ? registry.fetchSnippet(member) : `<${member.tagName}></${member.tagName}>`,
    }))
    if(params.has("fixture")) cases.splice(0, cases.length, ...(fixtures[pkg.name] ? [{name: "nested components fixture", html: () => fixtures[pkg.name]}] : []))
    for(const member of cases) {
      // Some published widgets retain timers after removal. An isolated mode
      // distinguishes their teardown errors from the next member's startup.
      if(params.has("isolated")) {
        context.win.editor.destroy()
        context = await mount(pkg)
      }
      const {win, errors} = context
      status.textContent = `Inserting ${pkg.name}: ${member.name}`
      try {
        const html = await member.html()
        let doc = win.document
        doc.body.replaceChildren(doc.createElement("p"))
        doc.getSelection()!.setPosition(doc.body.firstChild, 0)
        win.editor.getActionHandler("insert")({type: "insert", html})
        await delay(500)
        if(params.has("preview") || params.has("export")) {
          const preview = document.createElement("iframe")
          preview.title = `${pkg.label} ${params.has("export") ? "export" : "preview"}`
          preview.sandbox.add("allow-scripts", "allow-same-origin")
          preview.srcdoc = params.has("export") ? await win.editor.serializeHTML() : context.app.currentPreviewHTML()
          const loaded = new Promise(resolve => preview.addEventListener("load", resolve, {once: true}))
          stage.append(preview)
          await loaded
          await delay(1000)
          doc = preview.contentDocument!
          context.frame.hidden = true
        }
        const widgets = Array.from(doc.body.querySelectorAll<HTMLElement>("*")).filter(element => element.localName.includes("-"))
        const bounds = widgets.map(element => {
          const rect = element.getBoundingClientRect()
          return {tag: element.localName, defined: Boolean(doc.defaultView!.customElements.get(element.localName)), shadow: Boolean(element.shadowRoot), width: Math.round(rect.width), height: Math.round(rect.height)}
        })
        const embeds = Array.from(doc.body.querySelectorAll("iframe")).map(frame => ({src: frame.src, sandbox: frame.getAttribute("sandbox"), height: Math.round(frame.getBoundingClientRect().height)}))
        record(`${pkg.name}: ${member.name}`, {inputLength: html.length, html: doc.body.innerHTML.slice(0, 1200), bounds, embeds, errors: [...new Set(errors.splice(0))]})
      }
      catch(error) { record(`${pkg.name}: ${member.name}`, {error: (error as Error)?.stack ?? String(error), errors: errors.splice(0)}) }
    }
    context.win.editor.destroy()
  }
  status.textContent = `Complete: ${catalog.length} packages, ${records.length - catalog.length} insertions`
}

document.querySelector<HTMLButtonElement>("#run")!.addEventListener("click", event => {
  const button = event.currentTarget as HTMLButtonElement
  button.disabled = true
  void run().catch(error => {status.textContent = String(error)}).finally(() => {button.disabled = false})
})
