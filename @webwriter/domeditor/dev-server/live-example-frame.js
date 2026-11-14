import {reconcileExampleContent} from "../src/example-content.ts"

// This function is serialized into the sandbox. Keep its dependencies local to it.
function runLiveExample(importModule, reconcile) {
  const preview = document.querySelector("#preview")
  const nonce = document.currentScript.nonce
  let editing = false
  let collaboration = false
  let sharedReading = false
  let editingController
  let initialized = false
  let lastHTML = ""
  let lastShadow = ""
  let lastData = new Map()
  const dataSelector = 'script[type="application/json" i][slot="data"]:not([src])'

  function dataBlocks() {
    return new Map([...preview.querySelectorAll(dataSelector)].flatMap((block, index) => {
      const host = block.parentElement
      if(!host.localName.includes("-")) return []
      const scope = host.getAttribute("shared")
      const key = JSON.stringify([host.localName, host.id || index, scope])
      return [[key, {block, mode: scope === "group" ? "group" : scope === null ? "individual" : "all"}]]
    }))
  }

  function announceData(block, mode) {
    block.dispatchEvent(new CustomEvent("datachange", {bubbles: true, detail: {mode}}))
  }

  preview.addEventListener("datarequest", event => {
    if(!collaboration || !event.target.matches?.(dataSelector)) return
    for(const {block, mode} of dataBlocks().values()) {
      if(block !== event.target) continue
      event.preventDefault()
      announceData(block, mode)
      break
    }
  })

  function syncEditingMode() {
    for(const element of preview.querySelectorAll("*")) {
      if(!element.localName.includes("-") && !element.hasAttribute("is")) continue
      const value = element.getAttribute("contenteditable")
      if(editing && value === null) element.setAttribute("contenteditable", "")
      else if(!editing && value === "") element.removeAttribute("contenteditable")
    }
  }

  function updateHTML(html) {
    const template = document.createElement("template")
    template.innerHTML = html
    template.content.querySelectorAll("base, embed, fencedframe, frame, iframe, link, meta, object, portal, script")
      .forEach(element => {
        if(element.matches('script[type="application/json" i][slot="data"]:not([src])')) return
        element.remove()
      })
    const authoredHTML = template.innerHTML

    reconcile(preview, [...template.content.childNodes])
    syncEditingMode()
    editingController?.refresh()
    return authoredHTML
  }

  function escapeText(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  }

  function shadowMarkup(node, depth) {
    const indent = "  ".repeat(depth)
    if(node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim()
      return text ? [indent + escapeText(text)] : []
    }
    if(node.nodeType !== Node.ELEMENT_NODE || node.matches("style, script")) return []
    const comment = node.nextSibling?.nodeType === Node.COMMENT_NODE ? ` <!--${node.nextSibling.data}-->` : ""
    if(!node.children.length) return [indent + node.outerHTML + comment]
    const tag = node.prefix ? `${node.prefix}:${node.localName}` : node.localName
    const attributes = [...node.attributes].map(({name, value}) => ` ${name}="${escapeText(value).replaceAll('"', "&quot;")}"`).join("")
    return [
      `${indent}<${tag}${attributes}>`,
      ...[...node.childNodes].flatMap(child => shadowMarkup(child, depth + 1)),
      `${indent}</${tag}>`,
    ]
  }

  function openShadowRoots(container) {
    return [...container.querySelectorAll("*")].flatMap(element => element.shadowRoot
      ? [element.shadowRoot, ...openShadowRoots(element.shadowRoot)] : [])
  }

  function readShadowDOM(roots) {
    return roots.flatMap(root => ["#shadow-root ▼", ...[...root.childNodes].flatMap(node => shadowMarkup(node, 1))]).join("\n")
  }

  async function loadSource(source, runtime, shared) {
    if(runtime) {
      const script = document.createElement("script")
      script.nonce = nonce
      script.textContent = runtime
      document.head.append(script)
      script.remove()
    }
    const urls = []
    const moduleURL = code => {
      const url = URL.createObjectURL(new Blob([code], {type: "text/javascript"}))
      urls.push(url)
      return url
    }
    const imports = {}
    for(const [specifier, module] of Object.entries(globalThis.__liveExampleModules ?? {})) {
      const exports = Object.keys(module).map((name, index) =>
        `const value${index} = globalThis.__liveExampleModules[${JSON.stringify(specifier)}][${JSON.stringify(name)}]; export {value${index} as ${JSON.stringify(name)}};`)
      imports[specifier] = moduleURL(exports.join("\n"))
    }
    for(const [specifier, code] of shared ?? []) imports[specifier] = moduleURL(code)
    if(Object.keys(imports).length) {
      const map = document.createElement("script")
      map.type = "importmap"
      map.nonce = nonce
      map.textContent = JSON.stringify({imports})
      document.head.append(map)
    }
    // A shared module can be imported after the initial render.
    window.addEventListener("pagehide", () => urls.forEach(url => URL.revokeObjectURL(url)), {once: true})
    await importModule(moduleURL(source))
  }

  async function render({id, source, html, runtime, shared}) {
    let error
    let authoredHTML
    const captureError = event => {
      if(typeof event.message !== "string") return
      error ??= event.message
      event.preventDefault()
    }
    window.addEventListener("error", captureError)
    try {
      authoredHTML = updateHTML(html)
      if(!initialized) {
        initialized = true
        await loadSource(source, runtime, shared)
      }
      // Let the widget finish its queued DOM updates before reading the result.
      await Promise.resolve()
      if(!error) return {id, authoredHTML}
    }
    catch(reason) { error ??= String(reason) }
    finally {
      if(error && source === undefined) {
        try { updateHTML(lastHTML) }
        catch { /* Keep the original error for the reader. */ }
      }
      window.removeEventListener("error", captureError)
    }
    return {id, error}
  }

  // The preview stays in its own document when a reader tries an authored link.
  preview.addEventListener("click", event => {
    if(event.composedPath().some(node => node instanceof Element && node.matches("a[href], area[href]"))) {
      event.preventDefault()
    }
  })

  function connect(event) {
    if(event.source !== parent || event.data?.type !== "live-example-connect" || event.ports.length !== 1) return
    window.removeEventListener("message", connect)
    const [port] = event.ports
    let renderedId
    const mutations = {subtree: true, childList: true, attributes: true, characterData: true}
    const observer = new MutationObserver(() => {
      syncEditingMode()
      const roots = observePreview()
      const data = syncData(true)
      const html = preview.innerHTML
      const shadow = readShadowDOM(roots)
      if(html === lastHTML && shadow === lastShadow && !data.length) return
      port.postMessage({id: renderedId, changed: true, html: html === lastHTML ? undefined : html, shadow, data})
      lastHTML = html
      lastShadow = shadow
    })
    function syncData(relay) {
      if(!collaboration) return []
      const changes = []
      const next = new Map()
      for(const [key, {block, mode}] of dataBlocks()) {
        const text = block.textContent
        const previous = lastData.get(key)
        next.set(key, {block, text})
        if(previous?.block === block && previous.text === text) continue
        if(relay && sharedReading && mode !== "individual") changes.push([key, text])
        announceData(block, mode)
      }
      lastData = next
      return changes
    }
    function observePreview() {
      observer.disconnect()
      observer.observe(preview, mutations)
      const roots = openShadowRoots(preview)
      for(const root of roots) observer.observe(root, mutations)
      return roots
    }
    new ResizeObserver(() => {
      if(renderedId) port.postMessage({id: renderedId, resize: true, height: document.body.getBoundingClientRect().height})
    }).observe(document.body, {box: "border-box"})
    port.onmessage = async ({data}) => {
      if(typeof data?.editing === "boolean") {
        editing = data.editing
        collaboration = data.collaboration === true
        sharedReading = data.sharedReading === true
        if(editing && !globalThis.__liveExampleEditing && typeof data.editor === "string") {
          const script = document.createElement("script")
          script.nonce = nonce
          script.textContent = data.editor
          document.head.append(script)
          script.remove()
        }
        if(editing && !editingController && globalThis.__liveExampleEditing) {
          try { editingController = globalThis.__liveExampleEditing.mount(preview) }
          catch(error) { port.postMessage({editorError: String(error)}) }
        } else if(!editing && editingController) {
          try { editingController.destroy() }
          catch(error) { port.postMessage({editorError: String(error)}) }
          finally { editingController = undefined }
        }
        syncEditingMode()
        return
      }
      if(sharedReading && data?.id === renderedId && Array.isArray(data.data)) {
        const blocks = dataBlocks()
        for(const [key, text] of data.data) {
          const target = blocks.get(key)
          if(!target || target.mode === "individual" || target.block.textContent === text) continue
          target.block.textContent = text
        }
        syncData(false)
        return
      }
      if(!Number.isSafeInteger(data?.id) || typeof data.html !== "string") return
      if(initialized ? data.source !== undefined : typeof data.source !== "string") return
      // Editor writes are acknowledged by the render result, not echoed as mutations.
      observer.disconnect()
      const result = await render(data)
      if(result.error) {
        if(renderedId) observePreview()
        port.postMessage(result)
        return
      }
      renderedId = data.id
      syncData(false)
      // Observe before taking the snapshot so an asynchronous widget update
      // can't land between serialization and reconnecting the observer.
      lastShadow = readShadowDOM(observePreview())
      lastHTML = preview.innerHTML
      const height = Math.ceil(document.body.getBoundingClientRect().height)
      port.postMessage({id: renderedId, shadow: lastShadow, height, html: lastHTML === result.authoredHTML ? undefined : lastHTML})
    }
  }
  window.addEventListener("message", connect)
}

export function createLiveExampleDocument(library) {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")
  const jit = library === "angular" ? " 'unsafe-eval'" : ""
  // The nonce permits the runner and trusted runtime. Editable modules load from
  // frame-local blobs. The second policy also blocks network scripts with a nonce.
  // Give the sandbox a document ID before the editor starts so its data scope stays stable.
  return `<!doctype html>
<html lang="en" id="live-example-document">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:${jit}; script-src-attr 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline' blob:${jit}">
  <style>
    body { margin: 0; padding: .35rem .85rem .85rem; }
    @media (max-width: 30rem) { body { padding-block-start: 2rem; } }
    #preview { display: flow-root; }
    #preview > * > p { margin: 0; }
  </style>
</head>
<body>
  <div id="preview"></div>
  <script nonce="${nonce}">(${runLiveExample.toString()})(url => import(url), ${reconcileExampleContent.toString()})</script>
</body>
</html>`
}
