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

export const styleMarkNames = [
  "font-family",
  "font-size",
  "color",
  "background-color",
] as const

export type StyleMarkName = typeof styleMarkNames[number]
export type StyleMarkValues = Partial<Record<StyleMarkName, string>>

export type StyleMarkOption = {
  label: string
  value: string
}

export const fontFamilyOptions: readonly StyleMarkOption[] = [
  {label: "Default font", value: ""},
  {label: "Arial", value: "Arial, sans-serif"},
  {label: "Verdana", value: "Verdana, sans-serif"},
  {label: "Tahoma", value: "Tahoma, sans-serif"},
  {label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif'},
  {label: "Times New Roman", value: '"Times New Roman", serif'},
  {label: "Georgia", value: "Georgia, serif"},
  {label: "Courier New", value: '"Courier New", monospace'},
] as const

export const fontSizeOptions: readonly StyleMarkOption[] = [
  {label: "Default size", value: ""},
  ...[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]
    .map(size => ({label: `${size} px`, value: `${size}px`})),
] as const

export const textColorOptions: readonly StyleMarkOption[] = [
  {label: "Default text color", value: ""},
  {label: "Black", value: "#000000"},
  {label: "Dark gray", value: "#4b5563"},
  {label: "Red", value: "#dc2626"},
  {label: "Orange", value: "#ea580c"},
  {label: "Gold", value: "#ca8a04"},
  {label: "Green", value: "#16a34a"},
  {label: "Blue", value: "#2563eb"},
  {label: "Purple", value: "#9333ea"},
  {label: "White", value: "#ffffff"},
] as const

export const backgroundColorOptions: readonly StyleMarkOption[] = [
  {label: "No background color", value: ""},
  {label: "Yellow", value: "#fef08a"},
  {label: "Orange", value: "#fed7aa"},
  {label: "Red", value: "#fecaca"},
  {label: "Green", value: "#bbf7d0"},
  {label: "Blue", value: "#bfdbfe"},
  {label: "Purple", value: "#e9d5ff"},
  {label: "Gray", value: "#e5e7eb"},
  {label: "Black", value: "#000000"},
] as const

const styleMarkNameSet = new Set<string>(styleMarkNames)

export function isStyleMarkName(name: string): name is StyleMarkName {
  return styleMarkNameSet.has(name)
}

export type MarkOption = {
  name: MarkName
  label: string
  icon: string
  shortcutKey?: string
}

export type MergedMarkGroup = {
  primary: MarkName
  alternatives: readonly MarkName[]
  members: readonly MarkName[]
}

const mergedMarkGroupDefinitions = [
  {primary: "code", alternatives: ["samp", "time", "data", "var"]},
  {primary: "ruby", alternatives: ["bdi", "bdo"]},
  {primary: "ins", alternatives: ["del"]},
] as const satisfies readonly {
  primary: MarkName
  alternatives: readonly MarkName[]
}[]

/** Mark controls which share one primary drawer button but retain their exact HTML tags. */
export const mergedMarkGroups: readonly MergedMarkGroup[] = mergedMarkGroupDefinitions.map(group => ({
  ...group,
  members: [group.primary, ...group.alternatives],
}))

export function mergedMarkGroupFor(mark: MarkName) {
  return mergedMarkGroups.find(group => group.members.includes(mark))
}

export type MarkAttributeOption = {
  name: string
  label: string
  placeholder: string
  inputType?: "text" | "url"
}

/** Element-specific attributes exposed in the mark detail row. Global HTML attributes are omitted. */
export const markAttributeOptions: Partial<Record<MarkName, readonly MarkAttributeOption[]>> = {
  a: [
    {name: "href", label: "Link", placeholder: "https://…", inputType: "url"},
    {name: "target", label: "Target", placeholder: "_blank"},
    {name: "download", label: "Download", placeholder: "Filename"},
    {name: "ping", label: "Ping", placeholder: "URLs"},
    {name: "rel", label: "Relationship", placeholder: "noopener"},
    {name: "hreflang", label: "Language", placeholder: "en"},
    {name: "type", label: "Media type", placeholder: "text/html"},
    {name: "referrerpolicy", label: "Referrer policy", placeholder: "Policy"},
  ],
  q: [{name: "cite", label: "Source", placeholder: "https://…", inputType: "url"}],
  data: [{name: "value", label: "Value", placeholder: "Value"}],
  time: [{name: "datetime", label: "Date/time", placeholder: "YYYY-MM-DD"}],
  ins: [
    {name: "cite", label: "Source", placeholder: "https://…", inputType: "url"},
    {name: "datetime", label: "Date/time", placeholder: "YYYY-MM-DD"},
  ],
  del: [
    {name: "cite", label: "Source", placeholder: "https://…", inputType: "url"},
    {name: "datetime", label: "Date/time", placeholder: "YYYY-MM-DD"},
  ],
}

export const markAttributeNames = [...new Set(
  Object.values(markAttributeOptions).flatMap(options => options?.map(option => option.name) ?? []),
)]

export type MarkAttributeValues = Partial<Record<MarkName, Record<string, string>>>

export function markAttributeOptionsFor(mark: MarkName) {
  return markAttributeOptions[mark] ?? []
}

export function markHasAttributes(mark: MarkName) {
  return markAttributeOptionsFor(mark).length > 0
}

export function isMarkAttributeName(mark: MarkName, attribute: string) {
  return markAttributeOptionsFor(mark).some(option => option.name === attribute)
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
const htmlNamespace = "http://www.w3.org/1999/xhtml"

/** Maps equivalent semantic tags onto the button which controls them. */
export function canonicalMarkName(name: string): MarkName | null {
  const normalized = name.toLowerCase()
  if(normalized === "strong") return "b"
  if(normalized === "em") return "i"
  return markNameSet.has(normalized)? normalized as MarkName: null
}

/** Whether an element is an HTML wrapper controlled by the marks feature.
 * `strong` and `em` are included as the DOM aliases of bold and italic. */
export function isMarkElement(node: unknown) {
  if(!node || typeof node !== "object") return false
  const element = node as Partial<Element>
  return element.nodeType === 1
    && element.namespaceURI === htmlNamespace
    && typeof element.localName === "string"
    && canonicalMarkName(element.localName) !== null
}

function normalizedMarkAttributes(element: Element) {
  return Array.from(element.attributes).flatMap(attribute => {
    if(attribute.name !== "class") return [[attribute.name, attribute.value] as const]
    const classes = attribute.value.split(/\s+/).filter(name => name && !name.startsWith("◆")).sort()
    return classes.length? [[attribute.name, classes.join(" ")] as const]: []
  }).sort(([first], [second]) => first.localeCompare(second))
}

/** Whether adjacent mark wrappers may be joined without changing meaning. */
export function areEquivalentMarkElements(first: Element, second: Element) {
  if(!isMarkElement(first) || !isMarkElement(second) || first.localName !== second.localName) return false
  const firstAttributes = normalizedMarkAttributes(first)
  const secondAttributes = normalizedMarkAttributes(second)
  return firstAttributes.length === secondAttributes.length
    && firstAttributes.every(([name, value], index) =>
      secondAttributes[index]?.[0] === name && secondAttributes[index]?.[1] === value,
    )
}

/** Recursively joins adjacent equivalent mark runs, like `Node.normalize()`
 * joins adjacent text nodes. */
export function normalizeMarkElements(root: Element) {
  for(const child of Array.from(root.children)) normalizeMarkElements(child)
  let current: ChildNode | null = root.firstChild
  while(current) {
    const next: ChildNode | null = current.nextSibling
    if(current instanceof Element && next instanceof Element && areEquivalentMarkElements(current, next)) {
      current.append(...Array.from(next.childNodes))
      next.remove()
      current.normalize()
      continue
    }
    current = next
  }
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
