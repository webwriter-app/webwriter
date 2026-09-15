/** Formula tools describe commands, never a second document representation. */
export const MATH_NAMESPACE = "http://www.w3.org/1998/Math/MathML"

export function inlineMathRoot(node: Node | null) {
  const root = mathRoot(node)
  return root && root.getAttribute("display") !== "block" ? root : null
}

/** Reuse neighboring prose for inline edges instead of adding a parent stop. */
export function mathOutsidePoint(math: Element, after = false) {
  if(!math.parentNode) return null
  let neighbor = after ? math.nextSibling : math.previousSibling
  while(neighbor?.nodeType === Node.COMMENT_NODE) neighbor = after ? neighbor.nextSibling : neighbor.previousSibling
  // Range.insertNode leaves empty split text at paragraph edges. Chromium
  // paints a caret there but redirects native typing into the formula.
  // Use the parent boundary so the editor can insert prose outside MathML.
  if(math.getAttribute("display") !== "block" && neighbor instanceof Text && neighbor.length) {
    return {node: neighbor as Node, offset: after ? 0 : neighbor.length}
  }
  return {node: math.parentNode, offset: Array.from(math.parentNode.childNodes).indexOf(math) + (after ? 1 : 0)}
}

/** The padding around a formula addresses the surrounding document. */
export function mathBoundaryPoint(math: Element, x: number, y: number) {
  if(!math.parentNode || mathRoot(math) !== math) return null
  const rect = math.getBoundingClientRect()
  if(!rect.width || !rect.height) return null
  const block = math.getAttribute("display") === "block"
  const rtl = getComputedStyle(math).direction === "rtl"
  const start = block ? y <= rect.top + 2 : y < rect.top || y <= rect.bottom && (rtl ? x >= rect.right - 2 : x <= rect.left + 2)
  const end = block ? y >= rect.bottom - 2 : y > rect.bottom || y >= rect.top && (rtl ? x <= rect.left + 2 : x >= rect.right - 2)
  if(!start && !end) return null
  return mathOutsidePoint(math, !start)
}
export type MathSelectionState = {active: true, display: "inline" | "block"}
export type MathTool = {label: string, title: string, command: string}

const symbols = (text: string): MathTool[] => [...text].map(label => ({label, title: label, command: `text:${label}`}))
const structure = (name: string, label: string, title: string): MathTool => ({label, title, command: `structure:${name}`})
export const mathStructureOptions: MathTool[] = [
  structure("frac", "□/□", "Fraction"), structure("square", "x²", "Square"),
  structure("sup", "xⁿ", "Power"), structure("sub", "xₙ", "Subscript"),
  structure("sqrt", "√□", "Square root"), structure("root", "ⁿ√□", "Nth root"),
  structure("abs", "|□|", "Absolute value"), structure("paren", "(□)", "Parentheses"),
  structure("binom", "(ⁿₖ)", "Binomial coefficient"), structure("matrix", "[▦]", "Matrix"),
  ...[["sum", "∑"], ["prod", "∏"], ["int", "∫"], ["bigcup", "⋃"], ["bigcap", "⋂"]]
    .map(([name, label]) => structure(name, label, {sum: "Sum", prod: "Product", int: "Integral", bigcup: "Big union", bigcap: "Big intersection"}[name]!)),
]
export const mathToolGroups: {label: string, options: MathTool[]}[] = [
  {label: "Structures", options: mathStructureOptions},
  {label: "Numbers and constants", options: symbols("0123456789.πℯⅈ∞ℕℤℚℝℂ")},
  {label: "Operators", options: symbols("+-−×÷=<>≤≥≠≈±⋯()[]{},′∈∉∪∩⊂∖∅∧∨¬⇒⇔≡∘!")},
  {label: "Functions", options: ["sin", "cos", "tan", "ln", "log"].map(name => ({label: name, title: name, command: `function:${name}`}))},
  {label: "Greek letters", options: symbols("αβγδεϵζηθϑικλμνξπρϱσςτυφϕχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ")},
  {label: "Letters", options: symbols("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")},
]

export const mathCommandAliases: Record<string, string> = {
  frac: "structure:frac", sqrt: "structure:sqrt", root: "structure:root", binom: "structure:binom",
  sum: "structure:sum", prod: "structure:prod", int: "structure:int", bigcup: "structure:bigcup", bigcap: "structure:bigcap",
  abs: "structure:abs", matrix: "structure:matrix",
  ...Object.fromEntries(["sin", "cos", "tan", "ln", "log"].map(name => [name, `function:${name}`])),
  ...Object.fromEntries(Object.entries({alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", NN: "ℕ", ZZ: "ℤ", QQ: "ℚ", RR: "ℝ", CC: "ℂ", e: "ℯ", i: "ⅈ", infinity: "∞", times: "×", le: "≤", ge: "≥", ne: "≠"}).map(([name, value]) => [name, `text:${value}`])),
}

export const mathTokenNames = new Set(["mi", "mn", "mo", "mtext", "ms"])
export const mathRowNames = new Set(["math", "mrow", "msqrt", "mtd", "mstyle", "mpadded", "mphantom", "merror"])
export const mathArity: Record<string, number> = {mfrac: 2, mroot: 2, msup: 2, msub: 2, msubsup: 3, mover: 2, munder: 2, munderover: 3}
export const mathElement = (name: string, ...children: (Node | string)[]) => {
  const element = document.createElementNS(MATH_NAMESPACE, name)
  element.append(...children)
  return element
}

export function mathRoot(node: Node | null): Element | null {
  let element = node instanceof Element ? node : node?.parentElement
  let root: Element | null = null
  while(element && element !== document.body) {
    // Widgets, including contentful widgets, own their internal mathematics.
    if(element.localName.includes("-") || element.hasAttribute("is")) return null
    if(element.namespaceURI === MATH_NAMESPACE && element.localName === "math") root = element
    element = element.parentElement
  }
  return root && document.body.contains(root) ? root : null
}

export function mathTokenType(text: string) {
  return /^[\d.]+$/u.test(text) ? "mn" : /^[\p{L}\p{Nl}]+$/u.test(text) ? "mi" : /^\s+$/u.test(text) ? "mtext" : "mo"
}
