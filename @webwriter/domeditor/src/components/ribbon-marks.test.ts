// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {formatShortcut} from "../app-settings"
import {markStateChangeEvent} from "../editor-bridge"
import {DomEditor} from "./dom-editor"
import {AppRibbon} from "./ribbon"
import type {FileLabel} from "./file-label"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonCombobox} from "./ribbon-combobox"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenu} from "./ribbon-menu"
import type {RibbonTab} from "./ribbon-tab"
import {WebWriterPackageRegistry} from "../packages"
import * as fonts from "../fonts"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
  vi.spyOn(fonts, "bunnyFonts").mockResolvedValue([])
})

async function mountRibbon() {
  const ribbon = new AppRibbon()
  document.body.append(ribbon)
  await ribbon.updateComplete
  const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
  await drawer.updateComplete
  return {ribbon, drawer}
}

async function mountEditor() {
  const editor = new DomEditor()
  Object.assign(editor, {frameStarted: true})
  document.body.append(editor)
  await editor.updateComplete
  const iframe = editor.shadowRoot!.querySelector("iframe")!
  iframe.dispatchEvent(new Event("load"))
  return {editor, iframe, editorWindow: iframe.contentWindow!}
}

function dispatchEditorMessage(editor: DomEditor, editorWindow: Window, data: object) {
  const bridgeNonce = (editor as unknown as {bridgeNonce: string}).bridgeNonce
  window.dispatchEvent(new MessageEvent("message", {
    data: {...data, bridgeNonce},
    source: editorWindow,
    origin: window.location.origin,
  }))
}

const primaryButtons = (drawer: RibbonDrawer) => Array.from(
  drawer.querySelectorAll<RibbonButton>('ribbon-button:not([slot="more"])'),
)

