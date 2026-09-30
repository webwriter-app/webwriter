export type WidgetGroupingRules = {
  version: 1
  method: "automatic" | "manual" | "existing"
  namingScheme: string
  groupBy: "groups" | "members"
  number: number
  allocateBy: "random" | "firstname" | "lastname" | "idnumber" | "none"
  preventSmallGroup: boolean
  ignoreGrouped: boolean
  activeOnly: boolean
  roleId: string
  cohortId: string
  sourceGroupId: string
  sourceGroupingId: string
  grouping: "none" | "new" | "existing"
  groupingName: string
  groupingId: string
  messaging: boolean
  seed: string
  manualGroups: {id: string, name: string, members: string[]}[]
  existingGroupingId: string
}
export type WidgetGroupingContext = {
  canManage: boolean
  participants: {id: string, firstName?: string, lastName?: string, idNumber?: string, roles?: string[], cohorts?: string[], groups?: string[], groupings?: string[], active?: boolean}[]
  groups: {id: string, name: string, members: string[]}[]
  groupings: {id: string, name: string, groups: string[]}[]
  roles?: {id: string, name: string}[]
  cohorts?: {id: string, name: string}[]
}
export type WidgetGroupingResult = {
  groups: {id: string, name: string, members: string[]}[]
  assignments: Record<string, string>
  grouping: {mode: string, id?: string, name?: string}
}
export const groupingTarget: "ww-grouping"
export function defaultGroupingRules(seed?: string): WidgetGroupingRules
export function validateGroupingRules(value: unknown): WidgetGroupingRules
export function formWidgetGroups(rules: WidgetGroupingRules, context: WidgetGroupingContext): WidgetGroupingResult
