/**
 * Editing capabilities for the conforming elements in the WHATWG HTML index.
 *
 * This is documentation and a regression contract, not an editor schema. The
 * live DOM remains authoritative and unfamiliar/custom elements are preserved.
 * Update `htmlLivingStandardElementNames` from the linked index first; the
 * typed capability record will then require an explicit decision for every
 * added element.
 */

export const htmlLivingStandardElementIndex = {
  url: "https://html.spec.whatwg.org/multipage/indices.html#elements",
  checked: "2026-08-31",
} as const

export const htmlLivingStandardElementNames = [
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo",
  "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup",
  "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "label",
  "legend", "li", "link", "main", "map", "mark", "math", "menu", "meta", "meter", "nav", "noscript",
  "object", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt",
  "ruby", "s", "samp", "script", "search", "section", "select", "selectedcontent", "slot", "small",
  "source", "span", "strong", "style", "sub", "summary", "sup", "svg", "table", "tbody", "td",
  "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var",
  "video", "wbr", "autonomous-custom-elements",
] as const

export type HTMLLivingStandardElementName = typeof htmlLivingStandardElementNames[number]
export type HTMLElementSupport = "full" | "partial" | "none"
export type HTMLElementInsertion = "menu" | "contextual" | "package" | "none"
export type HTMLElementCapabilityOwner =
  | "document"
  | "head"
  | "manipulation"
  | "mark"
  | "list"
  | "dialog"
  | "form"
  | "media"
  | "table"
  | "graphic"
  | "packages"
  | "platform"
  | "policy"

export type HTMLElementCapability = {
  support: HTMLElementSupport
  insertion: HTMLElementInsertion
  contentEditing: boolean
  attributeEditing: boolean
  structuralEditing: boolean
  intentionallyRestricted: boolean
  owner: HTMLElementCapabilityOwner
  comment: string
}

type CapabilityOverrides = Partial<Pick<
  HTMLElementCapability,
  "contentEditing" | "attributeEditing" | "structuralEditing" | "intentionallyRestricted"
>>

const capability = (
  support: HTMLElementSupport,
  owner: HTMLElementCapabilityOwner,
  insertion: HTMLElementInsertion,
  comment: string,
  overrides: CapabilityOverrides = {},
): HTMLElementCapability => ({
  support,
  insertion,
  contentEditing: true,
  attributeEditing: true,
  structuralEditing: false,
  intentionallyRestricted: false,
  owner,
  comment,
  ...overrides,
})

const full = (
  owner: HTMLElementCapabilityOwner,
  insertion: HTMLElementInsertion,
  comment: string,
  overrides?: CapabilityOverrides,
) => capability("full", owner, insertion, comment, overrides)

const partial = (
  owner: HTMLElementCapabilityOwner,
  insertion: HTMLElementInsertion,
  comment: string,
  overrides?: CapabilityOverrides,
) => capability("partial", owner, insertion, comment, overrides)

const none = (
  owner: HTMLElementCapabilityOwner,
  comment: string,
) => capability("none", owner, "none", comment, {
  contentEditing: false,
  attributeEditing: false,
  intentionallyRestricted: true,
})

/** Human-readable capability manifest. Keys intentionally match the tracked
 * WHATWG index above so a standard update cannot compile without a decision. */
