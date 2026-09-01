export const dialogClosedByValues = ["any", "closerequest", "none"] as const

export type DialogClosedBy = typeof dialogClosedByValues[number]

export type DialogSelectionState = {
  attributes: Record<string, string>
  initiallyOpen: boolean
  closedBy: DialogClosedBy | ""
  openerCount: number
  closeControlCount: number
  hasDialogForm: boolean
}

const usedId = (root: ParentNode, id: string) => Array.from(root.querySelectorAll("[id]"))
  .some(element => element.id === id)

/** Generates stable, readable IDs without assuming that authored IDs are
 * unique or that the document follows an editor-owned naming convention. */
export function nextDialogIds(root: ParentNode = document) {
  let index = 1
  while(usedId(root, `dialog-${index}`) || usedId(root, `dialog-${index}-title`)) index++
  return {dialogId: `dialog-${index}`, titleId: `dialog-${index}-title`}
}

/** A useful, script-free dialog pattern. Every node is authored content: the
 * opener and closer use native command invokers, and the heading gives the
 * dialog an accessible name. */
export function dialogDefaultHTML(root: ParentNode = document) {
  const {dialogId, titleId} = nextDialogIds(root)
  const ownerDocument = root instanceof Document ? root : root.ownerDocument ?? document
  const container = ownerDocument.createElement("div")

  const opener = ownerDocument.createElement("button")
  opener.type = "button"
  opener.setAttribute("commandfor", dialogId)
  opener.setAttribute("command", "show-modal")
  opener.textContent = "Open dialog"

  const dialog = ownerDocument.createElement("dialog")
  dialog.id = dialogId
  dialog.setAttribute("closedby", "any")
  dialog.setAttribute("aria-labelledby", titleId)

  const title = ownerDocument.createElement("h2")
  title.id = titleId
  title.textContent = "Dialog title"
  const content = ownerDocument.createElement("p")
  content.textContent = "Dialog content"
  const close = ownerDocument.createElement("button")
  close.type = "button"
  close.setAttribute("commandfor", dialogId)
  close.setAttribute("command", "close")
  close.textContent = "Close"
  dialog.append(title, content, close)

  container.append(opener, dialog)
  return {html: container.innerHTML, dialogId, titleId}
}

export function isDialogClosedBy(value: unknown): value is DialogClosedBy {
  return dialogClosedByValues.includes(value as DialogClosedBy)
}
