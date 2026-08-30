// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

afterEach(() => document.body.replaceChildren())

describe("form ribbon and toolbox controls", () => {
  it("groups all form building blocks under one ribbon entry", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const labels = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button',
    ), button => button.label)
    expect(labels.filter(label => [
      "Form", "Field Set", "Text Field", "Text Area", "Dropdown", "Button",
      "Label", "Data List", "Output", "Meter", "Progress", "Option", "Legend",
      "Selected Content",
    ].includes(label))).toEqual(["Form"])
  })

  it("renders complete input editing state and dispatches attribute changes", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.form = {
      type: "input",
      attributes: {type: "email", name: "address", required: "", "data-source": "profile"},
    }
    const listener = vi.fn()
    ribbon.addEventListener("form-attribute-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const attributes = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer ribbon-button[label="Attributes"]',
    )!
    await attributes.updateComplete
    const type = attributes.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="input: Type"]')!
    const required = attributes.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="input: Required"]')!
    const custom = attributes.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="input: data-source"]')!

    expect(type.value).toBe("email")
    expect(required.checked).toBe(true)
    expect(custom.value).toBe("profile")

    type.value = "date"
    type.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {type: "input", attribute: "type", value: "date"},
    }))
  })

  it("offers only structure actions valid for the selected form element", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.form = {
      type: "select",
      attributes: {},
      canAddOption: true,
      canAddOptionGroup: true,
      canCustomizeSelect: true,
    }
    document.body.append(ribbon)
    await ribbon.updateComplete

    const button = (label: string) => ribbon.shadowRoot!.querySelector<RibbonButton>(`ribbon-button[label="${label}"]`)!
    expect(button("Add field").disabled).toBe(true)
    expect(button("Add option").disabled).toBe(false)
    expect(button("Add group").disabled).toBe(false)
    expect(button("Custom select").disabled).toBe(false)
  })
})
