// CSS can select a node's current location, but it cannot take a reference to
// the node itself. Keep presentation state by identity and retarget rules when
// a node moves, without writing editor state into the document.
const presentationDocumentKey = Symbol.for("webwriter.presentation-state")
const presentationToken = /:state\(ww-([\w-]+)\)/g
// Keep inactive branches impossible to match while giving the style engine a
// class key for rule indexing and ancestor rejection. This class is never set.
const inactivePresentationSelector = ".ww-inactive-presentation:not(*)"
/** Raises a :where() path to the specificity of one class. A positional
 * pseudo-class such as :nth-child(n) would do the same, but on a compound
 * without a tag or class it makes every insertion and removal restyle the
 * subtrees of all siblings. This class is never set, so the test always holds. */
export const presentationSpecificity = ":not(.ww-inactive-presentation)"

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
  return paths.length ? `:where(${paths.join(", ")})${presentationSpecificity}` : inactivePresentationSelector
}

/** Splits a selector list at its top-level commas. */
function selectorAlternatives(text) {
  const parts = []
  let depth = 0, start = 0
  for(let index = 0; index <= text.length; index++) {
    const character = text[index]
    if(character === "(" || character === "[") depth++
    else if(character === ")" || character === "]") depth--
    else if(character === undefined || character === "," && depth === 0) {
      parts.push(text.slice(start, index).trim())
      start = index + 1
    }
  }
  return parts
}

/** The index after the parenthesis closing the one opened before `from`. */
function closingParenthesis(text, from) {
  let depth = 1
  for(let index = from; index < text.length; index++) {
    if(text[index] === "(") depth++
    else if(text[index] === ")" && --depth === 0) return index + 1
  }
  return -1
}

/** The :has() tests that a compound starting with BODY applies to presentation
 * states, as [start, end, argument] in the template. */
function hostHasTests(template) {
  const tests = []
  let depth = 0, compound = 0
  for(let index = 0; index < template.length; index++) {
    const character = template[index]
    if(character === "(" || character === "[") depth++
    else if(character === ")" || character === "]") depth--
    else if(depth === 0 && /[\s,>+~]/.test(character)) compound = index + 1
    else if(depth === 0 && template.startsWith(":has(", index) && /^body(?![\w-])/.test(template.slice(compound))) {
      const end = closingParenthesis(template, index + 5)
      if(end < 0) break
      const argument = template.slice(index + 5, end - 1)
      if(argument.search(presentationToken) >= 0) tests.push([index, end, argument])
      presentationToken.lastIndex = 0
      index = end - 1
    }
  }
  return tests
}

/** Whether every alternative of a :has() argument needs an element in some
 * state, so that it cannot match while those states are unused. */
function needsPresentationState(argument) {
  let positive = argument
  for(let index = positive.indexOf(":not("); index >= 0; index = positive.indexOf(":not(")) {
    const end = closingParenthesis(positive, index + 5)
    if(end < 0) return false
    positive = positive.slice(0, index) + positive.slice(end)
  }
  return selectorAlternatives(positive).every(alternative => alternative.search(presentationToken) >= 0)
}

/** Decides BODY:has(…state…) here and leaves a constant in the rule. As CSS,
 * such a test in front of ::part() or a descendant is invalidated by every
 * insertion, removal and hover change anywhere in BODY, including in the
 * shadow appendix, and each time restyles the whole document because nothing
 * narrows what the rule can affect. The constant keeps the test's specificity. */
function resolveHostHas(data, template, pass) {
  const tests = hostHasTests(template)
  if(!tests.length) return template
  // Some DOM implementations answer :has(:where(…)) incorrectly without
  // throwing. Leave the test to CSS there. Asked once per update of the rules.
  if(pass.decides === undefined) {
    const probe = data.doc.createElement("div")
    probe.append(data.doc.createElement("p"))
    try { pass.decides = probe.matches(":has(:where(p))") && !probe.matches(":has(:where(div))") }
    catch { pass.decides = false }
  }
  if(!pass.decides) return template
  let resolved = ""
  let position = 0
  for(const [start, end, argument] of tests) {
    const states = Array.from(argument.matchAll(presentationToken), match => match[1])
    let matches = false
    if(states.some(state => data.elements.get(state)?.size) || !needsPresentationState(argument)) {
      const selector = argument.replace(presentationToken, (_, state) => presentationStateSelector(data.doc, state))
      try { matches = data.doc.body.matches(`:has(${selector})`) }
      // Leave the rule to CSS where the selector cannot be evaluated.
      catch { return template }
    }
    const inactive = selectorAlternatives(argument.replace(presentationToken, inactivePresentationSelector))
      .map(alternative => alternative.replace(/^[>+~]\s*/, "")).join(", ")
    resolved += template.slice(position, start) + (matches ? `:not(:is(${inactive}):not(*))` : `:is(${inactive}):not(*)`)
    position = end
  }
  return resolved + template.slice(position)
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
    const unchanged = data.selectors.get(state) === selector
    data.selectors.set(state, selector)
    // A test decided here also depends on the document around the element.
    for(const rule of data.rules.get(state)) if(!unchanged || rule.hostHas) rules.add(rule)
  }
  data.changed.clear()
  const pass = {}
  for(const entry of rules) {
    const selector = (entry.hostHas ? resolveHostHas(data, entry.template, pass) : entry.template)
      .replace(presentationToken, (_, state) => data.selectors.get(state) ?? inactivePresentationSelector)
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
          const entry = {rule, parent, template, selector: null, states, hostHas: hostHasTests(template).length > 0}
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
