import {editorFrameHTML, previewFrameHTML} from "../src/frame-document"
import type {DOMEditor} from "../src/domeditor"

export async function checkRemoteWebsite(assert: (condition: unknown, message: string) => void, host: DOMEditor) {
  const origin = new URLSearchParams(location.search).get("embedOrigin")
  assert(origin, "Run through scripts/native-browser.mjs to start the HTTPS fixture")
  const token = crypto.randomUUID()
  const frame = document.createElement("iframe")
  const reports: MessageEvent[] = []
  const receive = (event: MessageEvent) => {
    if(event.data?.token === token) reports.push(event)
  }
  window.addEventListener("message", receive)
  const options = {bridgeNonce: crypto.randomUUID(), hostOrigin: location.origin, revision: 0,
    language: "en", packages: [], executeScripts: true,
    entryURL: new URL("./native-browser-frame.ts", import.meta.url).href}
  const load = async (html: string) => {
    frame.contentWindow?.editor?.destroy()
    const loaded = new Promise<void>(resolve => frame.addEventListener("load", () => resolve(), {once: true}))
    frame.srcdoc = html
    if(!frame.isConnected) host.addAppendix(frame)
    await loaded
  }
  const report = async (count: number) => {
    for(let attempt = 0; reports.length < count && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const result = reports[count - 1]
    assert(result?.source === frame.contentDocument?.querySelector("iframe")?.contentWindow, "Website did not report from its iframe")
    assert(result?.origin === origin, `Website lost its real origin: ${result?.origin}`)
    assert(!result.data.error && result.data.lesson === "Remote lesson" && result.data.storage === "works", `Website fetch or storage failed: ${JSON.stringify(result.data)}`)
    assert(result.data.parentBlocked && result.data.topBlocked, "Website can read the editor or application DOM")
  }
  try {
    await load(editorFrameHTML(`<section><!--keep--><iframe title="Lesson" src="${origin}/?token=${token}"></iframe></section>`, options))
    await report(1)
    for(let attempt = 0; !frame.contentWindow?.editor && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const editor = frame.contentWindow?.editor as DOMEditor | undefined
    assert(editor, "Editing frame did not initialize")
    const saved = await editor!.serializeHTML()
    const source = new DOMParser().parseFromString(saved, "text/html")
    assert(source.querySelector("iframe")?.getAttribute("sandbox") === "allow-scripts allow-same-origin", "Export changed remote sandbox permissions")
    await load(previewFrameHTML(source, {...options, importMap: null, frameOrigin: location.origin,
      entryURL: new URL("../src/preview-entry.ts", import.meta.url).href}))
    await report(2)
    await load(saved)
    await report(3)
    // Replacing a running remote website with an upload must tighten the
    // sandbox before navigation, including the very first local script.
    await load(editorFrameHTML(`<iframe src="${origin}/?token=${token}"></iframe>`, options))
    await report(4)
    for(let attempt = 0; !frame.contentWindow?.editor && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const view = frame.contentWindow as Window & typeof globalThis
    assert(view.editor, "Editing frame did not initialize before replacing a website")
    const website = view.document.querySelector("iframe")!
    view.editor!.features.selection.selectElement(website)
    const localHTML = `<p>Local lesson</p><script nonce="${options.bridgeNonce}">
      const result = {token: ${JSON.stringify(token)}};
      try { parent.document.body; result.parentBlocked = false } catch { result.parentBlocked = true }
      try { top.document.body; result.topBlocked = false } catch { result.topBlocked = true }
      top.postMessage(result, "*")
    </script>`
    assert(view.editor!.features.media.actions.setMediaFile({type: "setMediaFile",
      file: new view.File([localHTML], "lesson.html", {type: "text/html"})}), "Website upload failed")
    for(let attempt = 0; reports.length < 5 && attempt < 200; attempt++) await new Promise(resolve => setTimeout(resolve, 25))
    const result = reports[4]
    assert(result?.source === website.contentWindow && result.origin === "null", "Website upload retained a real origin")
    assert(result.data.parentBlocked && result.data.topBlocked, "Website upload exposed WebWriter's DOM")
    assert(website.getAttribute("sandbox") === "allow-scripts", "Website upload retained remote permissions")
  }
  finally {
    frame.contentWindow?.editor?.destroy()
    window.removeEventListener("message", receive)
    frame.remove()
  }
}
