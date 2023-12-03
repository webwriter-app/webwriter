import {Node, NodeSpec, Schema} from "prosemirror-model"
import redefineCustomElementsString from "redefine-custom-elements/lib/index.js?raw"

import { unscopePackageName } from "../../../../utility"
import { Package } from "../.."
import { Expression } from "../../contentexpression"
import { SchemaPlugin } from ".";
import { Command } from "prosemirror-state"
import { globalHTMLAttributes, getAttrs, toAttributes } from "../.."


export function createWidget(schema: Schema, name: string, id: string, editable=true) {
  const nodeType = schema.nodes[name]
  return nodeType.createAndFill({id, otherAttrs: {editable}}, [])
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
    .map(t => t.slice(1).replaceAll("/", "__").replaceAll("-", "_"))
  const maybeMediaParseRules = mediaTypes.length > 0? []: []
  return {
    group: "flow widget",
    widget: true,
    package: pkg,
    selectable: true,
    draggable: false,
    isolating: false,
    ...maybeContent,
    attrs: {
      ...globalHTMLAttributes,
      _otherAttrs: {default: {}, private: true} as any
    },
    parseDOM : [{tag: unscopePackageName(pkg.name), getAttrs: (dom: HTMLElement ) => {
      return {
        ...getAttrs(dom),
        _otherAttrs: Object.fromEntries(dom
          .getAttributeNames()
          .filter(name => !Object.keys(globalHTMLAttributes).includes(name) && !name.startsWith("data-"))
          .map(name => [name, dom.getAttribute(name)])
        )
      }
    }}, ...maybeMediaParseRules] as any,
    toDOM: (node: Node) => {
      const attrs = toAttributes(node, node.attrs._otherAttrs)
      const classes = new DOMTokenList(); classes.value = attrs.class
      classes.add("ww-widget", (node.type.spec.package as Package).id)
      const attrsWithClass = {...attrs, class: classes.value}
      
      return [node.type.name, attrsWithClass].concat(pkg.editingConfig?.content? [0] as any: [] as any) as any
    }
  }  
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


const preventWidgetDelete: Command = ({selection, doc}, dispatch, view) => {
  if(selection.empty && selection.$anchor.parentOffset === 0) {
    const $pos = selection.$anchor
    const node = doc.resolve($pos.before($pos.depth)).nodeBefore
    return node?.type.spec.widget
  }
  return false
}

export const widgetPlugin = (packages: Package[]) => ({
  nodes: {
    ...Object.fromEntries(packages.map(pkg => [
      unscopePackageName(pkg.name),
      packageWidgetNodeSpec(pkg)
    ])),
    ...Object.fromEntries(packages.flatMap(pkg => {
      const content = pkg.editingConfig?.content ?? {}
      return Object.entries(content).map(([name, expr]) => [
        slotContentNodeSpecName(pkg.name, name),
        slotContentNodeSpec(pkg, name, expr.raw!)
      ])
    }))
  },
  scripts: [redefineCustomElementsString],
  keymap: {
    "Backspace": preventWidgetDelete,
    "shift-Backspace": preventWidgetDelete,
    "control-ArrowUp": (state, dispatch) => {
      return false
    },
    "control-ArrowDown": (state, dispatch) => {
      return false
    }
  }
} as SchemaPlugin)