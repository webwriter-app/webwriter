// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {defaultGroupingRules} from "../widget-grouping.js"
import {WidgetGroupingDialog} from "./widget-grouping-dialog"

afterEach(() => document.body.replaceChildren())

const context = {
  canManage: true,
  participants: [{id: "a", firstName: "Ada"}, {id: "b", firstName: "Ben"}],
  groups: [{id: "g1", name: "One", members: ["a"]}],
  groupings: [{id: "set1", name: "Set one", groups: ["g1"]}],
  roles: [{id: "student", name: "Student"}],
  cohorts: [{id: "cohort", name: "Cohort"}],
}
const settle = async (dialog: WidgetGroupingDialog) => {
  await new Promise(resolve => setTimeout(resolve, 0))
  await dialog.updateComplete
  await dialog.updateComplete
}

describe("widget grouping dialog", () => {
  it("opens with saved rules, loads the roster, and resolves validated saved rules", async () => {
    const dialog = new WidgetGroupingDialog()
    document.body.append(dialog)
    const saved = {...defaultGroupingRules("stable"), number: 2, roleId: "student"}
    const resultPromise = dialog.show(saved, async () => context)
    await dialog.updateComplete
    await settle(dialog)
    expect(dialog.shadowRoot!.querySelector("dialog")!.open).toBe(true)
    expect(dialog.shadowRoot!.querySelector<HTMLSelectElement>('select')!.value).toBe("automatic")
    expect(dialog.rules.number).toBe(2)
    expect(dialog.context).toBe(context)
    dialog.shadowRoot!.querySelector<HTMLFormElement>("#rules-form")!.dispatchEvent(new SubmitEvent("submit", {bubbles: true, cancelable: true}))
    expect(await resultPromise).toEqual(saved)
    expect(dialog.shadowRoot!.querySelector("dialog")!.open).toBe(false)
  })

  it("returns undefined on cancel and uses defaults when no saved rules are provided", async () => {
    const dialog = new WidgetGroupingDialog()
    document.body.append(dialog)
    const resultPromise = dialog.show(null, async () => context)
    await dialog.updateComplete
    await settle(dialog)
    expect(dialog.rules.seed).toBeTruthy()
    dialog.shadowRoot!.querySelector<HTMLButtonElement>('button:not(.primary)')!.click()
    expect(await resultPromise).toBeUndefined()
  })

  it("settles cancellation without waiting for an unresolved roster request", async () => {
    const dialog = new WidgetGroupingDialog()
    document.body.append(dialog)
    const never = new Promise<typeof context>(() => {})
    const resultPromise = dialog.show(defaultGroupingRules("pending"), () => never)
    await settle(dialog)
    expect(dialog.loading).toBe(true)
    dialog.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    const result = await Promise.race([
      resultPromise,
      new Promise(resolve => setTimeout(() => resolve("timed out"), 100)),
    ])
    expect(result).toBeUndefined()
  })

  it("previews groups using the loaded context", async () => {
    const dialog = new WidgetGroupingDialog()
    document.body.append(dialog)
    dialog.rules = {...defaultGroupingRules("stable"), number: 1}
    const resultPromise = dialog.show(dialog.rules, async () => context)
    await dialog.updateComplete
    await settle(dialog)
    const preview = [...dialog.shadowRoot!.querySelectorAll("button")].find(button => button.textContent === "Preview")!
    preview.click()
    await dialog.updateComplete
    await settle(dialog)
    expect(dialog.shadowRoot!.querySelector(".preview")?.textContent).toContain("Group A: 1 participant")
    expect(dialog.preview?.flatMap(group => group.members)).toHaveLength(2)
    dialog.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    expect(await resultPromise).toBeUndefined()
  })

  it("preserves manual multi-select presets and creates unique ids after removal", async () => {
    const dialog = new WidgetGroupingDialog()
    document.body.append(dialog)
    const rules = {...defaultGroupingRules("manual"), method: "manual" as const, manualGroups: [
      {id: "m1", name: "One", members: ["a"]},
      {id: "m2", name: "Two", members: ["b"]},
    ]}
    const resultPromise = dialog.show(rules, async () => context)
    await settle(dialog)
    const selects = dialog.shadowRoot!.querySelectorAll<HTMLSelectElement>(".manual-group select[multiple]")
    expect([...selects[0].selectedOptions].map(option => option.value)).toEqual(["a"])
    expect([...selects[1].selectedOptions].map(option => option.value)).toEqual(["b"])
    dialog.shadowRoot!.querySelector<HTMLButtonElement>(".manual-group button")!.click()
    await dialog.updateComplete
    dialog.shadowRoot!.querySelector<HTMLButtonElement>(".wide > button")!.click()
    await dialog.updateComplete
    expect(new Set(dialog.rules.manualGroups.map(group => group.id)).size).toBe(2)
    dialog.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    expect(await resultPromise).toBeUndefined()
  })

  it("permits automatic save after connection failure, but blocks permission denial", async () => {
    const offline = new WidgetGroupingDialog()
    document.body.append(offline)
    const resultPromise = offline.show(defaultGroupingRules("offline"), async () => { throw new Error("Connect the document to load its participant roster") })
    await offline.updateComplete
    await settle(offline)
    expect(offline.offline).toBe(true)
    expect(offline.shadowRoot!.querySelector<HTMLButtonElement>("button.primary")!.disabled).toBe(false)
    offline.shadowRoot!.querySelector<HTMLFormElement>("#rules-form")!.dispatchEvent(new SubmitEvent("submit", {bubbles: true, cancelable: true}))
    expect((await resultPromise)?.seed).toBe("offline")

    const denied = new WidgetGroupingDialog()
    document.body.append(denied)
    const deniedResult = denied.show(defaultGroupingRules("denied"), async () => ({...context, canManage: false}))
    await denied.updateComplete
    await settle(denied)
    expect(denied.shadowRoot!.querySelector<HTMLButtonElement>("button.primary")!.disabled).toBe(true)
    denied.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    expect(await deniedResult).toBeUndefined()
  })
})
