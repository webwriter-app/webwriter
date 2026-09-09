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

export function isDialogClosedBy(value: unknown): value is DialogClosedBy {
  return dialogClosedByValues.includes(value as DialogClosedBy)
}