describe("mark ribbon controls", () => {
  it("renders the File tab as a rich document label and keeps file actions compact", async () => {
    const {ribbon} = await mountRibbon()
    const saveEvents: string[] = []
    ribbon.addEventListener("ribbon-button-click", event => {
      saveEvents.push((event as CustomEvent<{label: string}>).detail.label)
    })
    ribbon.fileName = "lesson"
    await ribbon.updateComplete

    const fileTab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!
    expect(getComputedStyle(fileTab).width).toBe("fit-content")
    expect(getComputedStyle(fileTab).minWidth).toBe("calc(100px + 27.2px)")
    expect(getComputedStyle(fileTab).maxWidth).toBe("500px")
    const fileLabel = fileTab.shadowRoot!.querySelector<FileLabel>("file-label")!
    await fileLabel.updateComplete
    expect(fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")?.textContent).toBe("lesson")
    expect(fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")?.tagName).toBe("STRONG")
    expect(getComputedStyle(fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")!).lineHeight).toBe("1.4")
    const compactLabel = fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-menu-label")!
    expect(compactLabel.textContent).toBe("File")
    expect(compactLabel.title).toBe("lesson")
    expect(getComputedStyle(compactLabel).display).toBe("none")
    expect(getComputedStyle(compactLabel).lineHeight).toBe("1.4")
    expect(fileLabel.shadowRoot!.querySelector(".location-icon")).toBeNull()
    expect(fileLabel.shadowRoot!.querySelector("button")).toBeNull()
    const fileChevron = fileTab.shadowRoot!.querySelector<HTMLElement>(".file-chevron")!
    expect(fileChevron).not.toBeNull()
    expect(fileTab.active).toBe(false)
    const reservedDirtyIndicator = fileLabel.shadowRoot!.querySelector<HTMLElement>(".dirty-indicator")!
    expect(reservedDirtyIndicator.textContent).toBe("*")
    expect(getComputedStyle(reservedDirtyIndicator).visibility).toBe("hidden")
    expect(getComputedStyle(reservedDirtyIndicator).width).toBe("8.8px")
    const fileTabButton = fileTab.shadowRoot!.querySelector<HTMLButtonElement>("button")!
    expect(getComputedStyle(fileTabButton).paddingLeft).toBe("8px")
    expect(getComputedStyle(fileTab.parentElement!).marginLeft).toBe("-8px")
    expect(getComputedStyle(fileTabButton).paddingRight).toBe("0px")
    const fileLabelElement = fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-label")!
    expect(["0", "0px"]).toContain(getComputedStyle(fileLabelElement).gap)
    expect(getComputedStyle(fileLabel).minWidth).toBe("100px")
    expect(getComputedStyle(fileLabelElement).position).toBe("relative")
    const quickActions = fileTab.nextElementSibling as HTMLElement
    expect(quickActions.classList.contains("file-quick-actions")).toBe(true)
    const quickButtons = Array.from(quickActions.querySelectorAll<RibbonButton>("ribbon-button"))
    await Promise.all(quickButtons.map(button => button.updateComplete))
    expect(quickButtons.map(button => button.label)).toEqual(["Save", "Collaboration"])
    expect(quickButtons.every(button => button.compact)).toBe(true)
    expect(quickButtons[0].shadowRoot!.querySelector(".icon-tabler-device-floppy")).not.toBeNull()
    expect(quickButtons[1].icon).toBe("UserShare")
    expect(ribbon.activeMenu).toBe("Start")
    ribbon.fileDirty = true
    await ribbon.updateComplete
    await fileLabel.updateComplete
    const dirtyIndicator = fileLabel.shadowRoot!.querySelector<HTMLElement>(".dirty-indicator")!
    expect(dirtyIndicator).toBe(reservedDirtyIndicator)
    expect(dirtyIndicator.textContent).toBe("*")
    expect(dirtyIndicator.closest("button")).toBeNull()
    expect(getComputedStyle(dirtyIndicator).visibility).toBe("visible")

    quickButtons[0].shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(saveEvents).toEqual(["Save"])
    expect(ribbon.activeMenu).toBe("Start")

    ribbon.linkSharingEnabled = true
    ribbon.collaborationLink = "https://webwriter.app/shared/lesson-token"
    ribbon.presenceUsers = [
      {clientId: 1, name: "Ada Lovelace", initials: "AL", color: "#123456", lastChange: new Date("2026-10-11T10:00:00Z").getTime()},
      {clientId: 2, name: "Lin Chen", initials: "LC", color: "#654321"},
      {clientId: 3, name: "Sam Taylor", initials: "ST", color: "#abcdef"},
    ]
    await ribbon.updateComplete
    await quickButtons[1].updateComplete
    quickButtons[1].shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await quickButtons[1].updateComplete
    expect(quickButtons[1].shadowRoot!.querySelector(".submenu-trigger")).toBeNull()
    expect(quickButtons[1].shadowRoot!.querySelector(".main-button")?.getAttribute("aria-haspopup")).toBe("dialog")
    expect(quickButtons[1].shadowRoot!.querySelector(".main-button")?.getAttribute("aria-expanded")).toBe("true")
    const quickShareMenu = quickButtons[1].shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await quickShareMenu.updateComplete
    expect(quickShareMenu.hidden).toBe(false)
    const shareRow = quickButtons[1].shadowRoot!.querySelector<HTMLElement>(".button-row")!
    expect(shareRow.getAttribute("data-connected")).toBe("below")
    expect(getComputedStyle(shareRow).height).toBe("40px")
    expect(getComputedStyle(shareRow).backgroundColor).toBe("#ffffff")
    expect(getComputedStyle(shareRow).borderTopColor).toBe("#a8a8a8")
    expect(quickShareMenu.getAttribute("data-connected")).toBe("below")
    expect(quickShareMenu.noScroll).toBe(true)
    expect(getComputedStyle(quickShareMenu).overflow).toBe("visible")
    expect(getComputedStyle(quickShareMenu.shadowRoot!.querySelector<HTMLElement>(".menu")!).overflow)
      .toBe("hidden")
    expect(quickShareMenu.querySelector<HTMLInputElement>('input[aria-label="Sharing link"]')?.value)
      .toBe("https://webwriter.app/shared/lesson-token")
    const inviteButton = quickShareMenu.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Invite to edit or review"]')!
    expect(inviteButton.getAttribute("aria-checked")).toBe("true")
    const inviteSwitch = inviteButton.querySelector<HTMLElement>(".sharing-switch")!
    expect(inviteSwitch.hasAttribute("data-checked")).toBe(true)
    expect(getComputedStyle(inviteSwitch).width).toBe("44px")
    expect(getComputedStyle(inviteSwitch).height).toBe("24px")
    const inviteLabel = inviteButton.querySelector("strong")!
    expect(inviteLabel.textContent).toBe("Invite to edit or review")
    expect(getComputedStyle(inviteLabel).fontWeight).toBe("700")
    expect(getComputedStyle(inviteLabel).textAlign).toBe("left")
    expect(getComputedStyle(inviteButton).flexDirection).toBe("row")
    expect(getComputedStyle(inviteButton).backgroundColor).toBe("#eef5ff")
    expect(inviteButton.querySelectorAll("button, input")).toHaveLength(0)
    expect(inviteButton.querySelector("svg")?.classList.contains("icon-tabler-user-edit")).toBe(true)
    expect(getComputedStyle(inviteButton).fontSize).toBe(getComputedStyle(inviteLabel).fontSize)
    expect(parseFloat(getComputedStyle(inviteButton.querySelector("svg")!).width)).toBeCloseTo(parseFloat(getComputedStyle(inviteLabel).fontSize) * 1.2)
    expect(parseFloat(getComputedStyle(inviteButton.querySelector("svg")!).height)).toBeCloseTo(parseFloat(getComputedStyle(inviteLabel).fontSize) * 1.2)
    const invitations = vi.fn()
    ribbon.addEventListener("link-sharing-change", invitations)
    inviteLabel.click()
    expect(invitations).toHaveBeenCalledOnce()
    expect(invitations.mock.calls[0][0].detail.enabled).toBe(false)
    expect(quickShareMenu.querySelectorAll("webwriter-qr-code, img.sharing-dropdown-qr-code")).toHaveLength(0)
    expect(quickShareMenu.querySelectorAll('ribbon-button[label="Print"], ribbon-button[label="Download"]')).toHaveLength(0)
    const collaborators = Array.from(quickShareMenu.querySelectorAll<HTMLElement>(".collaboration-authors li"))
    expect(collaborators).toHaveLength(3)
    expect(collaborators[0].querySelector(".author-status")?.textContent).toBe("Connected")
    expect(collaborators[0].querySelector(".author-change")?.textContent).toContain("Last change:")
    expect(collaborators[1].querySelector(".author-change")?.textContent).toBe("No changes yet")
    const presence = quickButtons[1].querySelector<HTMLElement>(".presence-users")!
    expect(presence.getAttribute("aria-label")).toBe("Active collaborators")
    expect(Array.from(presence.querySelectorAll(".presence-user"), user => user.textContent)).toEqual(["AL", "LC"])
    expect(getComputedStyle(presence.querySelectorAll<HTMLElement>(".presence-user")[1]!).marginLeft).toBe("-14.4px")

    quickButtons[1].closeSubmenu()
    await quickButtons[1].updateComplete
    expect(quickShareMenu.hidden).toBe(true)
    expect(shareRow.hasAttribute("data-connected")).toBe(false)

    fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")!.dispatchEvent(
      new MouseEvent("click", {bubbles: true, composed: true}),
    )
    await ribbon.updateComplete
    expect(ribbon.activeMenu).toBe("Start")
    expect(ribbon.menuOpen).toBe(true)
    expect(fileTab.active).toBe(true)
  })

  it("disables Collaboration and closes its menu during preview", async () => {
    const {ribbon} = await mountRibbon()
    const action = ribbon.shadowRoot!.querySelector<RibbonButton>(".file-share-action")!
    await action.updateComplete
    const button = action.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    button.click()
    await action.updateComplete
    expect(button.getAttribute("aria-expanded")).toBe("true")

    ribbon.previewActive = true
    await ribbon.updateComplete
    await action.updateComplete
    expect(action.disabled).toBe(true)
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("aria-expanded")).toBe("false")
    button.click()
    await action.updateComplete
    expect(button.getAttribute("aria-expanded")).toBe("false")

    ribbon.previewActive = false
    await ribbon.updateComplete
    await action.updateComplete
    expect(button.disabled).toBe(false)
  })

  it("shows at most two strongly overlapping collaborator initials in the top action", async () => {
    const {ribbon} = await mountRibbon()
    ribbon.presenceUsers = [
      {clientId: 1, name: "Ada Lovelace", initials: "AL", color: "#123456"},
      {clientId: 2, name: "Lin Chen", initials: "LC", color: "#654321"},
      {clientId: 3, name: "Sam Taylor", initials: "ST", color: "#abcdef"},
    ]
    await ribbon.updateComplete
    const action = ribbon.shadowRoot!.querySelector<RibbonButton>(".file-share-action")!
    await action.updateComplete
    expect(action.label).toBe("Collaboration")
    expect(Array.from(action.querySelectorAll(".presence-user"), user => user.textContent)).toEqual(["AL", "LC"])
    expect(getComputedStyle(action.querySelectorAll<HTMLElement>(".presence-user")[1]!).marginLeft).toBe("-14.4px")
  })

  it("closes the other menu when opening File or Share without pointer events", async () => {
    const {ribbon} = await mountRibbon()
    const fileTab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!
    const fileButton = fileTab.shadowRoot!.querySelector<HTMLButtonElement>("button")!
    const share = ribbon.shadowRoot!.querySelector<RibbonButton>(".file-share-action")!
    const shareButton = share.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    const shareMenu = share.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

    fileButton.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(true)

    shareButton.click()
    await ribbon.updateComplete
    await share.updateComplete
    await shareMenu.updateComplete
    expect(ribbon.menuOpen).toBe(false)
    expect(fileTab.active).toBe(false)
    expect(shareMenu.hidden).toBe(false)

    fileButton.click()
    await ribbon.updateComplete
    await share.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    expect(fileTab.active).toBe(true)
    expect(shareMenu.hidden).toBe(true)
    expect(shareButton.getAttribute("aria-expanded")).toBe("false")
    expect(share.shadowRoot!.querySelector(".button-row")!.hasAttribute("data-connected")).toBe(false)
  })

  it("toggles the filename dropdown in expanded, collapsed, and preview modes", async () => {
    const {ribbon} = await mountRibbon()
    const fileTab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!
    const fileName = fileTab.shadowRoot!.querySelector<HTMLButtonElement>("button")!
    const fileChevron = fileTab.shadowRoot!.querySelector<HTMLElement>(".file-chevron")!

    expect(fileTab.ribbonCollapsed).toBe(true)
    expect(ribbon.expanded).toBe(true)
    expect(ribbon.activeMenu).toBe("Start")

    fileName.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    expect(ribbon.expanded).toBe(true)
    expect(ribbon.activeMenu).toBe("Start")
    expect(fileTab.active).toBe(true)
    expect(getComputedStyle(fileChevron).transform).toBe("rotate(225deg)")
    expect(getComputedStyle(ribbon.shadowRoot!.querySelector("ribbon-menu")!).zIndex).toBe("4")
    expect(getComputedStyle(fileName).backgroundColor).toBe("#ffffff")
    expect(getComputedStyle(fileName).borderTopColor).toBe("#a8a8a8")
    expect(getComputedStyle(fileName).borderBottomWidth).toBe("0px")
    expect(getComputedStyle(ribbon.shadowRoot!.querySelector(".ribbon-top")!).zIndex).toBe("5")

    fileName.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(false)
    expect(fileTab.active).toBe(false)
    expect(getComputedStyle(fileChevron).transform).toBe("rotate(45deg)")
    expect(getComputedStyle(fileName).backgroundColor).toBe("transparent")
    expect(getComputedStyle(ribbon.shadowRoot!.querySelector(".ribbon-top")!).zIndex).toBe("1")

    ribbon.expanded = false
    await ribbon.updateComplete
    expect(fileTab.ribbonCollapsed).toBe(true)
    fileName.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    expect(ribbon.activeMenu).toBe("Start")
    const fileMenu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await fileMenu.updateComplete
    expect(fileMenu.groups.map(group => group.label)).toEqual(["File", "Editing", "Settings"])
    expect(fileMenu.groups[0]!.buttons.map(button => typeof button === "string" ? button : button.label))
      .toEqual(["New", "Open", "Save", "Save as", "Print"])

    ribbon.previewActive = true
    await ribbon.updateComplete
    expect(ribbon.expanded).toBe(true)
    expect(ribbon.activeMenu).toBe("File")
    fileName.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    expect(ribbon.previewActive).toBe(true)
  })

  it("clips long file names within the File tab instead of growing past its maximum", async () => {
    const {ribbon} = await mountRibbon()
    const longFileName = `${"lesson-".repeat(100)}.html`
    ribbon.fileName = longFileName
    await ribbon.updateComplete

    const fileTab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!
    const fileLabel = fileTab.shadowRoot!.querySelector<FileLabel>("file-label")!
    await fileLabel.updateComplete
    const fileLabelElement = fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-label")!
    const fileName = fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")!

    expect(fileName.textContent).toBe(longFileName)
    expect(getComputedStyle(fileTab).maxWidth).toBe("500px")
    expect(getComputedStyle(fileLabel).width).toBe("fit-content")
    expect(getComputedStyle(fileLabel).maxWidth).toBe("500px")
    expect(getComputedStyle(fileLabelElement).maxWidth).toBe("100%")
    expect(getComputedStyle(fileName).maxWidth).toBe("500px")
    expect(getComputedStyle(fileName).overflow).toBe("hidden")
    expect(getComputedStyle(fileName).textOverflow).toBe("ellipsis")
  })

  it("keeps the file controls out of a scroll container and lets their spacing shrink", async () => {
    const {ribbon} = await mountRibbon()
    const tabs = ribbon.shadowRoot!.querySelector<HTMLElement>(".tabs")!
    const actions = tabs.querySelector<HTMLElement>(".file-quick-actions")!
    const buttons = Array.from(actions.querySelectorAll<RibbonButton>("ribbon-button"))
    await Promise.all(buttons.map(button => button.updateComplete))

    expect(getComputedStyle(tabs).overflow).toBe("clip")
    expect(getComputedStyle(actions).flexShrink).toBe("1")
    expect(getComputedStyle(actions).minWidth).toBe("48px")
    expect(getComputedStyle(actions).justifyContent).toBe("space-between")
    expect(getComputedStyle(actions).gap).toBe(".2rem")
    for(const button of buttons) {
      expect(getComputedStyle(button).flexShrink).toBe("1")
      expect(getComputedStyle(button).minWidth).toBe("24px")
      expect(button.shadowRoot!.querySelector(".main-button")).not.toBeNull()
    }
  })

  it("collapses for short viewports and restores the prior expansion state", async () => {
    const previousHeight = window.innerHeight
    try {
      window.innerHeight = 500
      const {ribbon} = await mountRibbon()
      expect(ribbon.expanded).toBe(false)
      expect(ribbon.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!.hidden).toBe(true)
      const appButton = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
      expect(appButton.getAttribute("aria-label")).toBe("Open File menu")
      appButton.click()
      await ribbon.updateComplete
      expect(ribbon.expanded).toBe(false)
      expect(ribbon.menuOpen).toBe(true)
      expect(ribbon.shadowRoot!.querySelector(".ribbon-top")!.hasAttribute("data-app-menu-tab")).toBe(true)
      expect(appButton.getAttribute("aria-expanded")).toBe("true")
      appButton.click()
      await ribbon.updateComplete
      expect(ribbon.menuOpen).toBe(false)
      expect(ribbon.shadowRoot!.querySelector(".ribbon-top")!.hasAttribute("data-app-menu-tab")).toBe(false)
      ribbon.expanded = true
      await ribbon.updateComplete
      expect(ribbon.expanded).toBe(false)
      window.innerHeight = 900
      window.dispatchEvent(new Event("resize"))
      await ribbon.updateComplete
      expect(ribbon.expanded).toBe(true)
      ribbon.expanded = false
      await ribbon.updateComplete
      window.innerHeight = 500
      window.dispatchEvent(new Event("resize"))
      await ribbon.updateComplete
      expect(appButton.getAttribute("aria-label")).toBe("Open File menu")
      window.innerHeight = 900
      window.dispatchEvent(new Event("resize"))
      await ribbon.updateComplete
      expect(ribbon.expanded).toBe(false)
      expect(appButton.getAttribute("aria-label")).toBe("Expand ribbon")
    }
    finally {window.innerHeight = previousHeight}
  })

  it("starts at full height before enabling transitions for app-button toggles", async () => {
    class StartupRibbon extends AppRibbon {
      initialLayout: {expanded: boolean, height: string, transition: string} | null = null
      protected firstUpdated() {
        const style = getComputedStyle(this)
        this.initialLayout = {expanded: this.hasAttribute("expanded"), height: style.height, transition: style.transition}
        super.firstUpdated()
      }
    }
    customElements.define("startup-test-ribbon", StartupRibbon)
    const ribbon = new StartupRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    expect(ribbon.initialLayout).toEqual({expanded: true, height: "140px", transition: "none"})
    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!.click()
    await ribbon.updateComplete
    expect(ribbon.expanded).toBe(false)
    expect(getComputedStyle(ribbon).transition).toContain("height")
    expect(getComputedStyle(ribbon).transition).toContain("max-height")
  })

  it("toggles the ribbon from the app icon while the File tab stays collapsed", async () => {
    const {ribbon} = await mountRibbon()
    const fileTab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!

    expect(getComputedStyle(ribbon).transition).toContain("height")
    expect(getComputedStyle(ribbon).transition).toContain("max-height")
    expect(getComputedStyle(ribbon).height).toBe("140px")
    expect(fileTab.ribbonCollapsed).toBe(true)

    const brand = ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".brand")!
    expect(ribbon.shadowRoot!.querySelector(".ribbon-toggle")).toBeNull()
    expect(brand.getAttribute("aria-controls")).toBe("ribbon-content")
    expect(brand.getAttribute("aria-expanded")).toBe("true")
    expect(brand.getAttribute("aria-label")).toBe("Collapse ribbon")
    ribbon.menuOpen = true
    brand.click()
    await ribbon.updateComplete
    expect(ribbon.expanded).toBe(false)
    expect(ribbon.menuOpen).toBe(false)
    expect(brand.getAttribute("aria-expanded")).toBe("false")
    expect(brand.getAttribute("aria-label")).toBe("Expand ribbon")
    expect(fileTab.ribbonCollapsed).toBe(true)
    expect(fileTab.hasAttribute("ribbon-collapsed")).toBe(true)

    brand.click()
    await ribbon.updateComplete
    expect(ribbon.expanded).toBe(true)
    expect(brand.getAttribute("aria-expanded")).toBe("true")
    expect(brand.getAttribute("aria-label")).toBe("Collapse ribbon")
    expect(fileTab.ribbonCollapsed).toBe(true)
    expect(fileTab.hasAttribute("ribbon-collapsed")).toBe(true)
  })

  it("disables the quick Save button while preview is active", async () => {
    const {ribbon} = await mountRibbon()
    const saveEvents: string[] = []
    ribbon.addEventListener("ribbon-button-click", event => {
      saveEvents.push((event as CustomEvent<{label: string}>).detail.label)
    })
    ribbon.fileDirty = true
    await ribbon.updateComplete

    const saveButton = ribbon.shadowRoot!.querySelector<RibbonButton>("ribbon-button.file-save-action")!
    await saveButton.updateComplete
    expect(saveButton.disabled).toBe(false)

    ribbon.previewActive = true
    await ribbon.updateComplete
    await saveButton.updateComplete

    expect(saveButton.disabled).toBe(true)
    saveButton.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(saveEvents).toEqual([])
  })

  it("keeps toolbox menus out of the main tabs and promotes the insertion drawers to Start", async () => {
    const {ribbon} = await mountRibbon()
    const tabs = Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-tab"))

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Marks", "Elements", "Packages"])

    expect(tabs.map(tab => tab.label)).toEqual(["File"])

    ribbon.activeMenu = "Edit"
    await ribbon.updateComplete

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual([
        "Marks", "Document", "Section", "Layout", "Borders", "Background",
        "Comments", "Review", "View",
      ])

    const review = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Review"]')!
    expect(Array.from(review.querySelectorAll<RibbonButton>("ribbon-button"))
      .map(button => button.label))
      .toEqual([
        "Spelling", "Grammar", "Translate",
        "Track Changes", "Accept", "Reject",
      ])

    ribbon.activeMenu = "Style"
    await ribbon.updateComplete
    const styleDrawers = Array.from(
      ribbon.shadowRoot!.querySelectorAll<RibbonDrawer>('.ribbon-content > ribbon-drawer[layout="element-style"]'),
    )
    expect(styleDrawers.map(drawer => drawer.label)).toEqual([
      "Position & Form",
      "Layout",
      "Text",
      "Color & Visibility",
      "Interaction & Motion",
      "Other",
    ])
    expect(styleDrawers.every(drawer => drawer.expandable)).toBe(true)
    expect(styleDrawers.every(drawer => (
      drawer.querySelectorAll("element-style-editor").length === 2
    ))).toBe(true)
    await styleDrawers[0].updateComplete
    const advancedToggle = styleDrawers[0].shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    expect(advancedToggle.getAttribute("aria-label")).toBe("Show advanced position & form controls")
    advancedToggle.click()
    await styleDrawers[0].updateComplete
    expect(styleDrawers[0].hasAttribute("drawer-open")).toBe(true)
    expect(styleDrawers[0].shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!.hidden).toBe(false)
    const styleEditor = styleDrawers[0].querySelector("element-style-editor")!
    await styleEditor.updateComplete
    expect(styleEditor.shadowRoot!.querySelector("fieldset")?.hasAttribute("disabled")).toBe(false)
    expect(styleEditor.shadowRoot!.textContent).not.toContain("Select document content")

    ribbon.activeMenu = "File"
    await ribbon.updateComplete
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["File"])

    const fileDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="File"]')!
    const fileNameInput = fileDrawer.querySelector<HTMLInputElement>('input[aria-label="File name"]')!
    expect(fileNameInput.value).toBe("")
    expect(fileNameInput.placeholder).toBe("Unnamed File")
    expect(getComputedStyle(fileNameInput).maxWidth).toBe("204px")
    ribbon.fileDirty = true
    await ribbon.updateComplete
    expect(fileDrawer.querySelector(".file-dirty")).toBeNull()
    expect(fileDrawer.textContent).not.toContain("*")
    const storageLocation = fileDrawer.querySelector<HTMLElement>(".storage-location")!
    expect(storageLocation.textContent?.trim()).toBe("Local")
    expect(fileDrawer.querySelector('select[aria-label="Storage location"]')).toBeNull()
    ribbon.settings = {...ribbon.settings, cloudServices: [{id: "development-server", type: "url",
      url: "http://localhost:1234/api", username: "", authentication: "none"}],
    activeCloudServiceId: "development-server"}
    ribbon.backendState = "connected"
    await ribbon.updateComplete
    expect(storageLocation.textContent?.trim()).toBe("http://localhost:1234/api")
    expect(fileDrawer.querySelector(".storage-location-icon svg")?.getAttribute("class"))
      .toContain("icon-tabler-cloud")
    const fileButtons = Array.from(fileDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(fileButtons.map(button => button.label))
      .toEqual(["New", "Open", "Save", "Save as", "Print"])
    expect(fileButtons.every(button => getComputedStyle(
      button.shadowRoot!.querySelector<HTMLElement>(".button-row")!,
    ).boxSizing === "border-box")).toBe(true)
    expect(fileButtons.find(button => button.label === "New")?.submenu).toEqual([
      {label: "Document", action: "new:document", icon: "Document"},
      {label: "Canvas", action: "new:canvas", icon: "Canvas"},
      {label: "Slides", action: "new:slides", icon: "KeywordPresentation"},
      {label: "Board", action: "new:board", icon: "BoardColumn"},
    ])
    expect(fileButtons.find(button => button.label === "Save")?.submenu).toEqual([])
    expect(fileButtons.find(button => button.label === "Save as")?.submenu).toEqual([])
    expect(fileDrawer.querySelector('input[type="checkbox"]')).toBeNull()
    expect(getComputedStyle(fileDrawer).getPropertyValue("--ribbon-drawer-expanded-width").trim())
      .toBe("17.5rem")
    expect(getComputedStyle(fileDrawer.shadowRoot!.querySelector<HTMLElement>(".controls")!).gridTemplateColumns)
      .toBe("repeat(4, minmax(0, 1fr))")

    const fileMenu = ribbon.shadowRoot!.querySelector<RibbonMenu>("#ribbon-file-menu")!
    await fileMenu.updateComplete
    const fileMenuLabels = fileMenu.groups.flatMap(group => group.buttons)
      .map(button => typeof button === "string" ? button : button.label)
    expect(fileMenuLabels[fileMenuLabels.indexOf("Download") + 1]).toBe("Print")
    expect(fileMenuLabels.filter(label => label === "Print")).toHaveLength(1)
  })

  it("keeps the marks drawer fixed with grouped controls on the right", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!
    const buttons = primaryButtons(drawer)
    const comboboxes = Array.from(drawer.querySelectorAll<RibbonCombobox>("ribbon-combobox"))

    expect(ribbon.shadowRoot!.querySelector("mark-ribbon-drawer")).toBeNull()
    expect(drawer.layout).toBe("marks")
    expect(drawer.expandable).toBe(false)
    expect(getComputedStyle(drawer).getPropertyValue("--ribbon-drawer-expanded-width").trim()).toBe("18.475rem")
    expect(drawer.shadowRoot!.querySelector(".drawer-toggle")).toBeNull()
    expect(moreSlot.hidden).toBe(true)
    expect(comboboxes.map(combobox => combobox.name)).toEqual([
      "font-family",
      "font-size",
      "color",
      "background-color",
    ])
    expect(buttons.map(button => button.label)).toEqual([
      "Increase font size",
      "Decrease font size",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Remove formatting",
      "Formula",
      "Link",
    ])
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(0)
    expect(buttons.slice(2, 6).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons[6].compact).toBe(true)
    expect(buttons[6].toggle).toBe(false)
    expect(buttons[7].compact).toBe(false)
    expect(buttons[7].toggle).toBe(false)
    expect(buttons[8].compact).toBe(false)
    expect(buttons[8].toggle).toBe(true)
    expect(buttons.filter(button => button.label !== "Formula").every(button => button.disabled)).toBe(true)
    expect(comboboxes.every(combobox => combobox.disabled)).toBe(true)
    expect(getComputedStyle(controls).gridAutoFlow).toBe("row")
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(7, 1.75rem) 3.5rem")
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(controls).gap).toBe("0.2rem")
    for(const action of ["mark:code", "mark:kbd", "mark:q"]) {
      expect(drawer.querySelector(`ribbon-button[action="${action}"]`)).toBeNull()
    }

    expect(getComputedStyle(comboboxes[2]).gridColumn).toBe("1")
    expect(getComputedStyle(comboboxes[2]).gridRow).toBe("2")
    expect(getComputedStyle(comboboxes[3]).gridColumn).toBe("2")
    expect(getComputedStyle(comboboxes[3]).gridRow).toBe("2")
    expect(getComputedStyle(buttons[6]).gridColumn).toBe("7")
    expect(getComputedStyle(buttons[6]).gridRow).toBe("2")

    for(const action of ["Formula", "mark:a"]) {
      const button = drawer.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      expect(getComputedStyle(button).gridColumn).toBe("8")
      expect(getComputedStyle(button).gridRow).toBe(action === "Formula" ? "1" : "2")
      expect(button.shadowRoot!.querySelector(".submenu-trigger")).not.toBeNull()
    }

    await buttons[2].updateComplete
    expect(buttons[2].shadowRoot!.querySelector("button")!.getAttribute("aria-label")).toBe("Bold")
    expect(buttons[2].shadowRoot!.querySelector("button")!.getAttribute("aria-pressed")).toBe("false")
    expect(buttons[2].shadowRoot!.querySelector(".icon-tabler-bold")).not.toBeNull()
    expect(getComputedStyle(buttons[2].shadowRoot!.querySelector<HTMLElement>(".button-label")!).display).toBe("none")
  })

  it("shows a chevron to expand the marks drawer when it is collapsed", async () => {
    const {drawer} = await mountRibbon()
    drawer.collapsed = true
    await drawer.updateComplete

    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    expect(toggle.hidden).toBe(false)
    expect(toggle.getAttribute("aria-label")).toBe("Show Marks controls")
    expect(toggle.querySelector(".drawer-icon")).not.toBeNull()

    toggle.click()
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
  })

  it("uses the standard ribbon button and menu path for Link and Span", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    await ribbon.updateComplete
    await drawer.updateComplete

    const textDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const heading = Array.from(textDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
      .find(button => button.label === "Heading")!
    const standardButtons = [
      drawer.querySelector<RibbonButton>(".mark-span")!,
    ]
    await Promise.all([heading.updateComplete, ...standardButtons.map(button => button.updateComplete)])

    const headingRow = heading.shadowRoot!.querySelector<HTMLElement>(".button-row")!
    const headingTrigger = heading.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const headingMenu = heading.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

    for(const button of standardButtons) {
      const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      const menu = button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

      expect(button.constructor).toBe(heading.constructor)
      expect(row.className).toBe(headingRow.className)
      expect(trigger.className).toBe(headingTrigger.className)
      expect(menu.constructor).toBe(headingMenu.constructor)
      expect(menu.variant).toBe("button")
      expect(menu.customContent).toBe(true)
      expect(button.shadowRoot!.querySelector(".button-dropdown")).toBeNull()

      trigger.click()
      await button.updateComplete
      expect(menu.hidden).toBe(false)
      await vi.waitFor(() => expect(row.getAttribute("data-connected")).toBe("below"))
      expect(getComputedStyle(row).backgroundColor).toBe("#ffffff")
      expect(getComputedStyle(row).borderTopColor).toBe("#a8a8a8")
      expect(getComputedStyle(row).borderBottomColor).toBe("#ffffff")
      expect(getComputedStyle(row).boxShadow).toBe("none")
    }

    headingTrigger.click()
    await heading.updateComplete
    expect(headingMenu.hidden).toBe(false)
    expect(headingMenu.customContent).toBe(false)
    await vi.waitFor(() => expect(headingRow.getAttribute("data-connected")).toBe("below"))
    expect(getComputedStyle(headingRow).backgroundColor).toBe("#ffffff")

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await Promise.all([heading.updateComplete, ...standardButtons.map(button => button.updateComplete)])
    expect(headingMenu.hidden).toBe(true)
    expect(headingRow.hasAttribute("data-connected")).toBe(false)
    expect(standardButtons.every(button => button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!.hidden)).toBe(true)
    expect(standardButtons.every(button => !button.shadowRoot!.querySelector(".button-row")!.hasAttribute("data-connected"))).toBe(true)
  })

  it("shows the span multiselect with icons, attributes, and a count", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["sup", "sub"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>(".mark-span")!
    expect(span.active).toBe(true)
    expect(span.label).toBe("Link")
    expect(span.selectionCount).toBe(2)
    await span.updateComplete
    const trigger = span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    trigger.click()
    await span.updateComplete

    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.hidden).toBe(false)
    expect(dropdown.querySelector('[role="listbox"]')?.getAttribute("aria-multiselectable")).toBe("true")
    expect(Array.from(dropdown.querySelectorAll<HTMLElement>(".mark-dropdown-option-name")).map(option => option.textContent))
      .toEqual([
        "Superscript",
        "Subscript",
        "Code",
        "Keyboard Shortcut",
      ])
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-icon svg')).not.toBeNull()
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-name')?.textContent).toBe("Superscript")
    expect(dropdown.querySelector('input[aria-label="Select Quotation"]')).toBeNull()

    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Code"]')!.click()
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "sup", values: ["sup", "sub", "code"]},
    }))
    await ribbon.updateComplete
    expect(span.selectionCount).toBe(3)
    await span.updateComplete
    expect(span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!.hidden).toBe(false)
    expect(span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      .getAttribute("aria-expanded")).toBe("true")
    const label = span.shadowRoot!.querySelector<HTMLElement>(".button-label")!
    const labelText = span.shadowRoot!.querySelector<HTMLElement>(".button-label-text")!
    const count = span.shadowRoot!.querySelector<HTMLElement>(".selection-count")!
    expect(count.textContent).toBe("+3")
    expect(getComputedStyle(label).display).toBe("flex")
    expect(getComputedStyle(labelText).overflow).toBe("hidden")
    expect(getComputedStyle(count).flexShrink).toBe("0")
  })

  it("shows configured shortcuts at the right of More menu items", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.settings = {
      ...ribbon.settings,
      shortcuts: {...ribbon.settings.shortcuts, "text.code": "Alt+Shift+9", "text.q": ""},
    }
    await ribbon.updateComplete
    const more = drawer.querySelector<RibbonButton>(".mark-span")!
    await more.updateComplete
    const options = [...more.shadowRoot!.querySelectorAll<HTMLElement>(".mark-dropdown-option")]
    expect(options).toHaveLength(4)
    for(const [index, name] of ["sup", "sub", "code", "kbd"].entries()) {
      const shortcut = options[index].querySelector<HTMLElement>(".mark-dropdown-shortcut")
      const configured = ribbon.settings.shortcuts[`text.${name}`]
      expect(shortcut?.textContent ?? "").toBe(formatShortcut(configured))
      if(shortcut) {
        expect(getComputedStyle(shortcut).justifySelf).toBe("end")
        expect(["#687383", "rgb(104, 115, 131)"]).toContain(getComputedStyle(shortcut).color)
      }
    }
  })

  it("keeps an empty span multiselect open with Link as the primary action", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["sup"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>(".mark-span")!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    span.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Select Superscript"]')!.click()
    await ribbon.updateComplete
    await span.updateComplete

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "", values: []},
    }))
    expect(span.label).toBe("Link")
    expect(span.icon).toBe("MarkLink")
    expect(span.selectionCount).toBe(0)
    expect(span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!.hidden).toBe(false)
    expect(span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      .getAttribute("aria-expanded")).toBe("true")
  })

  it("hides removed marks and ruby controls even when that markup is selected", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["span", "small", "abbr", "mark", "bdi", "bdo", "cite", "data", "dfn", "ruby", "samp", "time", "var", "del", "ins"]
    ribbon.ruby = {
      active: true,
      canCreate: false,
      base: "漢字",
      annotations: [{index: 1, text: "かんじ", hasMarkup: false}],
      fallbacks: [],
    }
    await ribbon.updateComplete
    await drawer.updateComplete

    const button = drawer.querySelector<RibbonButton>(".mark-span")!
    await button.updateComplete
    expect(button.label).toBe("Link")
    expect(button.active).toBe(false)
    expect(button.selectionCount).toBe(0)
    button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await button.updateComplete
    const dropdown = button.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.querySelectorAll('[role="option"]')).toHaveLength(4)
    expect(dropdown.querySelector(".ruby-dropdown")).toBeNull()
    expect(dropdown.textContent).not.toContain("Annotation")

    dropdown.querySelector<HTMLInputElement>('input[aria-label="Select Code"]')!.click()
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "span", values: [...ribbon.marks, "code"]},
    }))
  })

  it("omits Quotation controls even when authored quotations are selected", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["q"]
    ribbon.markAttributes = {q: {cite: "https://example.com/source"}}
    await ribbon.updateComplete
    await drawer.updateComplete
    const span = drawer.querySelector<RibbonButton>(".mark-span")!
    await span.updateComplete
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.querySelector('input[aria-label="Select Quotation"]')).toBeNull()
    expect(dropdown.querySelector('input[aria-label="Quotation: Source"]')).toBeNull()
    expect(ribbon.marks).toEqual(["q"])
  })

  it("keeps Link as the primary toggle for More without link inputs", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["a"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const link = drawer.querySelector<RibbonButton>(".mark-span")!
    await link.updateComplete
    expect(link.toggle).toBe(true)
    expect(link.active).toBe(true)
    expect(drawer.querySelector(".mark-link")).toBeNull()
    expect(link.label).toBe("Link")
    expect(link.action).toBe("mark:a")
    expect(link.shadowRoot!.querySelector(".submenu-trigger")).not.toBeNull()
    expect(link.shadowRoot!.querySelector('[aria-label="Web address"], [aria-label="Link: URL"], [aria-label="Title"]')).toBeNull()

    const toggled = vi.fn()
    ribbon.addEventListener("ribbon-button-click", toggled)
    link.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(toggled).toHaveBeenCalledWith(expect.objectContaining({detail: expect.objectContaining({label: "mark:a"})}))

    const more = drawer.querySelector<RibbonButton>(".mark-span")!
    expect(more.label).toBe("Link")
    more.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await more.updateComplete
    const dropdown = more.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.querySelectorAll('[role="option"]')).toHaveLength(4)
    expect(dropdown.querySelector("input[aria-label=\"Select Link\"]")).toBeNull()
    expect(dropdown.querySelector("input, select")).not.toBeNull()
  })

  it("uses platform-native shortcut notation in button tooltips", async () => {
    const originalPlatform = navigator.platform
    try {
      Object.defineProperty(navigator, "platform", {value: "MacIntel", configurable: true})
      let mounted = await mountRibbon()
      let bold = mounted.drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (⌘B)")

      mounted.ribbon.remove()
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      mounted = await mountRibbon()
      bold = mounted.drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (Ctrl+B)")
    }
    finally {
      Object.defineProperty(navigator, "platform", {value: originalPlatform, configurable: true})
    }
  })

  it("disables both font inputs and their toggles when marks are unavailable", async () => {
    const {ribbon, drawer} = await mountRibbon()
    for(const canMark of [false, true, false]) {
      ribbon.canMark = canMark
      await ribbon.updateComplete
      for(const name of ["font-family", "font-size"]) {
        const picker = drawer.querySelector<RibbonCombobox>(`ribbon-combobox[name="${name}"]`)!
        await picker.updateComplete
        const field = picker.shadowRoot!.querySelector("font-combobox") ?? picker.shadowRoot!.querySelector("font-size-combobox")!
        await field.updateComplete
        const input = field.shadowRoot!.querySelector("input")!
        const toggle = field.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!
        expect(input.disabled).toBe(!canMark)
        expect(toggle.disabled).toBe(!canMark)
        expect(Number(getComputedStyle(field.shadowRoot!.querySelector(".control")!).opacity || 1)).toBe(canMark ? 1 : .6)
        toggle.click()
        await field.updateComplete
        expect(input.getAttribute("aria-expanded")).toBe(String(canMark))
      }
    }
  })

  it("opens custom listboxes and emits the selected style mark", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    await ribbon.updateComplete
    await drawer.updateComplete
    const changed = vi.fn()
    drawer.addEventListener("ribbon-combobox-change", changed)
    const family = drawer.querySelector<RibbonCombobox>('ribbon-combobox[name="font-family"]')!
    const size = drawer.querySelector<RibbonCombobox>('ribbon-combobox[name="font-size"]')!
    await Promise.all([family.updateComplete, size.updateComplete])

    const font = family.shadowRoot!.querySelector("font-combobox")!
    await font.updateComplete
    const fontInput = font.shadowRoot!.querySelector("input")!
    const sizeCombo = size.shadowRoot!.querySelector("font-size-combobox")!
    await sizeCombo.updateComplete
    const sizeInput = sizeCombo.shadowRoot!.querySelector("input")!
    expect(fontInput.placeholder).toBe("Default font")
    expect(sizeInput.placeholder).toBe("Size")

    fontInput.focus()
    await font.updateComplete
    expect(font.shadowRoot!.querySelector("[role=listbox]")).not.toBeNull()
    expect(font.shadowRoot!.querySelector<HTMLButtonElement>('.option[title="Default font"]')!.textContent)
      .toContain("Default font")
    font.shadowRoot!.querySelector<HTMLButtonElement>('.option[title="Arial"]')!.click()

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "font-family", value: "Arial, sans-serif"},
    }))

    sizeInput.focus()
    await sizeCombo.updateComplete
    expect(sizeCombo.shadowRoot!.querySelector<HTMLButtonElement>('.option[title="Default size"]')!.textContent)
      .toContain("Default size")
  })

  it("forwards Bunny font resources with the selected font through the editor bridge", async () => {
    const {editor} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    const fontStylesheet = "https://fonts.bunny.net/css?family=Alegreya:400,700&display=swap"
    editor.shadowRoot!.querySelector("app-ribbon")!.dispatchEvent(new CustomEvent("ribbon-combobox-change", {
      detail: {name: "font-family", value: '"Alegreya", serif', fontStylesheet}, bubbles: true, composed: true,
    }))
    expect(execute).toHaveBeenCalledWith({type: "setStyleMark", property: "font-family", value: '"Alegreya", serif', fontStylesheet})
  })
})

