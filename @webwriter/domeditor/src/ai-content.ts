/**
 * Checks the small set of structural rules used for AI-authored replacement
 * fragments.  This is deliberately a syntactic check: detached fragments do
 * not have the document's stylesheet, so a class (or an unfamiliar inline
 * declaration) may still provide a layout contract that cannot be inferred
 * here.
 *
 * The helper only considers wrappers which are commonly introduced as a
 * topic, typography, or spacing container. Required HTML containers are
 * preserved while their editable descendants remain inspectable; custom
 * elements are left to their own content contracts.
 */

const wrapperNames = new Set(["section", "div", "article", "main"])
const htmlNamespace = "http://www.w3.org/1999/xhtml"
const requiredContainerNames = new Set([
  "ul", "ol", "menu", "dl", "table", "caption", "colgroup", "thead", "tbody", "tfoot", "tr", "td", "th",
  "figure", "fieldset",
])

type WrapperDisposition = "layout" | "ambiguous" | "unnecessary"

function isCustomElement(element: Element) {
  return element.localName.includes("-") || element.hasAttribute("is")
}

function isHtmlElement(element: Element) {
  return element.namespaceURI === htmlNamespace
}

function isRequiredContainer(element: Element) {
  return requiredContainerNames.has(element.localName)
}

function inlineStyle(element: Element) {
  // The validator only inspects HTML elements. Element's base DOM type does
  // not expose the HTMLElement style convenience property in TypeScript.
  return (element as HTMLElement).style
}

function inlineDisplay(element: Element) {
  // CSSStyleDeclaration performs the browser's declaration parsing for us.
  // Invalid declarations remain empty and therefore ambiguous.
  const value = inlineStyle(element).getPropertyValue("display").trim().toLowerCase()
  return value || undefined
}

function isInlineLayout(element: Element) {
  const display = inlineDisplay(element)
  return element.classList.contains("ww-column-group") || display === "grid" || display === "inline-grid" || display === "flex" || display === "inline-flex"
}

function wrapperDisposition(element: Element): WrapperDisposition {
  const style = inlineStyle(element)
  const display = inlineDisplay(element)
  if(isInlineLayout(element)) {
    return "layout"
  }
  if(display) return "unnecessary"

  // These declarations state a presentation purpose directly.  Unknown
  // declarations (including custom properties) remain ambiguous because a
  // detached fragment cannot resolve the document's CSS contract.
  for(let index = 0; index < style.length; index++) {
    const property = style.item(index).toLowerCase()
    if(/^(?:margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|font(?:-[a-z-]+)?|line-height|text-align|color)$/.test(property)) {
      return "unnecessary"
    }
  }
  if(element.hasAttribute("class") || element.hasAttribute("style")) return "ambiguous"
  return "unnecessary"
}

function shallowIdentity(element: Element) {
  const attributes = Array.from(element.attributes)
    .map(attribute => `${attribute.namespaceURI ?? ""}:${attribute.name}=${attribute.value}`)
    .sort()
    .join("\u0000")
  return `${element.namespaceURI ?? ""}:${element.localName}\u0001${attributes}`
}

function addExistingWrapper(paths: Map<string, string>, path: string, element: Element) {
  if(wrapperNames.has(element.localName) && isHtmlElement(element)) {
    paths.set(`${path}:${element.localName}`, shallowIdentity(element))
  }
}

/** Collects wrapper paths and shallow identities from an authored region. */
function existingWrapperPaths(existing: ParentNode | undefined) {
  const paths = new Map<string, string>()
  if(!existing) return paths

  const visit = (parent: ParentNode, path: string) => {
    let elementIndex = 0
    for(const child of Array.from(parent.children)) {
      const childPath = pathForChild(path, elementIndex++)
      if(!isHtmlElement(child)) continue
      addExistingWrapper(paths, childPath, child)
      if(!isCustomElement(child)) visit(child, childPath)
    }
  }
  // ParentNode includes Element. Supporting an element as the region root is
  // useful to callers replacing a selected wrapper itself, while Document and
  // DocumentFragment retain their ordinary child paths.
  if(existing.nodeType === 1) {
    const root = existing as Element
    addExistingWrapper(paths, "0", root)
    if(!isCustomElement(root)) visit(root, "0")
  }
  else visit(existing, "")
  return paths
}

function pathForChild(path: string, index: number) {
  return path ? `${path}.${index}` : String(index)
}

function contentUnitCount(element: Element) {
  return Array.from(element.childNodes).filter(node => {
    if(node.nodeType === 3) return Boolean(node.textContent?.trim())
    if(node.nodeType !== 1) return false
    const child = node as Element
    return /^h[1-6]$/.test(child.localName)
      || child.localName === "p"
      || isCustomElement(child)
      || isRequiredContainer(child)
  }).length
}

function isLayoutItemGroup(element: Element, parentLayout: boolean) {
  return parentLayout && !inlineDisplay(element) && contentUnitCount(element) > 1
}

/**
 * Validates structural flatness of an AI replacement fragment.
 *
 * @param fragment The inert fragment (or parent) to validate. It is never
 * mutated.
 * @param existing The previous authored replacement region, when available.
 * Wrappers at the same element path with the same tag and shallow attributes
 * are considered authored structure and are therefore preserved.
 * @throws {Error} when a newly introduced wrapper is clearly unnecessary.
 */
export function validateAIFragmentStructure(fragment: ParentNode, existing?: ParentNode): void {
  const existingPaths = existingWrapperPaths(existing)

  const visit = (parent: ParentNode, path: string, parentLayout: boolean) => {
    let elementIndex = 0
    for(const child of Array.from(parent.children)) {
      const childPath = pathForChild(path, elementIndex++)
      if(!isHtmlElement(child)) continue
      if(isCustomElement(child)) continue

      if(wrapperNames.has(child.localName)) {
        const isExisting = existingPaths.get(`${childPath}:${child.localName}`) === shallowIdentity(child)
        const disposition = wrapperDisposition(child)
        const allowedAsLayoutItem = isLayoutItemGroup(child, parentLayout)
        if(!isExisting && disposition === "unnecessary" && !allowedAsLayoutItem) {
          throw new Error(
            `AI fragment adds an unnecessary <${child.localName}> wrapper at child ${childPath}. `
            + "Keep headings, paragraphs, and widgets as direct siblings; use a grid or flex wrapper only for layout.",
          )
        }
      }

      visit(child, childPath, isInlineLayout(child))
    }
  }

  visit(fragment, "", false)
}
