import {getElementPresentation} from "./element-names"
import {formElementTypes} from "./form"
import {sectionNames} from "./sections"
import {isGraphicShapeType} from "./graphic"
import {mathStructureOptions} from "./math"

export type InsertionMenuItem = {
  id?: string
  tag?: string
  /** Complete authored markup used instead of an empty element. */
  html?: string
  name: string
  section: "Text" | "Lists" | "Media" | "Forms" | "Packages"
  packageName?: string
  kind?: "widget" | "snippet" | "html"
  description?: string
  icon?: string
  iconUrl?: string
  htmlUrl?: string
}

type BuiltinInsertionMenuItem = InsertionMenuItem & {
  tag: string
  section: "Text" | "Lists" | "Media" | "Forms"
}

const insertionMenuItem = (
  section: BuiltinInsertionMenuItem["section"],
  tag: string,
  name?: string,
): BuiltinInsertionMenuItem => {
  const presentation = getElementPresentation(tag)
  return {section, tag, name: name ?? presentation.name, icon: presentation.icon}
}

export const headingInsertionTags = ["h2", "h3", "h4", "h5", "h6"] as const
export const sectionInsertionTags = sectionNames.filter(tag => tag !== "section")
export const deliberatelyUnsupportedInsertionTags = ["canvas", "template", "slot", "dialog", "hgroup", "hr", "dl", ...formElementTypes] as const

export const insertionMenuItems: InsertionMenuItem[] = [
  insertionMenuItem("Text", "p"),
  insertionMenuItem("Text", "h1"),
  ...headingInsertionTags.map(tag => insertionMenuItem("Text", tag)),
  insertionMenuItem("Lists", "ul"),
  insertionMenuItem("Lists", "ol"),
  insertionMenuItem("Lists", "details"),
  insertionMenuItem("Media", "table"),
  insertionMenuItem("Media", "picture"),
  insertionMenuItem("Media", "svg"),
  insertionMenuItem("Media", "audio"),
  insertionMenuItem("Media", "iframe"),
  insertionMenuItem("Media", "video"),
  insertionMenuItem("Media", "math"),
  insertionMenuItem("Media", "section"),
  ...sectionInsertionTags.map(tag => insertionMenuItem("Media", tag, tag === "div" ? "Division" : undefined)),
]

/** Returns valid empty-element markup using the browser's HTML serializer. */
export const emptyElementHTML = (tag: string) => document.createElement(tag).outerHTML

export const elementDragType = "application/x-webwriter-element-tag"
export const ribbonInsertionDragType = "application/x-webwriter-ribbon-insertion"
export const nodeDragType = "application/x-webwriter-node"

/** Returns whether an action inserts a package, package member, or saved snippet. */
export function ribbonInsertionAction(action: string) {
  return ["package:", "package-member:", "user-snippet:"].some(prefix =>
    action.startsWith(prefix) && action.length > prefix.length,
  )
}

/** Returns whether a ribbon action inserts a supported built-in element. */
export function ribbonElementInsertionAction(action: string) {
  if(action.startsWith("element:")) return insertionMenuItems.some(item => item.tag === action.slice("element:".length))
  const listMatch = /^list-style:(ul|ol):(.+)$/.exec(action)
  if(listMatch) {
    const styles = listMatch[1] === "ul"
      ? ["disc", "circle", "square", "none"]
      : ["decimal", "decimal-leading-zero", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman", "none"]
    return styles.includes(listMatch[2])
  }
  const shapePrefix = "insert-graphic-shape:"
  if(action.startsWith(shapePrefix)) return isGraphicShapeType(action.slice(shapePrefix.length))
  const mathPrefix = "insert-math:"
  if(action.startsWith(mathPrefix)) {
    const structure = action.slice(mathPrefix.length)
    return mathStructureOptions.some(option => option.command === `structure:${structure}`)
  }
  return false
}

/** Starts a copy drag for a ribbon insertion action. */
export function startRibbonInsertionDrag(event: DragEvent, action: string, icon: Element | null, html?: string) {
  if(!event.dataTransfer || (!ribbonInsertionAction(action) && !ribbonElementInsertionAction(action))) return
  event.dataTransfer.setData(ribbonInsertionDragType, action)
  if(html) event.dataTransfer.setData("text/html", html)
  event.dataTransfer.effectAllowed = "copy"
  if(icon instanceof HTMLElement || icon instanceof SVGElement) event.dataTransfer.setDragImage?.(icon, 12, 12)
}

/** Only insertion commands that create an element can be dragged from the ribbon. */
export function ribbonElementTag(label: string, action = label) {
  if(label === "Heading") return "h1"
  if(action === "toggle-list:ul") return "ul"
  if(action === "toggle-list:ol") return "ol"
  if(action === "insert-details") return "details"
  if(action === "toggle-section") return "section"
  return insertionMenuItems.find(item => (item.name === action || item.name === label) && item.tag)?.tag ?? null
}

export function startElementDrag(event: DragEvent, tag: string, icon: Element | null) {
  if(!event.dataTransfer || !insertionMenuItems.some(item => item.tag === tag)) return
  // Use the same boundary-routing marker as widgets. During dragover the
  // payload may be hidden, but the drag must still reach editor overlays.
  startRibbonInsertionDrag(event, `element:${tag}`, icon, emptyElementHTML(tag))
  event.dataTransfer.setData(elementDragType, tag)
  // Dragover may inspect types, but browsers hide data values until drop.
  event.dataTransfer.setData(`${elementDragType}-${tag}`, tag)
}
