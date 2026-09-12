// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

afterEach(() => document.body.replaceChildren())

describe("unsupported form authoring UI", () => {
  it("omits HTML and form insertion controls", async () => {
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
      "Selected Content", "HTML",
    ].includes(label))).toEqual([])
  })

})
