import {Node, NodeSpec, AttributeSpec, Attrs} from "prosemirror-model"

const globalAttributes = {
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

const eventhandlerAttributes = {
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

const ariaAttributes = {
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

export function toAttributes(node: Node | Attrs) {
  const outputAttrs = {} as Record<string, string>
  const attrs = node instanceof Node? node.attrs: node
  const attrSpec: (k: string) => AttributeSpec & {private?: boolean} | undefined = (k: string) => node instanceof Node? (node.type?.spec?.attrs ?? {})[k]: {}
  for (const [k, v] of Object.entries(attrs)) {
    const spec = attrSpec(k)
    if(k !== "data" && v !== undefined && (spec?.default !== v) && !spec?.private) {
      outputAttrs[k] = Array.isArray(v)? v.join(" "): v 
    }
    if(k === "data") {
      for(const [dk, dv] of Object.entries(v)) {
        outputAttrs[dk] = Array.isArray(dv)? v.join(" "): dv as string
      }
    }
  }
  return outputAttrs
}

export function getAttrs(dom: HTMLElement | string) {
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
      else {
        attrs[k] = Array.isArray(v)? v.split(" "): v
      }
    }
    return attrs
  }
}


export function HTMLElementSpec({tag, content, marks, group, inline, atom, attrs, selectable, draggable, code, whitespace, definingAsContext, definingForContent, defining, isolating, toDOM, parseDOM, toDebugString, leafText, ...rest}: NodeSpec & {tag: string}): NodeSpec {
  return {
    content,
    marks,
    group,
    inline,
    atom,
    attrs: {
      ...globalAttributes,
      ...ariaAttributes,
      ...eventhandlerAttributes,
      ...attrs
    },
    selectable,
    code,
    whitespace,
    definingAsContext,
    definingForContent,
    defining,
    isolating,
    toDOM: toDOM ?? (n => [tag, toAttributes(n), ...(content? [0]: [])]),
    parseDOM: parseDOM ?? [{tag, getAttrs}],
    toDebugString,
    leafText,
    ...rest
  }
}