import { EditorState, Plugin } from "prosemirror-state"
import { Attrs } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import { camelCaseToSpacedCase } from "../../../utility"
import { SchemaPlugin, getActiveMarks } from ".";

export const styleAttr = {default: null}

export const styleAttrs = {
  textAlign: {default: null},
  lineHeight: {default: null},
  marginTop: {default: null},
  marginBottom: {default: null},
  marginLeft: {default: null},
  marginRight: {default: null},
  paddingTop: {default: null},
  paddingBottom: {default: null},
  paddingLeft: {default: null},
  paddingRight: {default: null},
  borderTop: {default: null},
  borderBottom: {default: null},
  borderLeft: {default: null},
  borderRight: {default: null},
  background: {default: null},
}

export function serializeStyleAttrs(attrs: Attrs) {
  return Object.keys(attrs)
    .filter(key => (key in styleAttrs) && attrs[key])
    .map(key => `${camelCaseToSpacedCase(key, false, "-")}: ${attrs[key]}`)
    .join("; ")
}

export function parseStyleAttrs(dom: HTMLElement | string) {
  return typeof dom === "string"
    ? {} as Record<keyof typeof styleAttrs, string>
    : Object.fromEntries(Object.keys(styleAttrs)
      .map(k => [k, dom.style[k as keyof typeof dom.style]])
      .filter(([k, v]) => v)
    ) as Record<keyof typeof styleAttrs, string>
}

export function getStyleValues(state: EditorState, view: EditorView & {window: Window}, key: string) {
  if(!view || view.isDestroyed || !view.dom) {
    return []
  }
  const values = new Set<string>()
  const sel = view.dom.ownerDocument.getSelection()!
  let fragment = state.selection.content().content
  fragment = fragment.addToEnd(state.selection.$anchor.node())
  fragment.descendants((node, pos, parent) => {
    const dom = view.nodeDOM(pos)
    if(dom instanceof Element && sel) {
      const marked = [dom, ...Array.from(dom.children)]
        .filter(el => sel.containsNode(el, true) || sel.isCollapsed && sel.anchorNode?.parentElement === el)
        .map(el => (el as any).style[key])
        .filter(k => k)
      marked.forEach(value => values.add(value))
    }
  })
  if(key === "font-family" || key === "font-size") {
    const markName = key === "font-family"? "_fontfamily": "_fontsize"
    state.storedMarks
      ?.filter(mark => mark.type.name === markName)
      ?.forEach(mark => values.add(mark.attrs.value))
    
  }
  return [...values]
}


export function getComputedStyleObject(element: Element) {
  const computedStyles = {} as Record<string, string>
  const computedDeclaration = getComputedStyle(element)
  for(let i = 0; i < computedDeclaration.length; i++) {
    const key = computedDeclaration.item(i)
    const value = computedDeclaration.getPropertyValue(key)
    computedStyles[key] = value
  }
  return computedStyles
}

export const stylePlugin = () => ({

} as SchemaPlugin)