import {LitElement, html, nothing} from "lit"
import {ref} from "lit/directives/ref.js"
import {appCommands, defaultAppSettings, formatShortcut, type AppSettings} from "../app-settings"
import {dialogClosedByValues, type DialogSelectionState} from "../dialog"
import {
  emptyVersionHistoryState,
  type CommentState,
  type ElementStyleState,
  type FigureSelectionState,
  type HeadingGroupSelectionState,
  type ListSelectionState,
  type ListType,
  type VersionHistoryState,
} from "../editor-bridge"
import type {ElementAttributeState} from "../element-attributes"
import {elementStyleCategories, type ElementStyleCategory} from "../element-styles"
import {
  graphicShapeOptions,
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
  websiteTypes,
  type ImageMapAreaState,
  type ImageMapHotspotShape,
  type MediaAttributeOption,
  type MediaSelectionState,
  type MediaType,
  type TimedMediaResourceState,
  type TimedMediaResourceType,
} from "../media"
import type {WebWriterPackage} from "../packages"
import {describePackageExport, webWriterPackageExportTypes} from "../packages"
import {ribbonIcon} from "../ribbon-icons"
import {sectionOptions, type SectionName} from "../sections"
import {
  isTableRowGroupType,
  type TableCellRole,
  type TableColumnGroupState,
  type TableRowGroupState,
  type TableRowGroupType,
  type TableSelectionState,
} from "../table"
import {isOnApple} from "../utility"
import {editingControlStyles} from "./editing-controls.styles"
import "./element-attribute-editor"
import "./element-style-editor"
import "./ribbon-button"
import {type RibbonButton} from "./ribbon-button"
import "./ribbon-combobox"
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

const scopedPackageNamePattern = "@[^/\\s]+/[^/\\s]+"
const semanticVersionPattern = "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?(\\+[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?"

/** Selection controls shared by the top ribbon and side toolbox. Application
 * menus, AI, sharing and ribbon layout belong to AppRibbon. */
export abstract class EditingControls extends LitElement {
  static properties = {
    activeMenu: {type: String, attribute: "active-menu"},
    canMark: {type: Boolean, attribute: "can-mark"},
    canSection: {type: Boolean, attribute: "can-section"},
    sectionType: {type: String, attribute: "section-type"},
    sectionActive: {type: Boolean, attribute: "section-active"},
    sectionSelected: {type: Boolean, attribute: "section-selected"},
    marks: {attribute: false},
    markStyles: {attribute: false},
    markAttributes: {attribute: false},
    ruby: {attribute: false},
    commentState: {attribute: false},
    commentDraft: {type: String, state: true},
    localPackages: {attribute: false},
    localPackagesLoading: {type: Boolean, attribute: "local-packages-loading"},
    localPackageError: {type: String, attribute: "local-package-error"},
    selectedLocalPackageName: {type: String, attribute: "selected-local-package-name"},
    selectedLocalPackageAutoReload: {type: Boolean, attribute: "selected-local-package-auto-reload"},
    listType: {type: String, attribute: "list-type"},
    listStyle: {type: String, attribute: "list-style"},
    orderedList: {attribute: false},
    headingGroup: {attribute: false},
    figure: {attribute: false},
    media: {attribute: false},
    dialog: {attribute: false},
    table: {attribute: false},
    graphic: {attribute: false},
    elementStyle: {attribute: false},
    elementAttributes: {attribute: false},
    linkAttributeMenuOpen: {type: Boolean, state: true},
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

  marks: MarkName[] = []

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

  localPackageError = ""

  selectedLocalPackageName = ""

  selectedLocalPackageAutoReload = false

  listType: ListType | null = null

  listStyle = ""

  orderedList: ListSelectionState["ordered"] = undefined

  headingGroup: HeadingGroupSelectionState | null = null

  figure: FigureSelectionState | null = null

  media: MediaSelectionState | null = null

  dialog: DialogSelectionState | null = null

  table: TableSelectionState | null = null

  graphic: GraphicSelectionState | null = null

  elementAttributes: ElementAttributeState | null = null

  elementStyle: ElementStyleState = {
    target: null,
    inline: {},
    computed: {},
    context: {display: "", parentDisplay: ""},
  }

  protected linkAttributeMenuOpen = false

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
        ?disabled=${!this.canMark}
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
    const value = (event.currentTarget as HTMLInputElement | HTMLSelectElement).value
    this.dispatchEvent(new CustomEvent("mark-attribute-change", {
      detail: {mark, attribute, value},
      bubbles: true,
      composed: true,
    }))
  }

  protected closeLinkAttributeMenu() {
    this.linkAttributeMenuOpen = false
  }

  protected toggleLinkAttributeMenu() {
    if(!this.canMark) return
    if(this.linkAttributeMenuOpen) this.closeLinkAttributeMenu()
    else this.linkAttributeMenuOpen = true
  }

