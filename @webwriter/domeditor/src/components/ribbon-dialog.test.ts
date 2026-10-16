// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("dialog ribbon controls", () => {
  it.each(["confirm", "cancel", "escape", "close", "disconnect"])("settles the link sharing confirmation on %s", async action => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const result = ribbon.confirmLinkSharing()
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#link-sharing-dialog")!
    await vi.waitFor(() => expect(dialog.open).toBe(true))
    expect(dialog.classList.contains("document-dialog")).toBe(true)
    expect(dialog.querySelector(`#${dialog.getAttribute("aria-labelledby")}`)?.textContent).toBe("Enable link sharing?")
    expect(dialog.querySelector(`#${dialog.getAttribute("aria-describedby")}`)?.textContent).toContain("saved on the server")
    await expect(ribbon.confirmLinkSharing()).resolves.toBe(false)
    if(action === "confirm") dialog.querySelector<HTMLButtonElement>(".primary")!.click()
    else if(action === "cancel") dialog.querySelector<HTMLButtonElement>("footer button")!.click()
    else if(action === "escape") dialog.dispatchEvent(new Event("cancel", {cancelable: true}))
    else if(action === "close") dialog.querySelector<HTMLButtonElement>(".dialog-close")!.click()
    else ribbon.remove()
    await expect(result).resolves.toBe(action === "confirm")
    expect(dialog.open).toBe(false)
    if(action !== "disconnect") {
      const reopened = ribbon.confirmLinkSharing()
      await vi.waitFor(() => expect(dialog.open).toBe(true))
      dialog.querySelector<HTMLButtonElement>("footer button")!.click()
      await expect(reopened).resolves.toBe(false)
    }
  })

  it("opens About WebWriter from the last File menu item without forwarding an editor action", async () => {
    const originalURL = location.href
    history.replaceState(history.state, "", "/editor/?open=local%3Aexisting#selection")
    const ribbon = new AppRibbon()
    ribbon.menuOpen = true
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    const labels = (ribbon as any).fileMenuGroups().flatMap((group: {buttons: (string | {label: string})[]}) => group.buttons)
      .map((button: string | {label: string}) => typeof button === "string" ? button : button.label)
    expect(labels.at(-1)).toBe("About WebWriter...")

    const documentContent = document.createElement("p")
    documentContent.textContent = "Keep this document"
    const editorAction = vi.fn()
    document.body.append(documentContent)
    document.addEventListener("ribbon-button-click", editorAction)
    const open = vi.spyOn(window, "open").mockReturnValue(null)
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="About WebWriter..."]')!.click()

    expect(open).toHaveBeenCalledWith(`${location.origin}/`, "_blank", "noopener,noreferrer")
    expect(editorAction).not.toHaveBeenCalled()
    expect(documentContent.outerHTML).toBe("<p>Keep this document</p>")
    expect(ribbon.menuOpen).toBe(false)
    document.removeEventListener("ribbon-button-click", editorAction)
    history.replaceState(history.state, "", originalURL)
  })

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
    expect(button("Add opener")).toBeNull()
    expect(button("Add close button")).toBeNull()
  })
})