describe("mark ribbon bridge", () => {
  it.each(["color", "background-color"])("routes custom %s through the style mark command", async property => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchEditorMessage(editor, editorWindow, {type: markStateChangeEvent, detail: {canMark: true, marks: []}})
    await editor.updateComplete
    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const combo = ribbon.shadowRoot!.querySelector<RibbonCombobox>(`ribbon-combobox[name="${property}"]`)!
    await combo.updateComplete
    const input = combo.shadowRoot!.querySelector<HTMLInputElement>('input[type="color"]')!
    input.value = "#12ab34"
    input.dispatchEvent(new Event("change", {bubbles: true}))
    expect(execute).toHaveBeenCalledWith({type: "setStyleMark", property, value: "#12ab34"})
  })

  it("updates controls from selection messages and routes style, toggle, size, and clear commands", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchEditorMessage(editor, editorWindow, {
      type: markStateChangeEvent,
      detail: {
        canMark: true,
        marks: ["b"],
        styles: {"font-size": "18px"},
      },
    })
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    const bold = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
    const clear = drawer.querySelector<RibbonButton>('ribbon-button[action="removeMarks"]')!
    const increase = drawer.querySelector<RibbonButton>('ribbon-button[action="increaseFontSize"]')!
    const size = drawer.querySelector<RibbonCombobox>('ribbon-combobox[name="font-size"]')!
    await Promise.all([bold.updateComplete, clear.updateComplete, increase.updateComplete, size.updateComplete])

    expect(bold.active).toBe(true)
    expect(bold.disabled).toBe(false)
    expect(size.value).toBe("18px")
    bold.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    increase.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    const sizeCombo = size.shadowRoot!.querySelector("font-size-combobox")!
    await sizeCombo.updateComplete
    sizeCombo.shadowRoot!.querySelector<HTMLInputElement>("input")!.focus()
    await sizeCombo.updateComplete
    sizeCombo.shadowRoot!.querySelector<HTMLButtonElement>('.option[title="24 px"]')!.click()
    clear.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMark", mark: "b"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "increaseFontSize"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "setStyleMark", property: "font-size", value: "24px"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "removeMarks"})
    const sizeInput = sizeCombo.shadowRoot!.querySelector<HTMLInputElement>("input")!
    sizeInput.click()
    sizeInput.value = "17.5em"
    sizeInput.dispatchEvent(new InputEvent("input"))
    sizeInput.dispatchEvent(new Event("change"))
    expect(execute).toHaveBeenNthCalledWith(5, {type: "setStyleMark", property: "font-size", value: "17.5px"})
  })

  it("propagates ruby state and routes guarded ruby actions through the iframe bridge", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchEditorMessage(editor, editorWindow, {
      type: markStateChangeEvent,
      detail: {
        canMark: true,
        marks: ["ruby"],
        ruby: {
          active: true,
          canCreate: false,
          base: "漢",
          annotations: [{index: 1, text: "かん", hasMarkup: false}],
          fallbacks: [],
        },
      },
    })
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    const toolbox = editor.shadowRoot!.querySelector<AppRibbon>("dom-editor-toolbox")!
    await Promise.all([ribbon.updateComplete, toolbox.updateComplete])
    expect(ribbon.ruby).toEqual(expect.objectContaining({active: true, base: "漢"}))
    expect(toolbox.ruby).toEqual(ribbon.ruby)

    const dispatch = (detail: object) => ribbon.dispatchEvent(new CustomEvent("ruby-action", {
      detail,
      bubbles: true,
      composed: true,
    }))
    dispatch({action: "create", annotation: "かん", fallback: true})
    dispatch({action: "set-annotation", index: 1, expected: "かん", value: "kan"})
    dispatch({action: "add-annotation", value: "Chinese"})
    dispatch({action: "remove-annotation", index: 1, expected: "かん"})
    dispatch({action: "add-fallback"})
    dispatch({action: "set-fallback", index: 2, expected: "(", value: "["})
    dispatch({action: "remove-fallback"})
    dispatch({action: "remove-ruby"})

    expect(execute).toHaveBeenNthCalledWith(1, {type: "createRuby", annotation: "かん", fallback: true})
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "setRubyAnnotation", index: 1, expected: "かん", value: "kan",
    })
    expect(execute).toHaveBeenNthCalledWith(3, {type: "addRubyAnnotation", value: "Chinese"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "removeRubyAnnotation", index: 1, expected: "かん"})
    expect(execute).toHaveBeenNthCalledWith(5, {type: "addRubyFallback"})
    expect(execute).toHaveBeenNthCalledWith(6, {
      type: "setRubyFallback", index: 2, expected: "(", value: "[",
    })
    expect(execute).toHaveBeenNthCalledWith(7, {type: "removeRubyFallback"})
    expect(execute).toHaveBeenNthCalledWith(8, {type: "removeRuby"})
  })

  it("routes span dropdown selections while preserving authored quotations", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    dispatchEditorMessage(editor, editorWindow, {
      type: markStateChangeEvent,
      detail: {
        canMark: true,
        marks: ["q"],
        attributes: {q: {cite: "https://example.com/source"}},
      },
    })
    await editor.updateComplete

    const ribbon = editor.shadowRoot!.querySelector<AppRibbon>("app-ribbon")!
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Marks"]')!
    await drawer.updateComplete
    const span = drawer.querySelector<RibbonButton>(".mark-span")!
    const link = drawer.querySelector<RibbonButton>(".mark-span")!
    await span.updateComplete
    await link.updateComplete

    link.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Code"]')!.click()
    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMark", mark: "a"})
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "setMarkGroup",
      primary: "span",
      marks: ["q", "code"],
    })
    ribbon.dispatchEvent(new CustomEvent("ribbon-combobox-change", {
      detail: {name: "mark-types", value: "", values: []},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenNthCalledWith(3, {
      type: "setMarkGroup",
      primary: "span",
      marks: [],
    })
  })
})


