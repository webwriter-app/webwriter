// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
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

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.spyOn(WebWriterPackageRegistry.prototype, "search").mockResolvedValue([])
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
    expect(quickButtons.map(button => button.label)).toEqual(["Save", "Share"])
    expect(quickButtons.every(button => button.compact)).toBe(true)
    expect(quickButtons[0].shadowRoot!.querySelector(".icon-tabler-device-floppy")).not.toBeNull()
    expect(quickButtons[1].shadowRoot!.querySelector(".icon-tabler-share")).not.toBeNull()
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
      .toBe("https://webwriter.app/share/placeholder")
    const qrGenerator = quickShareMenu.querySelector<HTMLElement>("webwriter-qr-code")!
    expect(getComputedStyle(qrGenerator).display).toBe("none")
    expect(quickShareMenu.querySelectorAll("img.sharing-dropdown-qr-code")).toHaveLength(1)
    const sharingDropdown = quickShareMenu.querySelector<HTMLElement>(".sharing-dropdown")!
    const documentActions = sharingDropdown.querySelector<HTMLElement>(".sharing-document-actions")!
    expect(sharingDropdown.firstElementChild).toBe(documentActions)
    expect(getComputedStyle(documentActions).display).toBe("flex")
    expect(Array.from(documentActions.querySelectorAll<RibbonButton>("ribbon-button"), button => button.label))
      .toEqual(["Print", "Download"])
    const qrGroup = sharingDropdown.querySelector<HTMLElement>(".sharing-qr-group")!
    expect(getComputedStyle(qrGroup).borderTopWidth).toBe("1px")
    expect(qrGroup.querySelector("img.sharing-dropdown-qr-code")).not.toBeNull()
    expect(Array.from(qrGroup.querySelectorAll("button"), button => button.getAttribute("aria-label")))
      .toEqual(["Copy QR code", "Download QR code"])
    expect(Array.from(qrGroup.querySelectorAll("button span"), label => label.textContent))
      .toEqual(["Copy QR code", "Download QR code"])
    const linkRow = quickShareMenu.querySelector<HTMLElement>(".sharing-link-input-row")!
    const linkCopy = quickShareMenu.querySelector<HTMLElement>(".sharing-link-copy")!
    expect(getComputedStyle(linkRow).display).toBe("block")
    expect(getComputedStyle(linkRow).width).toBe("100%")
    expect(getComputedStyle(linkCopy).position).toBe("absolute")
    expect(getComputedStyle(linkCopy).right).toBe("4.48px")
    expect(getComputedStyle(linkCopy).width).toBe("18.4px")
    expect(getComputedStyle(linkCopy).height).toBe("18.4px")
    expect(getComputedStyle(linkCopy).backgroundColor).toBe("rgba(255, 255, 255, 0.5)")

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

  it("allows native QR image dragging while preserving pointer handling for ribbon buttons", async () => {
    const {ribbon} = await mountRibbon()
    const share = ribbon.shadowRoot!.querySelector<RibbonButton>(".file-share-action")!
    const button = share.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    button.click()
    await share.updateComplete
    const menu = share.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    const image = menu.querySelector<HTMLImageElement>(".sharing-dropdown-qr-code")!
    expect(image.getAttribute("draggable")).toBe("true")

    for(const type of ["pointerdown", "mousedown"]) {
      const imageEvent = new MouseEvent(type, {bubbles: true, composed: true, cancelable: true, button: 0})
      image.dispatchEvent(imageEvent)
      expect(imageEvent.defaultPrevented).toBe(false)
      expect(menu.hidden).toBe(false)

      const buttonEvent = new MouseEvent(type, {bubbles: true, composed: true, cancelable: true, button: 0})
      button.dispatchEvent(buttonEvent)
      expect(buttonEvent.defaultPrevented).toBe(true)
    }
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
    expect(fileMenu.groups.map(group => group.label)).toEqual(["File", "Settings"])
    expect(fileMenu.groups[0]!.buttons.map(button => typeof button === "string" ? button : button.label))
      .toEqual(["New", "Open", "Save"])

    ribbon.previewActive = true
    await ribbon.updateComplete
    expect(ribbon.expanded).toBe(false)
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
    for(const button of buttons) {
      expect(getComputedStyle(button).flexShrink).toBe("1")
      expect(getComputedStyle(button).minWidth).toBe("24px")
      expect(button.shadowRoot!.querySelector(".main-button")).not.toBeNull()
    }
  })

  it("animates ribbon collapse while the File tab stays collapsed", async () => {
    const {ribbon} = await mountRibbon()
    const fileTab = ribbon.shadowRoot!.querySelector<RibbonTab>('ribbon-tab[label="File"]')!

    expect(getComputedStyle(ribbon).transition).toContain("height")
    expect(getComputedStyle(ribbon).transition).toContain("max-height")
    expect(getComputedStyle(ribbon).height).toBe("140px")
    expect(fileTab.ribbonCollapsed).toBe(true)

    ribbon.expanded = false
    await ribbon.updateComplete
    expect(fileTab.ribbonCollapsed).toBe(true)
    expect(fileTab.hasAttribute("ribbon-collapsed")).toBe(true)

    ribbon.expanded = true
    await ribbon.updateComplete
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
        "Marks", "Document", "Section", "Layout", "Borders", "Background", "Semantics",
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
      .toEqual(["File", "Sharing"])

    const fileDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="File"]')!
    const fileNameInput = fileDrawer.querySelector<HTMLInputElement>('input[aria-label="File name"]')!
    expect(fileNameInput.value).toBe("")
    expect(fileNameInput.placeholder).toBe("Unnamed File")
    expect(getComputedStyle(fileNameInput).maxWidth).toBe("204px")
    ribbon.fileDirty = true
    await ribbon.updateComplete
    expect(fileDrawer.querySelector(".file-dirty")).toBeNull()
    expect(fileDrawer.textContent).not.toContain("*")
    const storageLocation = fileDrawer.querySelector<HTMLSelectElement>('select[aria-label="Storage location"]')!
    expect(storageLocation.value).toBe("local")
    expect(Array.from(storageLocation.options).map(option => option.textContent)).toEqual([
      "Local",
    ])
    ribbon.backendState = "connected"
    await ribbon.updateComplete
    expect(Array.from(storageLocation.options).map(option => option.textContent)).toEqual([
      "Local",
      "Development server",
    ])
    storageLocation.value = "development-server"
    storageLocation.dispatchEvent(new Event("change", {bubbles: true}))
    await ribbon.updateComplete
    expect(storageLocation.value).toBe("development-server")
    expect(fileDrawer.querySelector(".storage-location-icon svg")?.getAttribute("class"))
      .toContain("icon-tabler-cloud")
    const fileButtons = Array.from(fileDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(fileButtons.map(button => button.label))
      .toEqual(["New", "Open", "Save"])
    expect(fileButtons.every(button => getComputedStyle(
      button.shadowRoot!.querySelector<HTMLElement>(".button-row")!,
    ).boxSizing === "border-box")).toBe(true)
    expect(fileButtons.find(button => button.label === "Save")?.submenu).toEqual([
      {label: "HTML (.html)", action: "save:html"},
      {label: "Offline HTML (.offline.html)", action: "save:offline"},
      {label: "Save as"},
    ])
    expect(fileDrawer.querySelector('input[type="checkbox"]')).toBeNull()
    expect(getComputedStyle(fileDrawer).getPropertyValue("--ribbon-drawer-expanded-width").trim())
      .toBe("13.25rem")
    expect(getComputedStyle(fileDrawer.shadowRoot!.querySelector<HTMLElement>(".controls")!).gridTemplateColumns)
      .toBe("repeat(3, minmax(0, 1fr))")

    const sharingDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Sharing"]')!
    const sharingButtons = Array.from(sharingDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(sharingButtons.map(button => button.label)).toEqual(["Share", "Print", "Download"])
    expect(sharingButtons.every(button => getComputedStyle(
      button.shadowRoot!.querySelector<HTMLElement>(".button-row")!,
    ).boxSizing === "border-box")).toBe(true)
    expect(getComputedStyle(sharingDrawer.shadowRoot!.querySelector<HTMLElement>(".controls")!).gridTemplateColumns)
      .toBe("minmax(5rem, 1.15fr) minmax(0, 1fr)")
    const shareButton = sharingButtons[0]
    expect(shareButton.variant).toBe("qr")
    expect(shareButton.qrValue).toBe("https://webwriter.app/share/placeholder")
    expect(getComputedStyle(shareButton).gridColumn).toBe("span 1")
    expect(getComputedStyle(shareButton).gridRow).toBe("span 2")
    await shareButton.updateComplete
    expect(shareButton.shadowRoot!.querySelector(".submenu-trigger")).not.toBeNull()
    const qrCode = shareButton.shadowRoot!.querySelector("webwriter-qr-code")!
    await (qrCode as HTMLElement & {updateComplete: Promise<unknown>}).updateComplete
    expect(qrCode.shadowRoot!.querySelector(".code svg")).not.toBeNull()
    const exportCanvas = qrCode.shadowRoot!.querySelector<HTMLCanvasElement>(".export-code canvas")
    if(exportCanvas) {
      expect(exportCanvas.width).toBe(512)
      expect(exportCanvas.height).toBe(512)
    }

    shareButton.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await shareButton.updateComplete
    const shareMenu = shareButton.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await shareMenu.updateComplete
    expect(shareMenu.noScroll).toBe(true)
    const shareDocumentActions = Array.from(shareMenu.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(shareDocumentActions.map(button => button.label)).toEqual(["Print", "Download"])
    expect(shareMenu.querySelector<HTMLInputElement>('input[aria-label="Sharing link"]')?.value)
      .toBe("https://webwriter.app/share/placeholder")
    expect(Array.from(shareMenu.querySelectorAll("button")).map(button => button.getAttribute("aria-label")))
      .toEqual(["Copy link", "Copy QR code", "Download QR code"])
    expect(shareMenu.querySelector("img.sharing-dropdown-qr-code")).not.toBeNull()

    const toDataURL = vi.spyOn(
      qrCode as unknown as {toDataURL: () => string | null},
      "toDataURL",
    ).mockReturnValue("data:image/png;base64,qr")
    const clipboardWrite = vi.spyOn(navigator.clipboard, "write").mockResolvedValue()
    shareButton.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await new Promise(resolve => setTimeout(resolve))
    expect(clipboardWrite).toHaveBeenCalledOnce()
    const clipboardItem = clipboardWrite.mock.calls[0]![0][0]
    expect(clipboardItem.types).toEqual(expect.arrayContaining(["text/html", "text/plain"]))
    expect(await (await clipboardItem.getType("text/plain")).text())
      .toBe("https://webwriter.app/share/placeholder")
    expect(await (await clipboardItem.getType("text/html")).text()).toContain("<img")
    await shareButton.updateComplete
    const notification = shareButton.shadowRoot!.querySelector<HTMLElement>(".button-notification")!
    expect(notification.textContent?.trim()).toBe("Copied QR code and link")
    expect(notification.getAttribute("role")).toBe("status")
    expect(notification.classList.contains("visible")).toBe(true)
    toDataURL.mockRestore()
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
      "Link",
      "More",
    ])
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(0)
    expect(buttons.slice(2, 6).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons[6].compact).toBe(true)
    expect(buttons[6].toggle).toBe(false)
    expect(buttons.slice(7).every(button => !button.compact)).toBe(true)
    expect(buttons.slice(7).every(button => button.toggle)).toBe(true)
    expect(buttons.every(button => button.disabled)).toBe(true)
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

    for(const action of ["mark:a", "mark:span"]) {
      const button = drawer.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      expect(getComputedStyle(button).gridColumn).toBe("8")
      expect(getComputedStyle(button).gridRow).toBe(action === "mark:a" ? "1" : "2")
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
      drawer.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')!,
      drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!,
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
    }

    headingTrigger.click()
    await heading.updateComplete
    expect(headingMenu.hidden).toBe(false)
    expect(headingMenu.customContent).toBe(false)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await Promise.all([heading.updateComplete, ...standardButtons.map(button => button.updateComplete)])
    expect(headingMenu.hidden).toBe(true)
    expect(standardButtons.every(button => button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!.hidden)).toBe(true)
  })

  it("shows the span multiselect with icons, attributes, and a count", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["sup", "sub"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    expect(span.active).toBe(true)
    expect(span.label).toBe("Superscript")
    expect(span.selectionCount).toBe(1)
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
        "Quotation",
      ])
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-icon svg')).not.toBeNull()
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-name')?.textContent).toBe("Superscript")
    expect(dropdown.querySelector('input[aria-label="Quotation: Source"]')).not.toBeNull()

    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Code"]')!.click()
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "sup", values: ["sup", "sub", "code"]},
    }))
    await ribbon.updateComplete
    expect(span.selectionCount).toBe(2)
    await span.updateComplete
    expect(span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!.hidden).toBe(false)
    expect(span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      .getAttribute("aria-expanded")).toBe("true")
    const label = span.shadowRoot!.querySelector<HTMLElement>(".button-label")!
    const labelText = span.shadowRoot!.querySelector<HTMLElement>(".button-label-text")!
    const count = span.shadowRoot!.querySelector<HTMLElement>(".selection-count")!
    expect(count.textContent).toBe("+2")
    expect(getComputedStyle(label).display).toBe("flex")
    expect(getComputedStyle(labelText).overflow).toBe("hidden")
    expect(getComputedStyle(count).flexShrink).toBe("0")
  })

  it("keeps an empty span multiselect open and presents it as More", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["sup"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    span.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Select Superscript"]')!.click()
    await ribbon.updateComplete
    await span.updateComplete

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "", values: []},
    }))
    expect(span.label).toBe("More")
    expect(span.icon).toBe("More")
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

    const button = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    await button.updateComplete
    expect(button.label).toBe("More")
    expect(button.active).toBe(false)
    expect(button.selectionCount).toBe(0)
    button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await button.updateComplete
    const dropdown = button.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.querySelectorAll('[role="option"]')).toHaveLength(5)
    expect(dropdown.querySelector(".ruby-dropdown")).toBeNull()
    expect(dropdown.textContent).not.toContain("Annotation")

    dropdown.querySelector<HTMLInputElement>('input[aria-label="Select Code"]')!.click()
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "span", values: [...ribbon.marks, "code"]},
    }))
  })

  it("shows secondary mark attributes inside the span dropdown", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = []
    ribbon.markAttributes = {q: {cite: "https://example.com/source"}}
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    const quotation = dropdown.querySelector<HTMLInputElement>('input[aria-label="Quotation: Source"]')!
    expect(quotation.disabled).toBe(true)
    expect(quotation.parentElement!.getAttribute("aria-hidden")).toBe("true")
    expect(getComputedStyle(quotation.parentElement!).visibility).toBe("hidden")

    dropdown.querySelector<HTMLInputElement>('input[aria-label="Select Quotation"]')!.click()
    await ribbon.updateComplete
    await span.updateComplete
    const openDropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    const activeQuotation = openDropdown.querySelector<HTMLInputElement>('input[aria-label="Quotation: Source"]')!
    expect(openDropdown.hidden).toBe(false)
    expect(activeQuotation.value).toBe("https://example.com/source")
    expect(activeQuotation.disabled).toBe(false)
    expect(activeQuotation.parentElement!.getAttribute("aria-hidden")).toBe("false")
    expect(getComputedStyle(activeQuotation.parentElement!).visibility).not.toBe("hidden")
  })

  it("keeps link attributes in the link dropdown", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["a"]
    ribbon.markAttributes = {a: {href: "/page", target: "_blank"}}
    await ribbon.updateComplete
    await drawer.updateComplete

    const link = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')!
    link.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await link.updateComplete
    const dropdown = link.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    const inputs = Array.from(dropdown.querySelectorAll<HTMLInputElement>(".mark-attribute input"))
    expect(inputs.map(input => input.getAttribute("aria-label"))).toEqual(["Link: Link"])
    expect(inputs[0].value).toBe("/page")

    const more = link.shadowRoot!.querySelector<HTMLButtonElement>(".button-dropdown-more")!
    expect(more.getAttribute("aria-expanded")).toBe("false")
    more.click()
    await ribbon.updateComplete
    await link.updateComplete

    const openMore = link.shadowRoot!.querySelector<HTMLButtonElement>(".button-dropdown-more")!
    expect(openMore.getAttribute("aria-expanded")).toBe("true")
    const advanced = link.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-advanced")!
    const advancedInputs = Array.from(advanced.querySelectorAll<HTMLInputElement>("input"))
    expect(advancedInputs.map(input => input.getAttribute("aria-label"))).toEqual([
      "Link: Target",
      "Link: Download",
      "Link: Ping",
      "Link: Relationship",
      "Link: Language",
      "Link: Media type",
      "Link: Referrer policy",
    ])
    expect(advancedInputs[0].value).toBe("_blank")

    openMore.click()
    await ribbon.updateComplete
    await link.updateComplete
    expect(link.shadowRoot!.querySelector<HTMLButtonElement>(".button-dropdown-more")!
      .getAttribute("aria-expanded")).toBe("false")

    ribbon.marks = []
    await ribbon.updateComplete
    await link.updateComplete
    expect(link.shadowRoot!.querySelector(".button-dropdown-advanced")).toBeNull()
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

    expect(family.shadowRoot!.querySelector<HTMLElement>(".value")!.textContent!.trim()).toBe("Font")
    expect(size.shadowRoot!.querySelector<HTMLElement>(".value")!.textContent!.trim()).toBe("Size")

    family.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await family.updateComplete
    expect(family.shadowRoot!.querySelector("[role=listbox]")).not.toBeNull()
    expect(family.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Default font"]')!.textContent)
      .toContain("Default font")
    family.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Arial"]')!.click()

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "font-family", value: "Arial, sans-serif"},
    }))

    size.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await size.updateComplete
    expect(size.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="Default size"]')!.textContent)
      .toContain("Default size")
  })
})

