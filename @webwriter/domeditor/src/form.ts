/** HTML elements that participate in form authoring, including the
 * customizable-select <selectedcontent> element from the Living Standard. */
export const formElementTypes = [
  "form", "fieldset", "legend", "label", "input", "textarea", "select",
  "datalist", "optgroup", "option", "button", "output", "meter", "progress",
  "selectedcontent",
] as const

export type FormElementType = typeof formElementTypes[number]

/** Useful standalone building blocks. Structural children such as OPTION and
 * LEGEND are added from the contextual form toolbox instead. */
export const topLevelFormElementTypes = [
  "form",
] as const satisfies readonly FormElementType[]

/** Form elements that are valid in ordinary flow/phrasing insertion
 * contexts. Context-only children are created from their parent's toolbox. */
export const insertableFormElementTypes = [
  "form", "fieldset", "label", "input", "textarea", "select", "datalist",
  "button", "output", "meter", "progress",
] as const satisfies readonly FormElementType[]

export const formElementSelector = formElementTypes.join(", ")

/** Native controls whose own focus, value, and keyboard interaction can be
 * capture-selected while the surrounding authored DOM remains atomic. */
export const formControlSelector = "button, input, select, textarea"

/** Labels participate in native control activation as well, so their pointer
 * events must take the same route as the control they address. */
export const formInteractionSelector = `${formControlSelector}, label`

export const inputTypes = [
  "hidden", "text", "search", "tel", "url", "email", "password", "date",
  "month", "week", "time", "datetime-local", "number", "range", "color",
  "checkbox", "radio", "file", "submit", "image", "reset", "button",
] as const

export type InputType = typeof inputTypes[number]

export type FormAttributeOption = {
  name: string
  label: string
  kind?: "text" | "url" | "number" | "boolean" | "select"
  placeholder?: string
  options?: readonly {label: string, value: string}[]
}

const text = (name: string, label: string, placeholder = ""): FormAttributeOption => ({
  name, label, ...(placeholder ? {placeholder} : {}),
})
const url = (name: string, label: string, placeholder = "https://…"): FormAttributeOption => ({
  name, label, kind: "url", placeholder,
})
const number = (name: string, label: string, placeholder = ""): FormAttributeOption => ({
  name, label, kind: "number", ...(placeholder ? {placeholder} : {}),
})
const boolean = (name: string, label: string): FormAttributeOption => ({name, label, kind: "boolean"})
const select = (
  name: string,
  label: string,
  values: readonly (string | readonly [label: string, value: string])[],
): FormAttributeOption => ({
  name,
  label,
  kind: "select",
  options: [
    {label: "Not set", value: ""},
    ...values.map(value => Array.isArray(value)
      ? {label: value[0], value: value[1]}
      : {label: value, value}),
  ],
})

/** Common global attributes are included directly; any other global, ARIA,
 * data, or future attribute remains editable through the custom row. */
export const commonFormAttributeOptions: readonly FormAttributeOption[] = [
  text("id", "ID", "element-id"),
  text("class", "Classes", "class-name"),
  text("title", "Title"),
  text("lang", "Language", "en"),
  select("dir", "Direction", ["auto", "ltr", "rtl"]),
  boolean("hidden", "Hidden"),
  number("tabindex", "Tab index"),
  text("accesskey", "Access key"),
  text("role", "ARIA role"),
  text("aria-label", "Accessible label"),
  text("aria-describedby", "Described by", "element-id"),
]

const submissionAttributes: readonly FormAttributeOption[] = [
  url("formaction", "Submission URL"),
  select("formenctype", "Submission encoding", [
    "application/x-www-form-urlencoded", "multipart/form-data", "text/plain",
  ]),
  select("formmethod", "Submission method", ["get", "post", "dialog"]),
  boolean("formnovalidate", "Skip validation"),
  text("formtarget", "Submission target", "_self"),
]

const popoverAttributes: readonly FormAttributeOption[] = [
  text("popovertarget", "Popover target", "element-id"),
  select("popovertargetaction", "Popover action", ["toggle", "show", "hide"]),
]

