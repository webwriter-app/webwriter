import { tableNodes, tableEditing, columnResizing, addColumnAfter, goToNextCell, addRowAfter, fixTables, nextCell, deleteColumn, deleteRow, CellSelection, deleteSection, deleteTable, TableMap } from "@massifrg/prosemirror-tables-sections";
import { joinUpIfAtStart, SchemaPlugin, splitOrBreak, splitParent } from ".";
import pmTablesCSS from "@massifrg/prosemirror-tables-sections/style/tables.css?raw"
import { HTMLElementSpec, toAttributes } from "../htmlelementspec";
import { chainCommands, joinBackward, joinUp, selectAll } from "prosemirror-commands";
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from "prosemirror-state";
import { GapCursor } from "prosemirror-gapcursor";
import { EditorView } from "prosemirror-view";
import { chainCommandsIf } from "#model/utility/index.js";
import {findParentNode} from "prosemirror-utils"
import { canJoin } from "prosemirror-transform";

const {table, table_cell, table_header, table_row, table_head, table_body, table_foot, table_caption} = tableNodes({
  tableGroup: "flow containerblock",
  cellContent: "(p | flow)*",
  cellAttributes: {}
})

// TODO: Resize columns
// TODO: Split cell horizontally on enter
// TODO: Split cell vertically on mod+enter

function tableSelected(state: EditorState) {
  if(!(state.selection instanceof CellSelection)) return false
  const selectionSize = state.selection.content().size
  const table = findParentNode(node => node.type.name === "table")(state.selection)
  const tableContentSize = table?.node.content.size
  return selectionSize === tableContentSize
}

function rowEndSelected(state: EditorState) {
  let tablePos = findParentNode(node => node.type.name === "table")(state.selection)?.pos
  if(tablePos === undefined) return false
  const $tablePos = state.doc.resolve(tablePos)
  const tableDepth = $tablePos.depth
  let tdPos = findParentNode(node => node.type.name === "td")(state.selection)?.start
  const $pos = tdPos? state.doc.resolve(tdPos): undefined
  const $after = state.doc.resolve($pos!.after())
  const atEnd = state.selection.$from.pos === $after.pos -1
  const isLastCell = $after.nodeAfter?.type.name !== "td"
  return isLastCell && atEnd
}

function rowEndSelectedGap(state: EditorState) {
  const gapSelection = state.selection instanceof GapCursor
  const nodeAfter = state.selection.$to.nodeAfter
  return gapSelection && (!nodeAfter || nodeAfter.type.name === "tr")
}

function setGapCursorAfterCell(state: EditorState, dispatch?: (tr: Transaction) => void) {
  let tdPos = findParentNode(node => node.type.name === "td")(state.selection)?.start
  const $pos = tdPos? state.doc.resolve(tdPos): undefined
  const $after = state.doc.resolve($pos!.after() + 1)
  const sel = new GapCursor($after)
  const tr = state.tr.setSelection(sel)
  dispatch && dispatch(tr)
  return true
}

function selectInTable(dir:"up"|"down"|"left"|"right"="right") {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const horizontal = ["left", "right"].includes(dir)
    const forward = ["right", "bottom"].includes(dir)
    let table = findParentNode(node => node.type.name === "table")(state.selection)?.node
    let tableStart = findParentNode(node => node.type.name === "table")(state.selection)?.start!
    let parentCell = findParentNode(node => node.type.name === "td")(state.selection)?.pos
    parentCell && console.log(
      parentCell,
      state.doc.resolve(parentCell).nodeAfter
    )

    let cellPos = parentCell? state.doc.resolve(parentCell): undefined
    const textOffset = state.selection instanceof TextSelection? state.selection.$to.textOffset: 0
    if(!cellPos || !table) return false
    const tableMap = TableMap.get(table)
    console.log(tableMap)
    const nextPos = tableMap.nextCell(
      state.selection.from,
      horizontal? "horiz": "vert",
      forward? 1: -1
    )
    if(!nextPos && !horizontal && forward) {
      const tr = state.tr.setSelection(new GapCursor(state.doc.resolve(state.doc.resolve(tableStart).after())))
      dispatch && dispatch(tr)
      return true
    }
    else if(!nextPos && !horizontal && !forward) {
      const tr = state.tr.setSelection(new GapCursor(state.doc.resolve(state.doc.resolve(tableStart).before())))
      dispatch && dispatch(tr)
      return true
    }
    else if(!nextPos) {
      return false
    }
    const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(nextPos), forward? 1: -1))
    dispatch && dispatch(tr)
    return true
  }
}

function joinTable(state: EditorState, dispatch?: (tr: Transaction) => void) {
  const sel = state.selection
  const isGapCursor = sel instanceof GapCursor
  const tableBefore = sel.$anchor.nodeBefore?.type.name === "table"? sel.$anchor.nodeBefore: undefined
  const tableAfter = sel.$anchor.nodeAfter?.type.name === "table"? sel.$anchor.nodeAfter: undefined
  if(isGapCursor && tableBefore && tableAfter) {
    const tr = state.tr.join(sel.anchor)
    dispatch && dispatch(tr)
    return true
  }
  else {
    return false
  }
}

function splitTable(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) {
  const sel = state.selection
  const isGapCursor = sel instanceof GapCursor
  const tableBefore = sel.$anchor.nodeBefore?.type.name === "table"? sel.$anchor.nodeBefore: undefined
  const tableAfter = sel.$anchor.nodeAfter?.type.name === "table"? sel.$anchor.nodeAfter: undefined
  if(isGapCursor && tableBefore && tableAfter) {
    const tr = state.tr.join(sel.anchor)
    dispatch && dispatch(tr)
    return true
  }
  else {
    return false
  }
}

