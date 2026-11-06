import type {DomEditor} from "../src/components/dom-editor"
import type {AppSettings} from "../src/app-settings"

export async function checkPreviewEditing(assert: (condition: unknown, message: string) => void) {
  const appFrame = document.createElement("iframe")
  appFrame.style.cssText = "position:fixed;inset:0;width:1280px;height:900px;background:white"
  appFrame.src = "/editor/"
  document.body.append(appFrame)
  try {
    const waitFor = async <T>(read: () => T | null | undefined | Promise<T | null | undefined>, message: string) => {
      for(let attempt = 0; attempt < 200; attempt++) {
        const result = await read()
        if(result) return result
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      throw new Error(message)
    }
    const app = await waitFor(() => {
      const editor = appFrame.contentDocument?.querySelector<DomEditor>("dom-editor")
      return editor?.shadowRoot?.querySelector("iframe.editor-frame") && editor
    }, "The app editor did not initialize")
    const host = app as unknown as {
      waitForEditorWindow(): Promise<Window>
      reloadDocument(html: string): Promise<void>
      currentPreviewHTMLFromFrame(): Promise<string>
      editorSrcdocFromHTML(html: string | null): string
      bridgeNonce: string
      settings: AppSettings
    }
    await host.waitForEditorWindow()
    // Install a test probe alongside the trusted editor entry. The app still
    // opens its normal cross-origin frame and uses the real preview bridge.
    const renderEditor = host.editorSrcdocFromHTML.bind(host)
    host.editorSrcdocFromHTML = html => renderEditor(html).replace("</head>",
      `<script class="◆ ◆editor-only" type="module" nonce="${host.bridgeNonce}" src="/tests/preview-editing-probe.ts"></script></head>`)
    await host.reloadDocument("<!doctype html><html><body><p>Keep this text</p></body></html>")
    await app.updateComplete
    let editorFrame = app.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")!
    const probe = (command: "place-caret" | "try-typing" | "state") => new Promise<{
      text: string, designMode: string, caret: number, blocked?: boolean, inserted?: boolean
    }>((resolve, reject) => {
      const channel = new MessageChannel()
      const timer = setTimeout(() => {
        channel.port1.close()
        reject(new Error(`The editor frame did not answer the ${command} probe`))
      }, 5000)
      channel.port1.onmessage = ({data}) => {
        clearTimeout(timer)
        channel.port1.close()
        if(data.error) reject(new Error(data.error))
        else resolve(data)
      }
      editorFrame.contentWindow!.postMessage({type: "probe-preview-editing", command}, new URL(editorFrame.src).origin, [channel.port2])
    })

    const ribbon = app.shadowRoot!.querySelector("app-ribbon")!
    const preview = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".preview-button")!
    const snapshot = host.currentPreviewHTMLFromFrame.bind(host)
    let snapshotPending = false
    let finishSnapshot!: () => void
    const snapshotGate = new Promise<void>(resolve => {finishSnapshot = resolve})
    host.currentPreviewHTMLFromFrame = async () => {
      snapshotPending = true
      await snapshotGate
      return snapshot()
    }
    appFrame.focus()
    editorFrame.focus()
    const before = await probe("place-caret")
    assert(before.designMode === "on" && before.caret === 4, "The authoring document did not start with an editable caret")
    preview.click()
    try {
      assert(ribbon.shadowRoot!.activeElement === preview, "Preview did not move focus out of the authoring frame")
      await waitFor(() => snapshotPending, "The preview did not request a snapshot")
      const pending = await probe("try-typing")
      assert(pending.designMode === "off" && pending.blocked && !pending.inserted && pending.text === before.text,
        "The authoring document accepted input while the preview snapshot was pending")
    }
    finally { finishSnapshot() }
    await waitFor(() => app.shadowRoot!.querySelector("iframe.preview-frame"), "Preview did not open")
    const during = await probe("try-typing")
    assert(during.designMode === "off" && during.blocked && !during.inserted && during.text === before.text,
      "The hidden authoring document accepted input during preview")

    preview.click()
    const after = await waitFor(async () => {
      const state = await probe("state")
      return state.designMode === "on" && state.caret === 4 ? state : null
    }, "Returning from preview did not resume native editing")
    assert(after.text === before.text, "Returning from preview changed the text")
    const edited = await probe("try-typing")
    assert(!edited.blocked && edited.inserted && edited.text === "Keep! this text", "Typing did not resume at the saved caret")

    host.currentPreviewHTMLFromFrame = async () => { throw new Error("Preview snapshot failed") }
    preview.click()
    await waitFor(() => app.shadowRoot!.querySelector(".file-error")?.textContent?.includes("Preview snapshot failed"),
      "A preview snapshot failure was not reported")
    await waitFor(async () => {
      const state = await probe("state")
      return state.designMode === "on" && state.caret === edited.caret
    }, "A failed preview left the authoring document locked or lost the caret")

    app.shadowRoot!.querySelector<HTMLButtonElement>(".file-error button")!.click()
    host.settings = {...host.settings, activeCloudServiceId: null, cloudServicesConfigured: true}
    host.currentPreviewHTMLFromFrame = snapshot
    preview.click()
    await waitFor(() => app.shadowRoot!.querySelector("iframe.preview-frame"), "Preview did not reopen")
    const file = new File(["<p>Opened lesson</p>"], "opened.html", {type: "text/html"})
    appFrame.contentWindow!.confirm = () => true
    Object.defineProperty(appFrame.contentWindow, "showOpenFilePicker", {
      configurable: true, value: async () => [{name: file.name, getFile: async () => file}],
    })
    ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.shadowRoot!.querySelector("button")!.click()
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    const open = await waitFor(() => !menu.hidden && menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Open"]') || null,
      "The File menu did not offer Open in Preview")
    open.click()
    await app.updateComplete
    const previous = editorFrame
    editorFrame = await waitFor(() => {
      const error = app.shadowRoot!.querySelector(".file-error span")?.textContent
      if(error) throw new Error(`Opening a file in Preview failed: ${error}`)
      const frame = app.shadowRoot!.querySelector<HTMLIFrameElement>("iframe.editor-frame")
      return frame !== previous && frame && !frame.hidden && !frame.inert ? frame : null
    }, "Opening a file in Preview did not reveal the replacement editor")
    assert(!app.shadowRoot!.querySelector("iframe.preview-frame"), "The previous document's preview remained visible")
    const opened = await probe("state")
    assert(opened.designMode === "on" && opened.text === "Opened lesson", "The opened file was not ready for native editing")
  }
  finally { appFrame.remove() }
}
