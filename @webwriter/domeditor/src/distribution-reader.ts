import {applyUpdate, encodeStateAsUpdate, encodeStateVector} from "yjs"
import {SharedDOMDoc} from "./domdoc"
import {WidgetDataStorage} from "./widget-data-storage"
import {effectiveDistribution, hydrateDistributionInstructions, readDistributionConfigs} from "./distribution-dom"
import {distributionFragment, distributionSnapshot} from "./distribution-snapshot"
import {validateDistributionChange} from "./distribution-validation.js"
import type {DistributionConfig, DistributionPermission} from "./distribution.js"

export type DistributionReaderContext = {
  root: Document
  controls: HTMLElement
  selected: () => Element | null
  policy: (element?: Element | null) => DistributionConfig | null
  allows: (permission: DistributionPermission, element?: Element | null) => boolean
  mutate: (operation: () => void, element?: Element | null) => boolean
  addButton: (label: string, permission: DistributionPermission, action: () => void) => HTMLButtonElement
  listen: (target: EventTarget, type: string, listener: EventListener) => void
  message: (text: string) => void
  destroy: () => void
}

/** Only in-frame primitives are imported here. Authoring controls never enter this graph. */
export function mountDistributionReader(root: Document): DistributionReaderContext | null {
  hydrateDistributionInstructions(root)
  const configs = readDistributionConfigs(root)
  if(!configs.length || root.designMode === "on") return null
  const view = root.defaultView
  if(!view || !root.body || root.body.shadowRoot?.querySelector(".◆distribution-reader")) return null
  const appendix = root.body.shadowRoot ?? root.body.attachShadow({mode: "open"})
  if(!Array.from(appendix.children).some(element => element.matches("slot:not([name])"))) appendix.prepend(root.createElement("slot"))
  const initialDefaults = new Map(configs.map(config => {
    const target = root.getElementById(config.target)
    return [config.target, target ? distributionSnapshot(target === root.documentElement ? root.body : target) : null]
  }))
  const dock = root.createElement("section")
  dock.className = "◆distribution-reader"
  dock.setAttribute("aria-label", "Reader editing")
  const controls = root.createElement("div")
  controls.setAttribute("role", "toolbar")
  controls.setAttribute("aria-label", "Reader actions")
  const status = root.createElement("p")
  status.setAttribute("role", "status")
  status.textContent = "Select an element to see available actions."
  const outline = root.createElement("div")
  outline.className = "◆distribution-outline"
  outline.hidden = true
  const style = root.createElement("style")
  style.textContent = `
    .◆distribution-reader{position:fixed;inset:auto 12px 12px;margin:auto;width:max-content;max-width:calc(100vw - 24px);max-height:min(40vh,20rem);overflow:auto;box-sizing:border-box;padding:8px;z-index:2147483646;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;box-shadow:0 3px 16px #0002;font:13px/1.4 system-ui}
    .◆distribution-reader [role=toolbar]{display:flex;flex-wrap:wrap;align-items:center;gap:6px;max-width:100%}
    .◆distribution-reader button,.◆distribution-reader input,.◆distribution-reader select,.◆distribution-reader textarea{box-sizing:border-box;max-width:100%;min-width:0;padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;background:#fff;color:inherit;font:inherit}
    .◆distribution-reader textarea{width:100%;min-height:5rem;resize:vertical}
    .◆distribution-reader label{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .◆distribution-reader button:disabled{opacity:.45}.◆distribution-reader button[aria-pressed=true]{background:#e0f2fe}
    .◆distribution-reader :focus-visible{outline:2px solid #2563eb;outline-offset:2px}
    .◆distribution-reader p{margin:6px 0 0;font-size:12px}.◆distribution-outline{position:fixed;pointer-events:none;border:2px solid #2563eb;box-sizing:border-box;z-index:2147483645}
    @media print{.◆distribution-reader,.◆distribution-outline{display:none!important}}
  `
  dock.append(controls, status)
  appendix.append(style, outline, dock)
  const cleanup: (() => void)[] = []
  const mirrors = new Map<string, {mirror: SharedDOMDoc, root: HTMLElement, close: () => void}>()
  const buttons: {button: HTMLButtonElement, permission: DistributionPermission}[] = []
  let baseMirror: SharedDOMDoc | undefined
  let selected: Element | null = null, selecting = false, destroyed = false, ready = false
  let accepted = distributionSnapshot(root.documentElement)!
  const listen = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener)
    cleanup.push(() => target.removeEventListener(type, listener))
  }
  const policy = (element: Element | null = selected) => element?.isConnected ? effectiveDistribution(element)?.config ?? null : null
  const owner = (element: Element | null = selected) => {
    const config = policy(element)
    return config ? mirrors.get(config.target) : undefined
  }
  const position = () => {
    if(selected && !selected.isConnected) selected = null
    outline.hidden = !selected
    if(selected) {
      const rect = selected.getBoundingClientRect()
      Object.assign(outline.style, {left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`})
    }
    for(const {button, permission} of buttons) button.disabled = !ready || !owner() || !policy()?.permissions.includes(permission)
    if(selected) status.textContent = `${selected.localName}${selected.id ? ` #${selected.id}` : ""} · ${policy()?.scope ?? "No editing permissions"}`
  }
  const restore = () => {
    if(baseMirror) { baseMirror.pauseDOMSync(); baseMirror.resumeDOMSync() }
    for(const {mirror} of mirrors.values()) { mirror.pauseDOMSync(); mirror.resumeDOMSync() }
    observer.takeRecords()
    position()
  }
  const validate = () => {
    const next = distributionSnapshot(root.documentElement)!
    return validateDistributionChange(accepted, next, configs, html => distributionFragment(html, root))
  }
  // Register validation first so invalid mutations are restored before scope mirrors observe them.
  const observer = new view.MutationObserver(() => {
    if(!ready || destroyed) return
    if(!validate()) { restore(); status.textContent = "This change is not permitted. The accepted document was restored."; return }
    accepted = distributionSnapshot(root.documentElement)!
    position()
  })
  observer.observe(root.documentElement, {subtree: true, attributes: true, characterData: true, childList: true})
  const context: DistributionReaderContext = {
    root, controls, selected: () => selected, policy,
    allows: (permission, element = selected) => ready && Boolean(owner(element)) && Boolean(policy(element)?.permissions.includes(permission)),
    mutate: (operation, element = selected) => {
      const binding = owner(element)
      if(!ready || !binding || !element?.isConnected) return false
      const parent = element.parentNode, following = element.nextSibling
      const end = binding.mirror.beginUndoGroup()
      binding.mirror.stopObserve()
      let succeeded = false
      try {
        operation()
        if(element === binding.root && (!element.isConnected || element.parentNode !== parent)) {
          parent?.insertBefore(element, following?.parentNode === parent ? following : null)
          status.textContent = "Move or delete content inside this editing region."
        }
        else succeeded = validate()
        if(succeeded) binding.mirror.syncFromDOM()
        else restore()
      }
      finally {
        binding.mirror.startObserve()
        end()
        accepted = distributionSnapshot(root.documentElement)!
        observer.takeRecords()
        position()
      }
      return succeeded
    },
    addButton: (label, permission, action) => {
      const button = root.createElement("button")
      button.type = "button"; button.textContent = label; button.disabled = true
      button.addEventListener("click", action)
      controls.append(button); buttons.push({button, permission})
      return button
    },
    listen, message: text => { status.textContent = text },
    destroy: () => {
      if(destroyed) return
      destroyed = true; observer.disconnect()
      cleanup.splice(0).forEach(close => close())
      baseMirror?.destroy()
      mirrors.forEach(({mirror, close}) => { mirror.destroy(); close() }); mirrors.clear()
      dock.remove(); outline.remove(); style.remove()
    },
  }
  const selectButton = root.createElement("button")
  selectButton.type = "button"; selectButton.textContent = "Select"; selectButton.setAttribute("aria-pressed", "false")
  selectButton.addEventListener("click", () => { selecting = !selecting; selectButton.setAttribute("aria-pressed", String(selecting)) })
  controls.append(selectButton)
  for(const kind of ["undo", "redo"] as const) {
    const button = root.createElement("button")
    button.type = "button"; button.textContent = kind === "undo" ? "Undo" : "Redo"
    button.addEventListener("click", () => {
      const binding = owner()
      if(!ready || !binding) return
      binding.mirror[kind]()
      accepted = distributionSnapshot(root.documentElement)!
      position()
    })
    controls.append(button)
  }
  listen(root, "click", event => {
    if(!selecting || event.composedPath().includes(appendix)) return
    const target = event.target as Element
    if(!target?.closest || !root.body.contains(target)) return
    selected = target.closest("[is]") ?? target
    // Select custom hosts atomically, including light-DOM descendants owned by a widget.
    for(let parent = selected.parentElement; parent && parent !== root.body; parent = parent.parentElement) {
      if(parent.localName.includes("-") || parent.hasAttribute("is")) selected = parent
    }
    event.preventDefault(); event.stopImmediatePropagation(); position()
  })
  listen(root, "keydown", event => { if((event as KeyboardEvent).key === "Escape") { selecting = false; selected = null; selectButton.setAttribute("aria-pressed", "false"); position() } })
  listen(view, "scroll", position)
  listen(view, "resize", position)
  listen(view, "pagehide", context.destroy)
  const storage = new WidgetDataStorage(view.indexedDB)
  cleanup.push(() => storage.destroy())
  const initialize = async () => {
    if(!configs.some(config => config.target === root.documentElement.id)) baseMirror = new SharedDOMDoc(undefined, undefined, [], ["◆"], {
      root: root.body, scopeBoundary: element => configs.some(config => config.target === element.id),
    })
    for(const config of [...configs].sort((a, b) => {
      const first = root.getElementById(a.target), second = root.getElementById(b.target)
      return first && second ? first.contains(second) ? -1 : second.contains(first) ? 1 : 0 : 0
    })) {
      if(destroyed) return
      const target = root.getElementById(config.target)
      if(!target) continue
      const scopeRoot = (target === root.documentElement ? root.body : target) as HTMLElement
      if(config.scope === "group") { status.textContent = "Group editing requires a connected session."; continue }
      const documentId = root.documentElement.id || root.URL
      const revisionInput = JSON.stringify({
        config, defaults: initialDefaults.get(config.target),
      })
      const revisionBytes = view.crypto.subtle ? await view.crypto.subtle.digest("SHA-256", new TextEncoder().encode(revisionInput)) : undefined
      const revision = revisionBytes ? Array.from(new Uint8Array(revisionBytes), byte => byte.toString(16).padStart(2, "0")).join("") : revisionInput
      const key = `webwriter-distribution:${JSON.stringify([documentId, config.target, config.scope, revision])}`
      const connection = storage.connect(key, () => {})
      await connection.ready
      if(destroyed) return
      const mirror = new SharedDOMDoc(undefined, undefined, [], ["◆"], {root: scopeRoot, ydoc: connection.doc,
        scopeBoundary: element => configs.some(child => child.target === element.id),
      })
      let channel: BroadcastChannel | undefined
      const unsubscribe = connection.observePersistence(state => {
        if(state.state === "error") status.textContent = state.message ?? "Changes are only available in memory."
      })
      const relay = (update: Uint8Array, origin: unknown) => { if(origin !== channel) channel?.postMessage({kind: "update", update}) }
      if(config.scope === "all" && view.BroadcastChannel) {
        channel = new view.BroadcastChannel(`webwriter-distribution:${key}`)
        channel.onmessage = event => {
          if(destroyed) return
          if(event.data?.kind === "sync" && event.data.vector instanceof Uint8Array) channel?.postMessage({kind: "update", update: encodeStateAsUpdate(connection.doc, event.data.vector)})
          else if(event.data?.kind === "update" && event.data.update instanceof Uint8Array) applyUpdate(connection.doc, event.data.update, channel)
        }
        connection.doc.on("update", relay)
        channel.postMessage({kind: "sync", vector: encodeStateVector(connection.doc)})
      }
      mirrors.set(config.target, {mirror, root: scopeRoot, close: () => { unsubscribe(); connection.doc.off("update", relay); channel?.close() }})
    }
    accepted = distributionSnapshot(root.documentElement)!
    ready = true; observer.takeRecords(); position()
    view.dispatchEvent(new Event("webwriter-distribution-ready"))
  }
  void initialize().catch(error => { status.textContent = error instanceof Error ? error.message : String(error) })
  return context
}
