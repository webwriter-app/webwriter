import {validateGroupingRules, type WidgetGroupingRules} from "./widget-grouping.js"
import {compatibleControl, isRecord, widgetOptionTypes, type UnknownRecord, type WidgetOptionType, type WidgetOptionState, type WidgetOptionGroupState, type WidgetActionState} from "@webwriter/lit"
export * from "@webwriter/lit"

/** Options and actions of the widget at the selection. */
export type WidgetOptionsState = {
  /** BODY-relative child-node path of the widget. */
  path: number[]
  localName: string
  options: WidgetOptionState[]
  actions: WidgetActionState[]
  groups?: WidgetOptionGroupState[]
  data?: {type: "application/json" | "application/xml", value: string}
  sharing?: {widgetId: string, mode: "individual" | "all" | "group", grouping: WidgetGroupingRules | null, error?: string}
}

export type WidgetPermissionState = Pick<WidgetOptionState, "name" | "label" | "description" | "disabled" | "disabledReason" | "readOnly"> & {
  value: boolean
}

const isOptionValue = (value: unknown, depth = 0): boolean => {
  if(value === null || ["string", "boolean"].includes(typeof value)) return true
  if(typeof value === "number") return Number.isFinite(value)
  if(depth > 8) return false
  if(Array.isArray(value)) return value.every(item => isOptionValue(item, depth + 1))
  return isRecord(value) && Object.values(value).every(item => isOptionValue(item, depth + 1))
}

function isOptionTree(value: unknown, depth = 0, budget = {remaining: 1000}): boolean {
  return depth <= 8 && Array.isArray(value) && value.every(node => {
    if(--budget.remaining < 0 || !isRecord(node) || typeof node.label !== "string"
      || node.description !== undefined && typeof node.description !== "string") return false
    return node.children !== undefined ? node.value === undefined && isOptionTree(node.children, depth + 1, budget)
      : typeof node.value === "string"
  })
}

export function isWidgetOptionsState(value: unknown): value is WidgetOptionsState {
  if(!isRecord(value)) return false
  if(value.data !== undefined && (!isRecord(value.data)
    || !["application/json", "application/xml"].includes(value.data.type as string)
    || typeof value.data.value !== "string")) return false
  if(value.sharing !== undefined) {
    const sharing = value.sharing
    if(!isRecord(sharing) || typeof sharing.widgetId !== "string"
      || !["individual", "all", "group"].includes(sharing.mode as string)
      || sharing.error !== undefined && typeof sharing.error !== "string") return false
    try { if(sharing.grouping !== null) validateGroupingRules(sharing.grouping) }
    catch { return false }
  }
  const strings = (record: UnknownRecord, keys: string[]) => keys.every(key => record[key] === undefined || typeof record[key] === "string")
  const booleans = (record: UnknownRecord, keys: string[]) => keys.every(key => record[key] === undefined || typeof record[key] === "boolean")
  const available = (record: UnknownRecord) => strings(record, ["group", "disabledReason"]) && booleans(record, ["hidden", "disabled"])
  return (value.groups === undefined || Array.isArray(value.groups) && value.groups.every(group => isRecord(group)
      && typeof group.name === "string" && typeof group.label === "string" && strings(group, ["description"])
      && booleans(group, ["collapsible", "collapsed", "advanced"])))
    && Array.isArray(value.path) && value.path.every(index => Number.isInteger(index) && index >= 0)
    && typeof value.localName === "string"
    && Array.isArray(value.options) && value.options.every(option => isRecord(option)
      && typeof option.name === "string" && typeof option.label === "string"
      && widgetOptionTypes.includes(option.type as WidgetOptionType)
      && (option.attribute === null || typeof option.attribute === "string")
      && isOptionValue(option.value)
      && available(option) && booleans(option, ["readOnly", "excludeSelf", "referenceMissing"]) && strings(option, ["unit", "selector"])
      && (option.tree === undefined || option.type === "select" && option.multiple === true && option.control === "tree" && isOptionTree(option.tree))
      && (option.control === undefined || compatibleControl(option.type as WidgetOptionType, option.control, option.multiple))
      && (option.steps === undefined || option.type === "number" && Array.isArray(option.steps)
        && option.steps.every(step => typeof step === "number" && Number.isFinite(step)))
      && ["description", "placeholder", "pattern"].every(key => option[key] === undefined || typeof option[key] === "string")
      && ["min", "max", "step", "minlength", "maxlength"].every(key => option[key] === undefined
        || typeof option[key] === "number" && Number.isFinite(option[key]))
      && ["multiline", "multiple"].every(key => option[key] === undefined || typeof option[key] === "boolean")
      && (option.swatches === undefined || Array.isArray(option.swatches) && option.swatches.every(swatch => typeof swatch === "string"))
      && (option.choices === undefined || Array.isArray(option.choices) && option.choices.every(choice => isRecord(choice)
        && typeof choice.value === "string" && typeof choice.label === "string" && strings(choice, ["description"]))))
    && Array.isArray(value.actions) && value.actions.every(action => isRecord(action)
      && typeof action.name === "string" && typeof action.label === "string" && available(action)
      && strings(action, ["buttonGroup", "icon", "confirm", "error"]) && booleans(action, ["busy"])
      && (action.input === undefined || isRecord(action.input) && action.input.type === "file"
        && strings(action.input, ["accept"]) && booleans(action.input, ["multiple"]))
      && (action.intent === undefined || action.intent === "default" || action.intent === "danger")
      && (action.description === undefined || typeof action.description === "string"))
}
