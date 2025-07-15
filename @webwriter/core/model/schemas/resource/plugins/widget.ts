import {Node, NodeSpec, Schema} from "prosemirror-model"
import redefineCustomElementsString from "redefine-custom-elements/lib/index.js?raw"
import scopedCustomElementRegistry from "@webcomponents/scoped-custom-element-registry/src/scoped-custom-element-registry.js?raw"

import { filterObject, unscopePackageName } from "../../../utility"
import { HTMLElementSpec, ManifestClassField, ManifestCustomElementDeclaration, ManifestDeclaration, Package, WidgetEditingSettings } from "../.."
import { Expression } from "../../contentexpression"
import { SchemaPlugin } from ".";
import { Command } from "prosemirror-state"
import { globalHTMLAttributes, getAttrs, toAttributes } from "../.."



export function createWidget(schema: Schema, name: string, id: string, contentEditable=true) {
  const nodeType = schema.nodes[name]
  return nodeType.createAndFill({id, contentEditable}, [])
}

/*
export function getManifestCustomElements(pkg: Package) {
  return (pkg.customElements?.modules ?? [])
    .flatMap(mod => (mod?.declarations ?? []) as ManifestDeclaration[])
    .filter((decl): decl is ManifestCustomElementDeclaration => "customElement" in decl && !!decl.tagName?.startsWith(pkg.nameParts.scope!))
}
*/

export function widgetSpecs(pkg: Package): NodeSpec[] {
  return Object.entries(pkg.widgets)
    .map(([name, settings]) => widgetSpec(name.replace("./widgets/", ""), settings, pkg))
}

export function widgetSpec(tag: string, settings: WidgetEditingSettings, pkg: Package): NodeSpec {
  return {
    isolating: true,
    selectable: true,
    ...settings,
    content: settings.content? String(settings.content).replaceAll("-", "_"): undefined,
    group: widgetGroup(settings),
    tag,
    fullName: `${pkg.id}/widgets/${tag}`,
    package: pkg,
    attrs: widgetAttrs(),
    toDebugString: widgetToDebugString(),
    toDOM: widgetToDOM(pkg, !!settings.content),
    parseDOM: widgetParseDOM(tag, pkg),
    leafText: undefined,
    widget: true,
  }
}

/*
export function escapePmNodeName(str: string) {
  return str.replaceAll("-", "_".repeat(214))
}

export function unescapePmNodeName(str: string) {
  return str.replaceAll("_".repeat(214), "-")
}

function widgetContent(pkg: Package, decl: ManifestCustomElementDeclaration) {
  const slotsField = decl.members?.find(m => m.kind === "field" && m.static && m.name === "slots" && m.default) as ManifestClassField
  const slots = JSON.parse(slotsField?.default ?? "null") as Record<string, string> | undefined

  const slotMap = Object.fromEntries(Object.keys(slots ?? {}).map(slotName => 
    [slotName,
      `${escapePmNodeName(pkg.nameParts.scope!)}_SLOT_${slotName}`
  ]))
  const content = slots? `(${Object.keys(slotMap).join(" | ")}) | (${Object.values(slots).join(" | ")})*`: "flow*"

  const slotContentSpecs = Object.entries(slotMap).map(([slot, slotID]) => ({
    group: "_slotContent",
    content: (slots ?? {})[slot],
    toDOM: () => ["div", {class: `ww-slot ww-lift ww-${slotID}`, slot}, 0],
    parseDOM: [{tag: `div.ww-${slotID}`}]
  }))

  return {content, slots, atom: !!slots, slotContentSpecs}
}

function widgetGroup(pkg: Package, decl: ManifestCustomElementDeclaration) {
  const field = decl.members?.find(m => m.kind === "field" && m.static && m.name === "group" && m.default) as ManifestClassField
  const group = field?.default ?? ""
  return "flow widget " + group
}

function widgetConfig(pkg: Package, decl: ManifestCustomElementDeclaration) {
  const field = decl.members?.find(m => m.kind === "field" && m.static && m.name === "editingConfig" && m.default) as ManifestClassField
  const editingConfig = field?.default? JSON.parse(field.default): undefined
  return editingConfig
}
*/

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
    _: {default: {}}
  }
}

