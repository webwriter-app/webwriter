import type {Schema} from "./schema"
import type axe from "axe-core"
import {getDocumentRoot} from "./document-template"
import {isAtomicEditingElement} from "./utility"

export type AccessibilityFinding = {
  element: Element
  rule: string
  message: string
  text: string
  helpUrl: string
}

export type AccessibilityReviewer = {
  check(root: Element, schema: Schema): Promise<AccessibilityFinding[]>
  dispose(): void
}

type AxeRunner = Pick<typeof axe, "run">

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]

function getAuthoredScope(root: Element, schema: Schema) {
  const html = root.ownerDocument.documentElement
  const body = root.ownerDocument.body
  const documentRoot = body ? getDocumentRoot(body) : null
  // Body checks should include page-level html/head rules as well as the live
  // body content. Other element checks stay scoped to their requested subtree.
  const includesPage = root === body || root === documentRoot || root === html
  const context = includesPage
    ? html
    : root
  const excluded: Element[] = []
  const atomicWidgets = new Set<Element>()
  const excludeShadowUI = (parent: Element | ShadowRoot) => {
    for(const child of Array.from(parent.children)) {
      // A slot may be nested in widget layout containers. Excluding those
      // containers would also hide their authored assigned light DOM from axe.
      if(child.localName === "slot") continue
      if(child.querySelector("slot")) excludeShadowUI(child)
      else excluded.push(child)
    }
  }
  const visit = (element: Element) => {
    // Axe can inspect open widget shadow trees independently of their
    // authored light DOM. Those internals are implementation UI in either
    // case, so exclude their direct children from its context.
    if(element.shadowRoot) excludeShadowUI(element.shadowRoot)

    if(!(includesPage && element === documentRoot) && isAtomicEditingElement(element, schema)) {
      atomicWidgets.add(element)
      excluded.push(...Array.from(element.children))
      return
    }
    Array.from(element.children).forEach(visit)
  }
  visit(context)

  if(includesPage) {
    excluded.push(...Array.from(context.querySelectorAll(".◆editor-only, [data-webwriter-editor-only]")))
  }

  return {context, excluded: [...new Set(excluded)], atomicWidgets, includesPage}
}

function isWithinAtomicWidget(element: Element, atomicWidgets: Set<Element>) {
  let ancestor: Element | null = element
  while(ancestor) {
    if(atomicWidgets.has(ancestor)) return ancestor !== element
    ancestor = ancestor.parentElement
  }
  return false
}

function labelFor(element: Element) {
  const accessibleName = element.getAttribute("aria-label")?.trim()
    || (element.localName === "img" ? element.getAttribute("alt")?.trim() : "")
  const text = accessibleName || element.textContent?.trim().replace(/\s+/g, " ") || ""
  return text.slice(0, 160) || `<${element.localName}>`
}

export async function createAccessibilityReviewer(): Promise<AccessibilityReviewer> {
  // Keep axe out of the initial editor bundle path until a review is requested.
  const imported = await import("axe-core")
  const axe: AxeRunner = imported.default ?? imported
  let disposed = false

  return {
    async check(root, schema) {
      if(disposed || !root.isConnected) return []
      const {context, excluded, atomicWidgets, includesPage} = getAuthoredScope(root, schema)
      const results = await axe.run(
        excluded.length ? {include: [context], exclude: excluded} : context,
        {
          elementRef: true,
          iframes: false,
          preload: false,
          resultTypes: ["violations"],
          runOnly: {type: "tag", values: tags},
        },
      )
      if(disposed) return []

      const findings: AccessibilityFinding[] = []
      for(const violation of results.violations ?? []) {
        for(const node of violation.nodes ?? []) {
          const element = node.element
          if(!element || !element.isConnected || element.getRootNode() !== root.ownerDocument) continue
          if((!includesPage && !context.contains(element)) || isWithinAtomicWidget(element, atomicWidgets)) continue
          if(element.closest(".◆editor-only, [data-webwriter-editor-only]")) continue
          findings.push({
            element,
            rule: violation.id,
            message: violation.help,
            text: labelFor(element),
            helpUrl: violation.helpUrl,
          })
        }
      }
      return findings
    },
    dispose() {
      disposed = true
    },
  }
}