it("disables Link and More for formulas while keeping inline formatting available", async () => {
  const {ribbon, drawer} = await mountRibbon()
  ribbon.canMark = true
  ribbon.math = {active: true, display: "inline"}
  await ribbon.updateComplete
  expect(drawer.querySelector<RibbonButton>(".mark-span")!.disabled).toBe(true)
  expect(drawer.querySelector<RibbonButton>('[action="mark:b"]')!.disabled).toBe(false)
  expect(drawer.querySelector<RibbonButton>(".mark-remove")!.disabled).toBe(false)
})

it("keeps SVG text links available and shows style state while disabling More", async () => {
  const {ribbon, drawer} = await mountRibbon()
  ribbon.canMark = true
  ribbon.svgText = true
  ribbon.marks = ["b", "a"]
  await ribbon.updateComplete
  expect(drawer.querySelector<RibbonButton>(".mark-span")!.disabled).toBe(false)
  expect(drawer.querySelector<RibbonButton>(".mark-span")!.active).toBe(true)
  expect(drawer.querySelector<RibbonButton>(".mark-span")!.disabled).toBe(false)
  expect(drawer.querySelector<RibbonButton>('[action="mark:b"]')!.active).toBe(true)
  expect(drawer.querySelector<RibbonButton>(".mark-remove")!.disabled).toBe(false)
})

