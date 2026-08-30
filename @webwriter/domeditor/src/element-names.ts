export type ElementPresentation = {
  name: string
  icon: string
}

export const isLineBreakElement = (elementOrTagName: Element | string): boolean => {
  const tagName = typeof elementOrTagName === "string" ? elementOrTagName : elementOrTagName.tagName
  return tagName.toLowerCase() === "br" || tagName.toLowerCase() === "wbr"
}

const presentations: Record<string, ElementPresentation> = {
  body: {name: "Document", icon: "Document"},
  p: {name: "Paragraph", icon: "Paragraph"},
  pre: {name: "Preformatted Text", icon: "Preformatted Text"},
  h1: {name: "Heading 1", icon: "Heading 1"},
  h2: {name: "Heading 2", icon: "Heading 2"},
  h3: {name: "Heading 3", icon: "Heading 3"},
  h4: {name: "Heading 4", icon: "Heading 4"},
  h5: {name: "Heading 5", icon: "Heading 5"},
  h6: {name: "Heading 6", icon: "Heading 6"},
  ul: {name: "List", icon: "List"},
  ol: {name: "Enumeration", icon: "Enumeration"},
  dl: {name: "Glossary", icon: "Glossary"},
  menu: {name: "Menu", icon: "List"},
  li: {name: "List Item", icon: "Lists"},
  dt: {name: "Description Term", icon: "Glossary"},
  dd: {name: "Description", icon: "Glossary"},
  details: {name: "Details", icon: "Details"},
  summary: {name: "Summary", icon: "Details"},
  dialog: {name: "Dialog", icon: "Details"},
  table: {name: "Table", icon: "Table"},
  thead: {name: "Table Header", icon: "Table"},
  tbody: {name: "Table Body", icon: "Table"},
  tfoot: {name: "Table Footer", icon: "Table"},
  tr: {name: "Table Row", icon: "Table"},
  td: {name: "Table Cell", icon: "Table"},
  th: {name: "Table Header Cell", icon: "Table"},
  picture: {name: "Image", icon: "Image"},
  img: {name: "Image", icon: "Image"},
  svg: {name: "Graphic", icon: "Graphic"},
  audio: {name: "Audio", icon: "Audio"},
  video: {name: "Video", icon: "Video"},
  iframe: {name: "Website", icon: "Website"},
  math: {name: "Formula", icon: "Formula"},
  span: {name: "Text", icon: "Text"},
  br: {name: "Line Break", icon: "Paragraph"},
  wbr: {name: "Word Break", icon: "Paragraph"},
  hr: {name: "Divider", icon: "Section"},
  code: {name: "Code", icon: "Preformatted Text"},
  kbd: {name: "Keyboard Input", icon: "Input"},
  samp: {name: "Sample Text", icon: "Preformatted Text"},
  mark: {name: "Highlighted Text", icon: "Highlight"},
  del: {name: "Deleted Text", icon: "Clear"},
  ins: {name: "Inserted Text", icon: "Underline"},
  s: {name: "Strikethrough Text", icon: "Clear"},
  sub: {name: "Subscript", icon: "Superscript"},
  sup: {name: "Superscript", icon: "Superscript"},
  q: {name: "Quote", icon: "Quote"},
  cite: {name: "Citation", icon: "Quote"},
  canvas: {name: "Drawing", icon: "Graphic"},
  script: {name: "Script", icon: "Preformatted Text"},
  style: {name: "Style", icon: "Theme"},
  template: {name: "Template", icon: "Section"},
  slot: {name: "Slot", icon: "Section"},
  embed: {name: "Website", icon: "Website"},
  object: {name: "Website", icon: "Website"},
  source: {name: "Media Source", icon: "Video"},
  track: {name: "Captions", icon: "Video"},
  div: {name: "Section", icon: "Section"},
  section: {name: "Section", icon: "Section"},
  article: {name: "Article", icon: "Article"},
  main: {name: "Main Content", icon: "Layout"},
  aside: {name: "Sidebar", icon: "Layout"},
  header: {name: "Header", icon: "Layout"},
  footer: {name: "Footer", icon: "Layout"},
  nav: {name: "Navigation", icon: "Layout"},
  figure: {name: "Figure", icon: "Section"},
  figcaption: {name: "Caption", icon: "Section"},
  blockquote: {name: "Quote", icon: "Quote"},
  strong: {name: "Bold Text", icon: "Bold"},
  b: {name: "Bold Text", icon: "Bold"},
  em: {name: "Emphasized Text", icon: "Italic"},
  i: {name: "Emphasized Text", icon: "Italic"},
  u: {name: "Underlined Text", icon: "Underline"},
  a: {name: "Link", icon: "Link"},
  form: {name: "Form", icon: "Form"},
  label: {name: "Label", icon: "Label"},
  button: {name: "Button", icon: "Button"},
  input: {name: "Text Field", icon: "Input"},
  textarea: {name: "Text Area", icon: "Input"},
  select: {name: "Dropdown", icon: "Input"},
  meter: {name: "Meter", icon: "Input"},
  datalist: {name: "Data List", icon: "Input"},
  fieldset: {name: "Field Set", icon: "Form"},
  legend: {name: "Legend", icon: "Label"},
  optgroup: {name: "Option Group", icon: "Input"},
  option: {name: "Option", icon: "Input"},
  output: {name: "Output", icon: "Input"},
  progress: {name: "Progress", icon: "Input"},
  selectedcontent: {name: "Selected Content", icon: "Input"},
  search: {name: "Search", icon: "Search"},
  address: {name: "Address", icon: "Section"},
}

const fallbackPresentation = {name: "Content", icon: "Section"}

/** Returns a user-facing name and icon key for an HTML element. */
export function getElementPresentation(elementOrTagName: Element | string): ElementPresentation {
  const tagName = typeof elementOrTagName === "string"
    ? elementOrTagName
    : elementOrTagName.tagName
  const normalizedTagName = tagName.toLowerCase()
  const known = presentations[normalizedTagName]
  if(known) return known

  return fallbackPresentation
}
