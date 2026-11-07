// CSS can select a node's current location, but it cannot take a reference to
// the node itself. Keep presentation state by identity and retarget rules when
// a node moves, without writing editor state into the document.
const presentationDocumentKey = Symbol.for("webwriter.presentation-state")
const presentationToken = /:state\(ww-([\w-]+)\)/g
// Keep inactive branches impossible to match while giving the style engine a
// class key for rule indexing and ancestor rejection. This class is never set.
const inactivePresentationSelector = ".ww-inactive-presentation:not(*)"

const changesPresentationSelector = record => record.type === "attributes"
  || [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1)

function presentationDocument(doc) {
  let data = doc[presentationDocumentKey]
  if(data) return data
  data = {doc, elements: new Map(), rules: new Map(), selectors: new Map(), observer: null, changed: new Set(), depth: 0}
  doc[presentationDocumentKey] = data
  return data
}

function updatePresentationObserver(data) {
  if(!data.rules.size || !data.elements.size) {
    data.observer?.disconnect()
    data.observer = null
  }
  else if(!data.observer && data.doc.defaultView?.MutationObserver) {
    data.observer = new data.doc.defaultView.MutationObserver(records => {
      if(records.some(changesPresentationSelector)) {
        refreshPresentationStyles(data.doc)
      }
    })
    data.observer.observe(data.doc, {childList: true, subtree: true, attributes: true, attributeFilter: ["id"]})
  }
}

/** A selector for the current position of a light-DOM element. */
export function presentationElementSelector(element, preferId = false, scope = element.ownerDocument) {
  const doc = element.ownerDocument
  if(element.getRootNode() !== scope) return null
  if(scope === doc && element === doc.documentElement) return ":root"
  if(scope === doc && element === doc.body) return "body"
  if(preferId && element.id && !element.id.includes("\0")) {
    const escape = doc.defaultView?.CSS?.escape
    const id = escape ? escape(element.id) : Array.from(element.id, char => `\\${char.codePointAt(0).toString(16)} `).join("")
    const selector = `#${id}`
    const matches = scope.querySelectorAll(selector)
    if(matches.length === 1 && matches[0] === element) return selector
  }
  if(scope !== doc) {
    const path = []
    for(let node = element; node; node = node.parentElement) {
      let index = 1
      for(let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) index++
      path.push(`${/^[a-z][\w-]*$/i.test(node.localName) ? node.localName : ""}:nth-child(${index})`)
    }
    return [":host", ...path.reverse()].join(" > ")
  }
  const path = []
  let node = element
  while(node && node !== doc.body && node !== doc.documentElement) {
    let index = 1
    for(let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) index++
    path.push(`${/^[a-z][\w-]*$/i.test(node.localName) ? node.localName : ""}:nth-child(${index})`)
    node = node.parentElement
  }
  if(!node) return null
  return [node === doc.body ? ":root > body" : ":root", ...path.reverse()].join(" > ")
}

/** Match one state at the same specificity as a single class. */
export function presentationStateSelector(doc, state) {
  const paths = Array.from(doc[presentationDocumentKey]?.elements.get(state) ?? [],
    element => presentationElementSelector(element, true)).filter(Boolean)
  if(paths.length === 1 && paths[0] === ":root") return ":root"
  return paths.length ? `:where(${paths.join(", ")}):nth-child(n)` : inactivePresentationSelector
}

function setPresentationRuleSelector(entry, selector) {
  try { entry.rule.selectorText = selector }
  catch(error) {
    // Some DOM implementations expose a read-only selectorText.
    if(!(error instanceof TypeError)) throw error
    const index = Array.from(entry.parent.cssRules).indexOf(entry.rule)
    if(index < 0) return
    const body = entry.rule.cssText.slice(entry.rule.selectorText.length)
    entry.parent.insertRule(`${selector}${body}`, index)
    entry.parent.deleteRule(index + 1)
    entry.rule = entry.parent.cssRules[index]
  }
}

function updatePresentationRules(data) {
  if(data.depth || !data.changed.size) return
  const rules = new Set()
  for(const state of data.changed) {
    if(!data.rules.has(state)) continue
    const selector = presentationStateSelector(data.doc, state)
    if(data.selectors.get(state) === selector) continue
    data.selectors.set(state, selector)
    for(const rule of data.rules.get(state)) rules.add(rule)
  }
  data.changed.clear()
  for(const entry of rules) {
    const selector = entry.template.replace(presentationToken, (_, state) => data.selectors.get(state) ?? inactivePresentationSelector)
    if(selector !== entry.selector) {
      setPresentationRuleSelector(entry, selector)
      entry.selector = selector
    }
  }
}

