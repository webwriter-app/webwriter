export const primaryMarkNames = [
  "b",
  "i",
  "u",
  "s",
  "a",
  "sup",
  "sub",
  "small",
  "code",
  "q",
  "kbd",
  "abbr",
] as const

export const secondaryMarkNames = [
  "bdi",
  "bdo",
  "cite",
  "data",
  "del",
  "ins",
  "dfn",
  "ruby",
  "samp",
  "time",
  "var",
  "span",
] as const

export type PrimaryMarkName = typeof primaryMarkNames[number]
export type SecondaryMarkName = typeof secondaryMarkNames[number]
export type MarkName = PrimaryMarkName | SecondaryMarkName

export type MarkOption = {
  name: MarkName
  label: string
  icon: string
  shortcutKey?: string
}

export const primaryMarkOptions: readonly MarkOption[] = [
  {name: "b", label: "Bold", icon: "MarkBold", shortcutKey: "b"},
  {name: "i", label: "Italic", icon: "MarkItalic", shortcutKey: "i"},
  {name: "u", label: "Underline", icon: "MarkUnderline", shortcutKey: "u"},
  {name: "s", label: "Strikethrough", icon: "MarkStrikethrough", shortcutKey: "s"},
  {name: "a", label: "Link", icon: "MarkLink", shortcutKey: "k"},
  {name: "sup", label: "Superscript", icon: "MarkSuperscript", shortcutKey: "o"},
  {name: "sub", label: "Subscript", icon: "MarkSubscript", shortcutKey: "l"},
  {name: "small", label: "Side Comment", icon: "MarkSmall", shortcutKey: "m"},
  {name: "code", label: "Code", icon: "MarkCode", shortcutKey: "c"},
  {name: "q", label: "Quotation", icon: "MarkQuotation", shortcutKey: "q"},
  {name: "kbd", label: "Keyboard Shortcut", icon: "MarkKeyboard", shortcutKey: "p"},
  {name: "abbr", label: "Abbreviation", icon: "MarkAbbreviation", shortcutKey: "a"},
] as const

export const secondaryMarkOptions: readonly MarkOption[] = [
  {name: "bdi", label: "Bidirectional Isolate", icon: "MarkBdi"},
  {name: "bdo", label: "Bidirectional Override", icon: "MarkBdo"},
  {name: "cite", label: "Citation Source", icon: "MarkCite"},
  {name: "data", label: "Data Annotation", icon: "MarkData"},
  {name: "del", label: "Deletion", icon: "MarkDeletion"},
  {name: "ins", label: "Insertion", icon: "MarkInsertion"},
  {name: "dfn", label: "Defined Term", icon: "MarkDefinition"},
  {name: "ruby", label: "Ruby Annotation", icon: "MarkRuby"},
  {name: "samp", label: "Sample Output", icon: "MarkSample"},
  {name: "time", label: "Date/Time Annotation", icon: "MarkTime"},
  {name: "var", label: "Variable", icon: "MarkVariable"},
  {name: "span", label: "Span", icon: "MarkSpan"},
] as const

export const markOptions = [...primaryMarkOptions, ...secondaryMarkOptions] as const
export const markNames = [...primaryMarkNames, ...secondaryMarkNames] as const

const markNameSet = new Set<string>(markNames)

/** Maps equivalent semantic tags onto the button which controls them. */
export function canonicalMarkName(name: string): MarkName | null {
  const normalized = name.toLowerCase()
  if(normalized === "strong") return "b"
  if(normalized === "em") return "i"
  return markNameSet.has(normalized)? normalized as MarkName: null
}

export function markTagNames(name: MarkName) {
  if(name === "b") return ["b", "strong"] as const
  if(name === "i") return ["i", "em"] as const
  return [name] as const
}

/** The legacy editor keymap, displayed with platform-native modifier names. */
export function markShortcutLabel(option: MarkOption, applePlatform: boolean) {
  if(!option.shortcutKey) return ""
  const key = option.shortcutKey.toUpperCase()
  return applePlatform? `⌥⇧${key}`: `Alt+Shift+${key}`
}