describe("mark ribbon bridge", () => {
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
    size.shadowRoot!.querySelector<HTMLButtonElement>(".combobox")!.click()
    await size.updateComplete
    size.shadowRoot!.querySelector<HTMLButtonElement>('.option[aria-label="24 px"]')!.click()
    clear.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMark", mark: "b"})
    expect(execute).toHaveBeenNthCalledWith(2, {type: "increaseFontSize"})
    expect(execute).toHaveBeenNthCalledWith(3, {type: "setStyleMark", property: "font-size", value: "24px"})
    expect(execute).toHaveBeenNthCalledWith(4, {type: "removeMarks"})
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

  it("routes span dropdown selections and detail-attribute changes", async () => {
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
    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    await span.updateComplete

    span.shadowRoot!.querySelector<HTMLButtonElement>("button")!.click()
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Code"]')!.click()
    const source = dropdown.querySelector<HTMLInputElement>(
      'input[aria-label="Quotation: Source"]',
    )!
    source.value = "https://example.com/updated"
    source.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMarkGroup", mark: "span"})
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "setMarkGroup",
      primary: "span",
      marks: ["q", "code"],
    })
    expect(execute).toHaveBeenNthCalledWith(3, {
      type: "setMarkAttribute",
      mark: "q",
      attribute: "cite",
      value: "https://example.com/updated",
    })

    ribbon.dispatchEvent(new CustomEvent("ribbon-combobox-change", {
      detail: {name: "mark-types", value: "", values: []},
      bubbles: true,
      composed: true,
    }))
    expect(execute).toHaveBeenNthCalledWith(4, {
      type: "setMarkGroup",
      primary: "span",
      marks: [],
    })
  })
})
