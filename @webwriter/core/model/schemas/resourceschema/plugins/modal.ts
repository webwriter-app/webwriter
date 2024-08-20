import { TextSelection, Command, EditorState, NodeSelection, AllSelection } from "prosemirror-state";
import { SchemaPlugin } from ".";
import { range } from "../../../../utility";
import { HTMLElementSpec } from "../htmlelementspec";
import {Node, ResolvedPos, NodeType, Attrs, NodeRange, Fragment} from "prosemirror-model"
import {canSplit, liftTarget} from "prosemirror-transform"

export function getNodePath($pos: ResolvedPos, excludeRoot=true) {
  return range($pos.depth + 1).map(k => $pos.node(k)).slice(excludeRoot? 1: 0)
}

export function getPosPath($pos: ResolvedPos, excludeRoot=true) {
  return range($pos.depth + 1).map(k => $pos.before(k + 1)).slice(excludeRoot? 1: 0) 
}

export function findAncestor($pos: ResolvedPos, predicate: (value: [number, Node], index: number, array: [number, Node][]) => boolean) {
  const nodePath = getNodePath($pos)
  const posPath = getPosPath($pos)
  return posPath.map((pos, i) => [pos, nodePath[i]] as [number, Node]).find(predicate) ?? []
}

export function ancestorOfType($pos: ResolvedPos, type: string) {
  return findAncestor($pos, ([_, node]) => node?.type.name === type)
}

function selectDetailsContent(split=false): Command {
  return (state, dispatch, view) => {
    const {selection, doc} = state
    const pType = state.schema.nodes["p"]!
    const [detailsPos, details] = ancestorOfType(selection.$from, "details")
    const [summaryPos, summary] = ancestorOfType(selection.$from, "summary")
    const nodePath = getNodePath(selection.$from)
    if(details && summary && split) {

      let tr = state.tr.setNodeAttribute(detailsPos! - 1, "open", true)
      tr = tr.deleteSelection()
      tr = tr.split(tr.selection.from, undefined, [{type: pType}])
      dispatch && dispatch(tr)
      return true
    }
    return false
  }
}

export const modalPlugin = () => ({
  nodes: {
    dialog: HTMLElementSpec({
      tag: "dialog",
      group: "flow sectioningroot containerblock",
      content: "flow*",
      attrs: {
        open: {default: undefined}
      }
    }),
    details: HTMLElementSpec({
      tag: "details",
      group: "flow sectioningroot interactive palpable containerblock",
      content: `summary flow*`,
      attrs: {
        open: {default: undefined}
      }
    }),
    summary: HTMLElementSpec({
      group: "containerinline",
      tag: "summary",
      content: "phrasing*" // simplified until phrase editing is fixed
    })
  },
  keymap: {
    "Enter": selectDetailsContent(true),
    "ArrowDown": selectDetailsContent(),
    "Backspace": (state, dispatch, view) => {
      /*
      console.log(getNodePath(selection.$from), getPosPath(selection.$from))
      const [detailsPos, details] = ancestorOfType(selection.$from, "details")
      const [summaryPos, summary] = detailsPos? [
        detailsPos + 1,
        details?.child(0).type.name === "summary"? details?.child(0): undefined
      ]: []
      const open = details?.attrs.open
      console.log(details, summaryPos, selection.from)
      if(details && summaryPos !== undefined && selection.from === summaryPos) {
        console.log("backspace handled")
        let tr = state.tr.setSelection(TextSelection.create(doc, selection.from - 2))
    
        dispatch && dispatch(tr)
        return true
      }*/
      return false
    },
  }
} as SchemaPlugin)