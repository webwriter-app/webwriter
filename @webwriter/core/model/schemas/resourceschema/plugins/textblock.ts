import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { SchemaPlugin, parseStyleAttrs, serializeStyleAttrs, styleAttrs } from ".";
import { ProsemirrorEditor } from "../../../../view";
import { camelCaseToSpacedCase, range } from "../../../../utility";
import { chainCommands, createParagraphNear, deleteSelection, joinBackward, joinTextblockBackward, joinUp, lift, liftEmptyBlock, selectParentNode } from "prosemirror-commands";
import {Node, NodeType, Attrs, Slice, Fragment} from "prosemirror-model"
import { ContentExpression, ParentedExpression } from "../../contentexpression";
import { HTMLElementSpec } from "../htmlelementspec";


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

export function wrapSelection(type: string | NodeType, attrs?: Attrs) {
  return chainCommands((state: EditorState, dispatch: any) => {
    const {selection} = state
    const nodeType = typeof type === "string"? state.schema.nodes[type]: type
    let from: number, to: number, slice: Slice
    if(!selection.empty) {
      from = selection.from
      to = selection.to
      slice = selection.content()
    }
    // selection.$anchor.parent.canReplaceWith(selection.$from.index(), selection.$to.index(), nodeType)
    else if(!nodeType.isInline && !nodeType.isLeaf) {
      from = selection.$from?.before(selection.$from.depth)!
      to = selection.$from?.after(selection.$from.depth)!
      const wrappingSelection = TextSelection.create(state.doc, from, to)
      slice = wrappingSelection.content()
    }
    else {
      slice = Slice.empty
      from = to = selection.from
    }
    let content = [] as Node[]
    const n = slice.content.childCount
    range(n).forEach(i => content.push(slice.content.child(i)))
    const newNode = fitIntoNode(nodeType.create(attrs)!, content)
    let tr = state.tr.replaceRangeWith(from, to, newNode)
    /*
    tr.doc.nodesBetween(0, tr.doc.content.size - 1, (node, start) => {
      if(node === newNode) {
        newStart = start
        newEnd = start + node.content.size + 1
      }
    })
    if(newStart !== null && newEnd !== null) {
      // tr = tr.setSelection(new TextSelection(tr.doc.resolve(newStart), tr.doc.resolve(newEnd)))
      const s = new NodeSelection(tr.doc.resolve(newStart))
      tr = tr.setSelection(new TextSelection(s.$from, s.$to))
    }
    */
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
    "Backspace": (state, dispatch, view) => {
      const {selection, doc, tr} = state
      const $pos = selection.$from
      const k = $pos.parentOffset
      const indices = [...range(0, $pos.depth).map(d => $pos.index(d)), k]
      const isAtStartOfFirstBranch = indices.every(i => i === 0)
      const isEmptyFirstP = $pos.node().type.name === "p" && $pos.depth === 1
      if(isAtStartOfFirstBranch && selection.empty && !isEmptyFirstP) {
        return wrapSelection("p")(state, dispatch, view)
      }
      else {
        return false
      }
    },
    "Control-Enter": (state, dispatch, view) => {
      const {$from} = state.selection;
      (dispatch ?? (() => null))(state.tr
        .deleteSelection()
        .split($from.pos, Math.min(2, $from.depth))
      )
      return true
    },
    "Control-Backspace": (state, dispatch, view) => {
      const {$from} = state.selection;
      return joinUp(state, dispatch, view)
    },
    "Alt-Shift-ArrowLeft": (state, dispatch, view) => {
      const {selection, doc} = state
      const {empty, $from} = selection
      if($from.parent.type.name === state.schema.topNodeType.name) {
        return true
      }
      const pos = $from.before($from.depth)
      const $pos = doc.resolve(pos)
      const newSelection = new NodeSelection($pos)
      const tr = state.tr.setSelection(newSelection)
      dispatch && dispatch(tr)
      return true
    },
    "Alt-Shift-ArrowRight": (state, dispatch, view) => {
      const {selection, doc} = state
      const {empty, $from} = selection
      if(!(selection instanceof NodeSelection)) {
        return true
      }
      const pos = $from.posAtIndex(0, $from.depth + 1)
      const $pos = doc.resolve(pos)
      const newSelection = $pos.node().isTextblock
        ? new TextSelection($pos)
        : new NodeSelection($pos)
      const tr = state.tr.setSelection(newSelection)
      dispatch && dispatch(tr)
      return true
    }
  }
} as SchemaPlugin)