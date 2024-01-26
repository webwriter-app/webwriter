import {Node, Mark, NodeSpec, MarkSpec, AttributeSpec, Attrs} from "prosemirror-model"
import { z } from "zod"

export const eventHTMLAttributes = {
  onabort: {default: undefined},
  onautocomplete: {default: undefined},
  onautocompleteerror: {default: undefined},
  onblur: {default: undefined},
  oncancel: {default: undefined},
  oncanplay: {default: undefined},
  oncanplaythrough: {default: undefined},
  onchange: {default: undefined},
  onclick: {default: undefined},
  onclose: {default: undefined},
  oncontextmenu: {default: undefined},
  oncuechange: {default: undefined},
  ondblclick: {default: undefined},
  ondrag: {default: undefined},
  ondragend: {default: undefined},
  ondragenter: {default: undefined},
  ondragleave: {default: undefined},
  ondragover: {default: undefined},
  ondragstart: {default: undefined},
  ondrop: {default: undefined},
  ondurationchange: {default: undefined},
  onemptied: {default: undefined},
  onended: {default: undefined},
  onerror: {default: undefined},
  onfocus: {default: undefined},
  oninput: {default: undefined},
  oninvalid: {default: undefined},
  onkeydown: {default: undefined},
  onkeypress: {default: undefined},
  onkeyup: {default: undefined},
  onload: {default: undefined},
  onloadeddata: {default: undefined},
  onloadedmetadata: {default: undefined},
  onloadstart: {default: undefined},
  onmousedown: {default: undefined},
  onmouseenter: {default: undefined},
  onmouseleave: {default: undefined},
  onmousemove: {default: undefined},
  onmouseout: {default: undefined},
  onmouseover: {default: undefined},
  onmouseup: {default: undefined},
  onmousewheel: {default: undefined},
  onpause: {default: undefined},
  onplay: {default: undefined},
  onplaying: {default: undefined},
  onprogress: {default: undefined},
  onratechange: {default: undefined},
  onreset: {default: undefined},
  onresize: {default: undefined},
  onscroll: {default: undefined},
  onseeked: {default: undefined},
  onseeking: {default: undefined},
  onselect: {default: undefined},
  onshow: {default: undefined},
  onsort: {default: undefined},
  onstalled: {default: undefined},
  onsubmit: {default: undefined},
  onsuspend: {default: undefined},
  ontimeupdate: {default: undefined},
  ontoggle: {default: undefined},
  onvolumechange: {default: undefined},
  onwaiting: {default: undefined}
}

export const ariaAttributes = {
  role: {default: undefined},
  "aria-autocomplete": {default: undefined},
  "aria-checked": {default: undefined},
  "aria-disabled": {default: undefined},
  "aria-errormessage": {default: undefined},
  "aria-expanded": {default: undefined},
  "aria-haspopup": {default: undefined},
  "aria-hidden": {default: undefined},
  "aria-invalid": {default: undefined},
  "aria-label": {default: undefined},
  "aria-level": {default: undefined},
  "aria-modal": {default: undefined},
  "aria-multiline": {default: undefined},
  "aria-multiselectable": {default: undefined},
  "aria-orientation": {default: undefined},
  "aria-placeholder": {default: undefined},
  "aria-pressed": {default: undefined},
  "aria-readonly": {default: undefined},
  "aria-required": {default: undefined},
  "aria-selected": {default: undefined},
  "aria-sort": {default: undefined},
  "aria-valuemax": {default: undefined},
  "aria-valuemin": {default: undefined},
  "aria-valuenow": {default: undefined},
  "aria-valuetext": {default: undefined},
  "aria-busy": {default: undefined},
  "aria-live": {default: undefined},
  "aria-relevant": {default: undefined},
  "aria-atomic": {default: undefined},
  "aria-dropeffect": {default: undefined},
  "aria-grabbed": {default: undefined},
  "aria-activedescendant": {default: undefined},
  "aria-colcount": {default: undefined},
  "aria-colindex": {default: undefined},
  "aria-colspan": {default: undefined},
  "aria-controls": {default: undefined},
  "aria-describedby": {default: undefined},
  "aria-description": {default: undefined},
  "aria-details": {default: undefined},
  "aria-flowto": {default: undefined},
  "aria-labelledby": {default: undefined},
  "aria-owns": {default: undefined},
  "aria-posinset": {default: undefined},
  "aria-rowcount": {default: undefined},
  "aria-rowindex": {default: undefined},
  "aria-rowspan": {default: undefined},
  "aria-setsize": {default: undefined}
}

export const coreHTMLAttributes = {
  accesskey: {default: undefined},
  autocapitalize: {default: undefined},
  autofocus: {default: undefined},
  class: {default: undefined},
  contenteditable: {default: undefined},
  data: {default: {}},
  dir: {default: undefined},
  draggable: {default: undefined},
  enterkeyhint: {default: undefined},
  exportparts: {default: undefined},
  hidden: {default: undefined},
  id: {default: undefined},
  inert: {default: undefined},
  inputmode: {default: undefined},
  is: {default: undefined},
  itemid: {default: undefined},
  itemprop: {default: undefined},
  itemref: {default: undefined},
  itemscope: {default: undefined},
  itemtype: {default: undefined},
  lang: {default: undefined},
  nonce: {default: undefined},
  part: {default: undefined},
  popover: {default: undefined},
  role: {default: undefined},
  slot: {default: undefined},
  spellcheck: {default: undefined},
  style: {default: undefined},
  tabindex: {default: undefined},
  title: {default: undefined},
  translate: {default: undefined},
  virtualkeyboardpolicy: {default: undefined}
}

