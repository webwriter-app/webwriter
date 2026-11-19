import {renderSandbox, sandboxDocument, sandboxBootstrapSource} from "../../widget/sandbox.js"
import {editorFrameHTML, previewFrameHTML} from "../src/frame-document"
import type {DOMEditor} from "../src/domeditor"

/** The same widget API runs under the actual editing and preview policies. */
export async function checkSandboxRunner(assert: (value: unknown, message: string) => void, editor: DOMEditor) {
  const container = document.createElement("iframe")
  const token = crypto.randomUUID()
  const reports: {source: MessageEventSource | null, origin: string, kind: string, isolated?: boolean, order?: string[], kept?: boolean}[] = []
  const message = (event: MessageEvent) => {
    if(event.data?.token === token) reports.push({source: event.source, origin: event.origin, ...event.data})
  }
  window.addEventListener("message", message)
  const options = {bridgeNonce: crypto.randomUUID(), revision: 0, language: "en", packages: [], hostOrigin: location.origin,
    entryURL: new URL("./native-browser-frame.ts?proofreading-disabled", import.meta.url).href, executeScripts: true}
  const wait = async (predicate: () => unknown, reason: string) => {
    for(let attempt = 0; attempt < 200; attempt++) {
      if(predicate()) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error(reason)
  }
  const send = (kind: string) => `top.postMessage({token:${JSON.stringify(token)},kind:${JSON.stringify(kind)}}, "*")`
  try {
    for(const mode of ["editing", "preview"] as const) {
      container.contentWindow?.editor?.destroy()
      const html = "<!doctype html><html><head></head><body><!--authored--><ww-runner-test></ww-runner-test></body></html>"
      const loaded = new Promise<void>(resolve => container.addEventListener("load", () => resolve(), {once: true}))
      container.srcdoc = mode === "editing" ? editorFrameHTML(html, options)
        : previewFrameHTML(new DOMParser().parseFromString(html, "text/html"), {...options, frameOrigin: location.origin, importMap: null,
          entryURL: new URL("../src/preview-entry.ts", import.meta.url).href})
      if(!container.isConnected) editor.addAppendix(container)
      await loaded
      const doc = container.contentDocument!
      const host = doc.querySelector("ww-runner-test")!
      const shadow = host.attachShadow({mode: "open"})
      const frame = doc.createElement("iframe")
      frame.title = "Sandbox runner test"
      shadow.append(frame)
      const before = doc.body.innerHTML
      const external = `data:text/javascript,${encodeURIComponent('globalThis.sandboxOrder.push("external")')}`
      renderSandbox(frame, `<!doctype html><body><!--keep--><unfamiliar-element data-kept="yes"><svg viewBox="0 0 1 1"><path/></svg></unfamiliar-element>
        <script type="application/json" id="data">{"value":"kept"}</script>
        <script>globalThis.sandboxOrder = ["classic"];</script>
        <script src="${external}"></script>
        <script type="module">globalThis.sandboxOrder.push("module");</script>
        <script>
          let isolated = false; try { parent.document.body } catch { isolated = true }
          top.postMessage({token:${JSON.stringify(token)},kind:${JSON.stringify(mode)},isolated,order:sandboxOrder,
            kept:document.querySelector("unfamiliar-element")?.getAttribute("data-kept") === "yes"
              && document.querySelector("path")?.namespaceURI === "http://www.w3.org/2000/svg"
              && JSON.parse(document.getElementById("data").textContent).value === "kept"}, "*");
        </script></body>`)
      await wait(() => reports.some(report => report.kind === mode && report.source === frame.contentWindow), `${mode} runner did not execute`)
      const result = reports.find(report => report.kind === mode && report.source === frame.contentWindow)!
      assert(result.origin === "null" && result.isolated, `${mode} runner could access its parent`)
      assert(result.order?.join(",") === "classic,external,module", `${mode} scripts ran out of order`)
      assert(result.kept, `${mode} changed unfamiliar HTML, namespaces or inert script data`)
      assert(doc.body.innerHTML === before, `${mode} runner modified authored light DOM`)
      renderSandbox(frame, `<script>if (typeof sandboxOrder === "undefined") { ${send(mode + "-fresh")} }</script>`)
      await wait(() => reports.some(report => report.kind === mode + "-fresh" && report.source === frame.contentWindow), `${mode} reused the old execution realm`)

      // Even the authorized bootstrap cannot activate data in an ordinary
      // parent-accessible srcdoc frame (the editing origin is nonopaque too).
      const unsafe = doc.createElement("iframe")
      unsafe.srcdoc = sandboxDocument(`<script>${send(mode + "-unsafe")}</script>`)
      shadow.append(unsafe)
      await new Promise<void>(resolve => unsafe.addEventListener("load", () => resolve(), {once: true}))
      await new Promise(resolve => setTimeout(resolve, 50))
      assert(!reports.some(report => report.kind === mode + "-unsafe"), "bootstrap ran without sandbox isolation")

      // Appending the public bootstrap itself to the editor must be harmless.
      const payload = doc.createElement("script")
      payload.type = "application/json"
      payload.textContent = JSON.stringify(`<script>${send(mode + "-parent")}</script>`)
      const bootstrap = doc.createElement("script")
      bootstrap.textContent = sandboxBootstrapSource
      doc.body.append(payload, bootstrap)
      await new Promise(resolve => setTimeout(resolve, 50))
      assert(!reports.some(report => report.kind === mode + "-parent"), "bootstrap activated user code in the parent")
    }
  }
  finally {
    window.removeEventListener("message", message)
    container.contentWindow?.editor?.destroy()
    container.remove()
  }
}
