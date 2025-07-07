import { toggleMark } from "prosemirror-commands";
import { Fragment, Mark, MarkSpec } from "prosemirror-model";
import { Command, EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { MarkViewConstructor } from "prosemirror-view";
import { findMark } from "./plugins/phrasing";


let addedComments: WeakSet<Mark>
let lastRenderedState: EditorState


export const commentView: MarkViewConstructor = (mark, view, inline) => {
  if(lastRenderedState !== view.state) {
    addedComments = new WeakSet()
    lastRenderedState = view.state
  }
  const dom = view.dom.ownerDocument.createElement("comment-")
  inline && dom.classList.add("inline")
  const attrs = getCommentElementAttributes
  (mark, !addedComments.has(mark))!
  addedComments.add(mark)
  Object.keys(attrs).forEach(k => dom.setAttribute(k, (attrs as any)[k]))
  return {dom, ignoreMutation(mutation) {
    if(mutation.type === "selection") {
      return true
    }
    else {
      return false
    }
  },}
}

export function canAddCommentThread(state: EditorState) {
  if(state.selection instanceof NodeSelection) {
    return !state.selection.node.attrs["=comment"]
  }
  else if(state.selection instanceof TextSelection) {
    // findMark(state.doc, mark => )
    return !state.selection.empty
  }
  else {
    return false
  }
}

export function addComment(email?: string): Command {
  return (state, dispatch, view) => {
    let tr = state.tr
    const sel = state.selection
    if(sel instanceof TextSelection) {
      const prevIds = Array.from(view?.dom.querySelectorAll("comment-") ?? [])
        .map(el => el.getAttribute("data-id"))
        .map(id => parseInt(id?.slice("c-".length) ?? "-1"))
      const id = `c-${Math.max(...prevIds, -1) + 1}`
      const content = [{content: "", email}]
      return toggleMark(state.schema.marks["_comment"], {id, content}, {removeWhenPresent: false, enterInlineAtoms: false})(state, dispatch, view)
    }
    else if(sel instanceof NodeSelection) {
      tr.setNodeAttribute(sel.from, "=comment", [{content: "", email}])
      dispatch && dispatch(tr)
      return true
    }
    else return false
  }
}

export function updateComment(idOrPos: string | number, change: Partial<CommentData>, i=0) {
  return (state: EditorState, dispatch: any) => {
    if(typeof idOrPos === "string") {
      const {mark, start, end} = findMark(state.doc, mark => mark.type.name === "_comment" && mark.attrs.id === idOrPos)
      const content = mark.attrs.content
      content.splice(i, 1, {...content[i], ...change})
      const newMark = mark.type.create({...mark.attrs, content})
      dispatch && dispatch(state.tr
        .removeMark(start, end, mark)
        .addMark(start, end, newMark)
      )
      return true
    }
    else {
      const node = state.doc.resolve(idOrPos).nodeAfter!
      const comment = node.attrs["=comment"].slice()
      comment.splice(i, 1, {...comment[i], ...change})
      let tr = state.tr.setNodeAttribute(idOrPos, "=comment", comment)
      dispatch && dispatch(tr)
      return true
    }
  }
}

export function deleteComment(idOrPos: string | number, i=0) {
  return (state: EditorState, dispatch: any) => {
    if(typeof idOrPos === "string") {
      const {mark, start, end} = findMark(state.doc, mark => mark.type.name === "_comment" && mark.attrs.id === idOrPos)
      const content = mark.attrs.content
      content.splice(i, 1)
      const newMark = mark.type.create({...mark.attrs, content})
      let tr = state.tr.removeMark(start, end, mark)
      if(newMark.attrs.content?.length) {
        tr.addMark(start, end, newMark)
      }
      dispatch && dispatch(tr)
      return true
    }
    else {
      const node = state.doc.resolve(idOrPos).nodeAfter!
      const comment = node.attrs["=comment"].slice()
      comment.splice(i, 1)
      let tr = state.tr.setNodeAttribute(idOrPos, "=comment", comment.length? comment: undefined)
      dispatch && dispatch(tr)
      return true
    }
  }
}

export type CommentData = {content: string, position?: "beforebegin" | "afterbegin" | "beforeend", id?: string, changed?: number, name?: string, email?: string}

// Opening stub comment: <!--id☛...-->
// Closing comment: <!--id☛...♦-->
export function parseComment(str: string) { // id☛...♦date☛...♦name☛...♦email☛...♦...
  const innerStr = str.startsWith("<!--")? str.slice("<!--".length, -"-->".length): str
  let parts = innerStr.split(/(?<!\\)♦/)
  const isClosing = innerStr.startsWith("id☛") && innerStr.endsWith("♦♦") && !innerStr.endsWith("\\♦♦")
  const isOpeningStub = innerStr.startsWith("id☛") && !innerStr.match(/(?<!\\)♦/)
  const content = !isClosing && !isOpeningStub? parts.at(-1)?.replaceAll("\\☛", "☛").replaceAll("\\♦", "♦"): undefined
  const metaParts = (isOpeningStub? parts: parts.slice(0, -1)).map(p => p.replaceAll("\\☛", "☛").replaceAll("\\♦", "♦"))
  const result = {content}
  metaParts.forEach(p => {
    const [k, v] = p.split(/(?<!\\)☛/);
    (result as any)[k] = k === "changed"? parseInt(v): v
  })
  return result as CommentData
}

export function serializeComment(data: CommentData, stripId=false): string {
  const metaParts = Object.keys(data ?? {}).filter(k => k !== "content" && (!stripId || k !== "id") && (data as any)[k]).map(k => `${k}☛${String((data as any)[k])!.replaceAll("\\☛", "☛")?.replaceAll("\\♦", "♦")}`)
  return `${metaParts.join("♦")}${metaParts.length? "♦": ""}${data.content.replaceAll("☛", "\\☛").replaceAll("♦", "\\♦")}`
}

export function getCommentElementData(commentEl: HTMLElement, backtrack=false): CommentData[] {
  const id = commentEl.getAttribute("data-id")
  const span = !commentEl.getAttributeNames().some(k => k !== "data-id")
  const el = span && backtrack? commentEl.ownerDocument.querySelector(`[data-id=${id}]`) ?? commentEl: commentEl
  const comments = el.getAttributeNames().filter(k => k.startsWith("data-content-")).map(k => el.getAttribute(k)!)
  return comments.map(parseComment).map(data => ({...data, id: el.getAttribute("data-id")!}))
}

export function parseCommentToElement(comments: Comment[], root: Document=document): {el: HTMLElement, open: boolean} {
  const el = root.createElement("comment-")
  const id = parseComment(comments[0].textContent!).id
  id && el.setAttribute("data-id", id)
  comments.forEach((comm, i) => el.setAttribute(`content-${i}`, comm.textContent!))
  return {el, open: !!id}
}

export function serializeCommentElement(commentEl: HTMLElement): string {
  if(commentEl.tagName !== "COMMENT-") {
    const comments = commentEl.getAttributeNames().filter(k => k.startsWith("data-ww-comment-")).map(k => commentEl.getAttribute(k))
    return comments.map(comment => `<!--${comment}-->`).join("\n")
  }
  else {
      const comments = commentEl.getAttributeNames().filter(k => k.startsWith("data-content-")).map(k => commentEl.getAttribute(k))
    const id = commentEl.getAttribute("data-id")
    return comments.map(comment => `<!--${id? `id☛${id}♦`: ""}${comment}-->`).join("\n")
  }
}

function getCommentElementAttributes(mark: Mark, isFirst=true) {
  const attrs = {"data-id": mark.attrs.id} as any
  if(isFirst) {
    mark.attrs.content?.forEach((data: CommentData, i: number) => attrs[`data-content-${i}`] = serializeComment(data, true))
  }
  return attrs
}

export const commentMarkSpec: MarkSpec = {
  attrs: {
    id: {default: undefined},
    content: {default: undefined}    
  },
  spanning: true,
  toDOM: (mark, inline) => {
    let attrs = getCommentElementAttributes(mark)
    return ["comment-", attrs, 0]
  },
  parseDOM: [{
    tag: "comment-",
    getAttrs: node => {
      const content = getCommentElementData(node, true)
      return {id: node.getAttribute("data-id"), content}
    },

  }],
  excludes: ""
}