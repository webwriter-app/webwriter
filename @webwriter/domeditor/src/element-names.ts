import {boardColumns, boardLayoutRole, documentLayoutMode, isBoardCard, isBoardColumn, isBoardGroup, isSlide, slideLayoutRole} from "./document-layout"
import {widgetNameLabel, type PackageInsertionItem} from "./packages"

export type ElementPresentation = {
  name: string
  icon: string
  iconUrl?: string
}

export const isLineBreakElement = (elementOrTagName: Element | string): boolean => {
  const tagName = typeof elementOrTagName === "string" ? elementOrTagName : elementOrTagName.tagName
  return tagName.toLowerCase() === "br" || tagName.toLowerCase() === "wbr"
}

const presentations: Record<string, ElementPresentation> = {
  html: {name: "Document", icon: "Document"},
  body: {name: "Document", icon: "Document"},
  p: {name: "Paragraph", icon: "Paragraph"},
  pre: {name: "Preformatted Text", icon: "Preformatted Text"},
  h1: {name: "Heading 1", icon: "Heading 1"},
  h2: {name: "Heading 2", icon: "Heading 2"},
  h3: {name: "Heading 3", icon: "Heading 3"},
  h4: {name: "Heading 4", icon: "Heading 4"},
  h5: {name: "Heading 5", icon: "Heading 5"},
  h6: {name: "Heading 6", icon: "Heading 6"},
  hgroup: {name: "Heading Group", icon: "Heading"},
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
  hr: {name: "Divider", icon: "Divider"},
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
  ruby: {name: "Ruby Annotation", icon: "MarkRuby"},
  rt: {name: "Ruby Text", icon: "MarkRuby"},
  rp: {name: "Ruby Fallback", icon: "MarkRuby"},
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

/** Identify the native parts of an authored Popup from their current DOM relationships. */
export function popupElementRole(element: Element): "popup" | "toggle" | "content" | null {
  if(element.namespaceURI !== "http://www.w3.org/1999/xhtml" || element.hasAttribute("is") || element.localName.includes("-")) return null
  if((element.localName === "div" || element.localName === "span") && element.classList.contains("ww-popup")) return "popup"
  const wrapper = element.parentElement?.closest(".ww-popup")
  const inWrapper = wrapper && wrapper.namespaceURI === "http://www.w3.org/1999/xhtml" && !wrapper.hasAttribute("is")
    && ["div", "span"].includes(wrapper.localName)
  // A nested custom element owns its contents; do not reinterpret them as Popup parts.
  for(let parent = element.parentElement; inWrapper && parent && parent !== wrapper; parent = parent.parentElement) {
    if(parent.localName.includes("-") || parent.hasAttribute("is")) return null
  }
  if(element.hasAttribute("popover")) {
    if(inWrapper) return "content"
    if(!element.classList.contains("ww-popup-content") || !element.id) return null
    const toggles = Array.from(element.ownerDocument.querySelectorAll(".ww-popup button[popovertarget]"))
      .filter(toggle => popupContentForToggle(toggle) === element)
    return toggles.length === 1 ? "content" : null
  }
  if(!inWrapper || element.localName !== "button") return null
  return popupContentForToggle(element) ? "toggle" : null
}

/** Resolve the authored popover linked to a Popup button. */
export function popupContentForToggle(toggle: Element): Element | null {
  if(toggle.localName !== "button" || toggle.namespaceURI !== "http://www.w3.org/1999/xhtml") return null
  const wrapper = toggle.closest(".ww-popup")
  if(!wrapper || !["div", "span"].includes(wrapper.localName) || wrapper.hasAttribute("is")) return null
  const target = toggle.getAttribute("popovertarget")
  if(!target) return null
  const nested = Array.from(wrapper.querySelectorAll("[popover][id]"))
    .find(candidate => candidate.id === target && candidate.closest(".ww-popup") === wrapper)
  if(nested) return nested
  const external = wrapper.isConnected ? toggle.ownerDocument.getElementById(target) : null
  return external?.classList.contains("ww-popup-content") && external.hasAttribute("popover") ? external : null
}

/** The authored Popup Content containing a live node, if any. */
export function popupContentAncestor(node: Node | null): Element | null {
  let element = node instanceof Element ? node : node?.parentElement ?? null
  while(element) {
    if(element.hasAttribute("popover") && popupElementRole(element) === "content") return element
    element = element.parentElement
  }
  return null
}

/** The authored button represented as Popup for a wrapper or its linked content. */
export function popupDisplayToggle(element: Element): Element | null {
  const role = popupElementRole(element)
  if(role !== "popup" && role !== "content") return null
  const wrapper = role === "popup" ? element : element.closest(".ww-popup")
  const toggles = Array.from((wrapper ?? element.ownerDocument).querySelectorAll(".ww-popup button[popovertarget], button[popovertarget]"))
    .filter(candidate => popupElementRole(candidate) === "toggle"
      && (role === "popup" ? candidate.closest(".ww-popup") === wrapper : popupContentForToggle(candidate) === element))
  return toggles.length === 1 ? toggles[0] : null
}

/** Returns a user-facing name and icon key for an HTML element. */
export function getElementPresentation(elementOrTagName: Element | string, packageItems: readonly PackageInsertionItem[] | undefined = globalThis.DOMEDITOR_PACKAGE_ITEMS): ElementPresentation {
  if(typeof elementOrTagName !== "string") {
    const popupRole = popupElementRole(elementOrTagName)
    if(popupRole) return {name: popupRole === "content" ? "Popup Content" : "Popup", icon: "Popup"}
    if(elementOrTagName.matches("h2:not([is])") && isBoardGroup(elementOrTagName.parentElement)) return {name: "Group Heading", icon: "Heading"}
    if(elementOrTagName.matches("h2:not([is])") && isBoardColumn(elementOrTagName.parentElement)) {
      return {name: "Column Heading", icon: "Heading"}
    }
    const boardRole = boardLayoutRole(elementOrTagName)
    if(boardRole === "group") return {name: "Group", icon: "Group"}
    if(boardRole) {
      const peers = boardRole === "column" ? boardColumns(elementOrTagName.ownerDocument.body)
        : Array.from(elementOrTagName.parentElement!.children).filter(isBoardCard)
      return {name: `${boardRole === "column" ? "Column" : "Card"} ${peers.indexOf(elementOrTagName as HTMLElement) + 1}`,
        icon: boardRole === "column" ? "BoardColumn" : "BoardCard"}
    }
    if(elementOrTagName === elementOrTagName.ownerDocument.body) {
      const mode = documentLayoutMode(elementOrTagName as HTMLElement)
      if(mode === "canvas") return {name: "Canvas", icon: "Canvas"}
      if(mode === "board") return {name: "Board", icon: "Columns"}
    }
    const role = slideLayoutRole(elementOrTagName)
    if(role === "root") return {name: "Slides", icon: "KeywordPresentation"}
    if(role === "slide") {
      const slides = Array.from(elementOrTagName.parentElement!.children).filter(isSlide)
      return {name: `Slide ${slides.indexOf(elementOrTagName as HTMLElement) + 1}`, icon: "Rectangle"}
    }
  }
  const tagName = typeof elementOrTagName === "string"
    ? elementOrTagName
    : elementOrTagName.tagName
  const normalizedTagName = tagName.toLowerCase()
  const packageItem = packageItems?.find(item => item.kind === "widget" && item.tag?.toLowerCase() === normalizedTagName)
  if(packageItem) return {name: packageItem.name, icon: "Packages", ...(packageItem.iconUrl ? {iconUrl: packageItem.iconUrl} : {})}
  const known = presentations[normalizedTagName]
  if(known) return known

  return normalizedTagName.includes("-") ? {name: widgetNameLabel(normalizedTagName), icon: "Packages"} : fallbackPresentation
}