export const htmlElementCapabilities = {
  a: full("mark", "contextual", "Link mark with complete hyperlink controls."),
  abbr: full("mark", "contextual", "Abbreviation mark with editable expansion."),
  address: full("manipulation", "menu", "Semantic section type with direct content editing.", {structuralEditing: true}),
  area: full("media", "contextual", "Image-map hotspot drawing and link controls.", {contentEditing: false, structuralEditing: true}),
  article: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  aside: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  audio: full("media", "menu", "Player, sources, tracks, fallback, and attributes.", {structuralEditing: true}),
  b: full("mark", "contextual", "Bold mark with semantic alias preservation."),
  base: full("head", "contextual", "Head metadata insertion and attributes.", {contentEditing: false}),
  bdi: full("mark", "contextual", "Advanced bidirectional-isolation mark."),
  bdo: full("mark", "contextual", "Bidirectional override with explicit direction."),
  blockquote: full("manipulation", "menu", "Section workflow with source citation.", {structuralEditing: true}),
  body: full("document", "none", "Primary authored editing surface.", {structuralEditing: true}),
  br: full("platform", "contextual", "Native and command-driven line breaks.", {contentEditing: false}),
  button: full("form", "menu", "Form control insertion, text, behavior, and attributes."),
  canvas: partial("policy", "none", "Preserved with attributes and fallback; drawing state is not DOM-editable.", {intentionallyRestricted: true}),
  caption: full("table", "contextual", "Table caption insertion, removal, and editing.", {structuralEditing: true}),
  cite: full("mark", "contextual", "Advanced citation mark."),
  code: full("mark", "contextual", "Inline code mark; preformatted blocks use PRE."),
  col: full("table", "contextual", "Column definitions and span controls.", {contentEditing: false, structuralEditing: true}),
  colgroup: full("table", "contextual", "Column-group insertion, movement, and removal.", {structuralEditing: true}),
  data: full("mark", "contextual", "Data mark with editable machine value."),
  datalist: full("form", "menu", "Insertion and contextual option management.", {structuralEditing: true}),
  dd: full("list", "contextual", "Description-list creation and keyboard editing."),
  del: full("mark", "contextual", "Deletion mark with citation and timestamp."),
  details: full("list", "menu", "Disclosure insertion, grouping, state, and keyboard behavior.", {structuralEditing: true}),
  dfn: full("mark", "contextual", "Advanced definition mark."),
  dialog: full("dialog", "menu", "Dialog structure, opener, close controls, and attributes.", {structuralEditing: true}),
  div: full("manipulation", "menu", "Generic section insertion and conversion.", {structuralEditing: true}),
  dl: full("list", "menu", "Description-list structure and keyboard operations.", {structuralEditing: true}),
  dt: full("list", "contextual", "Description-list term creation and editing."),
  em: full("mark", "contextual", "Semantic italic alias is preserved and edited."),
  embed: full("media", "contextual", "Website/media type with relevant attributes.", {contentEditing: false}),
  fieldset: full("form", "menu", "Form grouping with contextual legend creation.", {structuralEditing: true}),
  figcaption: full("manipulation", "contextual", "Caption creation, placement, and editing.", {structuralEditing: true}),
  figure: full("manipulation", "menu", "Section insertion, media wrapping, and caption controls.", {structuralEditing: true}),
  footer: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  form: full("form", "menu", "Form insertion, fields, attributes, and safe interaction.", {structuralEditing: true}),
  h1: full("manipulation", "menu", "Heading insertion and block conversion."),
  h2: full("manipulation", "menu", "Heading insertion and block conversion."),
  h3: full("manipulation", "menu", "Heading insertion and block conversion."),
  h4: full("manipulation", "menu", "Heading insertion and block conversion."),
  h5: full("manipulation", "menu", "Heading insertion and block conversion."),
  h6: full("manipulation", "menu", "Heading insertion and block conversion."),
  head: full("head", "none", "Dedicated metadata editor manages children and ordering.", {structuralEditing: true}),
  header: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  hgroup: full("manipulation", "menu", "Complete template plus heading and supporting-text tools.", {structuralEditing: true}),
  hr: full("manipulation", "menu", "Dedicated thematic-break insertion.", {contentEditing: false}),
  html: full("document", "none", "Document attributes and serialization are supported.", {structuralEditing: true}),
  i: full("mark", "contextual", "Italic mark with semantic alias preservation."),
  iframe: partial("media", "menu", "Website controls cover safe attributes; SRCdoc remains blocked.", {contentEditing: false, intentionallyRestricted: true}),
  img: full("media", "contextual", "Image, responsive attributes, and image-map controls.", {contentEditing: false, structuralEditing: true}),
  input: full("form", "menu", "All standard input states and extensive attributes.", {contentEditing: false}),
  ins: full("mark", "contextual", "Insertion mark with citation and timestamp."),
  kbd: full("mark", "contextual", "Dedicated keyboard-input mark."),
  label: full("form", "menu", "Label text, association, attributes, and native activation."),
  legend: full("form", "contextual", "Contextual fieldset legend creation and editing."),
  li: full("list", "contextual", "List structure, keyboard behavior, and item numbering."),
  link: partial("head", "contextual", "General head links are editable; stylesheet links are read-only.", {contentEditing: false, intentionallyRestricted: true}),
  main: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  map: full("media", "contextual", "Image-map creation, naming, and hotspot management.", {structuralEditing: true}),
  mark: full("mark", "contextual", "Semantic highlight distinct from background styling."),
  math: partial("manipulation", "menu", "Native MathML is inserted and preserved without a formula editor.", {contentEditing: false}),
  menu: full("list", "contextual", "List-type conversion and keyboard behavior.", {structuralEditing: true}),
  meta: full("head", "contextual", "Metadata presets and arbitrary safe attributes.", {contentEditing: false}),
  meter: full("form", "menu", "Insertion, fallback text, and numeric attributes."),
  nav: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  noscript: partial("policy", "contextual", "Head metadata is editable; body-context authoring is deliberately unsupported.", {intentionallyRestricted: true}),
  object: partial("media", "contextual", "Object data and attributes are editable; fallback structure is not managed.", {contentEditing: false}),
  ol: full("list", "menu", "List editing, numbering, start, reverse, and item overrides.", {structuralEditing: true}),
  optgroup: full("form", "contextual", "Contextual grouping, label, state, and option management.", {structuralEditing: true}),
  option: full("form", "contextual", "Contextual creation, text, value, label, and state."),
  output: full("form", "menu", "Insertion, text, and form association."),
  p: full("manipulation", "menu", "Default block insertion, splitting, conversion, and styling."),
  picture: partial("media", "menu", "Responsive image container is supported; source rows are not yet managed.", {contentEditing: false}),
  pre: full("manipulation", "menu", "Preformatted block insertion and conversion."),
  progress: full("form", "menu", "Insertion, fallback text, value, and maximum."),
  q: full("mark", "contextual", "Inline quotation mark with citation."),
  rp: full("mark", "contextual", "Ruby fallback creation, editing, and removal."),
  rt: full("mark", "contextual", "Ruby annotation creation, editing, and removal."),
  ruby: full("mark", "contextual", "Structured ruby runs, annotations, and fallbacks.", {structuralEditing: true}),
  s: full("mark", "contextual", "Dedicated strikethrough mark."),
  samp: full("mark", "contextual", "Advanced sample-output mark."),
  script: none("policy", "Existing scripts are preserved; creation and editing are blocked."),
  search: full("manipulation", "menu", "Semantic section insertion and conversion.", {structuralEditing: true}),
  section: full("manipulation", "menu", "Dedicated wrap, add, remove, and conversion commands.", {structuralEditing: true}),
  select: full("form", "menu", "Options, groups, attributes, state, and customizable structure.", {structuralEditing: true}),
  selectedcontent: full("form", "contextual", "Created and maintained by customizable-select tooling.", {contentEditing: false}),
  slot: partial("policy", "none", "Attributes and fallback are preserved; component slot contracts are unsupported.", {intentionallyRestricted: true}),
  small: full("mark", "contextual", "Dedicated side-comment mark."),
  source: partial("media", "contextual", "Timed-media sources are managed; picture source rows remain unsupported.", {contentEditing: false, structuralEditing: true}),
  span: full("mark", "contextual", "Generic inline wrapper and style carrier."),
  strong: full("mark", "contextual", "Semantic bold alias is preserved and edited."),
  style: none("policy", "Existing styles are preserved; arbitrary CSS editing is blocked."),
  sub: full("mark", "contextual", "Dedicated subscript mark."),
  summary: full("list", "contextual", "Disclosure summary creation and specialized keyboard behavior."),
  sup: full("mark", "contextual", "Dedicated superscript mark."),
  svg: full("graphic", "menu", "Graphic insertion, shapes, layers, arrangement, and viewport.", {structuralEditing: true}),
  table: full("table", "menu", "Complete table insertion, selection, layout, semantics, and styling.", {structuralEditing: true}),
  tbody: full("table", "contextual", "Row-group creation, conversion, movement, and removal.", {structuralEditing: true}),
  td: full("table", "contextual", "Cell editing, spanning, role conversion, and header associations.", {structuralEditing: true}),
  template: partial("policy", "contextual", "Head templates and attributes are preserved; body template contents are deliberately unsupported.", {contentEditing: false, intentionallyRestricted: true}),
  textarea: full("form", "menu", "Native value editing, synchronization, text, and attributes."),
  tfoot: full("table", "contextual", "Footer-group creation, conversion, movement, and removal.", {structuralEditing: true}),
  th: full("table", "contextual", "Header-cell roles, scope, abbreviation, and associations.", {structuralEditing: true}),
  thead: full("table", "contextual", "Header-group creation, conversion, movement, and removal.", {structuralEditing: true}),
  time: full("mark", "contextual", "Time mark with machine-readable datetime."),
  title: full("head", "contextual", "Dedicated document-title and head editing."),
  tr: full("table", "contextual", "Row insertion, deletion, navigation, and selection.", {structuralEditing: true}),
  track: full("media", "contextual", "Timed-text insertion, ordering, state, and attributes.", {contentEditing: false, structuralEditing: true}),
  u: full("mark", "contextual", "Dedicated underline mark."),
  ul: full("list", "menu", "List creation, styles, nesting, and keyboard editing.", {structuralEditing: true}),
  var: full("mark", "contextual", "Advanced variable mark."),
  video: full("media", "menu", "Player, sources, tracks, fallback, and attributes.", {structuralEditing: true}),
  wbr: full("platform", "contextual", "Dedicated word-break insertion.", {contentEditing: false}),
  "autonomous-custom-elements": partial("packages", "package", "Preserved and atomic; internal editing depends on the package contract.", {contentEditing: false, intentionallyRestricted: true}),
} satisfies Record<HTMLLivingStandardElementName, HTMLElementCapability>

export function htmlElementSupportCounts() {
  const counts: Record<HTMLElementSupport, number> = {full: 0, partial: 0, none: 0}
  Object.values(htmlElementCapabilities).forEach(entry => counts[entry.support]++)
  return counts
}