const specificFormAttributeOptions: Record<FormElementType, readonly FormAttributeOption[]> = {
  form: [
    text("accept-charset", "Accepted charset", "UTF-8"),
    url("action", "Submission URL"),
    select("autocomplete", "Autocomplete", ["on", "off"]),
    select("enctype", "Encoding", [
      "application/x-www-form-urlencoded", "multipart/form-data", "text/plain",
    ]),
    select("method", "Method", ["get", "post", "dialog"]),
    text("name", "Name", "form-name"),
    boolean("novalidate", "Skip validation"),
    text("rel", "Relationship"),
    text("target", "Target", "_self"),
  ],
  fieldset: [
    boolean("disabled", "Disabled"),
    text("form", "Form ID", "form-id"),
    text("name", "Name", "group-name"),
  ],
  legend: [],
  label: [text("for", "Control ID", "control-id")],
  input: [
    select("type", "Type", inputTypes),
    text("name", "Name", "field-name"),
    text("value", "Value"),
    text("placeholder", "Placeholder", "Enter a value"),
    text("autocomplete", "Autocomplete", "off or a field token"),
    text("accept", "Accepted file types", "image/*,.pdf"),
    boolean("alpha", "Allow alpha"),
    text("alt", "Alternative text"),
    boolean("checked", "Checked"),
    select("colorspace", "Color space", ["limited-srgb", "display-p3"]),
    text("dirname", "Direction field name"),
    boolean("disabled", "Disabled"),
    text("form", "Form ID", "form-id"),
    ...submissionAttributes,
    number("height", "Image height"),
    text("list", "Data list ID", "list-id"),
    text("max", "Maximum"),
    number("maxlength", "Maximum length"),
    text("min", "Minimum"),
    number("minlength", "Minimum length"),
    boolean("multiple", "Multiple"),
    text("pattern", "Pattern"),
    ...popoverAttributes,
    boolean("readonly", "Read only"),
    boolean("required", "Required"),
    number("size", "Visible size"),
    url("src", "Image source"),
    text("step", "Step", "any"),
    number("width", "Image width"),
  ],
  textarea: [
    text("name", "Name", "field-name"),
    text("placeholder", "Placeholder", "Enter text"),
    text("autocomplete", "Autocomplete", "off or a field token"),
    number("cols", "Columns"),
    text("dirname", "Direction field name"),
    boolean("disabled", "Disabled"),
    text("form", "Form ID", "form-id"),
    number("maxlength", "Maximum length"),
    number("minlength", "Minimum length"),
    boolean("readonly", "Read only"),
    boolean("required", "Required"),
    number("rows", "Rows"),
    select("wrap", "Wrapping", ["soft", "hard"]),
  ],
  select: [
    text("name", "Name", "field-name"),
    text("autocomplete", "Autocomplete", "off or a field token"),
    boolean("disabled", "Disabled"),
    text("form", "Form ID", "form-id"),
    boolean("multiple", "Multiple"),
    boolean("required", "Required"),
    number("size", "Visible size"),
  ],
  datalist: [],
  optgroup: [
    text("label", "Label", "Option group"),
    boolean("disabled", "Disabled"),
  ],
  option: [
    text("value", "Value"),
    text("label", "Label"),
    boolean("disabled", "Disabled"),
    boolean("selected", "Selected"),
  ],
  button: [
    select("type", "Type", ["submit", "reset", "button"]),
    text("name", "Name", "button-name"),
    text("value", "Value"),
    text("command", "Command", "show-popover or --custom"),
    text("commandfor", "Command target", "element-id"),
    boolean("disabled", "Disabled"),
    text("form", "Form ID", "form-id"),
    ...submissionAttributes,
    ...popoverAttributes,
  ],
  output: [
    text("for", "Source control IDs", "control-id"),
    text("form", "Form ID", "form-id"),
    text("name", "Name", "result"),
  ],
  meter: [
    number("value", "Value"),
    number("min", "Minimum"),
    number("max", "Maximum"),
    number("low", "Low boundary"),
    number("high", "High boundary"),
    number("optimum", "Optimum"),
  ],
  progress: [
    number("value", "Value"),
    number("max", "Maximum"),
  ],
  selectedcontent: [],
}

export const formAttributeOptions = Object.fromEntries(formElementTypes.map(type => [
  type,
  [...specificFormAttributeOptions[type], ...commonFormAttributeOptions],
])) as unknown as Record<FormElementType, readonly FormAttributeOption[]>

export const formTextElementTypes = [
  "button", "label", "legend", "option", "output", "meter", "progress", "textarea",
] as const satisfies readonly FormElementType[]

export type FormTextElementType = typeof formTextElementTypes[number]

export type FormSelectionState = {
  type: FormElementType
  attributes: Record<string, string>
  text?: string
  canAddField?: boolean
  canAddLegend?: boolean
  canAddOption?: boolean
  canAddOptionGroup?: boolean
  canCustomizeSelect?: boolean
}

export function isFormElementType(value: unknown): value is FormElementType {
  return typeof value === "string" && (formElementTypes as readonly string[]).includes(value)
}

export function isInputType(value: unknown): value is InputType {
  return typeof value === "string" && (inputTypes as readonly string[]).includes(value)
}

export function formDefaultHTML(type: FormElementType) {
  switch(type) {
    case "form": return '<form><label>Field <input name="field" placeholder="Enter a value"></label><button type="submit">Submit</button></form>'
    case "fieldset": return '<fieldset><legend>Field set</legend><label>Field <input name="field" placeholder="Enter a value"></label></fieldset>'
    case "legend": return "<legend>Legend</legend>"
    case "label": return "<label>Label</label>"
    case "input": return '<input placeholder="Enter a value">'
    case "textarea": return '<textarea placeholder="Enter text"></textarea>'
    case "select": return '<select><option value="">Choose an option</option></select>'
    case "datalist": return '<datalist><option value="Option">Option</option></datalist>'
    case "optgroup": return '<optgroup label="Option group"><option value="option">Option</option></optgroup>'
    case "option": return '<option value="option">Option</option>'
    case "button": return '<button type="button">Button</button>'
    case "output": return "<output>Output</output>"
    case "meter": return '<meter min="0" max="100" value="50">50%</meter>'
    case "progress": return '<progress max="100" value="50">50%</progress>'
    // The browser fills this from the selected OPTION once it is connected.
    case "selectedcontent": return "<selectedcontent></selectedcontent>"
  }
}
