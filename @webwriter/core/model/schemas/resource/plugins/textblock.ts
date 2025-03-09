import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { SchemaPlugin, styleAttrs } from ".";
import { ProsemirrorEditor } from "#view/index.js";
import { camelCaseToSpacedCase, range } from "#utility";
import { chainCommands } from "prosemirror-commands";
import {Node, NodeType, Attrs, Slice, Fragment} from "prosemirror-model"
import { ContentExpression, ParentedExpression } from "#model";
import { GapCursor } from "prosemirror-gapcursor";


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
 * 
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
        if((value.type === "NodeExpression" && (contentNode.type.name === value?.node))) {
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
  return newContent && newContent.length > 0
    ? node.copy(Fragment.fromArray(newContent))
    : fillNode(node.type, node.attrs)
}

/** 
 * Paradigm: Discard as little as possible
export function fitIntoNodeAlt(node: Node, content: Fragment | Node[]): Node {
  const frag = content instanceof Fragment? content: Fragment.fromArray(content)
  if(node.type.spec.content) {
    const match = node.type.contentMatch
    match.
  }
  return subFragment && subFragment.size > 0
    ? node.copy(subFragment)
    : fillNode(node.type, node.attrs)
}*/

export function fillNode(type: NodeType, attrs?: Attrs): Node {
  const node = type.createAndFill(attrs)!
  let content = Fragment.fromArray([])
  node.content?.forEach(node => {
    content = content.addToEnd(fillNode(node.type))
  })
  return node.copy(content)
}

export function wrapSelection(type: string | NodeType | (string | NodeType)[], attrs?: Attrs, replaceOnly=false) {
  return chainCommands((state: EditorState, dispatch: any) => {
    const {selection} = state
    const allTypes = Array.isArray(type)? type.map(t => typeof t === "string"? state.schema.nodes[t]: t): [typeof type === "string"? state.schema.nodes[type]: type]
    const firstType = allTypes[0]
    let from: number, to: number, slice: Slice
    if(!selection.empty) {
      from = selection.from
      to = selection.to
      slice = selection.content()
    }
    // selection.$anchor.parent.canReplaceWith(selection.$from.index(), selection.$to.index(), nodeType)
    else if(!firstType.isInline && !firstType.isLeaf && !(selection instanceof GapCursor)) {
      from = selection.$from.pos === 0? 0: selection.$from?.before(selection.$from.depth)
      to = selection.$from.pos === 0? 0: selection.$from?.after(selection.$from.depth)!
      const wrappingSelection = TextSelection.create(state.doc, from, to)
      slice = wrappingSelection.content()
    }
    else {
      slice = Slice.empty
      from = to = selection.from
    }
    let content = [] as Node[]
    const n = slice.content.childCount
    !replaceOnly && range(n).forEach(i => content.push(slice.content.child(i)))
    let newNode: Node | undefined
    for(const type of allTypes.slice().reverse()) {
      if(!newNode) {
        newNode = fitIntoNode(type.create(attrs)!, content)
      }
      else {
        newNode = fitIntoNode(type.create(), [newNode])
      }
    }
    let tr = state.tr.replaceRangeWith(from, to, newNode!)
    let newStart: number; let newEnd: number
    tr.doc.nodesBetween(0, tr.doc.content.size - 1, (node, start) => {
      if(node === newNode) {
        newStart = start
        newEnd = start + node.content.size + 1
      }
    })
    if(newStart! != null && newEnd! != null) {
      // tr = tr.setSelection(new TextSelection(tr.doc.resolve(newStart), tr.doc.resolve(newEnd)))
      const s = NodeSelection.findFrom(tr.doc.resolve(newStart!), 1)
      if(s) {
        tr = tr.setSelection(s)
      }
      // tr = tr.setSelection(TextSelection(s.$from, s.$to))
    }
    return dispatch(tr)
  }
  )
}


export function setAttributeOnSelectedBlocks(key: string, value: any) {
  return (state: EditorState, dispatch: any, view: ProsemirrorEditor) => {
    if(state.selection instanceof TextSelection) {
      const selectedBlocksPos = new Set([
        state.selection.$from.before(1)
      ])

      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
        if(node.type.isBlock) {
          selectedBlocksPos.add(pos)
        }
      })

      const tr = [...selectedBlocksPos].reduce((tr, pos) => {
        return tr.setNodeAttribute(pos, key, value)
      }, state.tr)
      return dispatch(tr)
    }
    else {
      return false
    }
  }  
}

export const textblockPlugin = () => ({
  keymap: {

  }
} as SchemaPlugin)