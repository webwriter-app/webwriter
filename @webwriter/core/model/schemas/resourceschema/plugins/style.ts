import { EditorState, Plugin } from "prosemirror-state"
import { Attrs } from "prosemirror-model"
import { EditorView } from "prosemirror-view"
import { camelCaseToSpacedCase } from "../../../../utility"
import { SchemaPlugin } from ".";

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
  const values = new Set<string>()
  const kebabKey = camelCaseToSpacedCase(key, false, "-")
  state.selection.content().content.descendants((node, pos, parent) => {
    const dom = view.nodeDOM(pos)
    if(dom instanceof Element) {
      const computed = view.window.getComputedStyle(dom).getPropertyValue(kebabKey)
      values.add(computed)
    }
  })
  const beforeDom = view.nodeDOM(state.selection.$from.before(1))
  if(beforeDom instanceof Element) {
    const beforeComputed = view.window.getComputedStyle(beforeDom).getPropertyValue(kebabKey)
    values.add(beforeComputed)
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