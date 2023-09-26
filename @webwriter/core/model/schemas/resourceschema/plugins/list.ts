
import {NodeType, Fragment, Slice, NodeRange} from "prosemirror-model"
import {EditorState, Transaction, Selection, NodeSelection, TextSelection} from "prosemirror-state"
import { SchemaPlugin } from ".";
import { HTMLElementSpec } from "../htmlelementspec";
import { canSplit, canJoin, liftTarget, ReplaceAroundStep } from "prosemirror-transform";


export function splitListItem(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const itemType = state.schema.nodes["li"]
  let {$from, $to, node} = state.selection as NodeSelection
  if ((node && node.isBlock) || $from.depth < 2 || !$from.sameParent($to)) {
    return false
  }
  let grandParent = $from.node(-1)
  if (grandParent.type.name != itemType.name) {
    return false
  }
  if ($from.parent.content.size == 0 && $from.node(-1).childCount == $from.indexAfter(-1)) {
    // In an empty block. If this is a nested list, the wrapping
    // list item should be split. Otherwise, bail out and let next
    // command handle lifting.
    if ($from.depth == 3 || $from.node(-3).type != itemType ||
        $from.index(-2) != $from.node(-2).childCount - 1) return false
    if (dispatch) {
      let wrap = Fragment.empty
      let depthBefore = $from.index(-1) ? 1 : $from.index(-2) ? 2 : 3
      // Build a fragment containing empty versions of the structure
      // from the outer list item to the parent node of the cursor
      for (let d = $from.depth - depthBefore; d >= $from.depth - 3; d--)
        wrap = Fragment.from($from.node(d).copy(wrap))
      let depthAfter = $from.indexAfter(-1) < $from.node(-2).childCount ? 1
          : $from.indexAfter(-2) < $from.node(-3).childCount ? 2 : 3
      // Add a second list item with an empty default start node
      wrap = wrap.append(Fragment.from(itemType.createAndFill()))
      let start = $from.before($from.depth - (depthBefore - 1))
      let tr = state.tr.replace(start, $from.after(-depthAfter), new Slice(wrap, 4 - depthBefore, 0))
      let sel = -1
      tr.doc.nodesBetween(start, tr.doc.content.size, (node, pos) => {
        if (sel > -1) return false
        if (node.isTextblock && node.content.size == 0) sel = pos + 1
      })
      if (sel > -1) tr.setSelection(Selection.near(tr.doc.resolve(sel)))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
  let nextType = $to.pos == $from.end() ? grandParent.contentMatchAt(0).defaultType : null
  let tr = state.tr.delete($from.pos, $to.pos)
  let types = nextType ? [{type: nextType}] : undefined
  if (!canSplit(tr.doc, $from.pos, 2, types)) return false
  if (dispatch) dispatch(tr.split($from.pos, 2, types).scrollIntoView())
  return true
}

/// Create a command to lift the list item around the selection up into
/// a wrapping list.
export function liftListItem(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const itemType = state.schema.nodes["li"]
  let {$from, $to} = state.selection
  let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild!.type == itemType)
  if (!range) return false
  if (!dispatch) return true
  if ($from.node(range.depth - 1).type.name == itemType.name) // Inside a parent list
    return liftToOuterList(state, dispatch, itemType, range)
  else // Outer list node
    return liftOutOfList(state, dispatch, range)
}

/// Create a command to lift the list item around the selection up into
/// a wrapping list.
export function liftListItemInList(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const itemType = state.schema.nodes["li"]
  let {$from, $to} = state.selection
  let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild!.type == itemType)
  if (!range) return false
  if (!dispatch) return true
  if ($from.node(range.depth - 1).type.name == itemType.name) // Inside a parent list
    return liftToOuterList(state, dispatch, itemType, range)
  else // Outer list node
    return false
}

