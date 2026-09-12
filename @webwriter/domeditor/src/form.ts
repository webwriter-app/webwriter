/** HTML elements that participate in native form behavior and boundary handling. */
export const formElementTypes = [
  "form", "fieldset", "legend", "label", "input", "textarea", "select",
  "datalist", "optgroup", "option", "button", "output", "meter", "progress",
  "selectedcontent",
] as const

export type FormElementType = typeof formElementTypes[number]

export const formElementSelector = formElementTypes.join(", ")

/** Native controls whose focus, value, and keyboard interaction are atomic to the editor. */
export const formControlSelector = "button, input, select, textarea"

/** Labels participate in native control activation as well. */
export const formInteractionSelector = `${formControlSelector}, label`

export const inputTypes = [
  "hidden", "text", "search", "tel", "url", "email", "password", "date",
  "month", "week", "time", "datetime-local", "number", "range", "color",
  "checkbox", "radio", "file", "submit", "image", "reset", "button",
] as const

export type InputType = typeof inputTypes[number]

export function isFormElementType(value: unknown): value is FormElementType {
  return typeof value === "string" && (formElementTypes as readonly string[]).includes(value)
}

export function isInputType(value: unknown): value is InputType {
  return typeof value === "string" && (inputTypes as readonly string[]).includes(value)
}
