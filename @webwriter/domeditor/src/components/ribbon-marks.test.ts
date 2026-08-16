// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {markStateChangeEvent} from "../editor-bridge"
import {DomEditor} from "./dom-editor"
import {AppRibbon} from "./ribbon"
import type {FileLabel} from "./file-label"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonCombobox} from "./ribbon-combobox"
import type {RibbonDrawer} from "./ribbon-drawer"
import type {RibbonMenu} from "./ribbon-menu"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
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

const primaryButtons = (drawer: RibbonDrawer) => Array.from(
  drawer.querySelectorAll<RibbonButton>('ribbon-button:not([slot="more"])'),
)

describe("mark ribbon controls", () => {
  it("renders the File tab as a rich document label without changing its ribbon", async () => {
    const {ribbon} = await mountRibbon()
    const saveEvents: string[] = []
    ribbon.addEventListener("ribbon-button-click", event => {
      saveEvents.push((event as CustomEvent<{label: string}>).detail.label)
    })
    ribbon.fileName = "lesson"
    await ribbon.updateComplete

    const fileTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!
    const fileLabel = fileTab.shadowRoot!.querySelector<FileLabel>("file-label")!
    await fileLabel.updateComplete
    expect(fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")?.textContent).toBe("lesson")
    expect(fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")?.tagName).toBe("STRONG")
    expect(fileLabel.shadowRoot!.querySelector(".location-icon")).toBeNull()
    const dirtyButton = fileLabel.shadowRoot!.querySelector<HTMLButtonElement>(".dirty-button")!
    expect(dirtyButton.textContent).toBe("*")
    expect(getComputedStyle(dirtyButton).visibility).toBe("hidden")
    const fileTabButton = fileTab.shadowRoot!.querySelector<HTMLButtonElement>("button")!
    expect(getComputedStyle(fileTabButton).paddingLeft).toBe("0px")
    expect(getComputedStyle(fileTabButton).paddingRight).toBe("0px")
    expect(["0", "0px"]).toContain(getComputedStyle(
      fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-label")!,
    ).gap)

    ribbon.activeMenu = "File"
    await ribbon.updateComplete
    expect(["#1e4f87", "rgb(30, 79, 135)"]).toContain(
      getComputedStyle(fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")!).color,
    )

    ribbon.activeMenu = "Start"
    await ribbon.updateComplete
    ribbon.fileDirty = true
    await ribbon.updateComplete
    await fileLabel.updateComplete
    expect(getComputedStyle(dirtyButton).visibility).toBe("visible")

    dirtyButton.click()
    expect(saveEvents).toEqual(["Save"])
    expect(ribbon.activeMenu).toBe("Start")

    fileLabel.shadowRoot!.querySelector<HTMLElement>(".file-name")!.dispatchEvent(
      new MouseEvent("click", {bubbles: true, composed: true}),
    )
    await ribbon.updateComplete
    expect(ribbon.activeMenu).toBe("File")
  })

  it("animates ribbon collapse and hides its tab indicators", async () => {
    const {ribbon} = await mountRibbon()
    const fileTab = ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!

    expect(getComputedStyle(ribbon).transition).toContain("height")
    expect(getComputedStyle(ribbon).transition).toContain("max-height")
    expect(fileTab.ribbonCollapsed).toBe(false)

    ribbon.expanded = false
    await ribbon.updateComplete
    expect(fileTab.ribbonCollapsed).toBe(true)
    expect(fileTab.hasAttribute("ribbon-collapsed")).toBe(true)

    ribbon.expanded = true
    await ribbon.updateComplete
    expect(fileTab.ribbonCollapsed).toBe(false)
    expect(fileTab.hasAttribute("ribbon-collapsed")).toBe(false)
  })

  it("disables the dirty save marker while preview is active", async () => {
    const {ribbon} = await mountRibbon()
    const saveEvents: string[] = []
    ribbon.addEventListener("ribbon-button-click", event => {
      saveEvents.push((event as CustomEvent<{label: string}>).detail.label)
    })
    ribbon.fileDirty = true
    await ribbon.updateComplete

    const fileLabel = ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!
      .shadowRoot!.querySelector<FileLabel>("file-label")!
    await fileLabel.updateComplete
    const dirtyButton = fileLabel.shadowRoot!.querySelector<HTMLButtonElement>(".dirty-button")!
    expect(dirtyButton.disabled).toBe(false)

    ribbon.previewActive = true
    await ribbon.updateComplete
    await fileLabel.updateComplete

    expect(dirtyButton.disabled).toBe(true)
    dirtyButton.click()
    expect(saveEvents).toEqual([])
  })

  it("keeps Edit in the main ribbon and includes Review with its layout drawers", async () => {
    const {ribbon} = await mountRibbon()
    const tabs = Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-tab"))

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Marks", "Text", "Lists", "Media", "Packages"])

    expect(tabs.map(tab => tab.label)).toEqual([
      "File",
      "Insert",
      "Edit",
      "Develop",
    ])

    tabs.find(tab => tab.label === "Edit")!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Marks", "Styles", "Font", "Effects", "Review", "Page", "Arrange", "View"])

    const review = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Review"]')!
    expect(Array.from(review.querySelectorAll<RibbonButton>("ribbon-button"))
      .map(button => button.label))
      .toEqual([
        "Spelling", "Grammar", "Translate",
        "New Comment", "Previous", "Next",
        "Track Changes", "Accept", "Reject",
      ])

    tabs.find(tab => tab.label === "File")!.shadowRoot!.querySelector("button")!.click()
    await ribbon.updateComplete
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["File", "Sharing", "Editor", "Appearance", "Advanced"])

    const fileDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="File"]')!
    const fileNameInput = fileDrawer.querySelector<HTMLInputElement>('input[aria-label="File name"]')!
    expect(fileNameInput.value).toBe("")
    expect(fileNameInput.placeholder).toBe("Unnamed File")
    const storageLocation = fileDrawer.querySelector<HTMLSelectElement>('select[aria-label="Storage location"]')!
    expect(storageLocation.value).toBe("local")
    expect(Array.from(storageLocation.options).map(option => option.textContent)).toEqual([
      "Local",
      "Edumix Cloud",
    ])
    storageLocation.value = "edumix-cloud"
    storageLocation.dispatchEvent(new Event("change", {bubbles: true}))
    await ribbon.updateComplete
    expect(storageLocation.value).toBe("edumix-cloud")
    expect(fileDrawer.querySelector(".storage-location-icon svg")?.getAttribute("class"))
      .toContain("icon-tabler-cloud")
    const fileButtons = Array.from(fileDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
    expect(fileButtons.map(button => button.label))
      .toEqual(["New", "Open", "Save", "Save as"])
    expect(fileButtons.every(button => getComputedStyle(
      button.shadowRoot!.querySelector<HTMLElement>(".button-row")!,
    ).boxSizing === "border-box")).toBe(true)
    expect(fileButtons.find(button => button.label === "Save")?.submenu).toEqual([
      {label: "HTML (.html)", action: "save:html"},
      {label: "Offline HTML (.offline.html)", action: "save:offline"},
    ])
    expect(fileButtons.find(button => button.label === "Save as")?.submenu).toEqual([
      {label: "HTML (.html)", action: "save-as:html"},
      {label: "Offline HTML (.offline.html)", action: "save-as:offline"},
    ])
    expect(fileDrawer.querySelector('input[type="checkbox"]')).toBeNull()
    expect(getComputedStyle(fileDrawer.shadowRoot!.querySelector<HTMLElement>(".controls")!).gridTemplateColumns)
      .toBe("repeat(4, minmax(0, 1fr))")

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
    expect(shareMenu.querySelector<HTMLInputElement>('input[aria-label="Sharing link"]')?.value)
      .toBe("https://webwriter.app/share/placeholder")
    expect(Array.from(shareMenu.querySelectorAll("button")).map(button => button.textContent?.trim()))
      .toEqual(["Copy link", "Copy QR code", "Download QR code"])

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
      "Superscript",
      "Subscript",
      "Remove formatting",
      "Link",
      "More",
    ])
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(0)
    expect(buttons.slice(2, 8).every(button => button.compact && button.toggle)).toBe(true)
    expect(buttons[8].compact).toBe(true)
    expect(buttons[8].toggle).toBe(false)
    expect(buttons.slice(9).every(button => !button.compact)).toBe(true)
    expect(buttons.slice(9).every(button => button.toggle)).toBe(true)
    expect(buttons.every(button => button.disabled)).toBe(true)
    expect(comboboxes.every(combobox => combobox.disabled)).toBe(true)
    expect(getComputedStyle(controls).gridAutoFlow).toBe("row")
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(8, 1.75rem) 4rem")
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(controls).gap).toBe("0.2rem")
    for(const action of ["mark:code", "mark:kbd", "mark:q"]) {
      expect(drawer.querySelector(`ribbon-button[action="${action}"]`)).toBeNull()
    }

    expect(getComputedStyle(comboboxes[2]).gridColumn).toBe("1")
    expect(getComputedStyle(comboboxes[2]).gridRow).toBe("2")
    expect(getComputedStyle(comboboxes[3]).gridColumn).toBe("2")
    expect(getComputedStyle(comboboxes[3]).gridRow).toBe("2")
    expect(getComputedStyle(buttons[8]).gridColumn).toBe("8")
    expect(getComputedStyle(buttons[8]).gridRow).toBe("1")

    for(const action of ["mark:a", "mark:span"]) {
      const button = drawer.querySelector<RibbonButton>(`ribbon-button[action="${action}"]`)!
      expect(getComputedStyle(button).gridColumn).toBe("9")
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

    const textDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Text"]')!
    const paragraph = Array.from(textDrawer.querySelectorAll<RibbonButton>("ribbon-button"))
      .find(button => button.action === "Paragraph")!
    const standardButtons = [
      drawer.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')!,
      drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!,
    ]
    await Promise.all([paragraph.updateComplete, ...standardButtons.map(button => button.updateComplete)])

    const paragraphRow = paragraph.shadowRoot!.querySelector<HTMLElement>(".button-row")!
    const paragraphTrigger = paragraph.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const paragraphMenu = paragraph.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

    for(const button of standardButtons) {
      const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
      const menu = button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!

      expect(button.constructor).toBe(paragraph.constructor)
      expect(row.className).toBe(paragraphRow.className)
      expect(trigger.className).toBe(paragraphTrigger.className)
      expect(menu.constructor).toBe(paragraphMenu.constructor)
      expect(menu.variant).toBe("button")
      expect(menu.customContent).toBe(true)
      expect(button.shadowRoot!.querySelector(".button-dropdown")).toBeNull()

      trigger.click()
      await button.updateComplete
      expect(menu.hidden).toBe(false)
    }

    paragraphTrigger.click()
    await paragraph.updateComplete
    expect(paragraphMenu.hidden).toBe(false)
    expect(paragraphMenu.customContent).toBe(false)

    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await Promise.all([paragraph.updateComplete, ...standardButtons.map(button => button.updateComplete)])
    expect(paragraphMenu.hidden).toBe(true)
    expect(standardButtons.every(button => button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!.hidden)).toBe(true)
  })

  it("shows the span multiselect with icons, attributes, and a count", async () => {
    const {ribbon, drawer} = await mountRibbon()
    const changed = vi.fn()
    ribbon.addEventListener("ribbon-combobox-change", changed)
    ribbon.canMark = true
    ribbon.marks = ["time", "var"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    expect(span.active).toBe(true)
    expect(span.label).toBe("Date/Time Annotation")
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
        "Span",
        "Side Comment",
        "Code",
        "Keyboard Shortcut",
        "Quotation",
        "Abbreviation",
        "Bidirectional Isolate",
        "Bidirectional Override",
        "Citation Source",
        "Data Annotation",
        "Defined Term",
        "Ruby Annotation",
        "Sample Output",
        "Date/Time Annotation",
        "Variable",
        "Deletion",
        "Insertion",
      ])
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-icon svg')).not.toBeNull()
    expect(dropdown.querySelector('[role="option"] .mark-dropdown-option-name')?.textContent).toBe("Span")
    expect(dropdown.querySelector('input[aria-label="Abbreviation: Title"]')).not.toBeNull()
    expect(dropdown.querySelector('input[aria-label="Quotation: Source"]')).not.toBeNull()
    expect(dropdown.querySelector('input[aria-label="Data Annotation: Value"]')).not.toBeNull()
    expect(dropdown.querySelector('input[aria-label="Date/Time Annotation: Date/time"]')).not.toBeNull()

    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Data Annotation"]')!.click()
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {name: "mark-types", value: "time", values: ["time", "var", "data"]},
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
    ribbon.marks = ["span"]
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    span.shadowRoot!.querySelector<HTMLInputElement>('input[aria-label="Select Span"]')!.click()
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

  it("shows secondary mark attributes inside the span dropdown", async () => {
    const {ribbon, drawer} = await mountRibbon()
    ribbon.canMark = true
    ribbon.marks = ["abbr", "data", "time"]
    ribbon.markAttributes = {
      abbr: {title: "Hypertext Markup Language"},
      data: {value: "42"},
      time: {datetime: "2026-08-13"},
    }
    await ribbon.updateComplete
    await drawer.updateComplete

    const span = drawer.querySelector<RibbonButton>('ribbon-button[action="mark:span"]')!
    span.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await span.updateComplete
    const dropdown = span.shadowRoot!.querySelector<HTMLElement>(".button-dropdown-content")!
    expect(dropdown.querySelector<HTMLInputElement>('input[aria-label="Abbreviation: Title"]')!.value)
      .toBe("Hypertext Markup Language")
    expect(dropdown.querySelector<HTMLInputElement>('input[aria-label="Data Annotation: Value"]')!.value).toBe("42")
    expect(dropdown.querySelector<HTMLInputElement>('input[aria-label="Date/Time Annotation: Date/time"]')!.value)
      .toBe("2026-08-13")

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
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (⌥⇧B)")

      mounted.ribbon.remove()
      Object.defineProperty(navigator, "platform", {value: "Win32", configurable: true})
      mounted = await mountRibbon()
      bold = mounted.drawer.querySelector<RibbonButton>('ribbon-button[action="mark:b"]')!
      await bold.updateComplete
      expect(bold.shadowRoot!.querySelector("button")!.title).toBe("Bold (Alt+Shift+B)")
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
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {
          canMark: true,
          marks: ["b"],
          styles: {"font-size": "18px"},
        },
      },
      source: editorWindow,
    }))
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

  it("routes span dropdown selections and detail-attribute changes", async () => {
    const {editor, editorWindow} = await mountEditor()
    const execute = vi.spyOn(editor, "execute").mockResolvedValue(undefined)
    window.dispatchEvent(new MessageEvent("message", {
      data: {
        type: markStateChangeEvent,
        detail: {
          canMark: true,
          marks: ["time"],
          attributes: {time: {datetime: "2026-08-13"}},
        },
      },
      source: editorWindow,
    }))
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
    dropdown.querySelector<HTMLInputElement>('[role="option"] input[aria-label="Select Data Annotation"]')!.click()
    const datetime = dropdown.querySelector<HTMLInputElement>(
      'input[aria-label="Date/Time Annotation: Date/time"]',
    )!
    datetime.value = "2026-08-14"
    datetime.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(execute).toHaveBeenNthCalledWith(1, {type: "toggleMarkGroup", mark: "span"})
    expect(execute).toHaveBeenNthCalledWith(2, {
      type: "setMarkGroup",
      primary: "span",
      marks: ["time", "data"],
    })
    expect(execute).toHaveBeenNthCalledWith(3, {
      type: "setMarkAttribute",
      mark: "time",
      attribute: "datetime",
      value: "2026-08-14",
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
