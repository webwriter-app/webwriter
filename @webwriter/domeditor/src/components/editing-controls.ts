import "./widget-grouping-dialog"
import type {WidgetGroupingDialog} from "./widget-grouping-dialog"
import type {WidgetGroupingContext} from "../widget-grouping.js"
import {graphicShapePresets, type GraphicShapePreset} from "../graphic-shape-presets"
import {isGraphicPresetType} from "../graphic-shapes"
import {LitElement, html, nothing} from "lit"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonCombobox} from "./ribbon-combobox"
import type {ElementStyleEditor} from "./element-style-editor"
import {repeat} from "lit/directives/repeat.js"
import {appCommands, defaultAppSettings, formatShortcut, type AppSettings} from "../app-settings"
import {dialogClosedByValues, type DialogSelectionState} from "../dialog"
import {
  emptyVersionHistoryState,
  type CommentState,
  type ElementStyleState,
  type SelectedElementTypeState,
  type ElementSelectionType,
  type FigureSelectionState,
  type HeadingGroupSelectionState,
  type ListSelectionState,
  type ListType,
  type VersionHistoryState,
  type VersionHistoryCheckpoint,
} from "../editor-bridge"
import {widgetOptionValue, type WidgetOptionState, type WidgetOptionsState, type WidgetOptionValue} from "../widget-options"
import type {ElementAttributeState} from "../element-attributes"
import type {LayoutSelectionState} from "../layouts"
import {insertMathStructureButtons} from "./ribbon-menu-config"
import {elementStyleCategories, type ElementStyleCategory} from "../element-styles"
import {
  graphicShapeOptions,
  graphicShapeCategories,
  type GraphicLayerOperation,
  type GraphicSelectionState,
  type GraphicViewportOperation,
} from "../graphic"
import {
  backgroundColorOptions,
  emptyRubyState,
  excludedMarkNames,
  fontFamilyOptions,
  fontSizeOptions,
  markAttributeOptionsFor,
  markShortcutLabel,
  mergedMarkGroupFor,
  primaryDrawerMarkNames,
  primaryMarkOptions,
  secondaryMarkOptions,
  textColorOptions,
  type MarkAttributeOption,
  type MarkAttributeValues,
  type MarkName,
  type MarkOption,
  type RubyState,
  type StyleMarkValues,
} from "../marks"
import {
  imageMapAreaAttributeOptions,
  isWebsiteType,
  mediaAttributeOptions,
  timedMediaResourceAttributeOptions,
  type ImageMapAreaState,
  type ImageMapHotspotShape,
  type MediaAttributeOption,
  type MediaSelectionState,
  type MediaType,
  type TimedMediaResourceState,
  type TimedMediaResourceType,
} from "../media"
import type {MathSelectionState} from "../math"
import type {PackageTestResult, WebWriterPackage, WebWriterPackageExportType} from "../packages"
import type {LocalPackageWarning} from "../local-package"
import {describePackageExport, editingConfigKey, normalizeEditingConfig, webWriterPackageExportTypes} from "../packages"
import {ribbonIcon} from "../ribbon-icons"
import {sectionOptions, type SectionName} from "../sections"
import type {TableSelectionState} from "../table"
import {isOnApple} from "../utility"
import {editingControlStyles} from "./editing-controls.styles"
import "./element-attribute-editor"
import "./element-style-editor"
import "./ribbon-button"
import "./ribbon-combobox"
import "./document-head-editor"
import {packageLicenseOptions} from "../package-licenses"
import "./ribbon-drawer"
import {type RibbonDrawer} from "./ribbon-drawer"
import {type RibbonMenuGroup} from "./ribbon-menu"
import {graphicAlignButtons, graphicDistributeButtons, graphicOrderButtons, type RibbonMenuName} from "./ribbon-menu-config"

type RibbonInputEventDetail = {
  input: HTMLElement
  relatedTarget?: EventTarget | null
  relatedTargetIsInput?: boolean
}

const isRibbonInput = (target: EventTarget | null): target is HTMLElement => {
  if(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true
  }
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.getAttribute("contenteditable") !== null && target.getAttribute("contenteditable") !== "false" ||
    target.getAttribute("role") === "textbox"
  )
}

const ribbonInputFromEvent = (event: Event) => event.composedPath().find(isRibbonInput)

const packageMetadataText = (value: unknown) => value === undefined
  ? ""
  : typeof value === "string" ? value : JSON.stringify(value, null, 2)

const packagePersonText = (value: unknown) => value === undefined
  ? ""
  : typeof value === "string" ? value : JSON.stringify(value)

const packageExportIcons: Record<WebWriterPackageExportType, string> = {
  widget: "Extensions", test: "Accept", migration: "Migration", snippet: "Code",
  theme: "Theme", icon: "Image", "editing-config": "Preferences",
  "custom-elements": "Document", other: "More",
}