function splitCell(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) {
  let table = findParentNode(node => node.type.name === "table")(state.selection)?.node
  if(!table) {
    console
    return false
  }
  const tr = state.tr
    .deleteSelection()
    .split(state.selection.$anchor.pos)
  dispatch && dispatch(tr)
  return true
}

function joinCellBackward(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) {
  const sel = state.selection
  const inTable = !!findParentNode(node => node.type.name === "table")(sel)
  const atStart = sel.$from.parent.type.name === "td" && sel.$from.parentOffset === 0
  if(inTable && atStart && canJoin(state.doc, sel.$from.pos - 1)) {
    const tr = state.tr.join(sel.$from.pos - 1, 1)
    dispatch && dispatch(tr)
    return true
  }
  else {
    return false
  }
}

function joinRowBackward(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) {
  const sel = state.selection
  const inTable = !!findParentNode(node => node.type.name === "table")(sel)
  const atStart = sel.$from.parent.type.name === "td" && sel.$from.parentOffset === 0
  if(inTable && atStart && canJoin(state.doc, sel.$from.pos - 2)) {
    const tr = state.tr.join(sel.$from.pos - 2, 2)
    dispatch && dispatch(tr)
    return true
  }
  else {
    return false
  }
}


function insertRowAfter(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) {
  const sel = state.selection
  const isGapCursor = sel instanceof GapCursor
  const tableBefore = sel.$anchor.nodeBefore?.type.name === "table"? sel.$anchor.nodeBefore: undefined
  const tableAfter = sel.$anchor.nodeAfter?.type.name === "table"? sel.$anchor.nodeAfter: undefined
  if(isGapCursor && tableBefore && tableAfter) {
    const tr = state.tr.join(sel.anchor)
    dispatch && dispatch(tr)
    return true
  }
  else {
    return false
  }
}

export const tablePlugin = () => ({
  nodes: {
    table: HTMLElementSpec({
      ...table,
      tag: "table",
      group: "flow containerblock",
      content: "caption? thead? tbody* tfoot?",
      allowGapCursor: false
    }),
    caption: HTMLElementSpec({
      ...table_caption,
      tag: "caption",
      group: "containerblock",
      content: "flow*", // mixed
      allowGapCursor: false
    }),
    col: HTMLElementSpec({
      tag: "col"
    }),
    colgroup: HTMLElementSpec({
      tag: "colgroup",
      group: "containerblock",
      content: "col*"
    }),
    tbody: HTMLElementSpec({
      ...table_body,
      tag: "tbody",
      group: "containerblock",
      content: "tr*",
      allowGapCursor: false
    }),
    td: HTMLElementSpec({
      ...table_cell,
      tag: "td",
      group: "sectioningroot containerblock",
      content: "p | flow*", // mixed
      allowGapCursor: true
    }),
    tfoot: HTMLElementSpec({
      ...table_foot,
      tag: "tfoot",
      group: "containerblock",
      content: "tr*",
      allowGapCursor: false
    }),
    th: HTMLElementSpec({
      ...table_header,
      tag: "th",
      group: "containerblock",
      content: "tr*",
      allowGapCursor: false
    }),
    thead: HTMLElementSpec({
      ...table_head,
      tag: "thead",
      group: "containerblock",
      content: "tr*",
      allowGapCursor: true
    }),
    tr: HTMLElementSpec({
      ...table_row,
      tag: "tr",
      group: "containerblock",
      content: "(td | th)*",
      allowGapCursor: false
    }),
  },
  plugin: [
    //columnResizing(),
    new Plugin({
      ...tableEditing({allowTableNodeSelection: true}).spec,
      props: {
        ...tableEditing({allowTableNodeSelection: true}).spec.props,
        handleKeyDown: undefined
      }
    })
  ],
  keymap: {
    // "ArrowUp": selectInTable("up"),
    // "ArrowDown": selectInTable("down"),
    // "ArrowLeft": selectInTable("left"),
    "ArrowRight": chainCommandsIf(rowEndSelected,
      setGapCursorAfterCell
    ),
    "Enter": chainCommandsIf(rowEndSelectedGap,
      (state, dispatch) => {
        const pos = state.selection.from
        let tr = state.tr.replaceSelectionWith(state.schema.node("tr"))
        tr = tr.setSelection(TextSelection.create(tr.doc, pos))
        dispatch && dispatch(tr)
        return true
      } 
    ),
    // "mod-Enter": splitCell,
    // "mod-Shift-Enter": splitParent,
    "Backspace": chainCommands(
      joinTable,
      chainCommandsIf(tableSelected, deleteTable),
      chainCommandsIf(
        state => state.selection instanceof CellSelection && state.selection.isColSelection(),
        deleteColumn
      ),
      chainCommandsIf(
        state => state.selection instanceof CellSelection && state.selection.isRowSelection(),
        deleteRow
      ),
    ),
    "mod-Backspace": chainCommands(
      joinCellBackward
    ),
    "mod-Shift-Backspace": chainCommands(
      joinRowBackward
    ),
    "Delete": chainCommands(
      joinTable,
      chainCommandsIf(tableSelected, deleteTable),
      chainCommandsIf(
        state => state.selection instanceof CellSelection && state.selection.isColSelection(),
        deleteColumn
      ),
      chainCommandsIf(
        state => state.selection instanceof CellSelection && state.selection.isRowSelection(),
        deleteRow
      ),
    )
  },
  styles: [pmTablesCSS]
} as SchemaPlugin)