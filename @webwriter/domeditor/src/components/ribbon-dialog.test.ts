// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

afterEach(() => document.body.replaceChildren())

describe("dialog ribbon controls", () => {
  it("renders dialog state and dispatches authored attribute changes", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.dialog = {
      attributes: {id: "notice", "aria-label": "Notice", closedby: "any"},
      initiallyOpen: false,
      closedBy: "any",
      openerCount: 1,
      closeControlCount: 1,
      hasDialogForm: false,
    }
    const listener = vi.fn()
    ribbon.addEventListener("dialog-attribute-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Dialog"]')!
    const attributes = drawer.querySelector<RibbonButton>('ribbon-button[label="Attributes"]')!
    await attributes.updateComplete
    const id = attributes.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Dialog: ID"]')!
    const open = attributes.shadowRoot!.querySelector<HTMLInputElement>(
      'input[aria-label="Dialog: Initially open (non-modal)"]',
    )!
    const closedBy = attributes.shadowRoot!.querySelector<HTMLSelectElement>(
      'select[aria-label="Dialog: Close behavior"]',
    )!

    expect(id.value).toBe("notice")
    expect(open.checked).toBe(false)
    expect(closedBy.value).toBe("any")

    open.checked = true
    open.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    closedBy.value = "none"
    closedBy.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({
      detail: {attribute: "open", value: ""},
    }))
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: {attribute: "closedby", value: "none"},
    }))
  })

  it("offers structure actions without placing controls in the document", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.dialog = {
      attributes: {},
      initiallyOpen: false,
      closedBy: "",
      openerCount: 0,
      closeControlCount: 0,
      hasDialogForm: false,
    }
    document.body.append(ribbon)
    await ribbon.updateComplete

    const button = (label: string) => ribbon.shadowRoot!
      .querySelector<RibbonButton>(`ribbon-drawer[label="Dialog"] ribbon-button[label="${label}"]`)!
    expect(button("Add opener").action).toBe("dialog-add-invoker")
    expect(button("Add close button").action).toBe("dialog-add-close")
  })
})
