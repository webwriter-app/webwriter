export type LocalizedText = string | Record<string, string>

export interface OptionAvailability {
  hidden?: boolean
  disabled?: boolean
  disabledReason?: LocalizedText
}

export interface OptionGroupDeclaration {
  label?: LocalizedText
  description?: LocalizedText
  collapsible?: boolean
  collapsed?: boolean
  advanced?: boolean
}

interface BaseOptionDeclaration<TypeHint=any> extends OptionAvailability {
  attribute?: boolean | string
  group?: string
  readOnly?: boolean
  unit?: string
  type?: TypeHint
  label?: LocalizedText
  placeholder?: LocalizedText
  description?: LocalizedText
}

export interface BooleanOptionDeclaration extends BaseOptionDeclaration<BooleanConstructor | "boolean"> {
  control?: "checkbox" | "switch"
}

/** A boolean widget capability shown under Edit in element distribution permissions. */
export interface PermissionDeclaration extends Pick<BooleanOptionDeclaration, "label" | "description" | "hidden" | "disabled" | "disabledReason" | "readOnly"> {
  attribute?: string
}

interface InputOptionDeclaration<TypeHint=any> extends BaseOptionDeclaration<TypeHint> {
  pattern?: string
  minlength?: number
  maxlength?: number
  autocapitalize?: "none" | "characters" | "words" | "sentences"
  spellcheck?: "true" | "false"
  autocomplete?: HTMLInputElement["autocomplete"]
  inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url"
}

export interface StringOptionDeclaration extends InputOptionDeclaration<StringConstructor | "string"> {
  multiline?: boolean
}

export interface NumberOptionDeclaration extends InputOptionDeclaration<NumberConstructor | "number"> {
  control?: "input" | "range" | "duration"
  steps?: number[]
  min?: number
  max?: number
  step?: number
}

export interface DateOptionDeclaration extends InputOptionDeclaration<"date"> {
  min?: number
  max?: number
  step?: number
}
export interface DatetimeLocalOptionDeclaration extends InputOptionDeclaration<"datetime-local"> {
  min?: number
  max?: number
  step?: number
}
export interface EmailOptionDeclaration extends InputOptionDeclaration<"email"> {}
export interface PasswordOptionDeclaration extends InputOptionDeclaration<"password"> {}
export interface TelOptionDeclaration extends InputOptionDeclaration<"tel"> {}
export interface TimeOptionDeclaration extends InputOptionDeclaration<"time"> {}
export interface UrlOptionDeclaration extends InputOptionDeclaration<"url"> {}

export interface ObjectOptionDeclaration extends BaseOptionDeclaration<ObjectConstructor | "object" | ArrayConstructor | "array"> {}

export interface ColorOptionDeclaration extends BaseOptionDeclaration<"color"> {
  swatches?: string[]
}

export type SelectOptionChoice = {
  value: string
  label?: LocalizedText
  description?: LocalizedText
  children?: never
} | {
  label?: LocalizedText
  children: SelectOptionChoice[]
  value?: never
}

export interface ReferenceOptionDeclaration extends BaseOptionDeclaration<"reference"> {
  selector?: string
  excludeSelf?: boolean
}

export interface SelectOptionDeclaration extends BaseOptionDeclaration<"select"> {
  control?: "select" | "radio" | "segmented" | "tree"
  multiple?: boolean
  options?: SelectOptionChoice[]
}

export type OptionDeclaration =
| BooleanOptionDeclaration
| StringOptionDeclaration
| NumberOptionDeclaration
| DateOptionDeclaration
| DatetimeLocalOptionDeclaration
| EmailOptionDeclaration
| PasswordOptionDeclaration
| TelOptionDeclaration
| TimeOptionDeclaration
| UrlOptionDeclaration
| ObjectOptionDeclaration
| ColorOptionDeclaration
| SelectOptionDeclaration
| ReferenceOptionDeclaration

export interface ActionDeclaration extends OptionAvailability {
  /** Native chooser input; the action method receives transient File[]. */
  input?: {type: "file", accept?: string, multiple?: boolean}
  group?: string
  /** Joins adjacent visible actions with the same ID within an option group. */
  buttonGroup?: string
  icon?: string
  intent?: "default" | "danger"
  confirm?: LocalizedText
  label?: LocalizedText
  placeholder?: LocalizedText
  description?: LocalizedText
}
