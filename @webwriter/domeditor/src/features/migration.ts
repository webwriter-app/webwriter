import {EditorFeature} from "."
import type {WebWriterPackage} from "../packages"

/** One package migration run: the package's `migrate.js` source and the
 * outer HTML of each of its widgets found in the incoming content. */
export type MigrationRequest = {
  packageName: string
  version: string
  source: string
  tagNames: string[]
  items: string[]
}

/** Returns the migrated outer HTML of each item, in order. */
export type MigrationRunner = (request: MigrationRequest, timeout: number) => Promise<unknown>

/** How long one package's migration may take before its result is ignored. */
export const migrationTimeout = 3_000
const maximumSourceBytes = 5_000_000
const maximumOutputGrowth = 1_000_000

/** Runs package code in an opaque-origin frame, so it cannot reach the
 * editor or the application. Each run gets a fresh frame, which is removed
 * after the result or the timeout. */
function sandboxRunner(nonce: () => string, mount: (frame: HTMLIFrameElement) => void, currentSignal: () => AbortSignal): MigrationRunner {
  return (request, timeout) => new Promise((resolve, reject) => {
    const signal = currentSignal()
    const frame = document.createElement("iframe")
    frame.setAttribute("sandbox", "allow-scripts")
    frame.setAttribute("aria-hidden", "true")
    frame.tabIndex = -1
    frame.style.display = "none"
    // The frame inherits the editor's CSP; the nonce admits only this runner,
    // which imports the package source from a blob URL.
    frame.srcdoc = `<!doctype html><script nonce="${nonce().replaceAll(/[^A-Za-z0-9+/=_-]/g, "")}" type="module">
window.addEventListener("message", async event => {
  const {source, packageName, version, tagNames, items} = event.data
  const url = URL.createObjectURL(new Blob([source], {type: "text/javascript"}))
  try {
    await import(url)
    const results = []
    for(const item of items) {
      document.body.innerHTML = item
      const selector = tagNames.join(",")
      for(const element of [...document.body.querySelectorAll(selector)]) {
        try { element.dispatchEvent(new CustomEvent("migrate", {bubbles: true, detail: {packageName, version}})) }
        catch {}
      }
      await new Promise(resolve => setTimeout(resolve))
      results.push(document.body.innerHTML)
    }
    parent.postMessage({type: "widget-migration", results}, "*")
  }
  catch(error) {
    parent.postMessage({type: "widget-migration", error: String(error)}, "*")
  }
  finally { URL.revokeObjectURL(url) }
}, {once: true})
</script>`
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (callback: () => void) => {
      clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      window.removeEventListener("message", onMessage)
      frame.remove()
      callback()
    }
    const onMessage = (event: MessageEvent) => {
      if(event.source !== frame.contentWindow || event.data?.type !== "widget-migration") return
      finish(() => event.data.error ? reject(new Error(String(event.data.error))) : resolve(event.data.results))
    }
    const abort = () => finish(() => reject(new Error("The package migration was canceled")))
    if(signal.aborted) { abort(); return }
    signal.addEventListener("abort", abort, {once: true})
    window.addEventListener("message", onMessage)
    frame.addEventListener("load", () => frame.contentWindow?.postMessage(request, "*"), {once: true})
    timer = setTimeout(() => finish(() => reject(new Error("The package migration timed out"))), timeout)
    try { mount(frame) }
    catch(error) { finish(() => reject(error)) }
  })
}

/** Gives installed packages' `migrate.js` scripts a chance to update their
 * widgets in content entering the document. A migration that fails, times
 * out, or returns no element leaves those widgets unchanged. */
export class MigrationFeature extends EditorFeature {
  #controller = new AbortController()
  runner: MigrationRunner = sandboxRunner(() => this.editor.trustedScriptNonce, frame => this.editor.addAppendix(frame), () => this.#controller.signal)
  readonly #sources = new Map<string, Promise<string>>()

  enable() {
    if(this.isEnabled) return
    if(this.#controller.signal.aborted) this.#controller = new AbortController()
    super.enable()
  }

  disable() {
    this.#controller.abort()
    this.#sources.clear()
    super.disable()
  }

  async #wait<T>(operation: Promise<T>, signal: AbortSignal) {
    let abort!: () => void
    const canceled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error("The package migration was canceled"))
      if(signal.aborted) abort()
      else signal.addEventListener("abort", abort, {once: true})
    })
    try { return await Promise.race([operation, canceled]) }
    finally { signal.removeEventListener("abort", abort) }
  }

  #migrations(packages: readonly WebWriterPackage[] = this.editor.features.dependency.installedPackages) {
    return packages.flatMap(pkg => {
      const tagNames = pkg.members.flatMap(member => member.kind === "widget" && member.tagName ? [member.tagName.toLowerCase()] : [])
      return pkg.migrationUrl && tagNames.length ? [{pkg, url: pkg.migrationUrl, tagNames}] : []
    })
  }

  /** Whether `html` contains a widget of a package with a migration. */
  needsMigration(html: string) {
    const tagNames = this.#migrations().flatMap(({tagNames}) => tagNames)
    if(!tagNames.length) return false
    const lowered = html.toLowerCase()
    return tagNames.some(tagName => lowered.includes(`<${tagName}`))
  }

  #source(url: string) {
    let request = this.#sources.get(url)
    if(!request) {
      request = fetch(url, {signal: this.#controller.signal}).then(async response => {
        if(!response.ok) throw new Error(`Migration download failed (${response.status})`)
        const source = await response.text()
        if(source.length > maximumSourceBytes) throw new RangeError("The migration script is too large")
        return source
      })
      this.#sources.set(url, request)
      request.catch(() => { if(this.#sources.get(url) === request) this.#sources.delete(url) })
    }
    return request
  }

  /** Returns `html` with each package's widgets replaced by its migration's
   * result, where that result is usable. */
  async migrate(html: string) {
    if(!this.isEnabled) return html
    const signal = this.#controller.signal
    const migrations = this.#migrations()
    if(!migrations.length || !this.needsMigration(html)) return html
    const template = document.createElement("template")
    template.innerHTML = html
    for(const {pkg, url, tagNames} of migrations) {
      const selector = tagNames.join(",")
      // Nested widgets of the same package migrate with their outermost one.
      const elements = Array.from(template.content.querySelectorAll(selector))
        .filter(element => !element.parentElement?.closest(selector))
      if(!elements.length) continue
      const items = elements.map(element => element.outerHTML)
      let results: unknown
      try {
        const source = await this.#wait(this.#source(url), signal)
        if(signal.aborted) return html
        results = await this.#wait(this.runner({packageName: pkg.name, version: pkg.version, source, tagNames, items}, migrationTimeout), signal)
        if(signal.aborted) return html
      }
      catch(error) {
        if(signal.aborted) return html
        console.warn(`Migration of ${pkg.name} was skipped:`, error)
        continue
      }
      if(!Array.isArray(results) || results.length !== items.length) continue
      elements.forEach((element, index) => {
        const result = results[index]
        if(typeof result !== "string" || result === items[index]
          || result.length > items[index].length + maximumOutputGrowth) return
        const replacement = document.createElement("template")
        replacement.innerHTML = result
        if(!replacement.content.querySelector("*")) return
        element.replaceWith(replacement.content)
      })
    }
    return template.innerHTML
  }
}