it("opens preview from the reader-sharing hint at the bottom of the collaboration menu", async () => {
  const {ribbon} = await mountRibbon()
  const action = ribbon.shadowRoot!.querySelector<RibbonButton>(".file-share-action")!
  await action.updateComplete
  const commands = vi.fn()
  ribbon.addEventListener("ribbon-button-click", commands)
  action.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
  await action.updateComplete
  const menu = action.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
  await menu.updateComplete
  const hint = menu.querySelector<HTMLElement>(".sharing-reader-hint")!
  expect(hint.querySelector("span")?.textContent).toBe("Share with readers")
  expect(hint.parentElement?.lastElementChild).toBe(hint)
  expect(getComputedStyle(hint).borderTopWidth).toBe("1px")
  expect(getComputedStyle(hint).paddingTop).toBe("12px")
  expect(getComputedStyle(hint).fontSize).toBe("10.4px")
  expect(getComputedStyle(hint).color).toBe("#6b7280")
  const play = hint.querySelector<HTMLButtonElement>("button")!
  expect(play.querySelector("svg")).not.toBeNull()
  expect(play.querySelector("span")?.textContent).toBe("Share with readers")
  expect(hint.children).toHaveLength(1)
  expect(getComputedStyle(play).width).toBe("auto")
  expect(getComputedStyle(play).flexDirection).toBe("row")
  expect(getComputedStyle(play).whiteSpace).toBe("nowrap")
  expect(getComputedStyle(play).gap).toBe("0.7rem")
  expect(getComputedStyle(play).fontSize).toBe("10.4px")
  expect(getComputedStyle(play).height).toBe("19.2px")
  expect(getComputedStyle(play.querySelector<HTMLElement>(".sharing-preview-icon")!).width).toBe("12.8px")
  expect(getComputedStyle(play).color).toBe("#6b7280")
  expect(getComputedStyle(hint).justifyContent).toBe("flex-end")
  expect(getComputedStyle(hint).textAlign).toBe("right")
  play.querySelector<HTMLElement>("span")!.click()
  expect(commands).toHaveBeenCalledOnce()
  expect(commands.mock.calls[0][0].detail.label).toBe("Preview")
  await action.updateComplete
  expect(menu.hidden).toBe(true)

  ribbon.previewActive = true
  await ribbon.updateComplete
  await action.updateComplete
  action.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
  await action.updateComplete
  expect(action.disabled).toBe(true)
  expect(menu.querySelector(".sharing-preview-button")).toBeNull()
  expect(commands).toHaveBeenCalledOnce()
  await action.updateComplete
  expect(menu.hidden).toBe(true)
})

