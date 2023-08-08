import {Node, NodeSpec} from "prosemirror-model"

import { unscopePackageName } from "../../../utility"
import { Package } from ".."
import { Expression } from "../contentexpression"
import { styleAttrs, parseStyleAttrs, serializeStyleAttrs } from "./nodes"



export function getOtherAttrsFromWidget(dom: HTMLElement) {
  return Object.fromEntries(dom
    .getAttributeNames()
    .filter(name => !["editable", "printable", "analyzable", "contenteditable"].includes(name))
    .map(name => [name, dom.getAttribute(name)]))
}


export function slotContentNodeSpecName(packageName: string, slotName: string) {
  return `${unscopePackageName(packageName).replace("-", "I")}_SLOT_${slotName}`
}

export function widgetSlotContent(pkg: Package) {
  return Object.keys(pkg.editingConfig?.content ?? {})
    .map(name => slotContentNodeSpecName(pkg.name, name))
    .join(" ")
}

export function slotContentNodeSpec(pkg: Package, name: string, content: string): NodeSpec {
  const nodeName = slotContentNodeSpecName(pkg.name, name)
  return {
    group: "_slotContent",
    content,
    toDOM: () => ["div", {class: nodeName + " slot-content", slot: name}, 0],
    parseDOM: [{tag: `div.${nodeName}`}]
  }
}

export function getMediaTypesOfContent(content: Record<string, Expression | string | undefined> | undefined) {
  if(content && content[""]) {
    const expr = typeof content[""] === "string"? content[""]: content[""].raw
    const matches = [...expr.matchAll(/#\w+(?:\/[-+.\w]+)?/g)]
    return matches.map(match => match[0].slice(1))
  }
  else {
    return []
  }
}

export function packageWidgetNodeSpec(pkg: Package): NodeSpec {
  const maybeContent = pkg.editingConfig?.content
    ? {content: widgetSlotContent(pkg)}
    : undefined
  const mediaTypes = getMediaTypesOfContent(pkg.editingConfig?.content)
  const mediaNodeNames = mediaTypes
    .map(t => t.slice(1).replaceAll("/", "__").replaceAll("-", "_"))
  const maybeMediaParseRules = mediaTypes.length > 0? [

  ]: []

  return {
    group: "leaf",
    widget: true,
    package: pkg,
    selectable: true,
    draggable: false,
    isolating: false,
    ...maybeContent,
    handledMediaNodes: () => mediaNodeNames,
    supportsMediaType: (mediaType: string) => mediaTypes.includes(mediaType),
    attrs: {
      id: {},
      editable: {default: false},
      printable: {default: false},
      analyzable: {default: false},
      otherAttrs: {default: {}},
      ...styleAttrs
    },
    parseDOM : [{tag: unscopePackageName(pkg.name), getAttrs: (dom: HTMLElement ) => {
      console.log(parseStyleAttrs(dom))
      return {
        id: dom.getAttribute("id"),
        editable: dom.getAttribute("editable") ?? false,
        printable: dom.getAttribute("printable") ?? false,
        analyzable: dom.getAttribute("analyzable") ?? false,
        otherAttrs: Object.fromEntries(dom
          .getAttributeNames()
          .filter(name => !["editable", "printable", "analyzable"].includes(name))
          .map(name => [name, dom.getAttribute(name)])),
        ...parseStyleAttrs(dom)
      }
    }}, ...maybeMediaParseRules] as any,
    toDOM: (node: Node) => {
      return [node.type.name, {
        id: node.attrs.id,
        ...(node.attrs.editable? {"editable": true}: {}),
        ...(node.attrs.printable? {"printable": true}: {}),
        ...(node.attrs.analyzable? {"analyzable": true}: {}),
        ...node.attrs.otherAttrs,
        "class": "ww-widget",
        style: serializeStyleAttrs(node.attrs)
      }].concat(pkg.editingConfig?.content? [0]: []) as any
    }
  }  
}