export const globalHTMLAttributes = {
  ...coreHTMLAttributes,
  ...ariaAttributes,
  ...eventHTMLAttributes
}

const globalKeywordValues = ["initial", "inherit", "unset", "revert", "revert-layer"]

const styleSpec: AttributeSpec & Record<string, any> = {
  default: undefined,
  properties: {
    accentColor: z.string()
  }
}

export function toAttributes(node: Node | Attrs, extraAttrs?: Attrs) {
  node?.type?.name === "video" && console.log("toAttributes", node)
  const complex = node instanceof Node || node instanceof Mark
  const outputAttrs = {} as Record<string, string>
  const attrs = complex? {...node.attrs, ...extraAttrs}: {...node, ...extraAttrs}
  const attrSpec: (k: string) => AttributeSpec & {private?: boolean} | undefined = (k: string) => complex? (node.type?.spec?.attrs ?? {})[k]: {}
  for (const [k, v] of Object.entries(attrs)) {
    const spec = attrSpec(k)
    if(k !== "data" && v !== null && v !== undefined && v !== false && (spec?.default !== v) && !spec?.private) {
      outputAttrs[k] = Array.isArray(v)? v.join(" "): v 
    }
    if(k === "data") {
      for(const [dk, dv] of Object.entries(v)) {
        outputAttrs[dk] = Array.isArray(dv)? v.join(" "): dv as string
      }
    }
  }
  node?.type?.name === "video" && console.log("toAttributes", outputAttrs)
  return outputAttrs
}

const deprecatedStyleAttributes = {
  "align": (textAlign: string) => ({textAlign}),
  "background": (background: string) => ({background}),
  "bgcolor": (backgroundColor: string) => ({backgroundColor}),
  "border": (borderWidth: string) => ({borderWidth}),
  "clear": () => ({clear: "both"}),
  "height": (height: string) => ({height}),
  "hspace": (p: string) => ({paddingLeft: p, paddingRight: p}),
  "noshade": (textAlign: string) => ({textAlign}),
  "nowrap": () => ({whiteSpace: "nowrap"}),
  "start": (counterReset: string) => ({counterReset}),
  "text": (color: string) => ({color}),
  "type": (listStyleType: string) => ({listStyleType}),
  "vspace": (p: string) => ({paddingTop: p, paddingBottom: p}),
  "width": (width: string) => ({width}),
}

const otherDeprecatedAttributes = ["alink", "compact", "link", "size", "value", "vlink"]

export function getAttrs(dom: HTMLElement | string, getDeprecated=true) {
  if(typeof dom === "string") {
    return false
  }
  else if(dom.getAttribute("data-ww-editing") === "bundle") {
    return false
  }
  else {
    const attrs = {data: {} as Record<string, string>} as Record<string, any>
    for(const k of dom.getAttributeNames()) {
      const v = dom.getAttribute(k)!
      if(k.startsWith("data-") && k !== "data-ww-editing") {
        attrs.data[k] = Array.isArray(v)? v.split(" "): v
      }
      else if(getDeprecated && k in deprecatedStyleAttributes) {
        attrs.style = {...attrs.style, ...(deprecatedStyleAttributes as any)[k](v)}
      }
      else {
        attrs[k] = Array.isArray(v)? v.split(" "): v
      }
    }
    console.log(attrs)
    return attrs
  }
}


export function HTMLElementSpec({tag, content, marks, group, inline, atom, attrs, selectable, draggable, code, whitespace, definingAsContext, definingForContent, defining, isolating, toDOM, parseDOM, toDebugString, leafText, phrasingContent, ...rest}: NodeSpec & {tag: string, phrasingContent?: boolean}): NodeSpec {
  return {
    content,
    marks,
    group,
    inline,
    atom,
    attrs: {...globalHTMLAttributes, ...attrs},
    selectable,
    code,
    whitespace,
    definingAsContext,
    definingForContent,
    defining,
    isolating,
    toDOM: toDOM ?? (n => [tag, toAttributes(n), ...(content? [0]: [])]), //@ts-ignore
    parseDOM: parseDOM ?? [{
      tag,
      getAttrs,
      ...(true? null: {
        contentElement: node => {
          const span = node.ownerDocument!.createElement("span")
          span.setAttribute("data-ww-editing", "phrase")
          span.replaceChildren(...Array.from(node.childNodes));
          (node as HTMLElement).replaceChildren(span)
          return node
        }
      })
    }],
    toDebugString,
    leafText,
    ...rest
  }
}

export function HTMLMarkSpec({tag, attrs, inclusive, excludes, group, spanning, toDOM, parseDOM, ...rest}: MarkSpec & {tag: string, formAssociated?: boolean, scriptSupporting?: boolean, transparent?: boolean}): MarkSpec {
  return {
    attrs: {...globalHTMLAttributes, ...attrs},
    inclusive: inclusive ?? true,
    excludes,
    group,
    spanning,
    toDOM: toDOM ?? (n => [tag, toAttributes(n)]),
    parseDOM: parseDOM ?? [{tag, getAttrs}],
    ...rest
  }
}