import { chainCommands, deleteSelection, joinBackward, selectNodeBackward } from "prosemirror-commands"
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state"
import {Node, NodeType, Attrs, Slice, Fragment} from "prosemirror-model"

import { camelCaseToSpacedCase, filterObject, getMatchedCSSRules, range } from "../../../utility"
import { getActiveMarks, fitIntoNode } from "./helpers"
import { fixTables } from "prosemirror-tables"
import { ProsemirrorEditor } from "../../../view"
import { styleAttrs } from "./nodes"


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

/*
const customDeleteCommand = chainCommands(
  (state, dispatch, view) => {
    if(state.selection instanceof NodeSelection && state.selection.node.type.spec["widget"]) {
      return state.tr.
    }
  },
  (state, dispatch, view) => {
    return joinForward(state, dispatch, view)
  },
  (state, dispatch, view) => {
    return selectNodeForward(state, dispatch, view)
  },
)
*/

export function toggleOrUpdateMark(mark: string, attrs: any = {}) {
  return (state: EditorState, dispatch: any) => {
    const {from, to} = state.selection
    const markType = state.schema.marks[mark]
    const newMark = markType.create(attrs)
    const correspondingMark = getActiveMarks(state).find(m => m.type.name === mark)
    if(!correspondingMark || !correspondingMark?.eq(newMark)) {
      return dispatch(state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, newMark)
      )
    }
    else {
      return dispatch(state.tr.removeMark(from, to, markType))
    }
  }
}

export function setAttributeOnSelectedBlocks(key: string, value: any) {
  return (state: EditorState, dispatch: any, view: ProsemirrorEditor) => {
    if(state.selection instanceof TextSelection) {
      const selectedBlocksPos = new Set([
        state.selection.$from.before(1)
      ])

      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
        console.log(node)
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

export function wrapSelection(type: string | NodeType, attrs?: Attrs) {
  return chainCommands((state: EditorState, dispatch: any) => {
    const {selection} = state
    const nodeType = typeof type === "string"? state.schema.nodes[type]: type
    let from: number, to: number, slice: Slice
    if(!(selection instanceof TextSelection)) {
      return false
    }
    else if(!selection.empty) {
      from = selection.from
      to = selection.to
      slice = selection.content()
    }
    else {
      from = selection.$cursor?.before(1)!
      to = selection.$cursor?.after(1)!
      const wrappingSelection = TextSelection.create(state.doc, from, to)
      slice = wrappingSelection.content()
    }
    let content = [] as Node[]
    const n = slice.content.childCount
    range(n).forEach(i => content.push(slice.content.child(i)))
    const newNode = fitIntoNode(nodeType.create(attrs)!, content)
    console.log(newNode)
    let newStart: number | null = null
    let newEnd: number | null = null
    let tr = state.tr.replaceRangeWith(from, to, newNode)
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
    return dispatch(tr)
  }
  )
}
