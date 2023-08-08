import { EditorState, TextSelection} from "prosemirror-state"
import {Node, NodeType, Attrs, Fragment, Schema} from "prosemirror-model"

import { ContentExpression, ParentedExpression, styleAttrs } from ".."
import {camelCaseToSpacedCase, range, shallowCompare} from "../../../utility"
import { EditorView } from "prosemirror-view"
import { ProsemirrorEditor } from "../../../view"


export const INDETERMINATE_VALUE = Symbol("INDETERMINATE_VALUE")

export function createWidget(schema: Schema, name: string, id: string, editable=true) {
  const nodeType = schema.nodes[name]
  return nodeType.createAndFill({id, otherAttrs: {editable}}, [])
}


export function getActiveMarks(state: EditorState, includeStored=true) {
  const stored = state.storedMarks ?? []
  const marks = new Set(includeStored? stored: [])
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
    node.marks.forEach(mark => marks.add(mark))
  })
	return Array.from(marks)
}

export function getActiveAttributes(state: EditorState, key: string) {
  const attributes = new Set([
    state.selection.$from.node(1)?.attrs[key]
  ])
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
    attributes.add(node.attrs[key])
  })
  return Array.from(attributes).filter(attr => attr)
}

export function getActiveBlockAttributes(state: EditorState, view: ProsemirrorEditor) {
  const attributes = {} as Record<string, {value: any, fallbackValue?: any}>
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if(node.type.isBlock) {
      const dom = view?.nodeDOM(pos) as Element
      Object.keys(node.attrs).forEach(key => {
        const kebabKey = camelCaseToSpacedCase(key, false, "-")
        const value = node.attrs[key]
        const fallbackValue = key in Object.keys(styleAttrs)
          ? view.window.getComputedStyle(dom).getPropertyValue(kebabKey)
          : undefined
        attributes[key] = {
          ...attributes[key], 
          value: attributes[key]?.value !== undefined? null: value,
          fallbackValue: fallbackValue? fallbackValue: attributes[key]?.fallbackValue
        }
      })
    }
  })
  return attributes
}

export function getActiveNodeNames(state: EditorState | undefined) {
  const nodeNames = [] as string[]
  if(state) {
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
      nodeNames.push(node.type.name)
    })
  }
  return nodeNames
}

export function hasActiveNode(state: EditorState | undefined, type: string | NodeType, attrs?: Attrs, includeAncestors=false) {
  let matchFound = false
  if(state) {
    state.doc.nodesBetween(state.selection.from, state.selection.to, node => {
      const typeMatches = typeof type === "string"? node.type.name === type: node.type === type
      const attrsMatches = !attrs || Object.keys(attrs).every(k => attrs[k] === node.attrs[k])
      if(typeMatches && attrsMatches) {
        matchFound = true
      }
    })
    if(includeAncestors) {
      const resolvedPos = state.selection.$anchor
      const ancestors = range(0, resolvedPos.depth).map(i => resolvedPos.node(i))
    }
  }
  return matchFound
}

export function nestNodes(nodes: Node[]): Node {
  return nodes.reduceRight((acc, node) => node.copy(Fragment.fromArray([acc])))
}

/**
 * Try to fit `content` into `node`.
 * For each content node, DFS until content node fits
 */
export function fitIntoNode(node: Node, content: Node[]): Node {
  const {type} = node
  const newContent = [] as Node[]
  if(type.spec.content) {
    const expression = ContentExpression.parse(type.spec.content)
    const tree = ContentExpression.resolve(type.schema, expression)
    const values = ContentExpression.values(tree)
    const contentPaths = [] as Node[][]
    const fragment = Fragment.fromArray(content)
    fragment.descendants(contentNode => {
      for(const [i, value] of values.entries()) {
        if(value.type === "NodeExpression" && (contentNode.type.name === value?.node)) {
          const childPath = []
          let activeValue: ParentedExpression = value
          while(activeValue.parent) {
            if(activeValue.parent!.type === "NodeExpression") {
              childPath.unshift(activeValue.parent)
            }
            activeValue = activeValue.parent
          }
          const contentPath = [
            ...childPath.map(e => type.schema.nodes[e.node].create()),
            contentNode
          ]
          contentPaths.push(contentPath)
          return false
        }
      }
    })
    contentPaths.forEach(cp => newContent.push(nestNodes(cp)))
  }
  console.log(newContent)
  return newContent && newContent.length > 0
    ? node.copy(Fragment.fromArray(newContent))
    : fillNode(node.type, node.attrs)
}

export function fillNode(type: NodeType, attrs?: Attrs): Node {
  const node = type.createAndFill(attrs)!
  let content = Fragment.fromArray([])
  node.content?.forEach(node => {
    content = content.addToEnd(fillNode(node.type))
  })
  return node.copy(content)
}

export function getDocAttribute(state: EditorState, key: string, asArray=true): string {
  const attr = state.doc.attrs.meta[key]
  return attr == null || Array.isArray(attr) || !asArray? attr: [attr]
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

export function getSelectedDom(state: EditorState, view: EditorView) {
  const selectedPos = new Set([
    state.selection.$from.before(1)
  ])

  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
    selectedPos.add(pos)
  })
  return [...selectedPos].map(pos => view.nodeDOM(pos)!)
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