export function refreshPresentationStyles(doc) {
  const data = doc[presentationDocumentKey]
  if(!data) return
  data.observer?.takeRecords()
  for(const [state, elements] of data.elements) {
    for(const element of elements) if(element.ownerDocument !== doc || !element.isConnected) elements.delete(element)
    if(!elements.size) data.elements.delete(state)
    if(data.rules.has(state)) data.changed.add(state)
  }
  updatePresentationRules(data)
  updatePresentationObserver(data)
}

/** Keep synchronous geometry reads consistent with pending DOM edits. */
export function flushPresentationStyles(doc) {
  if(doc[presentationDocumentKey]?.observer?.takeRecords().some(changesPresentationSelector)) refreshPresentationStyles(doc)
}

/** Use :state(ww-…) in constructed stylesheets as a presentation selector. */
export function trackPresentationStyles(doc, sheet) {
  const data = presentationDocument(doc), entries = []
  function register(parent) {
    for(const rule of parent.cssRules) {
      const template = rule.selectorText
      if(template) {
        const states = new Set(Array.from(template.matchAll(presentationToken), match => match[1]))
        if(states.size) {
          const entry = {rule, parent, template, selector: null, states}
          for(const state of states) {
            let listeners = data.rules.get(state)
            if(!listeners) data.rules.set(state, listeners = new Set())
            listeners.add(entry)
            data.selectors.delete(state)
            data.changed.add(state)
          }
          entries.push(entry)
        }
      }
      if(rule.cssRules) register(rule)
    }
  }
  register(sheet)
  updatePresentationRules(data)
  updatePresentationObserver(data)
  return () => {
    for(const entry of entries) for(const state of entry.states) {
      const listeners = data.rules.get(state)
      listeners?.delete(entry)
      if(!listeners?.size) {
        data.rules.delete(state)
        data.selectors.delete(state)
      }
    }
    for(const entry of entries) setPresentationRuleSelector(entry, entry.template)
    updatePresentationObserver(data)
  }
}

export function hasPresentationState(element, state) {
  return Boolean(element && element.ownerDocument[presentationDocumentKey]?.elements.get(state)?.has(element))
}

export function setPresentationState(element, state, active = true) {
  if(!element) return
  const data = active ? presentationDocument(element.ownerDocument) : element.ownerDocument[presentationDocumentKey]
  if(!data) return
  let elements = data.elements.get(state)
  if(active) {
    if(elements?.has(element)) return
    if(!elements) data.elements.set(state, elements = new Set())
    elements.add(element)
  }
  else {
    if(!elements?.delete(element)) return
    if(!elements.size) data.elements.delete(state)
  }
  data.changed.add(state)
  updatePresentationRules(data)
  if(!data.depth) updatePresentationObserver(data)
}

export function batchPresentationStates(doc, update) {
  const data = presentationDocument(doc)
  data.depth++
  try { return update() }
  finally {
    data.depth--
    updatePresentationRules(data)
    if(!data.depth) updatePresentationObserver(data)
  }
}

export function setPresentationStates(element, ...states) {
  if(element) batchPresentationStates(element.ownerDocument, () => states.forEach(state => setPresentationState(element, state)))
}

export function clearPresentationState(element, ...states) {
  if(element) batchPresentationStates(element.ownerDocument, () => states.forEach(state => setPresentationState(element, state, false)))
}

export function clearEditorPresentation(doc) {
  const data = doc[presentationDocumentKey]
  if(!data) return
  batchPresentationStates(doc, () => {
    for(const state of data.elements.keys()) {
      // Anchor bindings have their own owners, including outside DOMEditor.
      if(state.startsWith("anchor-target-") || state.startsWith("anchor-control-")) continue
      data.elements.delete(state)
      data.changed.add(state)
    }
  })
}

export function presentationStateElements(root, ...states) {
  const doc = root.nodeType === 9 ? root : root.ownerDocument
  const data = doc[presentationDocumentKey]
  if(!data) return []
  const elements = new Set()
  for(const state of states) for(const element of data.elements.get(state) ?? []) {
    if(element !== root && root.contains(element)) elements.add(element)
  }
  return Array.from(elements).sort((a, b) => a.compareDocumentPosition(b) & 2 ? 1 : -1)
}

export function resolvePresentationSelector(doc, selector) {
  return selector.replace(presentationToken, (_, state) => presentationStateSelector(doc, state))
}
