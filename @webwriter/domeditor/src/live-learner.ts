import {previewFrameHTML} from "./frame-document"
import {editorHostOrigin} from "./frame-origins"
import {openFrameLinksInNewTabs} from "./frame-links"
import {LivePreview} from "./live-preview"
import type {LiveSession} from "./live-session"

function showSessionEnded(root: Document) {
  const appendix = root.body.shadowRoot ?? root.body.attachShadow({mode: "open"})
  if(!Array.from(appendix.children).some(element => element.matches("slot:not([name])"))) {
    appendix.prepend(root.createElement("slot"))
  }
  const style = root.createElement("style")
  style.textContent = `
    .◆live-session-ended {
      display: grid; grid-template-columns: 1fr auto; gap: 4px 16px;
      position: fixed; inset: auto 16px 20px; margin: 0 auto;
      box-sizing: border-box; width: min(36rem, calc(100vw - 32px));
      padding: 16px 20px; border: 1px solid #bfdbfe; border-radius: 10px;
      background: #eff6ff; color: #173760; box-shadow: 0 4px 20px rgb(15 23 42 / 16%);
      font: 14px/1.5 system-ui, sans-serif; text-align: start; z-index: 2147483647;
    }
    .◆live-session-ended h2 { margin: 0; align-self: center; font: 600 18px/1.4 system-ui, sans-serif; }
    .◆live-session-ended p { margin: 0; grid-column: 1 / -1; }
    .◆live-session-ended button {
      padding: 6px 10px; border: 1px solid #bfdbfe; border-radius: 6px;
      background: white; color: inherit; font: inherit; cursor: pointer;
    }
    .◆live-session-ended button:hover { background: #dbeafe; }
    .◆live-session-ended button:focus-visible { outline: 2px solid #173760; outline-offset: 2px; }
    @media print { .◆live-session-ended { display: none; } }
  `
  const notice = root.createElement("aside")
  notice.className = "◆live-session-ended"
  notice.setAttribute("role", "status")
  notice.setAttribute("aria-live", "polite")
  notice.setAttribute("aria-atomic", "true")
  const title = root.createElement("h2")
  title.textContent = "Session ended"
  const dismiss = root.createElement("button")
  dismiss.type = "button"
  dismiss.textContent = "Dismiss"
  const message = root.createElement("p")
  message.textContent = "The host has stopped this live session. Your activity is no longer being shared. You can keep viewing this document."
  const remove = () => {
    dismiss.removeEventListener("click", remove)
    notice.remove()
    style.remove()
  }
  dismiss.addEventListener("click", remove)
  notice.append(title, dismiss, message)
  appendix.append(style, notice)
  if(typeof notice.showPopover === "function") {
    notice.popover = "manual"
    try { notice.showPopover() }
    catch { notice.removeAttribute("popover") }
  }
  return remove
}

/** Mount one session's document directly in the learner's top-level page. */
export function connectLiveLearner(session: LiveSession, root: Document = document) {
  const view = root.defaultView
  if(!view) throw new Error("A learner document needs a browser window")
  const preview = new LivePreview()
  let rendered = false
  let disconnectLinks: (() => void) | undefined
  let removeSessionEnded: (() => void) | undefined
  const sync = () => {
    if(session.status === "stopped") {
      if(!rendered) {
        const status = root.createElement("p")
        status.setAttribute("role", "status")
        status.textContent = "This live session has ended."
        root.body.replaceChildren(status)
      }
      stopTracking()
      if(rendered && !removeSessionEnded) removeSessionEnded = showSessionEnded(root)
      return
    }
    if(rendered || !session.baseHTML) return
    const source = new DOMParser().parseFromString(session.baseHTML, "text/html")
    const html = previewFrameHTML(source, {
      bridgeNonce: "", entryURL: "", standalone: true,
      hostOrigin: editorHostOrigin(view.location), frameOrigin: view.location.origin,
      executeScripts: import.meta.env.MODE !== "test",
      ...session.previewDependencies ?? {packages: [], importMap: null},
    })
    const prepared = new DOMParser().parseFromString(html, "text/html")
    if(!prepared.head.querySelector('meta[name="viewport"]')) {
      const viewport = prepared.createElement("meta")
      viewport.name = "viewport"
      viewport.content = "width=device-width, initial-scale=1"
      prepared.head.prepend(viewport)
    }
    const referrer = prepared.createElement("meta")
    referrer.name = "referrer"
    referrer.content = "no-referrer"
    prepared.head.prepend(referrer)
    if(prepared.doctype) {
      const doctype = root.importNode(prepared.doctype, true)
      if(root.doctype) root.replaceChild(doctype, root.doctype)
      else root.insertBefore(doctype, root.documentElement)
    }
    else if(root.doctype) root.removeChild(root.doctype)
    for(const [target, replacement] of [[root.documentElement, prepared.documentElement], [root.head, prepared.head], [root.body, prepared.body]]) {
      for(const attribute of Array.from(target.attributes)) target.removeAttributeNode(attribute)
      for(const attribute of Array.from(replacement.attributes)) target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
    }
    root.head.replaceChildren(...Array.from(prepared.head.childNodes, node => root.importNode(node, true)))
    root.body.replaceChildren(...Array.from(prepared.body.childNodes, node => root.importNode(node, true)))
    root.designMode = "off"
    rendered = true
    disconnectLinks = openFrameLinksInNewTabs(view as Window & typeof globalThis)
    preview.observeLearner({contentWindow: view}, root, step => {
      if(session.status !== "stopped") session.publish(step)
    })
    // DOMParser scripts remain inert after import. Activate only the trusted
    // assets installed by previewFrameHTML, in import-map/registry/module order.
    for(const inert of Array.from(root.head.querySelectorAll("script"))) {
      const script = root.createElement("script")
      for(const attribute of Array.from(inert.attributes)) script.setAttribute(attribute.name, attribute.value)
      script.textContent = inert.textContent
      script.async = false
      inert.replaceWith(script)
    }
  }
  const unsubscribe = session.onChange(sync)
  // Browsers require their own confirmation for reload, tab close and back.
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if(session.status === "stopped") return
    event.preventDefault()
    event.returnValue = ""
  }
  const stopTracking = () => {
    unsubscribe()
    preview.disconnect()
    disconnectLinks?.()
    view.removeEventListener("beforeunload", beforeUnload)
    session.destroy()
  }
  const disconnect = () => {
    stopTracking()
    removeSessionEnded?.()
    removeSessionEnded = undefined
    view.removeEventListener("pagehide", disconnect)
  }
  view.addEventListener("pagehide", disconnect)
  view.addEventListener("beforeunload", beforeUnload)
  try { sync() }
  catch(error) {disconnect(); throw error}
  return disconnect
}
