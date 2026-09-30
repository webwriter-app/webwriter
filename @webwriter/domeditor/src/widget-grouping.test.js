import {describe, expect, it} from "vitest"
import {defaultGroupingRules, formWidgetGroups, validateGroupingRules} from "./widget-grouping"

const people = (count = 8) => Array.from({length: count}, (_, index) => ({
  id: `u${index + 1}`, firstName: `First${String.fromCharCode(65 + index)}`,
  lastName: `Last${String.fromCharCode(65 + index)}`, idNumber: String(index + 1),
  roles: [index % 2 ? "student" : "teacher"], cohorts: [index < 4 ? "red" : "blue"],
  groups: index === 0 ? ["g0"] : [], groupings: index === 0 ? ["set0"] : [], active: index !== 7,
}))
const configured = overrides => validateGroupingRules({...defaultGroupingRules("fixed"), ...overrides})

describe("widget grouping rules", () => {
  it("filters automatic participants by scope and already grouped status", () => {
    const result = formWidgetGroups(configured({
      roleId: "student", cohortId: "red", sourceGroupId: "g0", sourceGroupingId: "set0",
      activeOnly: true, ignoreGrouped: true,
    }), {participants: people(), groups: []})
    expect(result.groups).toEqual([])
    const next = formWidgetGroups(configured({roleId: "student", cohortId: "red", activeOnly: false}), {participants: people()})
    expect(next.groups.flatMap(group => group.members)).toEqual(["u2", "u4"])
  })

  it("derives source filters and already-grouped state from the supplied catalogs", () => {
    const context = {
      participants: [{id: "a"}, {id: "b"}, {id: "c"}],
      groups: [{id: "g1", name: "One", members: ["a"]}, {id: "g2", name: "Two", members: ["b"]}],
      groupings: [{id: "set1", name: "Set one", groups: ["g1"]}],
    }
    const byGroup = formWidgetGroups(configured({sourceGroupId: "g2", number: 1}), context)
    expect(byGroup.groups.flatMap(group => group.members)).toEqual(["b"])
    const byGrouping = formWidgetGroups(configured({sourceGroupingId: "set1", number: 1}), context)
    expect(byGrouping.groups.flatMap(group => group.members)).toEqual(["a"])
    const ignoring = formWidgetGroups(configured({ignoreGrouped: true, number: 1}), context)
    expect(ignoring.groups.flatMap(group => group.members)).toEqual(["c"])
  })

  it("rejects duplicate participant identities in a roster", () => {
    expect(() => formWidgetGroups(configured(), {participants: [{id: "same"}, {id: "same"}]})).toThrow(/duplicate participant id/)
  })

  it("uses deterministic random allocation and alphabetical ordering with stable id ties", () => {
    const participants = [{id: "z", firstName: "Alex"}, {id: "a", firstName: "Alex"}, {id: "b", firstName: "Bea"}, {id: "c", firstName: "Cal"}]
    const randomRules = configured({number: 2, seed: "same"})
    expect(formWidgetGroups(randomRules, {participants})).toEqual(formWidgetGroups(randomRules, {participants}))
    expect(formWidgetGroups(randomRules, {participants})).toEqual(formWidgetGroups(randomRules, {participants: [...participants].reverse()}))
    const sorted = formWidgetGroups(configured({number: 2, allocateBy: "firstname"}), {participants})
    expect(sorted.groups.map(group => group.members)).toEqual([["a", "z"], ["b", "c"]])
  })

  it("reduces a sub-70% final member-sized group and balances the remainder", () => {
    const result = formWidgetGroups(configured({number: 3, preventSmallGroup: true, activeOnly: false}), {participants: people(10)})
    expect(result.groups.map(group => group.members.length)).toEqual([4, 3, 3])
    const boundary = formWidgetGroups(configured({number: 10, preventSmallGroup: true, activeOnly: false}), {participants: people(17)})
    expect(boundary.groups.map(group => group.members.length)).toEqual([9, 8])
  })

  it("makes empty groups when allocation is none and permits group counts above roster size", () => {
    const result = formWidgetGroups(configured({allocateBy: "none", groupBy: "groups", number: 4}), {participants: people(2)})
    expect(result.groups).toHaveLength(4)
    expect(result.groups.every(group => group.members.length === 0)).toBe(true)
    expect(result.assignments).toEqual({})
  })

  it("validates manual groups and only assigns scoped roster members once", () => {
    const rules = configured({method: "manual", manualGroups: [
      {id: "m1", name: "Blue", members: ["u1", "u2"]},
      {id: "m2", name: "Gold", members: ["u3"]},
    ]})
    const result = formWidgetGroups(rules, {participants: people(3)})
    expect(result.assignments).toEqual({u1: "m1", u2: "m1", u3: "m2"})
    expect(() => formWidgetGroups(configured({method: "manual", manualGroups: [
      {id: "m1", name: "One", members: ["u1"]}, {id: "m2", name: "Two", members: ["u1"]},
    ]}), {participants: people(1)})).toThrow(/more than one manual group/)
    expect(() => formWidgetGroups(configured({method: "manual", manualGroups: [
      {id: "m1", name: "One", members: ["missing"]},
    ]}), {participants: people(1)})).toThrow(/not an eligible participant/)
  })

  it("reuses existing groups and rejects duplicate users in the source grouping", () => {
    const context = {
      participants: people(3),
      groups: [{id: "g1", name: "A", members: ["u1", "u2", "outside"]}, {id: "g2", name: "B", members: ["u3"]}],
      groupings: [{id: "old", name: "Old", groups: ["g1", "g2"]}],
    }
    const result = formWidgetGroups(configured({method: "existing", existingGroupingId: "old"}), context)
    expect(result.groups.map(group => group.members)).toEqual([["u1", "u2"], ["u3"]])
    expect(result.assignments.u2).toBe("g1")
    expect(() => formWidgetGroups(configured({method: "existing", existingGroupingId: "old"}), {
      ...context, groups: [...context.groups, {id: "g3", name: "C", members: ["u1"]}],
      groupings: [{id: "old", name: "Old", groups: ["g1", "g3"]}],
    })).toThrow(/more than one existing group/)
  })

  it("validates integer bounds, naming tokens, manual uniqueness, and grouping destinations", () => {
    expect(() => validateGroupingRules({...defaultGroupingRules("x"), number: 0})).toThrow(/number/)
    expect(() => formWidgetGroups(configured({number: 2, namingScheme: "Group"}), {participants: people(3)})).toThrow(/namingScheme/)
    expect(() => validateGroupingRules({...defaultGroupingRules("x"), manualGroups: [
      {id: "a", name: "Same", members: []}, {id: "b", name: "same", members: []},
    ]})).toThrow(/duplicate manual group name/)
    expect(() => formWidgetGroups(configured({grouping: "existing", groupingId: "missing"}), {participants: []})).toThrow(/grouping missing/)
  })
})