function liftToOuterList(state: EditorState, dispatch: (tr: Transaction) => void, itemType: NodeType, range: NodeRange) {
  let tr = state.tr, end = range.end, endOfList = range.$to.end(range.depth)
  if (end < endOfList) {
    // There are siblings after the lifted items, which must become
    // children of the last item
    tr.step(new ReplaceAroundStep(end - 1, endOfList, end, endOfList,
                                  new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0), 1, true))
    range = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth)
  }
  const target = liftTarget(range)
  if (target == null) return false
  tr.lift(range, target)
  let after = tr.mapping.map(end, -1) - 1
  if (canJoin(tr.doc, after)) tr.join(after)
  dispatch(tr.scrollIntoView())
  return true
}

function liftOutOfList(state: EditorState, dispatch: (tr: Transaction) => void, range: NodeRange) {
  let tr = state.tr, list = range.parent
  // Merge the list items into a single big item
  for (let pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
    pos -= list.child(i).nodeSize
    tr.delete(pos - 1, pos + 1)
  }
  let $start = tr.doc.resolve(range.start), item = $start.nodeAfter!
  if (tr.mapping.map(range.end) != range.start + $start.nodeAfter!.nodeSize) return false
  let atStart = range.startIndex == 0, atEnd = range.endIndex == list.childCount
  let parent = $start.node(-1), indexBefore = $start.index(-1)
  if (!parent.canReplace(indexBefore + (atStart ? 0 : 1), indexBefore + 1, item.content.append(atEnd ? Fragment.empty : Fragment.from(list))))
    return false
  let start = $start.pos, end = start + item.nodeSize
  // Strip off the surrounding list. At the sides where we're not at
  // the end of the list, the existing list is closed. At sides where
  // this is the end, it is overwritten to its end.
  tr.step(new ReplaceAroundStep(start - (atStart ? 1 : 0), end + (atEnd ? 1 : 0), start + 1, end - 1, new Slice((atStart ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))).append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))), atStart ? 0 : 1, atEnd ? 0 : 1), atStart ? 0 : 1))
  dispatch(tr.scrollIntoView())
  return true
}

/// Create a command to sink the list item around the selection down
/// into an inner list.
export function sinkListItem(state: EditorState, dispatch: (tr: Transaction) => void) {
  const itemType = state.schema.nodes["li"]
  let {$from, $to} = state.selection
  let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild!.type.name == itemType.name)
  if (!range) return false
  let startIndex = range.startIndex
  if (startIndex == 0) return false
  let parent = range.parent, nodeBefore = parent.child(startIndex - 1)
  if (nodeBefore.type.name != itemType.name) return false

  if (dispatch) {
    let nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type == parent.type
    let inner = Fragment.from(nestedBefore ? itemType.create() : null)
    let slice = new Slice(Fragment.from(itemType.create(null, Fragment.from(parent.type.create(null, inner)))), nestedBefore ? 3 : 1, 0)
    let before = range.start, after = range.end
    dispatch(state.tr.step(new ReplaceAroundStep(before - (nestedBefore ? 3 : 1), after, before, after, slice, 1, true)).scrollIntoView())
  }
  return true
}


export const listPlugin = () => ({
  nodes: {
    ol: HTMLElementSpec({
      tag: "ol",
      group: "flow palpable",
      content: "li+"
    }),
  
    ul: HTMLElementSpec({
      tag: "ul",
      group: "flow palpable",
      content: "li+"
    }),
    
    li: HTMLElementSpec({
      tag: "li",
      content: "flow*"
    }),
  },
  keymap: {
    "Enter": (state, dispatch, view) => {
      const {$to, empty} = state.selection
      const grandparent = $to.node(-1)
      const isParentLi = grandparent?.type.name === "li"
      if(empty && !$to.node().textContent) {
        return liftListItem(state, dispatch)
      }
      else if(isParentLi && $to.parentOffset === $to.parent.content.size) {
        const li = state.schema.nodes["li"].createAndFill()!
        let tr = state.tr
        tr = tr.insert($to.pos + 1, li)
        tr = tr.setSelection(TextSelection.create(tr.doc, $to.pos + 3))
        dispatch && dispatch(tr)
        return true
      }
      else {
        return splitListItem(state, dispatch)
      }
    },
    "Tab": sinkListItem,
    "shift-Tab": liftListItemInList
  }
} as SchemaPlugin)