const scopedPackageNamePattern = "@[^/\\s]+/[^/\\s]+"
const semanticVersionPattern = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?(\\+[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?"

/** Selection controls shared by the top ribbon and side toolbox. Application
 * menus, AI, sharing and ribbon layout belong to AppRibbon. */
export abstract class EditingControls extends LitElement {
  static properties = {
    activeMenu: {type: String, attribute: "active-menu"},
    svgText: {type: Boolean, attribute: false},
    canMark: {type: Boolean, attribute: "can-mark"},
    canSection: {type: Boolean, attribute: "can-section"},
    sectionType: {type: String, attribute: "section-type"},
    sectionActive: {type: Boolean, attribute: "section-active"},
    sectionSelected: {type: Boolean, attribute: "section-selected"},
    marks: {attribute: false},
    allowedMarks: {attribute: false},
    markStyles: {attribute: false},
    markAttributes: {attribute: false},
    ruby: {attribute: false},
    commentState: {attribute: false},
    commentDraft: {type: String, state: true},
    localPackages: {attribute: false},
    localPackageRefreshingNames: {attribute: false},
    localPackagesLoading: {type: Boolean, attribute: "local-packages-loading"},
    localPackageError: {type: String, attribute: "local-package-error"},
    selectedLocalPackageName: {type: String, attribute: "selected-local-package-name"},
    localPackageWarnings: {attribute: false},
    localPackageRuntimeWarnings: {attribute: false},
    localPackageTestResults: {attribute: false},
    listType: {type: String, attribute: "list-type"},
    listStyle: {type: String, attribute: "list-style"},
    orderedList: {attribute: false},
    headingGroup: {attribute: false},
    figure: {attribute: false},
    captionPosition: {attribute: false},
    captionAlignment: {attribute: false},
    media: {attribute: false},
    dialog: {attribute: false},
    table: {attribute: false},
    graphic: {attribute: false},
    math: {attribute: false},
    layout: {attribute: false},
    layoutError: {type: String},
    elementStyle: {attribute: false},
    elementAttributes: {attribute: false},
    selectedElementTypes: {attribute: false},
    widgetOptions: {attribute: false},
    historyState: {attribute: false},
    historyLoading: {type: Boolean, attribute: "history-loading"},
    historyError: {type: String, attribute: "history-error"},
    settings: {attribute: false},
  }

  static styles = editingControlStyles

  activeMenu: RibbonMenuName = "Start"

  canMark = false

  canSection = false

  sectionType: SectionName = "section"

  sectionActive = false

  sectionSelected = false

  svgText = false

  marks: MarkName[] = []

  /** Marks a containing widget allows; null when all marks are allowed. */
  allowedMarks: MarkName[] | null = null

  markStyles: StyleMarkValues = {}

  markAttributes: MarkAttributeValues = {}

  ruby: RubyState = {...emptyRubyState}

  commentState: CommentState = {
    canComment: false,
    active: false,
    text: "",
    activeCount: 0,
    count: 0,
    highlighting: true,
  }

  protected commentDraft = ""

  localPackages: WebWriterPackage[] = []

  localPackagesLoading = false
  localPackageRefreshingNames: string[] = []

  localPackageError = ""

  selectedLocalPackageName = ""


  /** Loader and runtime checks per local package name. */
  localPackageWarnings: Record<string, LocalPackageWarning[]> = {}
  localPackageRuntimeWarnings: Record<string, LocalPackageWarning[]> = {}

  /** Latest test run per `<package name>/<test name>`. */
  localPackageTestResults: Record<string, PackageTestResult | "running"> = {}

  listType: ListType | null = null

  listStyle = ""

  orderedList: ListSelectionState["ordered"] = undefined

  headingGroup: HeadingGroupSelectionState | null = null

  figure: FigureSelectionState | null = null
  captionPosition: "none" | "above" | "below" | null = null
  captionAlignment: "left" | "center" | "right" | null = null

  media: MediaSelectionState | null = null

  dialog: DialogSelectionState | null = null

  table: TableSelectionState | null = null

  graphic: GraphicSelectionState | null = null

  math: MathSelectionState | null = null

  layout: LayoutSelectionState | null = null
  layoutError = ""

  selectedElementTypes: SelectedElementTypeState[] = []

  elementAttributes: ElementAttributeState | null = null

  /** Options and actions of the selected widget. */
  widgetOptions: WidgetOptionsState | null = null

  elementStyle: ElementStyleState = {
    target: null,
    inline: {},
    computed: {},
    context: {display: "", parentDisplay: ""},
  }


  historyState = emptyVersionHistoryState()

  historyLoading = false

  historyError = ""

  protected spanMarkSelection: MarkName[] = []

  protected spanMarkSelectionSynced = false

  settings: AppSettings = defaultAppSettings()

  protected readonly handleRibbonPointerDown = (event: MouseEvent) => {
    if(event.button !== 0) return

    const input = ribbonInputFromEvent(event)
    if(input) {
      this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-pointerdown", {
        detail: {input},
        bubbles: true,
        composed: true,
      }))
      return
    }

    if(this.usesNativePointerInteraction(event)) return

    // Keep the editor iframe as the active element while the ribbon is used
    // with a pointer. The click event still performs the ribbon action.
    event.preventDefault()
  }

  protected readonly handleRibbonInputFocusIn = (event: FocusEvent) => {
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-focus", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  protected readonly handleRibbonInputFocusOut = (event: FocusEvent) => {
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-blur", {
      detail: {
        input,
        relatedTarget: event.relatedTarget,
        relatedTargetIsInput: isRibbonInput(event.relatedTarget),
      },
      bubbles: true,
      composed: true,
    }))
  }

  protected readonly handleRibbonInputChange = (event: Event) => {
    const input = ribbonInputFromEvent(event)
    if(!input || input.hasAttribute("data-ribbon-input-persistent")) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-commit", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  protected readonly handleRibbonInputKeydown = (event: KeyboardEvent) => {
    if(event.key !== "Escape") return
    const input = ribbonInputFromEvent(event)
    if(!input) return
    this.dispatchEvent(new CustomEvent<RibbonInputEventDetail>("ribbon-input-cancel", {
      detail: {input},
      bubbles: true,
      composed: true,
    }))
  }

  dismissMenus() {
    this.renderRoot.querySelectorAll<RibbonButton>("ribbon-button")
      .forEach(button => button.closeSubmenu())
    this.renderRoot.querySelectorAll<RibbonCombobox>("ribbon-combobox")
      .forEach(combobox => combobox.close())
    this.renderRoot.querySelectorAll<ElementStyleEditor>("element-style-editor")
      .forEach(editor => editor.dismissMenus())
  }

  dismissDrawers() {
    this.renderRoot.querySelectorAll<RibbonDrawer>("ribbon-drawer")
      .forEach(drawer => drawer.closeDrawer())
  }

  protected markButton(option: MarkOption) {
    const shortcut = this.commandShortcut(`mark:${option.name}`)
      || markShortcutLabel(option, isOnApple())
    const group = mergedMarkGroupFor(option.name)
    const active = group?.primary === option.name
      ? group.members.some(mark => this.marks.includes(mark))
      : this.marks.includes(option.name)
    return html`
      <ribbon-button
        compact
        toggle
        label=${option.label}
        action=${`mark:${option.name}`}
        icon=${option.icon}
        shortcut=${shortcut}
        ?active=${active}
        ?disabled=${!this.canMark || !!this.allowedMarks && !this.allowedMarks.includes(option.name)}
      ></ribbon-button>
    `
  }

  protected visibleMarkButton(name: MarkName) {
    return this.markButton(this.markOption(name))
  }

  protected markOption(name: MarkName) {
    return [...primaryMarkOptions, ...secondaryMarkOptions].find(option => option.name === name)!
  }

  protected dispatchMarkAttribute(mark: MarkName, attribute: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    let value: string | null = input.value
    if(input.type === "checkbox") {
      value = input.checked ? input.value : ""
      if(attribute === "target") value = input.checked ? "_blank" : ""
      if(attribute === "download") value = input.checked ? "" : null
    }
    if(mark === "a") this.applyLinkMark()
    this.dispatchEvent(new CustomEvent("mark-attribute-change", {
      detail: {mark, attribute, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected applyLinkMark() {
    if(!this.canMark || this.math?.active) return
    this.dispatchEvent(new CustomEvent("ribbon-button-click", {
      detail: {label: "mark:a", apply: true, keepDrawerOpen: true},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderMarkAttribute(mark: MarkName, option: MarkAttributeOption) {
    return html`
      <label class=${`mark-attribute${mark === "a" && option.name === "href" ? " mark-attribute-link" : ""}`}>
        <span>${option.label}</span>
        ${option.options ? html`<select
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          .value=${this.markAttributes[mark]?.[option.name] ?? option.options[0]?.value ?? ""}
          ?data-ribbon-input-persistent=${mark === "a"}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
        >${option.options.map(item => html`<option value=${item.value}>${item.label}</option>`)}</select>` : html`<input
          type=${option.inputType ?? "text"}
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          placeholder=${option.placeholder}
          .value=${this.markAttributes[mark]?.[option.name] ?? ""}
          ?data-ribbon-input-persistent=${mark === "a"}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
        />`}
      </label>
    `
  }

  protected renderDropdownAttribute(mark: MarkName, option: MarkAttributeOption, active = true) {
    if(option.options) return html`
      <select
        class="mark-dropdown-attribute"
        ?data-ribbon-input-persistent=${mark === "a"}
        aria-label=${`${this.markOption(mark).label}: ${option.label}`}
        title=${option.label}
        .value=${this.markAttributes[mark]?.[option.name] ?? option.options[0]?.value ?? ""}
        ?disabled=${!this.canMark || !active}
        @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
      >${option.options.map(item => html`<option value=${item.value}>${item.label}</option>`)}</select>
    `
    return html`
      <input
        class="mark-dropdown-attribute"
        ?data-ribbon-input-persistent=${mark === "a"}
        type=${option.inputType ?? "text"}
        aria-label=${`${this.markOption(mark).label}: ${option.label}`}
        placeholder=${option.placeholder}
        title=${option.label}
        .value=${this.markAttributes[mark]?.[option.name] ?? ""}
        ?disabled=${!this.canMark || !active}
        @focus=${() => { if(mark === "a" && option.name === "href") this.applyLinkMark() }}
        @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
      />
    `
  }

  protected renderLinkDropdown() {
    const download = this.markAttributes.a?.download
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Link options">
        <fieldset ?disabled=${!this.canMark || this.math?.active}>
        <div class="link-options" role="group" aria-label="Link behavior">
          <label class="mark-attribute">
            <span>Open in new tab</span>
            <input type="checkbox" aria-label="Link: Open in new tab" data-ribbon-input-persistent
              .checked=${this.markAttributes.a?.target === "_blank"}
              ?disabled=${!this.canMark}
              @change=${(event: Event) => this.dispatchMarkAttribute("a", "target", event)} />
          </label>
          <label class="mark-attribute link-option-download">
            <span>Download</span>
            <input type="checkbox" aria-label="Link: Download" data-ribbon-input-persistent
              .checked=${download !== undefined}
              ?disabled=${!this.canMark}
              @change=${(event: Event) => this.dispatchMarkAttribute("a", "download", event)} />
          </label>
          ${download !== undefined ? html`<div class="link-download-filename">
            ${this.renderMarkAttribute("a", {name: "download", label: "Filename", placeholder: "Filename"})}
          </div>` : ""}
        </div>
        </fieldset>
      </div>
    `
  }

  protected spanGroupMembers() {
    return (mergedMarkGroupFor("span")?.members ?? []).filter(mark => !excludedMarkNames.includes(mark))
  }

  protected activeSpanMarks() {
    return (mergedMarkGroupFor("span")?.members ?? []).filter(mark => this.marks.includes(mark))
  }

  protected spanSelectedMarks() {
    return this.spanMarkSelectionSynced ? this.spanMarkSelection : this.activeSpanMarks()
  }

  protected sameMarkSet(first: readonly MarkName[], second: readonly MarkName[]) {
    return first.length === second.length && first.every(mark => second.includes(mark))
  }

  protected syncSpanMarkSelection() {
    const active = this.activeSpanMarks()
    if(!this.sameMarkSet(this.spanMarkSelection, active)) this.spanMarkSelection = active
    this.spanMarkSelectionSynced = true
  }

  protected toggleSpanMark(mark: MarkName) {
    if(!this.canMark) return
    const selected = this.spanSelectedMarks()
    const next = selected.includes(mark)
      ? selected.filter(candidate => candidate !== mark)
      : [...selected, mark]
    if(this.sameMarkSet(selected, next)) return
    this.spanMarkSelection = next
    this.spanMarkSelectionSynced = true
    this.requestUpdate()
    this.dispatchEvent(new CustomEvent("ribbon-combobox-change", {
      detail: {name: "mark-types", value: next[0] ?? "", values: next},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderSpanMarkOption(mark: MarkName, selected: readonly MarkName[]) {
    const option = this.markOption(mark)
    const attributes = markAttributeOptionsFor(mark)
    const active = selected.includes(mark)
    const shortcut = this.commandShortcut(`mark:${mark}`)
    return html`
      <div
        class="mark-dropdown-option"
        role="option"
        aria-selected=${active}
      >
        <input
          type="checkbox"
          data-ribbon-input-persistent
          aria-label=${`Select ${option.label}`}
          .checked=${active}
          ?disabled=${!this.canMark || this.svgText}
          @change=${(event: Event) => {
            this.toggleSpanMark(mark)
            const input = event.currentTarget as HTMLInputElement
            input.checked = this.spanSelectedMarks().includes(mark)
          }}
        />
        <span class="mark-dropdown-option-icon" aria-hidden="true">${ribbonIcon(option.icon)}</span>
        <span class="mark-dropdown-option-name">${option.label}</span>
        ${attributes.length ? html`
          <span class="mark-dropdown-attributes" aria-hidden=${!active}>
            ${attributes.map(attribute => this.renderDropdownAttribute(mark, attribute, active))}
          </span>
        ` : ""}
        ${shortcut ? html`<span class="mark-dropdown-shortcut">${shortcut}</span>` : ""}
      </div>
    `
  }

  protected renderSpanDropdown(selected: readonly MarkName[]) {
    const linkActive = this.marks.includes("a")
    const href = markAttributeOptionsFor("a").find(option => option.name === "href")
    return html`
      <div class="mark-dropdown-list" role="listbox" aria-label="Advanced mark types" aria-multiselectable="true">
        <div class="mark-dropdown-option mark-dropdown-option-link" role="option" aria-selected=${linkActive}>
          <input type="checkbox" data-ribbon-input-persistent aria-label="Select Link"
            .checked=${linkActive} ?disabled=${!this.canMark || this.math?.active}
            @change=${() => this.dispatchEvent(new CustomEvent("ribbon-button-click", {
              detail: {label: "mark:a", keepDrawerOpen: true}, bubbles: true, composed: true,
            }))} />
          <span class="mark-dropdown-option-icon" aria-hidden="true">${ribbonIcon("MarkLink")}</span>
          <span class="mark-dropdown-option-name">Link</span>
          ${href ? html`<span class="mark-dropdown-link-url">${this.renderDropdownAttribute("a", href, !this.math?.active)}</span>` : ""}
          ${this.commandShortcut("mark:a") ? html`<span class="mark-dropdown-shortcut">${this.commandShortcut("mark:a")}</span>` : ""}
        </div>
        ${this.renderLinkDropdown()}
        ${this.spanGroupMembers().map(mark => this.renderSpanMarkOption(mark, selected))}
      </div>
    `
  }

  protected renderFormulaButton() {
    return html`
      <ribbon-button
        class="mark-formula"
        style="grid-column: 8; grid-row: 1"
        label="Formula"
        action="Formula"
        icon="Formula"
        shortcut=${this.commandShortcut("Formula")}
        .submenu=${insertMathStructureButtons}
      ></ribbon-button>
    `
  }

  protected renderSpanButton() {
    const selected = this.spanSelectedMarks().filter(mark =>
      this.spanGroupMembers().includes(mark)
    )
    return html`
      <ribbon-button
        class="mark-span"
        style="grid-column: 8; grid-row: 2"
        toggle
        label="Link"
        icon="MarkLink"
        action="mark:a"
        .selectionCount=${selected.length}
        .dropdown=${this.renderSpanDropdown(selected)}
        ?active=${this.marks.includes("a") || selected.length > 0}
        ?disabled=${!this.canMark || this.math?.active}
      ></ribbon-button>
    `
  }

  protected renderMarkDrawer() {
    return html`
      <ribbon-drawer
        label="Marks"
        icon="MarkBold"
        layout="marks"
      >
        <ribbon-combobox
          class="font-family"
          name="font-family"
          label="Font family"
          default-value-label="Font"
          .options=${fontFamilyOptions}
          .value=${this.markStyles["font-family"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-combobox
          class="font-size"
          name="font-size"
          label="Font size"
          default-value-label="Size"
          .options=${fontSizeOptions}
          .value=${this.markStyles["font-size"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-button
          compact
          label="Increase font size"
          action="increaseFontSize"
          icon="IncreaseFontSize"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        <ribbon-button
          compact
          label="Decrease font size"
          action="decreaseFontSize"
          icon="DecreaseFontSize"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        <ribbon-combobox
          class="mark-text-color"
          style="grid-column: 1; grid-row: 2"
          name="color"
          label="Text color"
          variant="color"
          .options=${textColorOptions}
          .value=${this.markStyles.color ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        <ribbon-combobox
          class="mark-background-color"
          style="grid-column: 2; grid-row: 2"
          name="background-color"
          label="Text background color"
          variant="color"
          .options=${backgroundColorOptions}
          .value=${this.markStyles["background-color"] ?? ""}
          ?disabled=${!this.canMark}
        ></ribbon-combobox>
        ${primaryDrawerMarkNames.map(mark => this.visibleMarkButton(mark))}
        <ribbon-button
          class="mark-remove"
          style="grid-column: 7; grid-row: 2"
          compact
          label="Remove formatting"
          action="removeMarks"
          icon="RemoveMarks"
          ?disabled=${!this.canMark}
        ></ribbon-button>
        ${this.renderFormulaButton()}
        ${this.renderSpanButton()}
      </ribbon-drawer>
    `
  }

  protected dispatchSectionType(event: Event) {
    const section = (event.currentTarget as HTMLSelectElement).value as SectionName
    this.dispatchEvent(new CustomEvent("section-type-change", {
      detail: {section},
      bubbles: true,
      composed: true,
    }))
  }

  protected get useStyleCombobox() { return false }

  protected renderOptionSelect(label: string, value: string, options: readonly {value: string, label: string}[],
    disabled: boolean, onChange: (value: string) => void) {
    if(this.useStyleCombobox) return html`<style-combobox .label=${label} .value=${value} .editable=${false}
      .options=${options} .disabled=${disabled}
      @combobox-change=${(event: CustomEvent<{value: string}>) => onChange(event.detail.value)}></style-combobox>`
    return html`<select aria-label=${label} .value=${value} ?disabled=${disabled}
      @change=${(event: Event) => onChange((event.currentTarget as HTMLSelectElement).value)}>
      ${options.map(option => html`<option value=${option.value} ?selected=${option.value === value}>${option.label}</option>`)}
    </select>`
  }

  protected renderSectionTypeSelect(label = "Section type") {
    return html`
      <label class="mark-attribute section-type-select">
        <span>${label}</span>
        ${this.renderOptionSelect(label, this.sectionType, sectionOptions, !this.canSection, section =>
          this.dispatchEvent(new CustomEvent("section-type-change", {detail: {section}, bubbles: true, composed: true})))}
      </label>
    `
  }

  protected renderSectionControls() {
    return html`
        ${this.renderSectionTypeSelect()}
        <ribbon-button
          label="Add outer section"
          action="section-add"
          icon="Plus"
          ?disabled=${!this.sectionSelected}
        ></ribbon-button>
        <ribbon-button
          label="Remove section"
          action="section-remove"
          icon="RemoveMarks"
          ?disabled=${!this.sectionSelected}
        ></ribbon-button>
        ${this.sectionType === "blockquote" && this.elementAttributes?.localName === "blockquote" ? html`
          <label class="mark-attribute">
            <span>Citation</span>
            <input
              type="url"
              placeholder="https://…"
              .value=${this.elementAttributes.attributes.cite ?? ""}
              @change=${(event: Event) => this.dispatchSelectedElementAttribute("cite", (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        ` : ""}
        ${this.sectionType === "figure" && this.figure ? this.renderFigureCaptionControls() : ""}
    `
  }

  protected renderSectionDrawer() {
    return html`
      <ribbon-drawer label="Section" icon="Section" layout="section">
        ${this.renderSectionControls()}
      </ribbon-drawer>
    `
  }

  protected renderFigureCaptionControls() {
    return this.figure?.hasCaption ? html`
      <ribbon-button label="Edit caption" action="figure-caption-edit" icon="Pencil"></ribbon-button>
    ` : html`
      <ribbon-button label="Add caption above" action="figure-caption-before" icon="Plus"></ribbon-button>
      <ribbon-button label="Add caption below" action="figure-caption-after" icon="Plus"></ribbon-button>
    `
  }

  protected dispatchSelectedElementAttribute(name: string, value: string | null) {
    if(!this.elementAttributes) return
    this.dispatchEvent(new CustomEvent("element-attribute-change", {
      detail: {
        path: this.elementAttributes.path,
        localName: this.elementAttributes.localName,
        namespaceURI: this.elementAttributes.namespaceURI,
        name,
        value,
      },
      bubbles: true,
      composed: true,
    }))
  }

  protected dispatchListAttribute(name: "start" | "reversed" | "type" | "value", value: string | null) {
    this.dispatchEvent(new CustomEvent("list-attribute-change", {
      detail: {name, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderListNumberInput(name: "start" | "value", value: string, placeholder: string) {
    return html`<input type="number" .value=${value} placeholder=${placeholder}
      @change=${(event: Event) => this.dispatchListAttribute(name, (event.currentTarget as HTMLInputElement).value)} />`
  }

  protected renderListControls() {
    if(this.listType !== "ol" || !this.orderedList) return nothing
    return html`
        <label class="mark-attribute">
          <span>Start at</span>
          ${this.renderListNumberInput("start", this.orderedList.start, "Automatic")}
        </label>
        <label class="mark-attribute">
          <span>Numbering</span>
          ${this.renderOptionSelect("Numbering", this.orderedList.numbering,
            [{value: "", label: "Automatic"}, {value: "1", label: "1, 2, 3"}, {value: "a", label: "a, b, c"},
              {value: "A", label: "A, B, C"}, {value: "i", label: "i, ii, iii"}, {value: "I", label: "I, II, III"}],
            false, value => this.dispatchListAttribute("type", value))}
        </label>
        <label class="mark-attribute">
          <span>Count backwards</span>
          <input
            type="checkbox"
            .checked=${this.orderedList.reversed}
            @change=${(event: Event) => this.dispatchListAttribute("reversed", (event.currentTarget as HTMLInputElement).checked ? "" : null)}
          />
        </label>
        ${this.orderedList.itemValue !== undefined ? html`
          <label class="mark-attribute">
            <span>Item number</span>
            ${this.renderListNumberInput("value", this.orderedList.itemValue, "Continue sequence")}
          </label>
        ` : ""}
    `
  }

  protected renderListDrawer() {
    if(this.listType !== "ol" || !this.orderedList) return nothing
    return html`
      <ribbon-drawer label="List" icon="Enumeration" layout="form">
        ${this.renderListControls()}
      </ribbon-drawer>
    `
  }

  protected get paragraphSelected() {
    return this.elementAttributes?.namespaceURI === "http://www.w3.org/1999/xhtml"
      && (this.elementAttributes.localName === "p" || this.elementAttributes.localName === "pre")
  }

  protected renderHeadingGroupDrawer() {
    if(!this.headingGroup) return nothing
    return html`
      <ribbon-drawer label="Heading group" icon="Heading" layout="form">
        <label class="mark-attribute">
          <span>Heading level</span>
          <select
            .value=${this.headingGroup.heading ?? "h1"}
            @change=${(event: Event) => this.dispatchEvent(new CustomEvent("heading-group-level-change", {
              detail: {level: (event.currentTarget as HTMLSelectElement).value},
              bubbles: true,
              composed: true,
            }))}
          >${[1, 2, 3, 4, 5, 6].map(level => html`<option value=${`h${level}`}>Heading ${level}</option>`)}</select>
        </label>
        <ribbon-button label="Add text above" action="heading-group-add-before" icon="Plus"></ribbon-button>
        <ribbon-button label="Add text below" action="heading-group-add-after" icon="Plus"></ribbon-button>
      </ribbon-drawer>
    `
  }

  protected updateCommentDraft(event: Event) {
    this.commentDraft = (event.currentTarget as HTMLTextAreaElement).value
  }

  protected commitCommentText() {
    if(!this.commentState.active || this.commentDraft === this.commentState.text) return
    this.dispatchEvent(new CustomEvent("comment-action", {
      detail: {action: "set-text", text: this.commentDraft},
      bubbles: true,
      composed: true,
    }))
  }

  protected handleCommentButton(event: Event) {
    event.stopPropagation()
    const action = (event as CustomEvent<{label?: string}>).detail?.label
    if(!["toggle", "remove-all", "previous", "next"].includes(action ?? "")) return
    this.dispatchEvent(new CustomEvent("comment-action", {
      detail: {action, text: this.commentDraft},
      bubbles: true,
      composed: true,
    }))
  }

  protected changeCommentHighlighting(event: Event) {
    this.dispatchEvent(new CustomEvent("comment-action", {
      detail: {
        action: "highlight",
        enabled: (event.currentTarget as HTMLInputElement).checked,
      },
      bubbles: true,
      composed: true,
    }))
  }

  protected renderCommentDrawer() {
    const {active, activeCount, canComment, count, highlighting} = this.commentState
    return html`
      <ribbon-drawer label="Comments" icon="Comments" layout="comments" @ribbon-button-click=${this.handleCommentButton}>
        <div class="comment-editor">
          <span class="comment-editor-header">
            <span>Comment${activeCount > 1 ? ` (${activeCount} selected)` : ""}</span>
            <label class="comment-highlight-toggle">
              <input
                type="checkbox"
                data-ribbon-input-persistent
                .checked=${highlighting}
                @change=${this.changeCommentHighlighting}
              >
              Highlight
            </label>
          </span>
          <textarea
            aria-label="Comment text"
            data-ribbon-input-persistent
            rows="2"
            placeholder=${active ? "Comment text" : "Add a comment…"}
            .value=${this.commentDraft}
            ?disabled=${!canComment}
            @input=${this.updateCommentDraft}
            @change=${this.commitCommentText}
          ></textarea>
        </div>
        <ribbon-button
          compact
          toggle
          label=${active ? "Remove comment" : "Add comment"}
          action="toggle"
          icon="Comments"
          ?active=${active}
          ?disabled=${!canComment}
        ></ribbon-button>
        <ribbon-button compact label="Remove all" action="remove-all" icon="RemoveMarks" ?disabled=${count === 0}></ribbon-button>
        <ribbon-button compact label="Previous comment" action="previous" icon="Previous" ?disabled=${count === 0}></ribbon-button>
        <ribbon-button compact label="Next comment" action="next" icon="Next" ?disabled=${count === 0}></ribbon-button>
      </ribbon-drawer>
    `
  }

  protected get selectedLocalPackage() {
    return this.localPackages.find(pkg => pkg.name === this.selectedLocalPackageName) ?? this.localPackages[0]
  }

  protected get localPackageSelectionName() {
    return this.selectedLocalPackage?.name ?? ""
  }

  protected selectLocalPackageByName(name: string) {
    const accepted = this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: `local-package-select:${name}`},
      bubbles: true,
      composed: true,
      cancelable: true,
    }))
    if(accepted) this.selectedLocalPackageName = name
  }

  protected localPackageMetadataChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement
    if(input instanceof HTMLInputElement && !input.checkValidity()) {
      input.reportValidity()
      return
    }
    this.dispatchEvent(new CustomEvent<{field: string, value: string}>("local-package-metadata-change", {
      detail: {field: input.name, value: input.value},
      bubbles: true,
      composed: true,
    }))
  }

  protected localPackageExportChange = (
    exportName: string,
    field: "type" | "name" | "source",
    event: Event,
  ) => {
    const value = (event.currentTarget as HTMLInputElement | HTMLSelectElement).value
    if(field !== "source" && !this.prepareLocalPackageStructureChange(event)) return
    this.dispatchEvent(new CustomEvent("local-package-export-change", {
      detail: {exportName, field, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected prepareLocalPackageStructureChange(_event: Event) { return true }

  protected addLocalPackageExport = () => {
    this.dispatchEvent(new Event("local-package-export-add", {bubbles: true, composed: true}))
  }

  protected deleteLocalPackageExport = (exportName: string) => {
    this.dispatchEvent(new CustomEvent("local-package-export-delete", {
      detail: {exportName},
      bubbles: true,
      composed: true,
    }))
  }

  protected pickLocalPackageExportFile = (exportName: string) => {
    this.dispatchEvent(new CustomEvent("local-package-export-file-pick", {
      detail: {exportName},
      bubbles: true,
      composed: true,
    }))
  }

  protected localPackageContributorChange = (index: number, event: Event) => {
    this.dispatchEvent(new CustomEvent("local-package-contributor-change", {
      detail: {index, value: (event.currentTarget as HTMLInputElement).value},
      bubbles: true,
      composed: true,
    }))
  }

  protected addLocalPackageContributor = () => {
    this.dispatchEvent(new Event("local-package-contributor-add", {bubbles: true, composed: true}))
  }

  protected deleteLocalPackageContributor = (index: number) => {
    this.dispatchEvent(new CustomEvent("local-package-contributor-delete", {
      detail: {index},
      bubbles: true,
      composed: true,
    }))
  }

  private handlePackageLoadMenu(event: Event) {
    if((event as CustomEvent<{label: string}>).detail.label !== "git-package-add") return
    event.stopPropagation()
    this.renderRoot.querySelector<HTMLDialogElement>(".git-package-dialog")?.showModal()
  }

  private loadGitPackage(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    this.dispatchEvent(new CustomEvent("git-package-load", {bubbles: true, composed: true,
      detail: {repository: String(data.get("repository")).trim(), ref: String(data.get("ref")).trim(), path: String(data.get("path")).trim()}}))
    form.closest("dialog")!.close()
  }

  private showPackageSource(event: Event) {
    const button = event.currentTarget as HTMLElement
    const popup = button.closest("li")?.querySelector<HTMLElement>(".package-source-popup")
    if(!popup || typeof popup.showPopover !== "function") return
    popup.showPopover()
    const rect = button.getBoundingClientRect()
    popup.style.left = `${Math.max(8, Math.min(rect.right, window.innerWidth - popup.offsetWidth - 8))}px`
    popup.style.top = `${Math.max(8, rect.top - popup.offsetHeight - 4)}px`
  }

  private hidePackageSource(event: Event) {
    const button = event.currentTarget as HTMLElement
    button.closest("li")?.querySelector<HTMLElement>(".package-source-popup")?.hidePopover?.()
  }

  protected renderDevelopDrawer() {
    const displayPackages = this.localPackages
    return html`
      <aside class="local-packages-drawer" aria-label="Local packages">
        <nav class="local-package-list" aria-label="Choose a local package">
          <ul>
            ${displayPackages.map((pkg, index) => html`<li>
              <button type="button" class="local-package-item"
                aria-pressed=${this.localPackageSelectionName === pkg.name}
                @click=${() => this.selectLocalPackageByName(pkg.name)}
              ><span class="local-package-name">${pkg.name}</span><span class="local-package-version">${pkg.version}</span></button>
              <span class="local-package-icon-stack">
                <span class="local-package-icon" aria-hidden="true">${pkg.iconUrl ? html`<img src=${pkg.iconUrl} alt="" />` : ribbonIcon("Packages")}</span>
                <span class="local-package-source" tabindex="0" role="img" aria-label=${`${pkg.developerSource?.kind === "git" ? "Git" : "Folder"} source of ${pkg.name}`}
                  aria-describedby=${`package-source-${index}`}
                  @mouseenter=${this.showPackageSource} @mouseleave=${this.hidePackageSource}
                  @focus=${this.showPackageSource} @blur=${this.hidePackageSource}
                >${ribbonIcon(pkg.developerSource?.kind === "git" ? "Git" : "Open")}</span>
              </span>
              <button type="button" class="local-package-remove" aria-label=${`Remove ${pkg.name}`} title="Remove package"
                ?disabled=${this.localPackagesLoading}
                @click=${() => this.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: `local-package-remove:${pkg.name}`}, bubbles: true, composed: true}))}
              >${ribbonIcon("Reject")}</button>
              <button type="button" class="local-package-refresh" aria-label=${`Refresh ${pkg.name}`} title="Refresh from source"
                aria-busy=${this.localPackageRefreshingNames.includes(pkg.name)}
                ?disabled=${this.localPackagesLoading || this.localPackageRefreshingNames.includes(pkg.name)}
                @click=${() => this.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: `local-package-refresh:${pkg.name}`}, bubbles: true, composed: true}))}
              >${this.localPackageRefreshingNames.includes(pkg.name) ? html`<span class="package-refresh-spinner" aria-hidden="true"></span>` : ribbonIcon("Refresh")}</button>
              <aside id=${`package-source-${index}`} class="package-source-popup" role="tooltip" popover="manual">
                ${pkg.developerSource?.kind === "git" ? html`<span>${pkg.developerSource.repository}</span><small>${pkg.developerSource.ref || "Default branch"}${pkg.developerSource.path ? ` · ${pkg.developerSource.path}` : ""}</small>`
                  : pkg.developerSource?.path || pkg.label}
              </aside>
            </li>`)}
          </ul>
          ${!displayPackages.length ? html`<span class="package-status">${this.localPackagesLoading ? "Loading packages…" : "No local packages"}</span>` : ""}
        </nav>
        <div class="local-package-actions">
          <ribbon-button
            label="Add package"
            action="local-package-add"
            .submenu=${[{label: "Add from local folder", action: "local-package-add", icon: "Open"}, {label: "Add from Git repository", action: "git-package-add", icon: "Git"}, {label: "Create new package", action: "local-package-new", icon: "PackagePlus"}]}
            @ribbon-button-click=${this.handlePackageLoadMenu}
            icon="Plus"
            variant="toolbar"
            package-add
            keep-drawer-open
          ></ribbon-button>
        </div>
        <dialog class="git-package-dialog" aria-labelledby="git-package-title">
          <form @submit=${this.loadGitPackage}>
            <strong id="git-package-title">Load Git package</strong>
            <label>Repository URL<input name="repository" type="url" required placeholder="https://github.com/owner/repository.git" /></label>
            <label>Branch or tag<input name="ref" type="text" placeholder="Default branch" /></label>
            <label>Package folder<input name="path" type="text" placeholder="Repository root" /></label>
            <small>Public repositories only. Git package contents are read-only.</small>
            <div><button type="button" @click=${(event: Event) => (event.currentTarget as HTMLElement).closest("dialog")!.close()}>Cancel</button><button type="submit">Load</button></div>
          </form>
        </dialog>
      </aside>
    `
  }

  private addLocalPackageKeyword(event: Event) {
    const target = event.currentTarget as HTMLElement
    const input = target instanceof HTMLInputElement ? target : target.parentElement!.querySelector<HTMLInputElement>("input")!
    const value = input.value.trim()
    if(!value) return
    this.dispatchEvent(new CustomEvent("local-package-keyword-change", {
      detail: {operation: "add", value}, bubbles: true, composed: true,
    }))
    input.value = ""
    input.focus()
  }

  private removeLocalPackageKeyword(value: string) {
    if(value === "webwriter-widget") return
    this.dispatchEvent(new CustomEvent("local-package-keyword-change", {
      detail: {operation: "remove", value}, bubbles: true, composed: true,
    }))
  }

  private localPackageEditingOptionChange(key: string, option: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    this.dispatchEvent(new CustomEvent("local-package-editing-option-change", {
      detail: {key, option, value: input.value}, bubbles: true, composed: true,
    }))
  }

  private renderPackageEditingFields(key: string, config: Record<string, unknown> = {}) {
    const textOptions = key === "."
      ? [["label", "Display label"], ["description", "Display description"]]
      : [["label", "Display label"], ["description", "Display description"], ["group", "Group"], ["content", "Content"], ["marks", "Allowed marks"], ["propagateEvents", "Propagated events"]]
    return html`
      ${textOptions.map(([option, label]) => html`<label class="develop-field">
        <span class="develop-field-label">${label}</span>
        <input type="text" data-editing-key=${key} data-editing-option=${option}
          .value=${option === "propagateEvents" && Array.isArray(config[option]) ? config[option].join(", ") : packageMetadataText(config[option])}
          placeholder=${option === "marks" ? "_ (all marks)" : option === "propagateEvents" ? "click, input" : ""}
          @change=${(event: Event) => this.localPackageEditingOptionChange(key, option, event)} />
        ${option === "label" || option === "description" ? html`<span class="develop-field-help">Text or JSON translations by language</span>` : nothing}
      </label>`)}
      ${key === "." ? nothing : [["uninsertable", "Prevent insertion"], ["inline", "Inline"], ["isolating", "Isolating"], ["sharedData", "Shared data"]].map(([option, label]) => html`<label class="develop-field">
        <span class="develop-field-label">${label}</span>
        <select data-editing-key=${key} data-editing-option=${option} .value=${config[option] === undefined ? "" : String(config[option])}
          @change=${(event: Event) => this.localPackageEditingOptionChange(key, option, event)}>
          <option value="" ?selected=${config[option] === undefined}>Default</option><option value="true" ?selected=${config[option] === true}>Yes</option><option value="false" ?selected=${config[option] === false}>No</option>
        </select>
      </label>`)}
    `
  }

  protected renderMetadataDrawer() {
    const pkg = this.selectedLocalPackage
    const manifest = pkg?.manifest
    const editingConfig = normalizeEditingConfig(manifest?.editingConfig)
    const author = manifest ? manifest.author : pkg?.authors[0]
    const keywords = ["webwriter-widget", ...new Set((manifest?.keywords ?? pkg?.keywords ?? []).filter(keyword => keyword !== "webwriter-widget"))]
    const contributors = manifest?.contributors ?? []
    const packageExports = Object.entries(manifest?.exports ?? {})
      .map(([exportName, target]) => ({exportName, descriptor: describePackageExport(exportName, target)}))
      .sort((a, b) => webWriterPackageExportTypes.findIndex(type => type.value === a.descriptor.type)
        - webWriterPackageExportTypes.findIndex(type => type.value === b.descriptor.type))
    return html`
      <ribbon-drawer label="Metadata" icon="Properties" layout="metadata" hide-pane-label>
        ${pkg ? html`<fieldset class="develop-fields" ?disabled=${pkg.developerSource?.kind === "git"}>
          <section class="develop-section" aria-labelledby="develop-package-fields">
            <span id="develop-package-fields" class="develop-section-title">Package</span>
            <label class="develop-field">
              <span class="develop-field-label">Name</span>
              <input type="text" name="name" .value=${manifest?.name ?? pkg.name} .pattern=${scopedPackageNamePattern} required @change=${this.localPackageMetadataChange} />
            </label>
            <label class="develop-field">
              <span class="develop-field-label">Version</span>
              <input type="text" name="version" .value=${manifest?.version ?? pkg.version} .pattern=${semanticVersionPattern} required @change=${this.localPackageMetadataChange} />
              <span class="develop-field-help">Semantic version, for example 1.2.0</span>
            </label>
            <label class="develop-field">
              <span class="develop-field-label">Description</span>
              <textarea name="description" .value=${manifest ? manifest.description ?? "" : pkg.description ?? ""} @change=${this.localPackageMetadataChange}></textarea>
            </label>
            <label class="develop-field">
              <span class="develop-field-label">License</span>
              <document-head-combobox label="License" placeholder="SPDX identifier or custom license"
                .value=${manifest?.license ?? pkg.license ?? ""} .options=${packageLicenseOptions}
                .disabled=${pkg.developerSource?.kind === "git"}
                @combobox-change=${(event: CustomEvent<{value: string}>) => this.dispatchEvent(new CustomEvent("local-package-metadata-change", {
                  detail: {field: "license", value: event.detail.value}, bubbles: true, composed: true,
                }))}
              ></document-head-combobox>
            </label>
            <details class="develop-compact-details">
              <summary><span>Keywords</span><span>${keywords.length}</span></summary>
              <ul class="develop-keyword-list" aria-label="Keywords">
                ${keywords.map(keyword => html`<li class="develop-keyword-entry ${keyword === "webwriter-widget" ? "required" : ""}">
                  <span>${keyword}</span>
                  ${keyword === "webwriter-widget" ? nothing : html`<button class="develop-icon-button" type="button" aria-label=${`Remove keyword ${keyword}`} title="Remove keyword" @click=${() => this.removeLocalPackageKeyword(keyword)}>${ribbonIcon("Reject")}</button>`}
                </li>`)}
                <li class="develop-field">
                  <div class="develop-keyword-add">
                    <input type="text" name="newKeyword" aria-label="New keyword" placeholder="Add keyword"
                      @keydown=${(event: KeyboardEvent) => {
                        if(event.key !== "Enter" || event.isComposing) return
                        event.preventDefault()
                        event.stopPropagation()
                        this.addLocalPackageKeyword(event)
                      }} />
                    <button class="develop-icon-button" type="button" aria-label="Add keyword" title="Add keyword" @click=${this.addLocalPackageKeyword}>${ribbonIcon("Accept")}</button>
                  </div>
                </li>
              </ul>
            </details>
            <div class="develop-section-title-row">
              <span class="develop-field-label">Author</span>
              <button class="develop-icon-button" type="button" aria-label="Add contributor" title="Add contributor" @click=${this.addLocalPackageContributor}>${ribbonIcon("Plus")}</button>
            </div>
            <label class="develop-field">
              <input type="text" name="author" .value=${packagePersonText(author)} placeholder="Name &lt;email&gt;" @change=${this.localPackageMetadataChange} />
            </label>
            ${contributors.length ? html`<div class="develop-contributors">
              ${contributors.map((contributor, index) => html`
                <div class="develop-contributor-row">
                  <input
                    type="text"
                    aria-label=${`Contributor ${index + 1}`}
                    .value=${packagePersonText(contributor)}
                    placeholder="Name &lt;email&gt;"
                    @change=${(event: Event) => this.localPackageContributorChange(index, event)}
                  />
                  <button
                    class="develop-icon-button"
                    type="button"
                    aria-label=${`Delete contributor ${index + 1}`}
                    title="Delete contributor"
                    @click=${() => this.deleteLocalPackageContributor(index)}
                  >${ribbonIcon("Delete")}</button>
                </div>
              `)}
            </div>` : ""}
            ${this.renderPackageEditingFields(".", editingConfig["."])}
          </section>

          <section class="develop-section" aria-labelledby="develop-export-fields">
            <div class="develop-section-title-row">
              <span id="develop-export-fields" class="develop-section-title">Exports</span>
              <button class="develop-icon-button" type="button" aria-label="Create export" title="Create export" @click=${this.addLocalPackageExport}>${ribbonIcon("Plus")}</button>
            </div>
            <div class="develop-export-list">
              ${packageExports.length ? repeat(packageExports, item => `${pkg.name}/${item.exportName}`, ({exportName, descriptor}) => {
                const fixedName = ["migration", "icon", "editing-config", "custom-elements"].includes(descriptor.type)
                return html`
                  <article class="develop-export-card" data-export-name=${exportName}>
                    <details class="develop-export-details">
                      <summary class="develop-export-card-header">
                        <span class="develop-export-type-icon" aria-hidden="true" title=${webWriterPackageExportTypes.find(type => type.value === descriptor.type)!.label}>${ribbonIcon(packageExportIcons[descriptor.type])}</span>
                        <span class="develop-export-card-title" title=${exportName}>${exportName}</span>
                      </summary>
                      <div class="develop-export-card-fields">
                        <label class="develop-field">
                          <span class="develop-field-label">Type</span>
                          <select name="exportType" .value=${descriptor.type} @change=${(event: Event) => this.localPackageExportChange(exportName, "type", event)}>
                            ${webWriterPackageExportTypes.map(type => html`<option value=${type.value} ?selected=${type.value === descriptor.type}>${type.label}</option>`)}
                          </select>
                        </label>
                        <label class="develop-field">
                          <span class="develop-field-label">Name</span>
                          <input
                            type="text"
                            name="exportName"
                            .value=${descriptor.name}
                            ?disabled=${fixedName}
                            title=${fixedName ? "This export type has a fixed package name" : ""}
                            required
                            @change=${(event: Event) => this.localPackageExportChange(exportName, "name", event)}
                          />
                        </label>
                        <label class="develop-field">
                          <span class="develop-field-label">Source path</span>
                          <span class="develop-export-source-row">
                            <input
                              type="text"
                              .value=${descriptor.source}
                              placeholder="./src/file.ts"
                              required
                              @change=${(event: Event) => this.localPackageExportChange(exportName, "source", event)}
                            />
                            <button
                              class="develop-icon-button"
                              type="button"
                              aria-label=${`Choose source file for ${exportName}`}
                              title="Choose source file"
                              @click=${() => this.pickLocalPackageExportFile(exportName)}
                            >${ribbonIcon("Open")}</button>
                          </span>
                        </label>
                        ${this.renderPackageEditingFields(editingConfigKey(exportName), editingConfig[editingConfigKey(exportName)])}
                      </div>
                    </details>
                    <button
                      class="develop-icon-button develop-export-delete"
                      type="button"
                      aria-label=${`Delete export ${exportName}`}
                      title="Delete export"
                      @click=${() => this.deleteLocalPackageExport(exportName)}
                    >${ribbonIcon("Delete")}</button>
                  </article>
                `
              }) : html`<span class="develop-empty">No exports</span>`}
            </div>
            <label class="develop-field">
              <span class="develop-field-label">Custom elements manifest</span>
              <input type="text" name="customElements" .value=${manifest?.customElements ?? ""} placeholder="custom-elements.json" @change=${this.localPackageMetadataChange} />
            </label>
          </section>

        </fieldset>` : html`<span class="develop-empty">Select a package</span>`}
      </ribbon-drawer>
    `
  }

  protected renderLocalPackageChecks(pkg: WebWriterPackage) {
    const warnings = this.localPackageWarnings[pkg.name] ?? []
    const loaded = Boolean(pkg.manifest && Object.hasOwn(this.localPackageWarnings, pkg.name))
    const runtimeChecked = Object.hasOwn(this.localPackageRuntimeWarnings, pkg.name)
    const checks: {label: string, codes: LocalPackageWarning["code"][], checked: boolean}[] = [
      {label: "Package metadata loaded", codes: [], checked: loaded},
      {label: "Widget or snippet bundle available", codes: ["missing-bundle"], checked: loaded},
      {label: "Configured exports available", codes: ["missing-export"], checked: loaded},
      {label: "Editing configuration readable", codes: ["editing-config-unavailable", "invalid-editing-config"], checked: loaded},
      {label: "Editing options valid", codes: ["unknown-editing-option", "invalid-editing-option"], checked: loaded},
      {label: "Editing entries match exports", codes: ["unmatched-editing-config"], checked: loaded},
      {label: "Widget definitions valid", codes: ["invalid-widget"], checked: loaded},
      ...pkg.members.some(member => member.kind === "widget") ? [
        {label: "Widgets registered", codes: ["undefined-widget" as const], checked: runtimeChecked},
        {label: "Widget properties reflect to attributes", codes: ["unreflected-property" as const], checked: runtimeChecked},
      ] : [],
    ]
    return html`
      <section class="develop-section" aria-labelledby="develop-check-fields">
        <span id="develop-check-fields" class="develop-section-title">Checks</span>
        <ul class="develop-checklist">${checks.map(check => {
          const failures = warnings.filter(warning => check.codes.includes(warning.code))
          return failures.length ? failures.map(warning => html`<li class="develop-check" data-status="failed" data-code=${warning.code}>
            <span class="check-icon" aria-label="Failed">${ribbonIcon("Reject")}</span><span>${warning.message}</span></li>`)
            : html`<li class="develop-check" data-status=${check.checked ? "passed" : "pending"}>
              <span class="check-icon" aria-label=${check.checked ? "Passed" : "Not checked"}>${check.checked ? ribbonIcon("Accept") : "–"}</span>
              <span>${check.label}${check.checked ? "" : " (not checked)"}</span></li>`
        })}${warnings.filter(warning => !checks.some(check => check.codes.includes(warning.code))).map(warning => html`<li class="develop-check" data-status="failed" data-code=${warning.code}>
          <span class="check-icon" aria-label="Failed">${ribbonIcon("Reject")}</span><span>${warning.message}</span></li>`)}</ul>
      </section>
    `
  }

  protected renderLocalPackageTests(pkg: WebWriterPackage) {
    if(!pkg.tests?.length) return nothing
    return html`
      <section class="develop-section" aria-labelledby="develop-test-fields">
        <span id="develop-test-fields" class="develop-section-title">Tests</span>
        ${pkg.tests.map(test => {
          const result = this.localPackageTestResults[`${pkg.name}/${test.name}`]
          const running = result === "running"
          const summary = !result || running ? ""
            : result.status === "timeout" ? "Timed out"
            : result.status === "error" ? result.error ?? "Failed to run"
            : `${result.tests.filter(item => item.passed).length}/${result.tests.length} passed`
          const failures = result && !running ? result.tests.filter(item => !item.passed) : []
          return html`
            <div class="develop-test" data-status=${running ? "running" : result ? result.status : "idle"}>
              <div class="develop-section-title-row">
                <span class="develop-field-label">${test.name}</span>
                <button class="develop-icon-button" type="button" ?disabled=${running}
                  aria-label=${`Run test ${test.name}`} title="Run test"
                  @click=${() => this.dispatchEvent(new CustomEvent("local-package-test-run", {detail: {name: test.name}, bubbles: true, composed: true}))}
                >${ribbonIcon(running ? "Refresh" : "Preview")}</button>
              </div>
              ${summary ? html`<span class="develop-field-help" role="status">${summary}</span>` : nothing}
              ${failures.length ? html`<ul class="develop-checks">${failures.map(item => html`<li class="develop-check">${item.path.join(" › ")}${item.timedOut ? " (timed out)" : ""}</li>`)}</ul>` : nothing}
            </div>
          `
        })}
      </section>
    `
  }

  protected mediaSelectionMatches(type: MediaType) {
    if(type === "picture" || type === "img") return this.media?.type === "picture" || this.media?.type === "img"
    if(isWebsiteType(type)) return isWebsiteType(this.media?.type)
    return this.media?.type === type
  }

  protected mediaLabel(type: MediaType) {
    if(type === "picture" || type === "img") return "Image"
    if(type === "audio") return "Audio"
    if(type === "video") return "Video"
    return "Website"
  }

  protected renderMediaAttributeField(
    option: MediaAttributeOption,
    {
      attributes,
      label,
      onChange,
      disabled = false,
      selectFallback = "",
      className = "media-attribute",
    }: {
      attributes: Record<string, string>
      label: string
      onChange: (event: Event) => void
      disabled?: boolean
      selectFallback?: string
      className?: string
    },
  ) {
    if(option.kind === "boolean") return html`
      <label class=${`${className} media-attribute-boolean`}>
        <span>${option.label}</span>
        <input
          type="checkbox"
          data-ribbon-input-persistent
          aria-label=${label}
          .checked=${Object.hasOwn(attributes, option.name)}
          ?disabled=${disabled}
          @change=${onChange}
        />
      </label>
    `
    if(option.kind === "select") return html`
      <label class=${className}>
        <span>${option.label}</span>
        <select
          data-ribbon-input-persistent
          aria-label=${label}
          ?disabled=${disabled}
          @change=${onChange}
        >
          ${option.options?.map(item => html`
            <option
              value=${item.value}
              ?selected=${item.value === (attributes[option.name] ?? selectFallback)}
            >${item.label}</option>
          `)}
        </select>
      </label>
    `
    return html`
      <label class=${className}>
        <span>${option.label}</span>
        <input
          data-ribbon-input-persistent
          type=${option.kind === "url" ? "url" : option.kind === "number" ? "number" : "text"}
          aria-label=${label}
          placeholder=${option.placeholder ?? ""}
          .value=${attributes[option.name] ?? ""}
          ?disabled=${disabled}
          @change=${onChange}
        />
      </label>
    `
  }

  protected dispatchMediaAttribute(type: MediaType, option: MediaAttributeOption, event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    const value = option.kind === "boolean"
      ? (input as HTMLInputElement).checked ? "" : null
      : input.value || null
    this.dispatchEvent(new CustomEvent("media-attribute-change", {
      detail: {type, attribute: option.name, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderMediaAttribute(type: MediaType, option: MediaAttributeOption) {
    const active = this.mediaSelectionMatches(type)
    const attributes = active ? this.media?.attributes ?? {} : {}
    return this.renderMediaAttributeField(option, {
      attributes,
      label: `${this.mediaLabel(type)}: ${option.label}`,
      onChange: event => this.dispatchMediaAttribute(type, option, event),
      disabled: !active,
      className: "mark-attribute media-attribute",
    })
  }

  protected renderMediaAttributeOptions(type: MediaType, options: MediaAttributeOption[]) {
    const advancedNames = type === "picture" || type === "img"
      ? new Set(["loading", "decoding", "crossorigin", "referrerpolicy", "sizes", "srcset"])
      : type === "audio" || type === "video"
        ? new Set(["preload", "crossorigin", "playsinline"])
        : new Set(["loading", "sandbox", "allow", "referrerpolicy"])
    const primary = options.filter(option => !advancedNames.has(option.name))
    const advanced = options.filter(option => advancedNames.has(option.name))
    return html`
      ${primary.map(option => this.renderMediaAttribute(type, option))}
      ${advanced.length ? html`
        <details class="media-advanced-options">
          <summary>More options</summary>
          <div class="media-advanced-options-content">
            ${advanced.map(option => this.renderMediaAttribute(type, option))}
          </div>
        </details>
      ` : nothing}
    `
  }

  protected dispatchMediaResourceAction(detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent("media-resource-action", {
      detail: {type: this.media?.type, ...detail},
      bubbles: true,
      composed: true,
    }))
  }

  protected dispatchMediaResourceAttribute(
    resource: TimedMediaResourceType,
    row: TimedMediaResourceState,
    option: MediaAttributeOption,
    event: Event,
  ) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    const value = option.kind === "boolean"
      ? (input as HTMLInputElement).checked ? "" : null
      : input.value || null
    this.dispatchMediaResourceAction({
      action: "set-attribute",
      resource,
      index: row.index,
      expected: row.attributes,
      attribute: option.name,
      value,
    })
  }

  protected renderMediaResourceAttribute(
    resource: TimedMediaResourceType,
    row: TimedMediaResourceState,
    option: MediaAttributeOption,
  ) {
    const label = `${resource === "source" ? "Source" : "Track"}: ${option.label}`
    return this.renderMediaAttributeField(option, {
      attributes: row.attributes,
      label,
      onChange: event => this.dispatchMediaResourceAttribute(resource, row, option, event),
      selectFallback: option.options?.[0]?.value,
    })
  }

  protected renderMediaResourceList(resource: TimedMediaResourceType, rows: TimedMediaResourceState[]) {
    const singular = resource === "source" ? "source" : "track"
    const heading = resource === "source" ? "Sources" : "Text tracks"
    return html`
      <section class="media-resource-editor" aria-label=${heading}>
        <div class="media-resource-heading">
          <span>${heading}</span>
          <button
            class="media-resource-add"
            type="button"
            @click=${() => this.dispatchMediaResourceAction({action: "add", resource})}
          >Add ${singular}</button>
        </div>
        ${rows.map((row, position) => html`
          <div class="media-resource-card" data-resource=${resource}>
            <div class="media-resource-card-heading">
              <span>${resource === "source" ? "Source" : "Track"} ${position + 1}</span>
              <span class="media-resource-card-actions">
                <button
                  class="media-resource-action"
                  type="button"
                  aria-label=${`Move ${singular} ${position + 1} up`}
                  ?disabled=${position === 0}
                  @click=${() => this.dispatchMediaResourceAction({
                    action: "move", resource, index: row.index, expected: row.attributes, direction: -1,
                  })}
                >↑</button>
                <button
                  class="media-resource-action"
                  type="button"
                  aria-label=${`Move ${singular} ${position + 1} down`}
                  ?disabled=${position === rows.length - 1}
                  @click=${() => this.dispatchMediaResourceAction({
                    action: "move", resource, index: row.index, expected: row.attributes, direction: 1,
                  })}
                >↓</button>
                <button
                  class="media-resource-action"
                  type="button"
                  aria-label=${`Remove ${singular} ${position + 1}`}
                  @click=${() => this.dispatchMediaResourceAction({
                    action: "remove", resource, index: row.index, expected: row.attributes,
                  })}
                >×</button>
              </span>
            </div>
            ${timedMediaResourceAttributeOptions[resource]
              .map(option => this.renderMediaResourceAttribute(resource, row, option))}
          </div>
        `)}
      </section>
    `
  }

  protected renderTimedMediaResources() {
    if(!this.media || this.media.type !== "audio" && this.media.type !== "video") return nothing
    const fallbackHTML = this.media.fallbackHTML ?? ""
    return html`
      ${this.renderMediaResourceList("source", this.media.sources ?? [])}
      ${this.renderMediaResourceList("track", this.media.tracks ?? [])}
      <section class="media-resource-editor" aria-label="Fallback content">
        <label class="media-attribute">
          <span>Fallback content</span>
          <textarea
            class="media-fallback-input"
            data-ribbon-input-persistent
            aria-label="Fallback content"
            placeholder="Content shown when this media cannot be played"
            .value=${fallbackHTML}
            @change=${(event: Event) => this.dispatchMediaResourceAction({
              action: "set-fallback",
              html: (event.currentTarget as HTMLTextAreaElement).value,
              expectedHTML: fallbackHTML,
            })}
          ></textarea>
        </label>
        <p class="media-fallback-help">Shown when the browser cannot play this media. Basic HTML is supported.</p>
      </section>
    `
  }

  protected dispatchImageMapAction(detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent("image-map-action", {
      detail: {type: this.media?.type, ...detail},
      bubbles: true,
      composed: true,
    }))
  }

  protected dispatchImageMapAreaAttribute(area: ImageMapAreaState, option: MediaAttributeOption, event: Event) {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement
    this.dispatchImageMapAction({
      action: "set-area-attribute",
      path: area.path,
      expected: area.attributes,
      attribute: option.name,
      value: input.value || null,
    })
  }

  protected renderImageMapAreaAttribute(area: ImageMapAreaState, option: MediaAttributeOption) {
    const label = `Hotspot: ${option.label}`
    return this.renderMediaAttributeField(option, {
      attributes: area.attributes,
      label,
      onChange: event => this.dispatchImageMapAreaAttribute(area, option, event),
      selectFallback: option.name === "shape" ? "rect" : "",
    })
  }

  protected renderImageMapControls() {
    if(!this.media || this.media.type !== "picture" && this.media.type !== "img") return nothing
    const map = this.media.imageMap
    if(!map) return html`
      <section class="media-resource-editor" aria-label="Image map">
        <div class="media-resource-heading"><span>Interactive hotspots</span></div>
        <button
          class="media-type-switch"
          type="button"
          @click=${() => this.dispatchImageMapAction({action: "add-map"})}
        >Add image map</button>
        <p class="image-map-note">Create linked regions over this image.</p>
      </section>
    `
    return html`
      <section class="media-resource-editor" aria-label="Image map">
        <div class="media-resource-heading">
          <span>Hotspots · ${map.name}</span>
          <button
            class="media-resource-add"
            type="button"
            @click=${() => this.dispatchImageMapAction({action: "remove-map"})}
          >${map.shared ? "Unlink" : "Remove map"}</button>
        </div>
        ${map.shared ? html`
          <p class="image-map-note">This map is shared. Unlinking keeps it available to the other images.</p>
        ` : ""}
        <div class="image-map-draw-grid" role="group" aria-label="Draw hotspot">
          ${([
            ["rect", "Rectangle"],
            ["circle", "Circle"],
            ["poly", "Polygon"],
          ] as Array<[ImageMapHotspotShape, string]>).map(([shape, label]) => html`
            <button
              class="image-map-draw"
              type="button"
              @click=${() => this.dispatchImageMapAction({action: "draw", shape})}
            >${label}</button>
          `)}
        </div>
        ${map.areas.length ? map.areas.map((area, position) => html`
          <div class="media-resource-card image-map-area">
            <div class="media-resource-card-heading">
              <span>Hotspot ${position + 1}</span>
              <button
                class="media-resource-action"
                type="button"
                aria-label=${`Remove hotspot ${position + 1}`}
                @click=${() => this.dispatchImageMapAction({
                  action: "remove-area", path: area.path, expected: area.attributes,
                })}
              >×</button>
            </div>
            ${imageMapAreaAttributeOptions.map(option => this.renderImageMapAreaAttribute(area, option))}
          </div>
        `) : html`<p class="image-map-note">Draw a shape to add the first hotspot.</p>`}
      </section>
    `
  }

  protected renderMediaDrawer() {
    if(!this.media) return nothing
    const selectedType = this.media.type
    const label = this.mediaLabel(selectedType)
    return html`
      <ribbon-drawer label=${label} icon=${label} layout="media">
        <div class="media-toolbox-controls" role="group" aria-label=${`${label} options`}>
          ${this.figure ? this.renderFigureCaptionControls() : html`
            <ribbon-button label="Convert to figure" action="media-to-figure" icon="Section"></ribbon-button>
          `}
          ${this.renderMediaAttributeOptions(
            isWebsiteType(selectedType) ? "iframe" : selectedType,
            mediaAttributeOptions[isWebsiteType(selectedType) ? "iframe" : selectedType],
          )}
          ${this.renderTimedMediaResources()}
          ${this.renderImageMapControls()}
        </div>
      </ribbon-drawer>
    `
  }

  protected dispatchTableStyle(property: string, value: string) {
    this.dispatchEvent(new CustomEvent("table-style-change", {
      detail: {property, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderTableBorderControls() {
    const disabled = !this.table?.active
    return html`
      <div class="table-inline-controls table-border-controls" role="group" aria-label="Cell borders">
        <label class="table-parameter">
          <span>Style</span>
          <select
            data-ribbon-input-persistent
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-style", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
            <option value="none">None</option>
          </select>
        </label>
        <label class="table-parameter">
          <span>Width</span>
          <select
            data-ribbon-input-persistent
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-width", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="1px">1 px</option>
            <option value="2px">2 px</option>
            <option value="3px">3 px</option>
            <option value="4px">4 px</option>
          </select>
        </label>
        <label class="table-parameter">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            value="#000000"
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("border-color", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="table-clear-button" type="button" ?disabled=${disabled}
          @click=${() => this.dispatchTableStyle("border-style", "")}>Clear borders</button>
      </div>
    `
  }

  protected renderTableBackgroundControls() {
    const disabled = !this.table?.active
    return html`
      <div class="table-inline-controls table-background-controls" role="group" aria-label="Cell background">
        <label class="table-parameter">
          <span>Color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            value="#ffffff"
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchTableStyle("background-color", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button class="table-clear-button" type="button" ?disabled=${disabled}
          @click=${() => this.dispatchTableStyle("background-color", "")}>Clear background</button>
      </div>
    `
  }

  protected toggleTableCaption = () => {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: "table-caption"},
      bubbles: true,
      composed: true,
    }))
  }

  protected toggleTableHeader = () => {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: "table-header"}, bubbles: true, composed: true,
    }))
  }

  protected toggleTableFooter = () => {
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: "table-footer"}, bubbles: true, composed: true,
    }))
  }

  protected dispatchGraphicParameter(name: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    this.dispatchGraphicParameterValue(name, input.value)
  }

  protected dispatchGraphicParameterValue(name: string, value: string) {
    this.dispatchEvent(new CustomEvent("graphic-parameter-change", {
      detail: {name, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected graphicNumberInput(name: string, label: string, options: {
    min?: number
    max?: number
    step?: number
    disabled?: boolean
  } = {}) {
    const parameters = this.graphic?.parameters ?? {}
    const selectionCount = this.graphic?.selectionCount ?? (this.graphic?.shape ? 1 : 0)
    const shared = name === "stroke-width" || name === "opacity"
    return html`
      <label class="mark-attribute graphic-parameter">
        <span>${label}</span>
        <input
          data-ribbon-input-persistent
          type="number"
          aria-label=${`Graphic: ${label}`}
          .value=${parameters[name] ?? ""}
          min=${options.min ?? nothing}
          max=${options.max ?? nothing}
          step=${options.step ?? 1}
          ?disabled=${options.disabled || (shared ? selectionCount < 1 : !this.graphic?.shape)}
          @change=${(event: Event) => this.dispatchGraphicParameter(name, event)}
        />
      </label>
    `
  }

  protected renderGraphicPaintControls(kind: "fill" | "stroke") {
    const parameters = this.graphic?.parameters ?? {}
    const selectionCount = this.graphic?.selectionCount ?? (this.graphic?.shape ? 1 : 0)
    const value = parameters[kind]
    const color = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : kind === "fill" ? "#ffffff" : "#334155"
    const disabled = selectionCount < 1 || kind === "fill" && selectionCount === 1
      && (this.graphic?.shape === "line" || this.graphic?.shape === "connector")
    return html`
      <label class="mark-attribute graphic-parameter">
        <span>${kind === "fill" ? "Fill color" : "Stroke color"}</span>
        <input
          data-ribbon-input-persistent
          type="color"
          aria-label=${`Graphic: ${kind === "fill" ? "Fill" : "Stroke"} color`}
          .value=${color}
          ?disabled=${disabled}
          @change=${(event: Event) => this.dispatchGraphicParameter(kind, event)}
        />
      </label>
      ${kind === "stroke" ? this.graphicNumberInput("stroke-width", "Stroke width", {min: 0, step: 1}) : ""}
      ${kind === "fill" ? this.graphicNumberInput("opacity", "Opacity", {min: 0, max: 1, step: 0.05}) : ""}
    `
  }

  protected renderGraphicGeometryControls(collapsible = false, textDisabled = false) {
    const connectorSelected = this.graphic?.shape === "connector"
    const preset: GraphicShapePreset | undefined = this.graphic?.shape && isGraphicPresetType(this.graphic.shape) ? graphicShapePresets[this.graphic.shape] : undefined
    const adjustments = preset?.adjustments ?? []
    const advanced = html`
        ${this.graphicNumberInput("x", "X")}
        ${this.graphicNumberInput("y", "Y")}
        ${this.graphicNumberInput("width", "Width", {min: 1})}
        ${this.graphicNumberInput("height", "Height", {min: 1})}
        ${this.graphicNumberInput("rotation", "Rotation", {step: 1, disabled: connectorSelected})}
        ${this.graphic?.shape === "rectangle"
          ? this.graphicNumberInput("corner-radius", "Corner radius", {min: 0})
          : ""}
        ${this.graphic?.shape === "hexagon"
          ? this.graphicNumberInput("inset", "Corner inset", {min: 0})
          : ""}
        ${this.graphic?.shape === "star"
          ? this.graphicNumberInput("inner-radius", "Inner radius", {min: 5, max: 90, step: 1})
          : ""}
        ${this.graphic?.shape === "arrow" ? html`
          ${this.graphicNumberInput("head-size", "Head size", {min: 15, max: 80, step: 1})}
          ${this.graphicNumberInput("tail-width", "Tail width", {min: 10, max: 90, step: 1})}
        ` : ""}
        ${adjustments.map(adjustment => this.graphicNumberInput(
          `adjust-${adjustment.name}`, adjustment.label,
          {min: adjustment.min, max: adjustment.max, step: 1},
        ))}
    `
    return html`
      <div class="graphic-inline-controls graphic-geometry-controls" role="group" aria-label="Graphic geometry">
        ${this.renderGraphicPaintControls("fill")}
        ${this.renderGraphicPaintControls("stroke")}
        ${this.renderGraphicTextControls(textDisabled)}
        ${collapsible ? html`
          <details class="graphic-disclosure">
            <summary>Advanced options</summary>
            <div class="graphic-geometry-controls">${advanced}</div>
          </details>
        ` : advanced}
      </div>
    `
  }

  protected renderGraphicConnectorControls(disabled: boolean) {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="graphic-inline-controls graphic-connector-controls" role="group" aria-label="Connector settings">
        <label class="mark-attribute graphic-parameter">
          <span>Routing</span>
          ${this.renderOptionSelect("Graphic: Connector routing", parameters.routing ?? "orthogonal",
            [{value: "straight", label: "Straight"}, {value: "orthogonal", label: "Orthogonal"}],
            disabled, value => this.dispatchGraphicParameterValue("routing", value))}
        </label>
        <label class="mark-attribute graphic-parameter graphic-boolean-parameter">
          <span>Start arrow</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label="Graphic: Start arrow"
            .checked=${parameters["start-arrow"] === "true"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameterValue(
              "start-arrow",
              String((event.currentTarget as HTMLInputElement).checked),
            )}
          />
        </label>
        <label class="mark-attribute graphic-parameter graphic-boolean-parameter">
          <span>End arrow</span>
          <input
            data-ribbon-input-persistent
            type="checkbox"
            aria-label="Graphic: End arrow"
            .checked=${parameters["end-arrow"] === "true"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameterValue(
              "end-arrow",
              String((event.currentTarget as HTMLInputElement).checked),
            )}
          />
        </label>
      </div>
    `
  }

  protected renderGraphicTextControls(disabled: boolean) {
    const parameters = this.graphic?.parameters ?? {}
    return html`
        <label class="mark-attribute graphic-parameter">
          <span>Text color</span>
          <input
            data-ribbon-input-persistent
            type="color"
            aria-label="Graphic: Text color"
            .value=${/^#[0-9a-f]{6}$/i.test(parameters["text-color"] ?? "") ? parameters["text-color"] : "#0f172a"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameter("text-color", event)}
          />
        </label>
        ${this.graphicNumberInput("font-size", "Font size", {min: 1, step: 1, disabled})}
    `
  }

  protected dispatchGraphicLayer(operation: GraphicLayerOperation, index: number) {
    this.dispatchEvent(new CustomEvent("graphic-layer-action", {
      detail: {operation, index},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderGraphicLayersControls(disabled: boolean) {
    const layers = [...(this.graphic?.layers ?? [])].reverse()
    const primary = layers.find(layer => layer.primary) ?? layers.find(layer => layer.selected)
    return html`
      <div class="graphic-layers-inline" role="group" aria-label="Graphic layers">
        <div class="graphic-layer-list" role="list">
          ${layers.length ? layers.map(layer => html`
            <div
              class="graphic-layer-row"
              role="listitem"
              data-selected=${String(layer.selected)}
              data-layer-index=${layer.index}
            >
              <button
                class="graphic-layer-select"
                type="button"
                title=${layer.label}
                aria-label=${`Select ${layer.label}`}
                ?disabled=${disabled || layer.locked || !layer.visible}
                @click=${() => this.dispatchGraphicLayer("select", layer.index)}
              >
                <span class="graphic-layer-icon">${ribbonIcon(
                  graphicShapeOptions.find(option => option.type === layer.type)?.icon ?? "Graphic",
                )}</span>
                <span>${layer.label}</span>
              </button>
              <button
                class="graphic-layer-action"
                type="button"
                aria-label=${`${layer.visible ? "Hide" : "Show"} ${layer.label}`}
                title=${layer.visible ? "Hide layer" : "Show layer"}
                ?disabled=${disabled}
                @click=${() => this.dispatchGraphicLayer("toggle-visibility", layer.index)}
              >${ribbonIcon(layer.visible ? "Visible" : "Hidden")}</button>
              <button
                class="graphic-layer-action"
                type="button"
                aria-label=${`${layer.locked ? "Unlock" : "Lock"} ${layer.label}`}
                title=${layer.locked ? "Unlock layer" : "Lock layer"}
                ?disabled=${disabled}
                @click=${() => this.dispatchGraphicLayer("toggle-lock", layer.index)}
              >${ribbonIcon(layer.locked ? "Lock" : "Unlock")}</button>
            </div>
          `) : html`<span class="button-dropdown-empty">This graphic has no shapes yet.</span>`}
        </div>
        <div class="graphic-layer-toolbar" role="group" aria-label="Layer order">
          ${([
            ["send-back", "Back"],
            ["move-down", "Down"],
            ["move-up", "Up"],
            ["bring-front", "Front"],
          ] as const).map(([operation, label]) => html`
            <button
              class="graphic-layer-order"
              type="button"
              aria-label=${`${label} layer`}
              ?disabled=${disabled || !primary}
              @click=${() => primary && this.dispatchGraphicLayer(operation, primary.index)}
            >${label}</button>
          `)}
        </div>
      </div>
    `
  }

  protected renderGraphicArrangeControls(selectionCount: number, shapesSelected: boolean, captured: boolean) {
    const actionGroup = (
      label: string,
      className: string,
      buttons: typeof graphicAlignButtons,
      disabled: boolean,
    ) => html`
      <div class=${`graphic-arrange-action-group ${className}`} role="group" aria-label=${label}>
        ${buttons.map(button => typeof button === "string" ? nothing : html`
          <ribbon-button
            compact
            label=${button.label}
            action=${button.action}
            icon=${button.icon}
            ?disabled=${disabled}
          ></ribbon-button>
        `)}
      </div>
    `
    return html`
      <div class="graphic-inline-controls graphic-arrange-controls">
        <div class="graphic-arrange-actions" aria-label="Arrange shapes">
          ${actionGroup("Align shapes", "graphic-align-actions", graphicAlignButtons, selectionCount < 2)}
          ${actionGroup("Distribute shapes", "graphic-distribute-actions", graphicDistributeButtons, selectionCount < 3)}
          ${actionGroup("Order shapes", "graphic-order-actions", graphicOrderButtons, !shapesSelected)}
        </div>
        ${this.renderGraphicLayersControls(!captured)}
      </div>
    `
  }

  protected dispatchGraphicViewport(operation: GraphicViewportOperation, zoom?: number) {
    this.dispatchEvent(new CustomEvent("graphic-viewport-action", {
      detail: {operation, ...(zoom === undefined ? {} : {zoom})},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderGraphicViewportDropdown() {
    const zoom = this.graphic?.viewport?.zoom ?? 100
    return html`
      <div class="button-dropdown-form graphic-zoom-dropdown" role="group" aria-label="Graphic zoom">
        <div class="graphic-zoom-stepper">
          <button class="graphic-zoom-action" type="button" aria-label="Zoom out"
            @click=${() => this.dispatchGraphicViewport("zoom-out")}>−</button>
          <output class="graphic-zoom-value" aria-live="polite">${zoom}%</output>
          <button class="graphic-zoom-action" type="button" aria-label="Zoom in"
            @click=${() => this.dispatchGraphicViewport("zoom-in")}>+</button>
        </div>
        <input
          data-ribbon-input-persistent
          type="range"
          aria-label="Graphic zoom percentage"
          min="25"
          max="400"
          step="5"
          .value=${String(zoom)}
          @change=${(event: Event) => this.dispatchGraphicViewport(
            "set-zoom",
            Number((event.currentTarget as HTMLInputElement).value),
          )}
        />
        <div class="graphic-zoom-presets">
          <button class="graphic-zoom-action" type="button"
            @click=${() => this.dispatchGraphicViewport("actual-size")}>100%</button>
          <button class="graphic-zoom-action" type="button"
            @click=${() => this.dispatchGraphicViewport("fit-content")}>Fit content</button>
        </div>
        <p class="graphic-navigation-hint">
          ${isOnApple() ? "⌘" : "Ctrl"} + wheel to zoom · Space or middle-drag to pan
        </p>
      </div>
    `
  }

  protected renderGraphicDrawer(toolbox = false) {
    if(!this.graphic?.active) return nothing
    const captured = Boolean(this.graphic?.capture)
    const selectionCount = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
    const shapeSelected = selectionCount === 1 && Boolean(this.graphic.shape)
    const connectorSelected = shapeSelected && this.graphic.shape === "connector"
    const labelableShapeSelected = shapeSelected && this.graphic.shape !== "line" && this.graphic.shape !== "connector"
    const shapesSelected = selectionCount > 0
    const options = this.graphic.options
    const renderShapes = (options: typeof graphicShapeOptions) => html`
      <div class="graphic-shape-gallery" role="group" aria-label="Graphic shapes">
        ${options.map((option, index) => html`
          ${index > 0 && option.category !== options[index - 1]?.category
            ? html`<div class="graphic-shape-divider" role="separator"></div>` : nothing}
          <ribbon-button
            label=${option.label}
            icon-only
            action=${`add-graphic-shape:${option.type}`}
            icon=${option.icon}
            icon-path=${option.path ?? nothing}
            ?disabled=${!captured}
          ></ribbon-button>
        `)}
      </div>
    `
    const primaryCategories = graphicShapeCategories.slice(0, 3)
    const fileControls = html`
      <div class="graphic-file-controls" role="group" aria-label="Graphic files">
        <ribbon-button label="Import graphic" action="import-graphic" icon="Upload"></ribbon-button>
        <ribbon-button label="Save graphic" action="save-graphic" icon="Download"></ribbon-button>
      </div>
    `
    return html`
      <ribbon-drawer label=${toolbox ? "Graphic style" : "Style"} icon="Theme" layout="graphic-geometry" show-pane-icon>
        ${this.renderGraphicGeometryControls(toolbox, !labelableShapeSelected)}
        ${connectorSelected ? this.renderGraphicConnectorControls(false) : nothing}
        ${toolbox ? fileControls : nothing}
      </ribbon-drawer>
      ${toolbox ? nothing : fileControls}
      <ribbon-drawer label="Insert shapes" icon="Graphic" layout="graphic">
        ${toolbox ? html`
          ${renderShapes(graphicShapeOptions.filter(option => primaryCategories.includes(option.category)))}
          <details class="graphic-disclosure">
            <summary>More shapes</summary>
            ${renderShapes(graphicShapeOptions.filter(option => !primaryCategories.includes(option.category)))}
          </details>
        ` : renderShapes(graphicShapeOptions)}
      </ribbon-drawer>
      <ribbon-drawer label="Arrange" icon="Align" layout="graphic-arrange">
        ${this.renderGraphicArrangeControls(selectionCount, shapesSelected, captured)}
      </ribbon-drawer>
      <ribbon-drawer label="Canvas" icon="Guides" layout="graphic-canvas">
        <ribbon-button
          label="Grid"
          action="toggle-graphic-option:grid"
          icon="Guides"
          toggle
          .active=${options?.grid ?? true}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label="Snap"
          action="toggle-graphic-option:snap"
          icon="Align"
          toggle
          .active=${options?.snap ?? true}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label="Guides"
          action="toggle-graphic-option:guides"
          icon="Guides"
          toggle
          .active=${options?.guides ?? true}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label=${`${this.graphic.viewport?.zoom ?? 100}%`}
          icon="Zoom"
          .dropdown=${this.renderGraphicViewportDropdown()}
          ?disabled=${!captured}
        ></ribbon-button>
        <ribbon-button
          label="Fit"
          action="navigate-graphic:fit-content"
          icon="Fullscreen"
          ?disabled=${!captured}
        ></ribbon-button>
      </ribbon-drawer>
    `
  }

  protected renderTableStructureControls(showCaption = true) {
    const active = Boolean(this.table?.active)
    return html`
        <ribbon-button label="Row above" action="table-row-above" icon="TableRowAbove" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Row below" action="table-row-below" icon="TableRowBelow" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column left" action="table-column-left" icon="TableColumnLeft" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column right" action="table-column-right" icon="TableColumnRight" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Merge cells" action="table-merge-cells" icon="TableMergeCells" ?disabled=${!this.table?.canMerge}></ribbon-button>
        <ribbon-button label="Split cells" action="table-split-cells" icon="TableSplitCells" ?disabled=${!this.table?.canSplit}></ribbon-button>
        <ribbon-button label="Split table" action="table-split" icon="TableSplit" ?disabled=${!active}></ribbon-button>
        ${showCaption ? html`
        <label class="table-caption-toggle">
          <span class="table-caption-icon" aria-hidden="true">${ribbonIcon("TableCaption")}</span>
          <span><input
            type="checkbox"
            data-ribbon-input-persistent
            .checked=${this.table?.hasCaption ?? false}
            ?disabled=${!active}
            @change=${this.toggleTableCaption}
          /> Caption</span>
        </label>
        ` : nothing}
        <label class="table-caption-toggle">
          <span><input type="checkbox" aria-label="Table header" data-ribbon-input-persistent .checked=${this.table?.hasHeader ?? false}
            ?disabled=${!active} @change=${this.toggleTableHeader} /> Header</span>
        </label>
        <label class="table-caption-toggle">
          <span><input type="checkbox" aria-label="Table footer" data-ribbon-input-persistent .checked=${this.table?.hasFooter ?? false}
            ?disabled=${!active} @change=${this.toggleTableFooter} /> Footer</span>
        </label>
    `
  }

  protected renderTableDrawers() {
    return html`
      <ribbon-drawer label="Layout" icon="TableLayout" layout="table-layout">
        ${this.renderTableStructureControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Borders" icon="TableBorders" layout="table-borders">
        ${this.renderTableBorderControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Background" icon="TableBackground" layout="table-background">
        ${this.renderTableBackgroundControls()}
      </ribbon-drawer>
    `
  }

  protected dispatchDialogAttribute(attribute: string, value: string | null) {
    this.dispatchEvent(new CustomEvent("dialog-attribute-change", {
      detail: {attribute, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderDialogEditor() {
    const state = this.dialog
    if(!state) return nothing
    return html`
      <div class="button-dropdown-form form-dropdown-form" role="group" aria-label="Dialog options">
        <label class="mark-attribute form-attribute form-attribute-boolean">
          <span>Initially open (non-modal)</span>
          <input
            type="checkbox"
            data-ribbon-input-persistent
            aria-label="Dialog: Initially open (non-modal)"
            .checked=${state.initiallyOpen}
            @change=${(event: Event) => this.dispatchDialogAttribute(
              "open",
              (event.currentTarget as HTMLInputElement).checked ? "" : null,
            )}
          />
        </label>
        <label class="mark-attribute form-attribute">
          <span>Close behavior</span>
          <select
            data-ribbon-input-persistent
            aria-label="Dialog: Close behavior"
            .value=${state.closedBy}
            @change=${(event: Event) => this.dispatchDialogAttribute(
              "closedby",
              (event.currentTarget as HTMLSelectElement).value || null,
            )}
          >
            <option value="" ?selected=${state.closedBy === ""}>Browser default</option>
            ${dialogClosedByValues.map(value => html`<option value=${value} ?selected=${state.closedBy === value}>${value}</option>`)}
          </select>
        </label>
        ${[
          ["id", "ID", "dialog-id"],
          ["aria-label", "Accessible label", "Dialog title"],
          ["aria-labelledby", "Labelled by", "heading-id"],
          ["title", "Title", ""],
        ].map(([attribute, label, placeholder]) => html`
          <label class="mark-attribute form-attribute">
            <span>${label}</span>
            <input
              data-ribbon-input-persistent
              type="text"
              aria-label=${`Dialog: ${label}`}
              placeholder=${placeholder}
              .value=${state.attributes[attribute] ?? ""}
              @change=${(event: Event) => this.dispatchDialogAttribute(
                attribute,
                (event.currentTarget as HTMLInputElement).value || null,
              )}
            />
          </label>
        `)}
      </div>
    `
  }

  protected renderDialogDrawer() {
    if(!this.dialog) return nothing
    return html`
      <ribbon-drawer label="Dialog" icon="Details" layout="form">
        <ribbon-button label="Attributes" icon="Settings" .dropdown=${this.renderDialogEditor()}></ribbon-button>
      </ribbon-drawer>
    `
  }

  protected renderElementAttributesDrawer() {
    if(!this.elementAttributes) return nothing
    return html`
      <ribbon-drawer label="Attributes" icon=${this.elementAttributes.icon ?? "Develop"} layout="attributes">
        <element-attribute-editor .state=${this.elementAttributes}></element-attribute-editor>
      </ribbon-drawer>
    `
  }

  protected dispatchWidgetOption(name: string, value: WidgetOptionValue) {
    this.dispatchEvent(new CustomEvent("widget-option-change", {detail: {name, value}, bubbles: true, composed: true}))
  }

  /** Reads a changed option field as the value type the widget declared. */
  protected widgetOptionInputValue(option: WidgetOptionState, target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): WidgetOptionValue | undefined {
    if(option.type === "boolean") return (target as HTMLInputElement).checked
    if(option.type === "select" && option.multiple) {
      return Array.from((target as HTMLSelectElement).selectedOptions, choice => choice.value)
    }
    if(option.type === "number") return target.value === "" ? null : Number(target.value)
    if(option.type === "object" || option.type === "array") {
      if(!target.value.trim()) return null
      try { return widgetOptionValue(JSON.parse(target.value)) }
      catch {
        (target as HTMLTextAreaElement).setCustomValidity("Enter valid JSON")
        target.reportValidity()
        return undefined
      }
    }
    return target.value
  }

  protected renderWidgetOptionField(option: WidgetOptionState, dispatch = this.dispatchWidgetOption.bind(this), fieldScope = "") {
    const change = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if("setCustomValidity" in target) target.setCustomValidity("")
      const value = this.widgetOptionInputValue(option, target)
      if(value !== undefined) dispatch(option.name, value)
    }
    const help = option.description ? html`<span class="develop-field-help">${option.description}</span>` : nothing
    if(option.type === "boolean") return html`
      <label class="develop-field widget-option-checkbox" title=${option.description ?? ""}>
        <input type="checkbox" .checked=${option.value === true} @change=${change} />
        <span class="develop-field-label">${option.label}</span>
      </label>
    `
    const text = option.value === null ? "" : typeof option.value === "object" ? JSON.stringify(option.value, undefined, 2) : String(option.value)
    let field
    if(option.type === "select") {
      const selected = new Set(Array.isArray(option.value) ? option.value.map(String) : [text])
      field = html`<select ?multiple=${option.multiple} @change=${change}>
        ${!option.multiple ? html`<option value="" .selected=${!text}></option>` : nothing}
        ${(option.choices ?? []).map(choice => html`<option value=${choice.value} title=${choice.description ?? ""} .selected=${selected.has(choice.value)}>${choice.label}</option>`)}
      </select>`
    }
    else if(option.type === "object" || option.type === "array") {
      field = html`<textarea data-json spellcheck="false" .value=${text} placeholder=${option.placeholder ?? ""} @change=${change}></textarea>`
    }
    else if(option.type === "string" && option.multiline) {
      field = html`<textarea .value=${text} placeholder=${option.placeholder ?? ""}
        minlength=${option.minlength ?? nothing} maxlength=${option.maxlength ?? nothing} @change=${change}></textarea>`
    }
    else {
      const listId = option.swatches?.length ? `widget-option-${fieldScope}${option.name}-swatches` : undefined
      field = html`
        <input
          type=${option.type === "string" ? "text" : option.type}
          .value=${text}
          placeholder=${option.placeholder ?? ""}
          min=${option.min ?? nothing}
          max=${option.max ?? nothing}
          step=${option.step ?? nothing}
          pattern=${option.pattern ?? nothing}
          minlength=${option.minlength ?? nothing}
          maxlength=${option.maxlength ?? nothing}
          list=${listId ?? nothing}
          @change=${change}
        />
        ${listId ? html`<datalist id=${listId}>${option.swatches!.map(swatch => html`<option value=${swatch}></option>`)}</datalist>` : nothing}
      `
    }
    return html`
      <label class="develop-field">
        <span class="develop-field-label">${option.label}</span>
        ${field}
        ${help}
      </label>
    `
  }

  protected renderWidgetSharing() {
    const state = this.widgetOptions
    if(!state?.sharing) return ""
    const {sharing} = state
    const reference = {path: [...state.path], localName: state.localName, widgetId: sharing.widgetId}
    const grouping = sharing.grouping
    const summary = grouping?.method === "existing" ? "Existing grouping"
      : grouping?.method === "manual" ? `${grouping.manualGroups.length} groups · manual`
      : grouping ? `${grouping.number} ${grouping.groupBy === "groups" ? "groups" : "members per group"} · ${grouping.allocateBy === "random" ? "random" : "ordered"}` : ""
    return html`
      <section class="widget-sharing" aria-label="Sharing">
        <label class="share-toggle"><span>Share</span><input type="checkbox" role="switch"
          .checked=${sharing.mode !== "individual"}
          @change=${(event: Event) => this.dispatchEvent(new CustomEvent("widget-sharing-change", {bubbles: true, composed: true,
            detail: {...reference, enabled: (event.target as HTMLInputElement).checked}}))}></label>
        ${sharing.mode === "individual" ? "" : grouping ? html`
          <div class="grouping-card">
            <button class="grouping-summary" @click=${() => this.configureWidgetGrouping(reference, grouping)}>
              <strong>${grouping.groupingName || "Grouping"}</strong><span>${summary}</span>
            </button>
            <button class="grouping-remove" aria-label="Remove grouping" title="Remove grouping"
              @click=${() => this.dispatchEvent(new CustomEvent("widget-grouping-change", {bubbles: true, composed: true, detail: {...reference, grouping: null}}))}>${ribbonIcon("Reject")}</button>
          </div>
        ` : html`<button class="add-grouping" @click=${() => this.configureWidgetGrouping(reference, null)}>Add grouping</button>`}
        ${sharing.error ? html`<p role="alert">${sharing.error}</p>` : ""}
      </section>
    `
  }

  private async configureWidgetGrouping(reference: {path: number[], localName: string, widgetId: string}, grouping: import("../widget-grouping.js").WidgetGroupingRules | null) {
    const dialog = this.shadowRoot?.querySelector<WidgetGroupingDialog>("widget-grouping-dialog")
    if(!dialog) return
    const result = await dialog.show(grouping, () => new Promise<WidgetGroupingContext>((resolve, reject) => {
      this.dispatchEvent(new CustomEvent("widget-grouping-context", {bubbles: true, composed: true, detail: {...reference, resolve, reject}}))
    }))
    if(result !== undefined) this.dispatchEvent(new CustomEvent("widget-grouping-change", {bubbles: true, composed: true, detail: {...reference, grouping: result}}))
  }

  protected renderWidgetOptionsControls(options = this.widgetOptions?.options ?? [], dispatch = this.dispatchWidgetOption.bind(this), state = this.widgetOptions, selectionType?: ElementSelectionType) {
    if(!state || !options.length && !state.actions.length) return nothing
    return html`
        <div class="widget-options">
          ${options.map(option => this.renderWidgetOptionField(option, dispatch, selectionType ? `${state.path.join("-")}-` : ""))}
          ${state.actions.length ? html`<div class="widget-actions">
            ${state.actions.map(action => html`<button type="button" class="widget-action" title=${action.description ?? ""}
              @click=${() => this.dispatchEvent(new CustomEvent("widget-action", {detail: {name: action.name, ...(selectionType ? {selectionType} : {})}, bubbles: true, composed: true}))}
            >${action.label}</button>`)}
          </div>` : nothing}
        </div>
    `
  }

  protected renderWidgetOptionsDrawer() {
    const state = this.widgetOptions
    if(!state || !state.options.length && !state.actions.length) return nothing
    return html`
      <ribbon-drawer label="Widget" icon="Packages" layout="form">
        ${this.renderWidgetOptionsControls()}
      </ribbon-drawer>
    `
  }

  protected commandShortcut(action: string) {
    const command = appCommands.find(candidate => candidate.action === action)
    return command ? formatShortcut(this.settings.shortcuts[command.id] ?? "") : ""
  }

  protected renderElementStyleDrawer(category: ElementStyleCategory) {
    return html`
      <ribbon-drawer
        label=${category.label}
        icon=${category.icon}
        layout="element-style"
        expandable
      >
        <element-style-editor
          mode="basic"
          .orientation=${this.elementStyleEditorOrientation}
          .definitions=${category.basic}
          .state=${this.elementStyle}
        ></element-style-editor>
        <element-style-editor
          slot="more"
          mode="advanced"
          .orientation=${this.elementStyleEditorOrientation}
          .definitions=${category.advanced}
          .state=${this.elementStyle}
          ?allow-custom=${category.id === "other"}
        ></element-style-editor>
      </ribbon-drawer>
    `
  }

  protected get elementStyleEditorOrientation(): "horizontal" | "vertical" {
    return "horizontal"
  }

  protected get selectedHistoryCheckpointId() {
    return this.historyState.preview?.checkpointId
      ?? this.historyState.versions.find(version => version.isCurrent)?.id
      ?? null
  }

  protected scrollNewHistoryCardIntoView(previousState: unknown) {
    if(!this.renderRoot.querySelector('.history-timeline')) return
    const previousVersions = previousState && typeof previousState === "object"
      && Array.isArray((previousState as Partial<VersionHistoryState>).versions)
      ? (previousState as VersionHistoryState).versions : []
    const previousIds = new Set(previousVersions.map(version => version.id))
    const added = this.historyState.versions.find(version => !previousIds.has(version.id))
    if(!added) return
    const card = Array.from(this.renderRoot.querySelectorAll<HTMLElement>(".history-version-card"))
      .find(candidate => candidate.dataset.checkpointId === added.id)
    card?.scrollIntoView({behavior: previousVersions.length ? "smooth" : "auto", block: "nearest", inline: "nearest"})
  }

  protected historyTime(timestamp: number) {
    return new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(new Date(timestamp))
  }

  protected historyDate(timestamp: number) {
    return new Intl.DateTimeFormat(undefined, {dateStyle: "medium"}).format(new Date(timestamp))
  }

  protected historyTimestamp(timestamp: number) {
    return `${this.historyTime(timestamp)} · ${this.historyDate(timestamp)}`
  }

  protected historyAuthor(user: VersionHistoryState["checkpoints"][number]["user"]) {
    return user.clientId === this.historyState.currentUserId ? "you" : user.name
  }

  protected selectHistoryCheckpoint = (event: Event) => {
    const checkpointId = (event.currentTarget as HTMLElement).dataset.checkpointId
    if(!checkpointId) return
    this.dispatchEvent(new CustomEvent("history-checkpoint-select", {
      detail: {checkpointId},
      bubbles: true,
      composed: true,
    }))
  }

  protected revertHistoryCheckpoint = (event: Event) => {
    const checkpointId = (event.currentTarget as HTMLElement).dataset.checkpointId
    if(!checkpointId) return
    this.dispatchEvent(new CustomEvent("history-revert", {
      detail: {checkpointId},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderHistoryEntry(entry: VersionHistoryCheckpoint, isVersion: boolean, isCurrent: boolean, isUnsaved = false) {
    const selected = this.selectedHistoryCheckpointId === entry.id
    return html`
      <div class=${isVersion ? "history-version-card" : "history-change-card"}
        data-checkpoint-id=${entry.id} ?data-selected=${selected}>
        <button class="history-checkpoint" type="button" data-checkpoint-id=${entry.id}
          aria-pressed=${selected} title=${entry.label} ?disabled=${this.historyLoading}
          @click=${this.selectHistoryCheckpoint}>
          <span class="history-checkpoint-avatar" style=${`--history-user-color: ${entry.user.color}`}
            aria-hidden="true">${entry.user.initials}</span>
          <span class="history-checkpoint-label">${isUnsaved ? "Unsaved changes" : this.historyTimestamp(entry.timestamp)}</span>
          <span class="history-checkpoint-meta">By ${this.historyAuthor(entry.user)}</span>
          <span class="history-checkpoint-counts" aria-label=${`${entry.changes.added} added, ${entry.changes.removed} removed, ${entry.changes.modified} changed`}>
            <span class="history-count" data-kind="added">+${entry.changes.added}</span>
            <span class="history-count" data-kind="removed">−${entry.changes.removed}</span>
            <span class="history-count" data-kind="modified">~${entry.changes.modified}</span>
            ${entry.commentCount ? html`<span class="history-count" data-kind="comments">${entry.commentCount} 💬</span>` : nothing}
          </span>
        </button>
        <button class="history-card-restore-button" type="button" data-checkpoint-id=${entry.id}
          aria-label=${`Restore ${isVersion ? "version" : "change"} from ${this.historyTimestamp(entry.timestamp)}`}
          title=${isCurrent ? "Already active" : entry.label}
          ?disabled=${this.historyLoading || isCurrent} @click=${this.revertHistoryCheckpoint}>
          <span class="history-card-restore-icon" aria-hidden="true">${ribbonIcon("Restore")}</span>
          <span>Restore</span>
        </button>
      </div>
    `
  }

  protected renderHistoryVersionsDrawer() {
    const checkpoints = new Map(this.historyState.checkpoints.map(checkpoint => [checkpoint.id, checkpoint]))
    const initialCheckpointId = this.historyState.checkpoints.at(-1)?.id
    return html`
      <ribbon-drawer label="Versions" icon="History" layout="history-versions">
        <div class="history-timeline" role="list" aria-label="Document versions">
          ${this.historyState.preview ? html`
            <button class="history-preview-clear" type="button" ?disabled=${this.historyLoading}
              @click=${() => this.dispatchEvent(new Event("history-preview-clear", {bubbles: true, composed: true}))}>
              Return to current document
            </button>` : nothing}
          ${this.historyError ? html`<div class="history-error" role="alert">${this.historyError}</div>`
          : this.historyLoading && !this.historyState.versions.length
            ? html`<div class="history-loading">Loading versions…</div>`
            : !this.historyState.versions.length
              ? html`<div class="history-empty">No versions yet</div>`
              : repeat(this.historyState.versions, version => version.id, version => {
                // The version card already represents its newest checkpoint.
                // Creation is the baseline, rather than an authored change.
                const changeIds = version.checkpointIds.slice(1)
                  .filter(id => id !== initialCheckpointId && checkpoints.has(id))
                return html`
                <div class="history-version-group" role="listitem">
                  ${this.renderHistoryEntry(version, true, version.isCurrent, version.isUnsaved)}
                  ${changeIds.length ? html`
                    <details class="history-version-changes">
                      <summary>${changeIds.length} ${changeIds.length === 1 ? "change" : "changes"}</summary>
                      <div role="list" aria-label=${`Changes in ${version.label}`}>
                        ${changeIds.map(id => {
                          const checkpoint = checkpoints.get(id)
                          return checkpoint ? html`<div role="listitem">
                            ${this.renderHistoryEntry(checkpoint, false, checkpoint.id === this.historyState.currentCheckpointId)}
                          </div>` : nothing
                        })}
                      </div>
                    </details>` : nothing}
                </div>
              `})}
        </div>
      </ribbon-drawer>
    `
  }

  protected usesNativePointerInteraction(_event: MouseEvent) { return false }

  protected willUpdate(changed: Map<string, unknown>) {
    if(changed.has("marks")) this.syncSpanMarkSelection()
    if(changed.has("commentState")) this.commentDraft = this.commentState.text
  }

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("activeMenu") && this.activeMenu === "Develop") {
      this.dispatchEvent(new Event("local-package-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && this.activeMenu === "Style") {
      this.dispatchEvent(new Event("element-style-state-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && this.activeMenu === "History") {
      this.dispatchEvent(new Event("history-state-request", {bubbles: true, composed: true}))
    }
    if(changed.has("activeMenu") && changed.get("activeMenu") === "History" && this.activeMenu !== "History") {
      this.dispatchEvent(new Event("history-preview-clear", {bubbles: true, composed: true}))
    }
    if(changed.has("historyState")) this.scrollNewHistoryCardIntoView(changed.get("historyState"))
  }

  protected abstract get currentMenuGroups(): RibbonMenuGroup[]

  protected renderDrawers() {
    return this.currentMenuGroups.map(drawer => this.renderDrawer(drawer))
  }

  protected renderDrawer(drawer: RibbonMenuGroup) {
    const styleCategory = this.activeMenu === "Style"
      ? elementStyleCategories.find(category => category.label === drawer.label)
      : undefined
    if(styleCategory) return this.renderElementStyleDrawer(styleCategory)
    if(drawer.label === "Versions") return this.renderHistoryVersionsDrawer()
    if(drawer.label === "Marks") return this.renderMarkDrawer()
    if(drawer.label === "Section") return this.renderSectionDrawer()
    if(drawer.label === "Heading group") return this.renderHeadingGroupDrawer()
    if(drawer.label === "List") return this.renderListDrawer()
    if(drawer.label === "Attributes") return this.renderElementAttributesDrawer()
    if(drawer.label === "Widget") return this.renderWidgetOptionsDrawer()
    if(drawer.label === "Media") return this.renderMediaDrawer()
    if(drawer.label === "Dialog") return this.renderDialogDrawer()
    if(drawer.label === "Comments") return this.renderCommentDrawer()
    if(drawer.label === "Layout") return this.renderTableDrawers()
    if(drawer.label === "Graphic") return this.renderGraphicDrawer()
    if(drawer.label === "Local packages") return this.renderDevelopDrawer()
    if(drawer.label === "Metadata") {
      return this.renderMetadataDrawer()
    }
    const representative = drawer.buttons[0]
    const icon = typeof representative === "string"
      ? representative
      : representative?.icon ?? representative?.action ?? representative?.label ?? drawer.label
    return html`
      <ribbon-drawer label=${drawer.label} icon=${icon} layout=${drawer.label.toLowerCase()}>
        ${drawer.buttons.map(button => {
          const item = typeof button === "string" ? {label: button} : button
          return html`
            <ribbon-button
              label=${item.label}
              .action=${item.action ?? item.label}
              .dragHTML=${item.dragHTML}
              .icon=${item.icon ?? item.label}
              .submenu=${item.submenu ?? []}
            ></ribbon-button>
          `
        })}
      </ribbon-drawer>
    `
  }
}
