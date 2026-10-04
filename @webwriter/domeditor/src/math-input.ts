/** Formula input commands, independent of the authored document DOM. */
export type MathCompletion = {name: string, label: string, command: string, preview: string}
export type MathKeyboardKey = {label: string, title: string, command: string, shift?: MathKeyboardKey, span?: number}

const entry = (name: string, label: string, command: string, preview = name): MathCompletion => ({name, label, command, preview})
const functions: Record<string, string> = {
  sin: "Sine", cos: "Cosine", tan: "Tangent", cot: "Cotangent", sec: "Secant", csc: "Cosecant",
  arcsin: "Arcsine", arccos: "Arccosine", arctan: "Arctangent", sinh: "Hyperbolic sine", cosh: "Hyperbolic cosine",
  tanh: "Hyperbolic tangent", coth: "Hyperbolic cotangent", exp: "Exponential function", ln: "Natural logarithm",
  log: "Logarithm", lg: "Common logarithm", lb: "Binary logarithm", max: "Maximum", min: "Minimum",
  gcd: "Greatest common divisor", det: "Determinant", dim: "Dimension", ker: "Kernel", lim: "Limit",
  limsup: "Limit superior", liminf: "Limit inferior", sup: "Supremum", inf: "Infimum", arg: "Argument", deg: "Degree", hom: "Homomorphisms",
}
export const mathGreekLetters: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ",
  vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ",
  varrho: "ϱ", sigma: "σ", varsigma: "ς", tau: "τ", upsilon: "υ", phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
}
const structures: [string, string, string][] = [
  ["sqrt", "Square root", "√□"], ["root", "Indexed root", "ⁿ√□"], ["cbrt", "Cube root", "³√□"],
  ["frac", "Fraction", "□/□"], ["binom", "Binomial coefficient", "(ⁿₖ)"], ["sum", "Sum", "∑"], ["prod", "Product", "∏"],
  ["int", "Integral", "∫"], ["coprod", "Coproduct", "∐"], ["bigcup", "Big union", "⋃"], ["bigcap", "Big intersection", "⋂"],
  ["abs", "Absolute value", "|□|"], ["norm", "Norm", "‖□‖"], ["floor", "Floor", "⌊□⌋"], ["ceil", "Ceiling", "⌈□⌉"],
  ["angle", "Angle brackets", "⟨□⟩"], ["cancel", "Cancel", "╱□"], ["bcancel", "Back cancel", "╲□"],
  ["xcancel", "Cross out", "╳□"], ["box", "Box", "▣"], ["overbrace", "Overbrace with label", "⏞"],
  ["underbrace", "Underbrace with label", "⏟"], ["overbracket", "Overbracket with label", "⎴"],
  ["underbracket", "Underbracket with label", "⎵"], ["overparen", "Overparenthesis with label", "⏜"],
  ["underparen", "Underparenthesis with label", "⏝"], ["text", "Text in a formula", "abc"], ["matrix", "2 × 2 matrix", "[▦]"],
]
const operators: [string, string, string][] = [
  ["plus", "Plus", "+"], ["minus", "Minus", "−"], ["pm", "Plus or minus", "±"], ["mp", "Minus or plus", "∓"],
  ["times", "Times", "×"], ["cdot", "Multiply", "·"], ["ast", "Asterisk", "∗"], ["div", "Divide", "÷"],
  ["circ", "Composition", "∘"], ["cup", "Union", "∪"], ["cap", "Intersection", "∩"], ["setminus", "Set difference", "∖"],
  ["neq", "Not equal", "≠"], ["leq", "Less than or equal", "≤"], ["geq", "Greater than or equal", "≥"],
  ["leqslant", "Less than or equal", "⩽"], ["geqslant", "Greater than or equal", "⩾"], ["approx", "Approximately equal", "≈"],
  ["equiv", "Congruent", "≡"], ["in", "Element of", "∈"], ["notin", "Not an element of", "∉"],
  ["subset", "Subset", "⊂"], ["subseteq", "Subset or equal", "⊆"], ["mid", "Divides", "∣"],
  ["coloneqq", "Defined as", "≔"], ["colon", "Colon", ":"], ["land", "Logical and", "∧"], ["lor", "Logical or", "∨"],
  ["Rightarrow", "Implies", "⇒"], ["implies", "Implies", "⟹"], ["Leftrightarrow", "Equivalent", "⇔"],
  ["iff", "Equivalent", "⟺"], ["neg", "Logical not", "¬"], ["prime", "Prime", "′"],
]
const constants: [string, string, string][] = [
  ["e", "Euler's number", "ℯ"], ["i", "Imaginary unit", "ⅈ"], ["d", "Differential", "d"],
  ["infty", "Infinity", "∞"], ["infinity", "Infinity", "∞"], ["cdots", "Centered dots", "⋯"],
  ["dots", "Ellipsis", "…"], ["ldots", "Ellipsis", "…"], ["emptyset", "Empty set", "∅"], ["varnothing", "Empty set", "∅"],
  ["NN", "Natural numbers", "ℕ"], ["ZZ", "Integers", "ℤ"], ["QQ", "Rational numbers", "ℚ"], ["RR", "Real numbers", "ℝ"], ["CC", "Complex numbers", "ℂ"],
]
const dictionary = [
  ...Object.entries(functions).map(([name, label]) => entry(name, label, `function:${name}`, `${name}(□)`)),
  ...Object.entries(mathGreekLetters).map(([name, glyph]) => entry(name, `Greek letter ${name}`, `text:${glyph}`, glyph)),
  ...structures.map(([name, label, preview]) => entry(name, label, `structure:${name}`, preview)),
  ...operators.map(([name, label, glyph]) => entry(name, label, `text:${glyph}`, glyph)),
  ...constants.map(([name, label, glyph]) => entry(name, label, name === "d" ? "identifier:d" : `text:${glyph}`, glyph)),
]
const aliases: Record<string, string> = {ne: "neq", le: "leq", ge: "geq", wedge: "land", vee: "lor", lnot: "neg", assign: "coloneqq"}
for(const [alias, name] of Object.entries(aliases)) {
  const source = dictionary.find(entry => entry.name === name)!
  dictionary.push({...source, name: alias})
}

