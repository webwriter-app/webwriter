/** Bind editor UI to live elements without putting UI or positioning styles in
 * authored content. Names and ::part rules share the nearest common tree. */
import {clearPresentationState, hasPresentationState, presentationElementSelector, setPresentationState} from "./presentation-state.js"
const defaultAnchorCSS = "left:anchor(left) !important;top:anchor(top);width:anchor-size(width);height:anchor-size(height);position-visibility:anchors-visible;"

export function createAnchorPositioner(doc = document) {
  const key = Symbol.for("webwriter.anchor-positioning")
  const state = doc[key] ??= {sequence: 0, bindings: new Set(), sheets: new Map(), offsets: new Map(), queued: false}
  state.offsets ??= new Map()
  state.observers ??= new Map()
  const owned = new Map()
  const view = doc.defaultView
  const rootOf = node => node.getRootNode()
  const roots = node => {
    const result = []
    for(let root = rootOf(node); root; root = root.host ? rootOf(root.host) : null) result.push(root)
    return result
  }
  const watch = (root, binding) => {
    let record = state.observers.get(root)
    if(!record) {
      const bindings = new Set()
      const observer = new view.MutationObserver(records => {
        if(!records.some(record => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1))) return
        for(const binding of bindings) {
          if(!binding.control.isConnected || !binding.target.isConnected
            || binding.controlSelector() !== binding.lastControlSelector || binding.targetSelector() !== binding.lastTargetSelector) {
            state.schedule()
            break
          }
        }
      })
      observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ["id"]})
      record = {observer, bindings}
      state.observers.set(root, record)
    }
    record.bindings.add(binding)
    return () => {
      record.bindings.delete(binding)
      if(!record.bindings.size) {
        record.observer.disconnect()
        state.observers.delete(root)
      }
    }
  }
  const removeToken = (element, attribute, token, separator = /\s+/) => {
    const tokens = (element.getAttribute(attribute) ?? "").split(separator).map(value => value.trim()).filter(value => value && value !== token)
    if(tokens.length) element.setAttribute(attribute, tokens.join(attribute === "exportparts" ? ", " : " "))
    else element.removeAttribute(attribute)
  }
  const expose = (element, scope, stateName, cleanup, ensure) => {
    if(rootOf(element) === scope) {
      const repair = () => { if(!hasPresentationState(element, stateName)) setPresentationState(element, stateName) }
      repair(); ensure.push(repair)
      cleanup.push(() => clearPresentationState(element, stateName))
      return () => {
        const selector = presentationElementSelector(element, true, scope)
        return selector ? `:where(${selector}):nth-child(n)` : ":not(*)"
      }
    }
    const part = stateName
    const repair = () => {
      const parts = (element.getAttribute("part") ?? "").split(/\s+/).filter(Boolean)
      if(!parts.includes(part)) element.setAttribute("part", [...parts, part].join(" "))
    }
    repair(); ensure.push(repair)
    cleanup.push(() => removeToken(element, "part", part))
    let root = rootOf(element)
    while(root.host && rootOf(root.host) !== scope) {
      const host = root.host
      const repairExport = () => {
        const exports = host.getAttribute("exportparts")
        if(!(exports ?? "").split(",").some(value => value.trim() === part)) host.setAttribute("exportparts", exports ? `${exports}, ${part}` : part)
      }
      repairExport(); ensure.push(repairExport)
      cleanup.push(() => removeToken(host, "exportparts", part, /,/))
      root = rootOf(host)
    }
    return () => `*::part(${part})`
  }
  if(!state.refresh) {
    state.refresh = () => {
      state.queued = false
      for(const binding of [...state.bindings]) if(!binding.target.isConnected || !binding.control.isConnected) binding.release()
      const scopes = new Set([...state.sheets.keys(), ...Array.from(state.bindings, binding => binding.scope)])
      const previous = new Map()
      for(const scope of scopes) {
        previous.set(scope, [...scope.adoptedStyleSheets])
        const sheet = state.sheets.get(scope)?.sheet
        if(sheet) scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter(value => value !== sheet)
      }
      const sources = new Map(), templates = new Map()
      // Gecko's fixed anchor origin can differ from the target's client rect
      // in document layout. The gutter is an initial estimate; the rendered
      // frame below supplies the exact correction for this scope.
      const root = doc.documentElement
      const gecko = view?.navigator.userAgent.includes("Firefox")
      const gutter = gecko
        && view.getComputedStyle(root).scrollbarGutter?.includes("both-edges")
        ? Math.max(0, view.innerWidth - root.clientWidth) / 2 : 0
      try {
        for(const scope of scopes) {
          const bindings = [...state.bindings].filter(binding => binding.scope === scope)
          const targets = new Map()
          const rules = bindings.length ? [
            "@position-try --ww-ui-popup-below {position-area:bottom span-all;justify-self:anchor-center;margin-inline:8px}",
            "@position-try --ww-ui-popup-above {position-area:top span-all;justify-self:anchor-center;margin-inline:8px}",
          ] : []
          for(const binding of bindings) {
            binding.ensure.forEach(repair => repair())
            binding.lastControlSelector = binding.controlSelector()
            binding.lastTargetSelector = binding.targetSelector()
            let target = targets.get(binding.target)
            if(!target) { target = new Map(); targets.set(binding.target, target) }
            const names = target.get(binding.pseudo) ?? []
            names.push(binding); target.set(binding.pseudo, names)
            const css = binding.defaultCSS && gecko
              ? "left:calc(anchor(left) - __ww_offset__px) !important;top:anchor(top);width:anchor-size(width);height:anchor-size(height);position-visibility:anchors-visible;"
              : binding.css
            rules.push(`${binding.lastControlSelector} {position:fixed;position-anchor:${binding.name} !important;${css}}`)
          }
          for(const [element, pseudos] of targets) for(const [pseudo, bindings] of pseudos) {
            const existing = view.getComputedStyle(element, pseudo || null).getPropertyValue("anchor-name")
            const names = [existing && existing !== "none" ? existing : "", ...bindings.map(binding => binding.name)].filter(Boolean)
            rules.push(`${bindings[0].lastTargetSelector}${pseudo} {anchor-name:${names.join(",")} !important}`)
          }
          const template = rules.join("\n")
          templates.set(scope, template)
          sources.set(scope, template.replaceAll("__ww_offset__", String(state.offsets.get(scope) ?? gutter)))
        }
      }
      finally { for(const [scope, sheets] of previous) scope.adoptedStyleSheets = sheets }
      for(const [scope, source] of sources) {
        let record = state.sheets.get(scope)
        if(!source) {
          if(record) scope.adoptedStyleSheets = scope.adoptedStyleSheets.filter(sheet => sheet !== record.sheet)
          state.sheets.delete(scope)
          state.offsets.delete(scope)
          continue
        }
        if(!record) {
          record = {sheet: new view.CSSStyleSheet(), source: ""}
          state.sheets.set(scope, record)
          scope.adoptedStyleSheets = [...scope.adoptedStyleSheets, record.sheet]
        }
        if(source !== record.source) { record.sheet.replaceSync(source); record.source = source }
      }
      if(gecko) for(const [scope, template] of templates) {
        for(const binding of state.bindings) {
          if(binding.scope !== scope || !binding.defaultCSS || !binding.control.isConnected || !binding.target.isConnected) continue
          const target = binding.target.getBoundingClientRect()
          const control = binding.control.getBoundingClientRect()
          if(!target.width || !control.width || Math.abs(target.width - control.width) > 2
            || Math.abs(target.height - control.height) > 2) continue
          const difference = control.left - target.left
          if(Math.abs(difference) >= .5) {
            const offset = (state.offsets.get(scope) ?? gutter) + difference
            state.offsets.set(scope, offset)
            const source = template.replaceAll("__ww_offset__", String(offset))
            const record = state.sheets.get(scope)
            if(record && source !== record.source) { record.sheet.replaceSync(source); record.source = source }
          }
          break
        }
      }
    }
    state.schedule = () => {
      if(state.queued) return
      state.queued = true
      queueMicrotask(() => { if(state.queued) state.refresh() })
    }
  }
  return {
    bind(control, target, css = defaultAnchorCSS, pseudo = "") {
      const current = owned.get(control)
      if(current?.target === target && current.css === css && current.pseudo === pseudo
        && current.targetRoot === rootOf(target) && current.controlRoot === rootOf(control)) return
      current?.release()
      if(!target.isConnected || !control.isConnected || target.ownerDocument !== doc || control.ownerDocument !== doc) return
      const controlRoots = roots(control), scope = roots(target).find(root => controlRoots.includes(root))
      if(!scope || !("adoptedStyleSheets" in scope)) return
      const index = state.sequence++, cleanup = [], ensure = []
      const targetState = `anchor-target-${index}`, controlState = `anchor-control-${index}`
      const binding = {control, target, css, defaultCSS: css === defaultAnchorCSS, pseudo, scope, ensure, targetRoot: rootOf(target), controlRoot: rootOf(control), name: `--ww-ui-anchor-${index}`,
        targetSelector: expose(target, scope, targetState, cleanup, ensure),
        controlSelector: expose(control, scope, controlState, cleanup, ensure),
        release() {
          if(!state.bindings.delete(binding)) return
          owned.delete(control)
          cleanup.reverse().forEach(dispose => dispose())
          state.schedule()
        },
      }
      for(const root of new Set([rootOf(target), rootOf(control)])) {
        cleanup.push(watch(root, binding))
      }
      owned.set(control, binding); state.bindings.add(binding)
      state.schedule()
    },
    release(control) { owned.get(control)?.release() },
    // A feature with no anchors must not rebuild another feature's sheets.
    // Pending releases still need to flush, including the last binding.
    refresh() { if(owned.size || state.queued) state.refresh() },
    destroy() { for(const binding of [...owned.values()]) binding.release(); state.refresh() },
  }
}