it("shows the empty-author hint regardless of invitations and the editing link only while enabled", async () => {
  const {ribbon} = await mountRibbon()
  ribbon.collaborationLink = "https://webwriter.app/edit/lesson"
  ribbon.collaborationStatus = "disconnected"
  await ribbon.updateComplete
  const action = ribbon.shadowRoot!.querySelector<RibbonButton>(".file-share-action")!
  await action.updateComplete
  action.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
  await action.updateComplete
  const menu = action.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
  await menu.updateComplete
  expect(menu.querySelector(".collaboration-status")).toBeNull()
  expect(menu.textContent).not.toContain("Disconnected")
  expect(menu.textContent).toContain("No other authors connected")
  expect(menu.querySelector(".sharing-link-input")).toBeNull()
  const emptyHint = menu.querySelector<HTMLElement>(".collaboration-empty")!
  expect(getComputedStyle(emptyHint).color).toBe("#6b7280")
  expect(getComputedStyle(emptyHint).textAlign).toBe("center")

  ribbon.linkSharingEnabled = true
  await ribbon.updateComplete
  await action.updateComplete
  const input = menu.querySelector<HTMLInputElement>(".sharing-link-input")!
  expect(input.value).toBe(ribbon.collaborationLink)
  expect(input.readOnly).toBe(true)
  expect(getComputedStyle(input).borderTopWidth).toBe("1px")
  expect(menu.querySelector(".sharing-toggle")?.nextElementSibling).toBe(input.closest(".sharing-link-field"))
  expect(input.nextElementSibling?.getAttribute("aria-label")).toBe("Copy link")
  expect(menu.textContent).toContain("No other authors connected")
  expect(menu.textContent).not.toContain("Disconnected")

  ribbon.linkSharingEnabled = false
  await ribbon.updateComplete
  await action.updateComplete
  expect(menu.querySelector(".sharing-link-input")).toBeNull()
  expect(menu.textContent).toContain("No other authors connected")
})

it("restores Download and Print in the preview ribbon with their existing actions", async () => {
  const {ribbon} = await mountRibbon()
  ribbon.previewActive = true
  await ribbon.updateComplete
  const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Sharing"]')!
  await drawer.updateComplete
  const buttons = Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"))
  await Promise.all(buttons.map(button => button.updateComplete))
  expect(buttons.map(button => button.label)).toEqual(["Download", "Print"])
  expect(buttons[0].submenu).toEqual([
    {label: "HTML (.html)", action: "download:html", icon: "HTML"},
    {label: "Offline HTML (.offline.html)", action: "download:offline", icon: "OfflineHTML"},
  ])
  const commands = vi.fn()
  ribbon.addEventListener("ribbon-button-click", commands)
  buttons[0].shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
  buttons[1].shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
  expect(commands.mock.calls.map(([event]) => event.detail.label)).toEqual(["Download", "Print"])
  ribbon.previewActive = false
  await ribbon.updateComplete
  expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Sharing"]')).toBeNull()
})