  protected handleLinkAttributeMenuKeydown(event: KeyboardEvent) {
    if(event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    this.toggleLinkAttributeMenu()
  }

  protected renderMarkAttribute(mark: MarkName, option: MarkAttributeOption) {
    return html`
      <label class=${`mark-attribute${mark === "a" && option.name === "href" ? " mark-attribute-link" : ""}`}>
        <span>${option.label}</span>
        ${option.options ? html`<select
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          .value=${this.markAttributes[mark]?.[option.name] ?? option.options[0]?.value ?? ""}
          ?disabled=${!this.canMark}
          @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
        >${option.options.map(item => html`<option value=${item.value}>${item.label}</option>`)}</select>` : html`<input
          type=${option.inputType ?? "text"}
          aria-label=${`${this.markOption(mark).label}: ${option.label}`}
          placeholder=${option.placeholder}
          .value=${this.markAttributes[mark]?.[option.name] ?? ""}
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
        type=${option.inputType ?? "text"}
        aria-label=${`${this.markOption(mark).label}: ${option.label}`}
        placeholder=${option.placeholder}
        title=${option.label}
        .value=${this.markAttributes[mark]?.[option.name] ?? ""}
        ?disabled=${!this.canMark || !active}
        @change=${(event: Event) => this.dispatchMarkAttribute(mark, option.name, event)}
      />
    `
  }

  protected renderLinkDropdown() {
    const [href, ...advanced] = markAttributeOptionsFor("a")
    return html`
      <div class="button-dropdown-form" role="group" aria-label="Link options">
        ${href ? this.renderMarkAttribute("a", href) : ""}
        <button
          class="button-dropdown-more"
          type="button"
          aria-label="More link options"
          aria-expanded=${this.linkAttributeMenuOpen}
          @click=${() => this.toggleLinkAttributeMenu()}
          @keydown=${(event: KeyboardEvent) => this.handleLinkAttributeMenuKeydown(event)}
        >More options</button>
        ${this.linkAttributeMenuOpen ? html`
          <div class="button-dropdown-advanced" role="group" aria-label="Advanced link options">
            ${advanced.map(option => this.renderMarkAttribute("a", option))}
          </div>
        ` : ""}
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
          ?disabled=${!this.canMark}
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
      </div>
    `
  }

  protected renderSpanDropdown(selected: readonly MarkName[]) {
    return html`
      <div class="mark-dropdown-list" role="listbox" aria-label="Advanced mark types" aria-multiselectable="true">
        ${this.spanGroupMembers().map(mark => this.renderSpanMarkOption(mark, selected))}
      </div>
    `
  }

  protected renderLinkButton() {
    return html`
      <ribbon-button
        class="mark-link"
        style="grid-column: 8; grid-row: 1"
        toggle
        label="Link"
        action="mark:a"
        icon="MarkLink"
        .dropdown=${this.renderLinkDropdown()}
        ?active=${this.marks.includes("a")}
        ?disabled=${!this.canMark}
      ></ribbon-button>
    `
  }

  protected renderSpanButton() {
    const selected = this.spanSelectedMarks().filter(mark =>
      this.spanGroupMembers().includes(mark)
    )
    const first = selected.length ? this.markOption(selected[0]) : {label: "More", icon: "More"}
    return html`
      <ribbon-button
        class="mark-span"
        style="grid-column: 8; grid-row: 2"
        toggle
        label=${first.label}
        icon=${first.icon}
        action="mark:span"
        .selectionCount=${Math.max(0, selected.length - 1)}
        .dropdown=${this.renderSpanDropdown(selected)}
        ?active=${selected.length > 0}
        ?disabled=${!this.canMark}
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
        ${this.renderLinkButton()}
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

  protected renderSectionTypeSelect(label = "Section type") {
    return html`
      <label class="mark-attribute section-type-select">
        <span>${label}</span>
        <select
          aria-label=${label}
          .value=${this.sectionType}
          ?disabled=${!this.canSection}
          @change=${this.dispatchSectionType}
        >
          ${sectionOptions.map(option => html`
            <option value=${option.value}>${option.label}</option>
          `)}
        </select>
      </label>
    `
  }

  protected renderSectionDrawer() {
    return html`
      <ribbon-drawer label="Section" icon="Section" layout="section">
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

  protected renderListDrawer() {
    if(this.listType !== "ol" || !this.orderedList) return nothing
    return html`
      <ribbon-drawer label="List" icon="Enumeration" layout="form">
        <label class="mark-attribute">
          <span>Start at</span>
          <input
            type="number"
            .value=${this.orderedList.start}
            placeholder="Automatic"
            @change=${(event: Event) => this.dispatchListAttribute("start", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="mark-attribute">
          <span>Numbering</span>
          <select
            .value=${this.orderedList.numbering}
            @change=${(event: Event) => this.dispatchListAttribute("type", (event.currentTarget as HTMLSelectElement).value)}
          >
            <option value="">Automatic</option>
            <option value="1">1, 2, 3</option>
            <option value="a">a, b, c</option>
            <option value="A">A, B, C</option>
            <option value="i">i, ii, iii</option>
            <option value="I">I, II, III</option>
          </select>
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
            <input
              type="number"
              .value=${this.orderedList.itemValue}
              placeholder="Continue sequence"
              @change=${(event: Event) => this.dispatchListAttribute("value", (event.currentTarget as HTMLInputElement).value)}
            />
          </label>
        ` : ""}
      </ribbon-drawer>
    `
  }

  protected get paragraphSelected() {
    return this.elementAttributes?.namespaceURI === "http://www.w3.org/1999/xhtml"
      && (this.elementAttributes.localName === "p" || this.elementAttributes.localName === "pre")
  }

  protected renderParagraphDrawer() {
    if(!this.paragraphSelected) return nothing
    return html`
      <ribbon-drawer label="Paragraph" icon="Paragraph" layout="form">
        <label class="paragraph-format-switch">
          <span>Preformatted text</span>
          <input
            type="checkbox"
            role="switch"
            .checked=${this.elementAttributes?.localName === "pre"}
            @change=${(event: Event) => this.dispatchEvent(new CustomEvent("paragraph-format-change", {
              detail: {preformatted: (event.currentTarget as HTMLInputElement).checked},
              bubbles: true,
              composed: true,
            }))}
          />
        </label>
      </ribbon-drawer>
    `
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

  protected renderDisclosureDrawer() {
    if(this.elementAttributes?.localName !== "details") return nothing
    return html`
      <ribbon-drawer label="Disclosure" icon="Details" layout="form">
        <label class="mark-attribute">
          <span>Group</span>
          <input
            type="text"
            placeholder="Independent"
            .value=${this.elementAttributes.attributes.name ?? ""}
            @change=${(event: Event) => this.dispatchSelectedElementAttribute("name", (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <label class="mark-attribute">
          <span>Initially open</span>
          <input
            type="checkbox"
            .checked=${Object.hasOwn(this.elementAttributes.attributes, "open")}
            @change=${(event: Event) => this.dispatchSelectedElementAttribute("open", (event.currentTarget as HTMLInputElement).checked ? "" : null)}
          />
        </label>
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
    return this.selectedLocalPackageName || this.localPackages[0]?.name || ""
  }

  protected selectLocalPackageFromSelect = (event: Event) => {
    const name = (event.currentTarget as HTMLSelectElement).value
    this.selectedLocalPackageName = name
    this.dispatchEvent(new CustomEvent<{label: string}>("ribbon-button-click", {
      detail: {label: `local-package-select:${name}`},
      bubbles: true,
      composed: true,
    }))
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
    this.dispatchEvent(new CustomEvent("local-package-export-change", {
      detail: {exportName, field, value},
      bubbles: true,
      composed: true,
    }))
  }

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

  protected localPackageAutoReloadChange = (event: Event) => {
    const enabled = (event.currentTarget as HTMLInputElement).checked
    this.dispatchEvent(new CustomEvent<{enabled: boolean}>("local-package-auto-reload-change", {
      detail: {enabled},
      bubbles: true,
      composed: true,
    }))
  }

  protected renderDevelopDrawer() {
    const displayPackages = this.localPackages
    return html`
      <ribbon-drawer
        class="local-packages-drawer"
        label="Local packages"
        icon="Packages"
        layout="packages"
        hide-pane-label
        single-column
      >
        <label class="local-package-selection">
          <span class="local-package-selection-icon" aria-hidden="true">${ribbonIcon("Packages")}</span>
          <select
            class="local-package-select"
            aria-label="Local package"
            .value=${this.localPackageSelectionName}
            ?disabled=${!displayPackages.length}
            @change=${this.selectLocalPackageFromSelect}
          >
            ${displayPackages.length
              ? displayPackages.map(pkg => html`<option value=${pkg.name}>${pkg.name}</option>`)
              : html`<option value="">${this.localPackagesLoading ? "Loading packages…" : "No local packages"}</option>`}
          </select>
        </label>
        <div class="local-package-actions">
          <ribbon-button
            label="Load"
            action="local-package-add"
            icon="Open"
            variant="toolbar"
            keep-drawer-open
          ></ribbon-button>
          <ribbon-button
            label="New"
            action="local-package-new"
            icon="New"
            variant="toolbar"
            keep-drawer-open
          ></ribbon-button>
        </div>
        <label class="develop-field local-package-auto-reload">
          <input
            type="checkbox"
            .checked=${this.selectedLocalPackageAutoReload}
            ?disabled=${!this.selectedLocalPackage}
            @change=${this.localPackageAutoReloadChange}
          />
          <span>Auto-reload</span>
        </label>
        ${this.localPackageError ? html`<span class="package-status" role="alert">${this.localPackageError}</span>` : ""}
        ${!this.localPackagesLoading && !displayPackages.length && !this.localPackageError
          ? html`<span class="package-status">No local packages</span>`
          : ""}
      </ribbon-drawer>
    `
  }

  protected renderMetadataDrawer() {
    const pkg = this.selectedLocalPackage
    const manifest = pkg?.manifest
    const author = manifest ? manifest.author : pkg?.authors[0]
    const keywords = manifest?.keywords ?? pkg?.keywords ?? []
    const contributors = manifest?.contributors ?? []
    const packageExports = Object.entries(manifest?.exports ?? {})
    return html`
      <ribbon-drawer label="Metadata" icon="Properties" layout="metadata" hide-pane-label>
        ${pkg ? html`<div class="develop-fields">
          <section class="develop-section" aria-labelledby="develop-package-fields">
            <span id="develop-package-fields" class="develop-section-title">Package</span>
            <label class="develop-field">
              <span class="develop-field-label">Name</span>
              <input type="text" name="name" .value=${pkg.name} .pattern=${scopedPackageNamePattern} required @change=${this.localPackageMetadataChange} />
            </label>
            <label class="develop-field">
              <span class="develop-field-label">Version</span>
              <input type="text" name="version" .value=${pkg.version} .pattern=${semanticVersionPattern} required @change=${this.localPackageMetadataChange} />
              <span class="develop-field-help">Semantic version, for example 1.2.0</span>
            </label>
            <label class="develop-field">
              <span class="develop-field-label">Description</span>
              <textarea name="description" .value=${manifest ? manifest.description ?? "" : pkg.description ?? ""} @change=${this.localPackageMetadataChange}></textarea>
            </label>
            <label class="develop-field">
              <span class="develop-field-label">License</span>
              <input type="text" name="license" .value=${manifest?.license ?? pkg.license ?? ""} placeholder="SPDX identifier" @change=${this.localPackageMetadataChange} />
            </label>
            <details class="develop-compact-details">
              <summary><span>Keywords</span><span>${keywords.length}</span></summary>
              <label class="develop-field">
                <textarea name="keywords" aria-label="Keywords" .value=${keywords.join("\n")} @change=${this.localPackageMetadataChange}></textarea>
                <span class="develop-field-help">One per line; webwriter-widget is required</span>
              </label>
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
          </section>

          <section class="develop-section" aria-labelledby="develop-export-fields">
            <div class="develop-section-title-row">
              <span id="develop-export-fields" class="develop-section-title">Exports</span>
              <button class="develop-icon-button" type="button" aria-label="Create export" title="Create export" @click=${this.addLocalPackageExport}>${ribbonIcon("Plus")}</button>
            </div>
            <div class="develop-export-list">
              ${packageExports.length ? packageExports.map(([exportName, target]) => {
                const descriptor = describePackageExport(exportName, target)
                const fixedName = ["migration", "icon", "editing-config", "custom-elements"].includes(descriptor.type)
                return html`
                  <article class="develop-export-card" data-export-name=${exportName}>
                    <div class="develop-export-card-header">
                      <span class="develop-export-card-title" title=${exportName}>${exportName}</span>
                      <button
                        class="develop-icon-button"
                        type="button"
                        aria-label=${`Delete export ${exportName}`}
                        title="Delete export"
                        @click=${() => this.deleteLocalPackageExport(exportName)}
                      >${ribbonIcon("Delete")}</button>
                    </div>
                    <label class="develop-field">
                      <span class="develop-field-label">Type</span>
                      <select .value=${descriptor.type} @change=${(event: Event) => this.localPackageExportChange(exportName, "type", event)}>
                        ${webWriterPackageExportTypes.map(type => html`<option value=${type.value} ?selected=${type.value === descriptor.type}>${type.label}</option>`)}
                      </select>
                    </label>
                    <label class="develop-field">
                      <span class="develop-field-label">Name</span>
                      <input
                        type="text"
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
                  </article>
                `
              }) : html`<span class="develop-empty">No exports</span>`}
            </div>
            <label class="develop-field">
              <span class="develop-field-label">Custom elements manifest</span>
              <input type="text" name="customElements" .value=${manifest?.customElements ?? ""} placeholder="custom-elements.json" @change=${this.localPackageMetadataChange} />
            </label>
          </section>

          <section class="develop-section" aria-labelledby="develop-editing-fields">
            <span id="develop-editing-fields" class="develop-section-title">Editing</span>
            <label class="develop-field">
              <span class="develop-field-label">Inline editing config</span>
              <textarea data-json name="editingConfig" .value=${packageMetadataText(manifest?.editingConfig)} placeholder="{}" spellcheck="false" @change=${this.localPackageMetadataChange}></textarea>
              <span class="develop-field-help">JSON keyed by “.” or an exported package member</span>
            </label>
          </section>
        </div>` : html`<span class="develop-empty">Select a package</span>`}
      </ribbon-drawer>
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
          ${selectedType === "picture" || selectedType === "img" ? html`
            <button
              class="media-type-switch"
              type="button"
              @click=${() => this.dispatchEvent(new CustomEvent("media-type-change", {
                detail: {type: selectedType === "picture" ? "img" : "picture"},
                bubbles: true,
                composed: true,
              }))}
            >Use &lt;${selectedType === "picture" ? "img" : "picture"}&gt;</button>
          ` : ""}
          ${isWebsiteType(selectedType) ? html`
            <label class="mark-attribute media-attribute">
              <span>Element</span>
              <select
                data-ribbon-input-persistent
                aria-label="Website: Element"
                @change=${(event: Event) => this.dispatchEvent(new CustomEvent("media-type-change", {
                  detail: {type: (event.currentTarget as HTMLSelectElement).value},
                  bubbles: true,
                  composed: true,
                }))}
              >
                ${websiteTypes.map(website => html`
                  <option value=${website} ?selected=${website === selectedType}>&lt;${website}&gt;</option>
                `)}
              </select>
            </label>
          ` : ""}
          ${mediaAttributeOptions[selectedType].map(option => this.renderMediaAttribute(selectedType, option))}
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
        <span>${kind === "fill" ? "Fill" : "Stroke"}</span>
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

  protected renderGraphicGeometryControls() {
    const connectorSelected = this.graphic?.shape === "connector"
    return html`
      <div class="graphic-inline-controls graphic-geometry-controls" role="group" aria-label="Graphic geometry">
        ${this.renderGraphicPaintControls("fill")}
        ${this.renderGraphicPaintControls("stroke")}
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
      </div>
    `
  }

  protected renderGraphicConnectorControls(disabled: boolean) {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="graphic-inline-controls graphic-connector-controls" role="group" aria-label="Connector settings">
        <label class="mark-attribute graphic-parameter">
          <span>Routing</span>
          <select
            data-ribbon-input-persistent
            aria-label="Graphic: Connector routing"
            .value=${parameters.routing ?? "orthogonal"}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameter("routing", event)}
          >
            <option value="straight">Straight</option>
            <option value="orthogonal">Orthogonal</option>
          </select>
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

  protected renderGraphicLabelControls(disabled: boolean) {
    const parameters = this.graphic?.parameters ?? {}
    return html`
      <div class="graphic-inline-controls graphic-text-controls" role="group" aria-label="Shape text">
        <label class="mark-attribute graphic-parameter graphic-label-parameter">
          <span>Label</span>
          <textarea
            data-ribbon-input-persistent
            rows="3"
            aria-label="Graphic: Label"
            .value=${parameters.label ?? ""}
            ?disabled=${disabled}
            @change=${(event: Event) => this.dispatchGraphicParameter("label", event)}
          ></textarea>
        </label>
        <label class="mark-attribute graphic-parameter">
          <span>Color</span>
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
      </div>
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

  protected renderGraphicDrawer() {
    if(!this.graphic?.active) return nothing
    const captured = Boolean(this.graphic?.capture)
    const selectionCount = this.graphic.selectionCount ?? (this.graphic.shape ? 1 : 0)
    const shapeSelected = selectionCount === 1 && Boolean(this.graphic.shape)
    const connectorSelected = shapeSelected && this.graphic.shape === "connector"
    const labelableShapeSelected = shapeSelected && this.graphic.shape !== "line" && this.graphic.shape !== "connector"
    const shapesSelected = selectionCount > 0
    const options = this.graphic.options
    return html`
      <ribbon-drawer label="Graphic" icon="Graphic" layout="graphic">
        ${graphicShapeOptions.map(option => html`
          <ribbon-button
            label=${option.label}
            action=${`add-graphic-shape:${option.type}`}
            icon=${option.icon}
            ?disabled=${!captured}
          ></ribbon-button>
        `)}
      </ribbon-drawer>
      <ribbon-drawer label="Geometry" icon="Geometry" layout="graphic-geometry">
        ${this.renderGraphicGeometryControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Text" icon="Text" layout="graphic-text">
        ${this.renderGraphicLabelControls(!labelableShapeSelected)}
      </ribbon-drawer>
      <ribbon-drawer label="Connector" icon="Connector" layout="graphic-connector">
        ${this.renderGraphicConnectorControls(!connectorSelected)}
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

  protected dispatchTableSemanticAction(detail: Record<string, unknown>) {
    this.dispatchEvent(new CustomEvent("table-semantic-action", {
      detail,
      bubbles: true,
      composed: true,
    }))
  }

  protected tableRowGroupLabel(type: TableRowGroupType) {
    return type === "thead" ? "Header" : type === "tfoot" ? "Footer" : "Body"
  }

  protected renderTableRowGroup(group: TableRowGroupState, position: number, count: number) {
    const label = this.tableRowGroupLabel(group.type)
    return html`
      <div class="table-semantic-card table-row-group-card">
        <div class="table-semantic-card-heading">
          <span>${label} · ${group.rows} ${group.rows === 1 ? "row" : "rows"}</span>
          <span class="table-semantic-actions">
            <button class="table-semantic-button icon" type="button" aria-label=${`Move ${label.toLowerCase()} group up`}
              ?disabled=${position === 0}
              @click=${() => this.dispatchTableSemanticAction({
                action: "move-row-group", index: group.index, expected: group.attributes, direction: -1,
              })}>↑</button>
            <button class="table-semantic-button icon" type="button" aria-label=${`Move ${label.toLowerCase()} group down`}
              ?disabled=${position === count - 1}
              @click=${() => this.dispatchTableSemanticAction({
                action: "move-row-group", index: group.index, expected: group.attributes, direction: 1,
              })}>↓</button>
            <button class="table-semantic-button icon" type="button" aria-label=${`Ungroup ${label.toLowerCase()} rows`}
              @click=${() => this.dispatchTableSemanticAction({
                action: "remove-row-group", index: group.index, expected: group.attributes,
              })}>×</button>
          </span>
        </div>
      </div>
    `
  }

  protected renderTableColumnGroup(group: TableColumnGroupState, position: number, count: number) {
    return html`
      <div class="table-semantic-card table-column-group-card">
        <div class="table-semantic-card-heading">
          <span>Column group ${position + 1}</span>
          <span class="table-semantic-actions">
            <button class="table-semantic-button icon" type="button" aria-label=${`Move column group ${position + 1} up`}
              ?disabled=${position === 0}
              @click=${() => this.dispatchTableSemanticAction({
                action: "move-column-group", path: group.path, expected: group.attributes, direction: -1,
              })}>↑</button>
            <button class="table-semantic-button icon" type="button" aria-label=${`Move column group ${position + 1} down`}
              ?disabled=${position === count - 1}
              @click=${() => this.dispatchTableSemanticAction({
                action: "move-column-group", path: group.path, expected: group.attributes, direction: 1,
              })}>↓</button>
            <button class="table-semantic-button icon" type="button" aria-label=${`Remove column group ${position + 1}`}
              @click=${() => this.dispatchTableSemanticAction({
                action: "remove-column-group", path: group.path, expected: group.attributes,
              })}>×</button>
          </span>
        </div>
        ${group.columns.length ? group.columns.map((column, columnIndex) => html`
          <div class="table-semantic-card">
            <div class="table-semantic-card-heading">
              <span>Column ${columnIndex + 1}</span>
              <button class="table-semantic-button icon" type="button"
                aria-label=${`Remove column ${columnIndex + 1} from group ${position + 1}`}
                @click=${() => this.dispatchTableSemanticAction({
                  action: "remove-column", path: column.path, expected: column.attributes,
                })}>×</button>
            </div>
            <label class="table-semantic-field">
              <span>Span</span>
              <input data-ribbon-input-persistent type="number" min="1" max="1000"
                aria-label=${`Column ${columnIndex + 1}: Span`}
                .value=${column.attributes.span ?? "1"}
                @change=${(event: Event) => this.dispatchTableSemanticAction({
                  action: "set-column-span",
                  path: column.path,
                  expected: column.attributes,
                  value: (event.currentTarget as HTMLInputElement).value || null,
                })} />
            </label>
          </div>
        `) : html`
          <label class="table-semantic-field">
            <span>Group span</span>
            <input data-ribbon-input-persistent type="number" min="1" max="1000"
              aria-label=${`Column group ${position + 1}: Span`}
              .value=${group.attributes.span ?? "1"}
              @change=${(event: Event) => this.dispatchTableSemanticAction({
                action: "set-column-span",
                path: group.path,
                expected: group.attributes,
                value: (event.currentTarget as HTMLInputElement).value || null,
              })} />
          </label>
        `}
        <button class="table-semantic-button" type="button"
          @click=${() => this.dispatchTableSemanticAction({
            action: "add-column", path: group.path, expected: group.attributes,
          })}>${group.columns.length ? "Add column" : "Define individual columns"}</button>
      </div>
    `
  }

  protected renderTableSemantics() {
    if(!this.table) return nothing
    const state = this.table
    const semantics = state.cellSemantics
    const roleOptions: Array<[TableCellRole, string]> = [
      ["data", "Data cell"],
      ["header", "Header cell"],
      ["column-header", "Header for this column"],
      ["row-header", "Header for this row"],
      ["column-group-header", "Header for this column group"],
      ["row-group-header", "Header for this row group"],
    ]
    return html`
      <div class="table-semantic-controls">
        <section class="table-semantic-section" aria-label="Row groups">
          <div class="table-semantic-heading"><span>Selected rows</span></div>
          <label class="table-semantic-field">
            <span>Place in</span>
            <select
              ${ref(element => {
                if(!(element instanceof HTMLSelectElement)) return
                const value = isTableRowGroupType(state.selectedRowGroup) ? state.selectedRowGroup : ""
                queueMicrotask(() => {
                  if(element.isConnected) element.value = value
                })
              })}
              data-ribbon-input-persistent aria-label="Selected rows: Group"
              @change=${(event: Event) => this.dispatchTableSemanticAction({
                action: "convert-rows", group: (event.currentTarget as HTMLSelectElement).value,
              })}>
              ${state.selectedRowGroup === "mixed" ? html`<option value="" selected disabled>Mixed groups</option>` : ""}
              ${state.selectedRowGroup === "direct" ? html`<option value="" selected disabled>Ungrouped rows</option>` : ""}
              <option value="thead" ?selected=${state.selectedRowGroup === "thead"}>Table header</option>
              <option value="tbody" ?selected=${state.selectedRowGroup === "tbody"}>Table body</option>
              <option value="tfoot" ?selected=${state.selectedRowGroup === "tfoot"}>Table footer</option>
            </select>
          </label>
          <div class="table-semantic-add-grid" aria-label="Add row group">
            <button class="table-semantic-button" type="button" ?disabled=${!state.canAddHeaderGroup}
              @click=${() => this.dispatchTableSemanticAction({action: "add-row-group", group: "thead"})}>Add header</button>
            <button class="table-semantic-button" type="button"
              @click=${() => this.dispatchTableSemanticAction({action: "add-row-group", group: "tbody"})}>Add body</button>
            <button class="table-semantic-button" type="button" ?disabled=${!state.canAddFooterGroup}
              @click=${() => this.dispatchTableSemanticAction({action: "add-row-group", group: "tfoot"})}>Add footer</button>
          </div>
          ${state.rowGroups.map((group, position) => this.renderTableRowGroup(group, position, state.rowGroups.length))}
        </section>
        <section class="table-semantic-section" aria-label="Column definitions">
          <div class="table-semantic-heading">
            <span>Column definitions</span>
            <button class="table-semantic-button" type="button"
              @click=${() => this.dispatchTableSemanticAction({action: "add-column-group"})}>Add group</button>
          </div>
          ${state.columnGroups.length
            ? state.columnGroups.map((group, position) => this.renderTableColumnGroup(group, position, state.columnGroups.length))
            : html`<p class="table-semantic-note">No explicit column definitions.</p>`}
        </section>
        <section class="table-semantic-section" aria-label="Cell semantics">
          <div class="table-semantic-heading"><span>Selected cells</span></div>
          <label class="table-semantic-field">
            <span>Role</span>
            <select
              ${ref(element => {
                if(!(element instanceof HTMLSelectElement)) return
                const value = semantics.role === "mixed" ? "" : semantics.role
                queueMicrotask(() => {
                  if(element.isConnected) element.value = value
                })
              })}
              data-ribbon-input-persistent aria-label="Selected cells: Role"
              @change=${(event: Event) => this.dispatchTableSemanticAction({
                action: "set-cell-role", role: (event.currentTarget as HTMLSelectElement).value,
              })}>
              ${semantics.role === "mixed" ? html`<option value="" selected disabled>Mixed roles</option>` : ""}
              ${roleOptions.map(([value, label]) => html`
                <option value=${value} ?selected=${semantics.role === value}>${label}</option>
              `)}
            </select>
          </label>
          <label class="table-semantic-field">
            <span>Associated header IDs</span>
            <input data-ribbon-input-persistent type="text" aria-label="Selected cells: Associated header IDs"
              placeholder=${semantics.headers === null ? "Mixed values" : "heading-id another-id"}
              .value=${semantics.headers ?? ""}
              @change=${(event: Event) => this.dispatchTableSemanticAction({
                action: "set-cell-attribute", attribute: "headers",
                value: (event.currentTarget as HTMLInputElement).value || null,
              })} />
          </label>
          <label class="table-semantic-field">
            <span>Abbreviation</span>
            <input data-ribbon-input-persistent type="text" aria-label="Selected cells: Abbreviation"
              ?disabled=${semantics.role === "data"}
              placeholder=${semantics.abbr === null ? "Mixed values" : "Short header label"}
              .value=${semantics.abbr ?? ""}
              @change=${(event: Event) => this.dispatchTableSemanticAction({
                action: "set-cell-attribute", attribute: "abbr",
                value: (event.currentTarget as HTMLInputElement).value || null,
              })} />
          </label>
        </section>
      </div>
    `
  }

  protected renderTableDrawers() {
    const active = Boolean(this.table?.active)
    return html`
      <ribbon-drawer label="Layout" icon="TableLayout" layout="table-layout">
        <ribbon-button label="Row above" action="table-row-above" icon="TableRowAbove" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Row below" action="table-row-below" icon="TableRowBelow" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column left" action="table-column-left" icon="TableColumnLeft" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Column right" action="table-column-right" icon="TableColumnRight" ?disabled=${!active}></ribbon-button>
        <ribbon-button label="Merge cells" action="table-merge-cells" icon="TableMergeCells" ?disabled=${!this.table?.canMerge}></ribbon-button>
        <ribbon-button label="Split cells" action="table-split-cells" icon="TableSplitCells" ?disabled=${!this.table?.canSplit}></ribbon-button>
        <ribbon-button label="Split table" action="table-split" icon="TableSplit" ?disabled=${!active}></ribbon-button>
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
      </ribbon-drawer>
      <ribbon-drawer label="Borders" icon="TableBorders" layout="table-borders">
        ${this.renderTableBorderControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Background" icon="TableBackground" layout="table-background">
        ${this.renderTableBackgroundControls()}
      </ribbon-drawer>
      <ribbon-drawer label="Semantics" icon="Settings" layout="table-semantics">
        ${this.renderTableSemantics()}
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
      ?? this.historyState.currentCheckpointId
      ?? this.historyState.checkpoints[0]?.id
      ?? null
  }

  protected scrollNewHistoryCardIntoView(previousState: unknown) {
    if(!this.renderRoot.querySelector('.history-timeline')) return
    const previousCheckpoints = previousState && typeof previousState === "object"
      && Array.isArray((previousState as Partial<VersionHistoryState>).checkpoints)
      ? (previousState as VersionHistoryState).checkpoints
      : []
    const previousIds = new Set(previousCheckpoints.map(checkpoint => checkpoint.id))
    const added = this.historyState.checkpoints.filter(checkpoint => !previousIds.has(checkpoint.id))
    if(!added.length) return
    const checkpoint = added.find(candidate => candidate.id === this.historyState.currentCheckpointId) ?? added[0]
    const card = Array.from(this.renderRoot.querySelectorAll<HTMLElement>(".history-version-card"))
      .find(candidate => candidate.dataset.checkpointId === checkpoint.id)
    card?.scrollIntoView({
      behavior: previousCheckpoints.length ? "smooth" : "auto",
      block: "nearest",
      inline: "nearest",
    })
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

  protected renderHistoryVersionsDrawer() {
    const selectedId = this.selectedHistoryCheckpointId
    const checkpoints = [...this.historyState.checkpoints].reverse()
    const currentIndex = checkpoints.findIndex(checkpoint =>
      checkpoint.id === this.historyState.currentCheckpointId,
    )
    return html`
      <ribbon-drawer label="Versions" icon="History" layout="history-versions">
        <div class="history-timeline" role="list" aria-label="Document versions">
          ${this.historyError ? html`<div class="history-error" role="alert">${this.historyError}</div>`
          : this.historyLoading && !this.historyState.checkpoints.length
            ? html`<div class="history-loading">Loading versions…</div>`
            : !this.historyState.checkpoints.length
              ? html`<div class="history-empty">No checkpoints yet</div>`
              : checkpoints.map((checkpoint, index) => html`
                <div
                  class="history-version-card"
                  role="listitem"
                  data-checkpoint-id=${checkpoint.id}
                  ?data-selected=${selectedId === checkpoint.id}
                  ?data-after-current=${currentIndex >= 0 && index > currentIndex}
                >
                  <button
                    class="history-checkpoint"
                    type="button"
                    data-checkpoint-id=${checkpoint.id}
                    aria-pressed=${selectedId === checkpoint.id}
                    title=${checkpoint.label}
                    @click=${this.selectHistoryCheckpoint}
                  >
                    <span
                      class="history-checkpoint-avatar"
                      style=${`--history-user-color: ${checkpoint.user.color}`}
                      aria-hidden="true"
                    >${checkpoint.user.initials}</span>
                    <span class="history-checkpoint-label">${this.historyTimestamp(checkpoint.timestamp)}</span>
                    <span class="history-checkpoint-meta">By ${this.historyAuthor(checkpoint.user)}</span>
                    <span class="history-checkpoint-counts" aria-label=${`${checkpoint.changes.added} added, ${checkpoint.changes.removed} removed, ${checkpoint.changes.modified} changed`}>
                      <span class="history-count" data-kind="added">+${checkpoint.changes.added}</span>
                      <span class="history-count" data-kind="removed">−${checkpoint.changes.removed}</span>
                      <span class="history-count" data-kind="modified">~${checkpoint.changes.modified}</span>
                      ${checkpoint.commentCount ? html`<span class="history-count" data-kind="comments">${checkpoint.commentCount} 💬</span>` : ""}
                    </span>
                  </button>
                  <button
                    class="history-card-restore-button"
                    type="button"
                    data-checkpoint-id=${checkpoint.id}
                    aria-label=${`Restore version from ${this.historyTimestamp(checkpoint.timestamp)}`}
                    title=${checkpoint.id === this.historyState.currentCheckpointId
                      ? "Already active"
                      : `Restore version from ${this.historyTimestamp(checkpoint.timestamp)}`}
                    ?disabled=${this.historyLoading || checkpoint.id === this.historyState.currentCheckpointId}
                    @click=${this.revertHistoryCheckpoint}
                  >
                    <span class="history-card-restore-icon" aria-hidden="true">${ribbonIcon("Restore")}</span>
                    <span>Restore</span>
                  </button>
                </div>
              `)}
        </div>
      </ribbon-drawer>
    `
  }

  protected usesNativePointerInteraction(_event: MouseEvent) { return false }

  private readonly handleLinkPointerDown = (event: PointerEvent) => {
    if(!event.composedPath().includes(this)) this.closeLinkAttributeMenu()
  }

  private readonly handleLinkKeydown = (event: KeyboardEvent) => {
    if(event.key !== "Escape" || !this.linkAttributeMenuOpen) return
    event.stopImmediatePropagation()
    this.closeLinkAttributeMenu()
    this.renderRoot.querySelector<RibbonButton>('ribbon-button[action="mark:a"]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>(".button-dropdown-more")?.focus()
  }

  private syncLinkMenuListeners() {
    this.ownerDocument.removeEventListener("pointerdown", this.handleLinkPointerDown)
    this.ownerDocument.removeEventListener("keydown", this.handleLinkKeydown, true)
    if(this.linkAttributeMenuOpen && this.isConnected) {
      this.ownerDocument.addEventListener("pointerdown", this.handleLinkPointerDown)
      this.ownerDocument.addEventListener("keydown", this.handleLinkKeydown, true)
    }
  }

  connectedCallback() {
    super.connectedCallback()
    this.syncLinkMenuListeners()
  }

  disconnectedCallback() {
    this.ownerDocument.removeEventListener("pointerdown", this.handleLinkPointerDown)
    this.ownerDocument.removeEventListener("keydown", this.handleLinkKeydown, true)
    super.disconnectedCallback()
  }

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
    if(changed.has("marks") && !this.marks.includes("a")) this.closeLinkAttributeMenu()
    if(changed.has("linkAttributeMenuOpen")) this.syncLinkMenuListeners()
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
    if(drawer.label === "Paragraph") return this.renderParagraphDrawer()
    if(drawer.label === "Heading group") return this.renderHeadingGroupDrawer()
    if(drawer.label === "List") return this.renderListDrawer()
    if(drawer.label === "Disclosure") return this.renderDisclosureDrawer()
    if(drawer.label === "Attributes") return this.renderElementAttributesDrawer()
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
              .icon=${item.icon ?? item.label}
              .submenu=${item.submenu ?? []}
            ></ribbon-button>
          `
        })}
      </ribbon-drawer>
    `
  }
}