function widgetToDebugString() {
  return (node: Node) => {
    const normal = filterObject(node.attrs, k => k !== "_")
    const attrs = Object.entries(normal).concat(Object.entries(node.attrs._))
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
    const normalAttrs = filterObject(node.attrs, k => k !== "_")
    const builtinAttrs = toAttributes(normalAttrs)
    if(!("id" in builtinAttrs)) {
      builtinAttrs.id = `ww-${crypto.randomUUID()}`
    }
    const widgetAttrs = node.attrs._
    const dummyDOM = document.createElement("div")
    dummyDOM.classList.value = builtinAttrs.class ?? ""
    dummyDOM.classList.add(...widgetBaseClasses(pkg))
    const attrsWithClass = {...builtinAttrs,  class: dummyDOM.classList.value, ...widgetAttrs}
    return [node.type.spec.tag, attrsWithClass, ...(hasContent? [0]: [])] as any
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

export function widgetParseDOM(tag: string, pkg: Package) {
  return [{tag, getAttrs: (dom: string | HTMLElement) => {
    let builtinAttrs = filterObject(getAttrs(dom), k => k in globalHTMLAttributes || k === "=comment") as Record<string, any>
    if(!("id" in builtinAttrs)) {
      builtinAttrs.id = `ww-${crypto.randomUUID()}`
    }
    const widgetAttrs = getWidgetAttrs(dom)
    const dummyDOM = document.createElement("div")
    dummyDOM.classList.value = builtinAttrs.class ?? ""
    dummyDOM.classList.remove(...widgetBaseClasses(pkg))
    // console.log("parse", {...builtinAttrs, class: dummyDOM.classList.value, _: widgetAttrs})
    return {...builtinAttrs, class: dummyDOM.classList.value, _: widgetAttrs}
  }}]
}

/*
export const customBackspaceCommand = chainCommands(
  deleteSelection,
  (state, dispatch, view) => {
    const nodeBefore = state.doc.resolve(state.selection.$from.before(1)).nodeBefore
    if(!nodeBefore || !nodeBefore.type.spec["widget"]) {
      return joinBackward(state, dispatch, view)
    }
    return false
  },
  (state, dispatch, view) => {
    const nodeBefore = state.doc.resolve(state.selection.$from.before(1)).nodeBefore
    if(!nodeBefore || !nodeBefore.type.spec["widget"]) {
      return selectNodeBackward(state, dispatch, view)
    }
    return false
  }
)

export const customArrowCommand = (up=false) => chainCommands(
  (state, dispatch, view) => {
    const isWidgetNode = state.selection instanceof NodeSelection && state.selection.node.type.spec["widget"] as boolean
    const hasParagraph = up
      ? state.selection.$from.nodeBefore?.type.name === "paragraph"
      : state.selection.$from.nodeAfter?.type.name === "paragraph"
    if(isWidgetNode && !hasParagraph) {
      const paragraph = state.schema.nodes.paragraph.create()
      
      const insertPos = up? state.selection.$from.pos: state.selection.$to.pos
      let tr = state.tr.insert(insertPos, paragraph)
      
      const selectPos = up? tr.selection.$from.pos - 1: tr.selection.$to.pos + 1
      const selection = new TextSelection(tr.doc.resolve(selectPos))
      tr = tr.setSelection(selection)
      dispatch? dispatch(tr): null
      return true
    }
    else if(isWidgetNode && hasParagraph) {
      const selectPos = up? state.selection.$from.pos - 1: state.selection.$to.pos + 1
      const selection = new TextSelection(state.doc.resolve(selectPos))
      const tr = state.tr.setSelection(selection)
      dispatch? dispatch(tr): null
      return true
    }
    else {
      return false
    }

  },
)

export const customSelectAllCommand = () => chainCommands(
  (state, dispatch, view) => {
    let selection = new TextSelection(TextSelection.atStart(state.doc).$from, TextSelection.atEnd(state.doc).$to)
    const tr = state.tr.setSelection(selection)
    dispatch? dispatch(tr): null
    return false
  }
)
*/

export const widgetPlugin = (packages: Package[]) => ({
  nodes: Object.fromEntries(packages
    .flatMap(pkg => widgetSpecs(pkg))
    .map(spec => [spec.tag.replaceAll("-", "_"), spec])
  ),
  scripts: [scopedCustomElementRegistry]
} as SchemaPlugin)