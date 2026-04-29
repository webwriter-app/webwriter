import {DOMOutputSpec, Node, NodeSpec, Schema} from "prosemirror-model"
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"

import { filterObject } from "../../../utility"
import { Package, WidgetEditingSettings } from "../.."
import { SchemaPlugin } from ".";
import { globalHTMLAttributes, getAttrs, toAttributes } from "../.."



export function createWidget(schema: Schema, name: string, id: string, contentEditable=true) {
  const nodeType = schema.nodes[name]
  return nodeType.createAndFill({id, contentEditable}, [])
}

export function widgetSpecs(pkg: Package): NodeSpec[] {
  return Object.entries(pkg.widgets)
    .map(([name, settings]) => widgetSpec(name.replace("./widgets/", ""), settings, pkg))
}

export function widgetSpec(tag: string, settings: WidgetEditingSettings, pkg: Package): NodeSpec {
  return {
    isolating: true,
    selectable: true,
    ...settings,
    content: widgetContent(settings),
    group: widgetGroup(settings),
    tag,
    fullName: `${pkg.id}/widgets/${tag}`,
    package: pkg,
    attrs: widgetAttrs(),
    toDebugString: widgetToDebugString(),
    toDOM: widgetToDOM(pkg, !!settings.content),
    parseDOM: widgetParseDOM(tag, pkg, settings),
    leafText: undefined,
    widget: true,
  }
}

function widgetGroup(settings: WidgetEditingSettings) {
  return Array.from(new Set([
    ...(settings?.group? settings.group.split(" "): []),
    settings?.inline? "widgetinline": "widget",
    settings?.group == undefined && !settings?.inline? "flow": ""
  ])).join(" ").trim()
}

function widgetAttrs() {
  return {
    ...globalHTMLAttributes,
    "=comment": {default: undefined},
    "=data": {default: undefined},
    "=custom": {default: {}},
  }
}

function widgetContent(settings: WidgetEditingSettings) {
  return settings.content? String(settings.content).replaceAll("-", "_"): undefined
}

function widgetToDebugString() {
  return (node: Node) => {
    const normal = filterObject(node.attrs, k => !k.startsWith("="))
    const attrs = Object.entries(normal).concat(Object.entries(node.attrs["=custom"]))
    const attrString = attrs
      .filter(([k, v]) => v !== undefined)
      .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
      .join(" ")
    return `[${node.type.name} ${attrString}]`
  }
}

function widgetBaseClasses(pkg: Package) {
  return ["ww-widget", `ww-v${pkg.version}`, `ww-pkg-${pkg.name}`]
}

export function widgetToDOM(pkg: Package, hasContent: boolean) {
  return (node: Node) => {
    const normalAttrs = filterObject(node.attrs, k => !k.startsWith("="))
    const builtinAttrs = toAttributes(normalAttrs)
    if(!("id" in builtinAttrs)) {
      builtinAttrs.id = `ww-${crypto.randomUUID()}`
    }
    const widgetAttrs = node.attrs["=custom"]
    const dummyDOM = document.createElement("div")
    dummyDOM.classList.value = builtinAttrs.class ?? ""
    dummyDOM.classList.add(...widgetBaseClasses(pkg))
    const attrsWithClass = {...builtinAttrs,  class: dummyDOM.classList.value, ...widgetAttrs}
    let widgetDataContent = [] as any
    if(node.attrs["=data"]) {
      const widgetData = node.attrs["=data"]
      widgetDataContent = widgetData?.type === "text/plain" && !hasContent
        ? [widgetData?.value]
        : ["script", {...widgetData, value: undefined}, widgetData?.value]
    }
    return [node.type.spec.tag, attrsWithClass, ...(hasContent? [0, ...widgetDataContent]: widgetDataContent)] as any
  }
}

function getWidgetAttrs(dom: HTMLElement | string) {
  if(typeof dom === "string") {
    return {}
  }
  const _ = {} as Record<string, any>
  const attrNames = dom.getAttributeNames().filter(name => !(name in globalHTMLAttributes))
  for(const attrName of attrNames) {
    _[attrName] = dom.getAttribute(attrName)
  }
  return _
}

function getWidgetData(dom: HTMLElement | string, hasContent: boolean) {
  if(typeof dom === "string") {
    return undefined
  }
  else if(!hasContent && dom.textContent) {
    return {
      value: dom.textContent,
      type: "text/plain"
    }
  }
  else {
    const script = dom.querySelector(":scope > script[type]") as HTMLScriptElement
    if(!script) {
      return undefined
    }
    return {
      value: script.textContent,
      type: script.type,
      attrs: Object.fromEntries(script.getAttributeNames().filter(k => k !== "type").map(k => [k, script.getAttribute(k)!]))
    }
  }
}

export function widgetParseDOM(tag: string, pkg: Package, settings?: WidgetEditingSettings) {
  let contentProp = {} as any
  if(settings?.dataType === "text/plain") {
    contentProp.getContent = (dom: HTMLElement) => dom.textContent
  }
  return [{tag, ...contentProp, getAttrs: (dom: string | HTMLElement) => {
    let builtinAttrs = filterObject(getAttrs(dom), k => k in globalHTMLAttributes || k === "=comment") as Record<string, any>
    if(!("id" in builtinAttrs)) {
      builtinAttrs.id = `ww-${crypto.randomUUID()}`
    }
    const widgetAttrs = getWidgetAttrs(dom)
    const widgetData = getWidgetData(dom, !!settings?.content)
    const dummyDOM = document.createElement("div")
    dummyDOM.classList.value = builtinAttrs.class ?? ""
    dummyDOM.classList.remove(...widgetBaseClasses(pkg))
    return {
      ...builtinAttrs,
      class: dummyDOM.classList.value,
      "=custom": widgetAttrs,
      "=data": widgetData
    }
  }}]
}

export const widgetPlugin = (packages: Package[]) => ({
  nodes: Object.fromEntries(packages
    .flatMap(pkg => widgetSpecs(pkg))
    .map(spec => [spec.tag.replaceAll("-", "_"), spec])
  ),
  scripts: [scopedCustomElementRegistry]
} as SchemaPlugin)