export function exactMathCompletion(text: string) { return dictionary.find(entry => entry.name === text) }
export function continuesMathCompletion(text: string) { return dictionary.some(entry => entry.name.toLowerCase().startsWith(text.toLowerCase())) }
export function mathCompletions(text: string, command = false): MathCompletion[] {
  if(!text) return []
  const exact = exactMathCompletion(text)
  const matches = dictionary.filter(entry => entry !== exact && entry.name.toLowerCase().startsWith(text.toLowerCase()))
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
  if(command) return [...(exact ? [exact] : []), ...matches]
  const variable = entry(text, "Variable", `identifier:${text}`, text)
  const call = entry(text, "Function", `function:${text}`, `${text}(□)`)
  return [...([...text].length === 1 ? [variable] : []), ...(exact ? [exact] : []), ...matches,
    ...([...text].length === 1 ? [] : [variable]), call]
}

const key = (label: string, command = `text:${label}`, title = label, shift?: MathKeyboardKey, span?: number): MathKeyboardKey => ({label, title, command, shift, span})
const gap = (span = 0.5) => key("", "", "", undefined, span)
const structure = (name: string, label: string, title: string) => key(label, `structure:${name}`, title)
const move = (direction: string, label: string) => key(label, `move:${direction}`, `Move ${direction}`)
const backspace = () => key("⌫", "delete:backward", "Backspace")
const shift = (span = 1) => key("⇧", "shift", "Shift", undefined, span)
const letters = (text: string) => [...text].map(letter => key(letter, `text:${letter}`, letter, key(letter.toUpperCase())))
const digits = (text: string) => [...text].map(digit => key(digit))
const greek = (names: string) => names.split(" ").map(name => {
  const glyph = mathGreekLetters[name]
  const capital = mathGreekLetters[name[0].toUpperCase() + name.slice(1)] ?? glyph.toUpperCase()
  return key(glyph, `text:${glyph}`, name, key(capital, `text:${capital}`, `Capital ${name}`))
})
const punctuation = () => [move("left", "←"), move("right", "→"), move("up", "↑"), move("down", "↓"), key("("), key(")"), key(","), key(".", "text:.", "Decimal point", key("′", "text:′", "Prime")), key("="), key("+")]
export const mathKeyboardLayouts: {id: string, label: string, rows: MathKeyboardKey[][]}[] = [
  {id: "numbers", label: "123", rows: [
    [key("x", "text:x", "x", key("y")), key("n", "text:n", "n", key("a")), gap(), ...digits("789"), key("÷"), gap(), key("e", "text:ℯ", "Euler's number", key("ln", "function:ln", "Natural logarithm")), key("i", "text:ⅈ", "Imaginary unit", key("∞", "text:∞", "Infinity")), key("π", "text:π", "Pi", key("sin", "function:sin", "Sine"))],
    [key("<"), key(">"), gap(), ...digits("456"), key("×"), gap(), structure("square", "x²", "Square"), structure("sup", "xⁿ", "Power"), structure("sqrt", "√□", "Square root")],
    [key("("), key(")"), gap(), ...digits("123"), key("−"), gap(), structure("frac", "□/□", "Fraction"), move("up", "↑"), backspace()],
    [shift(2), gap(), key("0"), key("."), key("="), key("+"), gap(), move("left", "←"), move("down", "↓"), move("right", "→")],
  ]},
  {id: "operators", label: "∑ ≤ ∞", rows: [
    [..."<>≤≥≠≈±∞⋯"].map(glyph => key(glyph)).concat(backspace()),
    [key("sin", "function:sin", "Sine"), key("cos", "function:cos", "Cosine"), key("tan", "function:tan", "Tangent"), key("ln", "function:ln", "Natural logarithm"), key("log", "function:log", "Logarithm"), structure("abs", "|□|", "Absolute value"), structure("root", "ⁿ√□", "Indexed root"), structure("sub", "xₙ", "Subscript"), structure("sum", "∑", "Sum"), structure("int", "∫", "Integral")],
    [..."∈∉∪∩⊂∖∅∧∨¬"].map(glyph => key(glyph)),
    [..."ℕℤℚℝℂ{}⇒⇔"].map(glyph => key(glyph)).concat(structure("binom", "(ⁿₖ)", "Binomial coefficient")),
    [move("left", "←"), move("right", "→"), move("up", "↑"), move("down", "↓"), key("≡"), key("∘"), key("!"), structure("prod", "∏", "Product"), structure("bigcup", "⋃", "Big union"), structure("bigcap", "⋂", "Big intersection")],
  ]},
  {id: "letters", label: "ABC", rows: [letters("qwertzuiop"), letters("asdfghjkl"), [shift(1.5), ...letters("yxcvbnm"), {...backspace(), span: 1.5}], punctuation()]},
  {id: "greek", label: "αβγ", rows: [greek("alpha beta gamma delta varepsilon zeta eta theta iota kappa"), greek("lambda mu nu xi pi rho sigma tau upsilon varphi"), [shift(), ...greek("chi psi omega vartheta epsilon phi varsigma varrho"), backspace()], punctuation()]},
]
