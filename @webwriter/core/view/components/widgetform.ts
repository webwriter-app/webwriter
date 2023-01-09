import { LitElement, html, css, TemplateResult } from "lit"
import { customElement, property } from "lit/decorators.js"
import {ScopedElementsMixin} from "@open-wc/scoped-elements"

import {SlInput, SlColorPicker, SlSelect, SlTextarea, SlCheckbox, SlDetails, SlCard, SlRadio, SlRadioGroup, SlMenuItem, SlTabGroup, SlTab, SlTabPanel, SlAlert } from "@shoelace-style/shoelace"
import { classMap } from "lit/directives/class-map.js"
import {FileInput as WwFileInput, ImageCoordinatePicker as WwImageCoordinatePicker, RichTextEditor as WwRichTextEditor} from "."

/* to support:

CORE:
https://github.com/h5p/h5p-editor-collage
https://github.com/h5p/h5p-editor-image-hotspot-question

OPTIONAL:
https://github.com/h5p/h5p-editor-interactive-video
https://github.com/h5p/h5p-editor-three-image
https://github.com/h5p/h5p-editor-course-presentation
https://github.com/h5p/h5p-editor-drag-question
https://github.com/h5p/h5p-editor-audio-recorder
https://github.com/h5p/h5p-editor-branching-scenario
https://github.com/h5p/h5p-editor-summary-textual-editor
https://github.com/h5p/h5p-editor-single-choice-set-textual-editor
https://github.com/h5p/h5p-editor-question-set-textual-editor
https://github.com/h5p/h5p-editor-impressive-presentation
https://github.com/h5p/h5p-editor-radio-selector
https://github.com/h5p/h5p-editor-shape
https://github.com/h5p/h5p-editor-select-toggle-fields
https://github.com/h5p/h5p-editor-conditional
https://github.com/h5p/h5p-editor-multi-line-select
https://github.com/h5p/h5p-editor-hierarchic-list
https://github.com/h5p/h5p-editor-table-list
*/

function capitalize(s: string) {
  return s? s[0].toUpperCase() + s.slice(1): s
}

interface BasePropertyDescription {
  name: string
  label?: string
  description?: string
  optional?: boolean
  importance?: "low" | "medium" | "high"
  common?: boolean
  attribute?: boolean
  showWhen?: {
    rules: {field: string, equals: boolean | string[]}[]
    type?: "and" | "or"
    detach?: boolean
    nullWhenHidden?: boolean
  },
  parent?: PropertyDescription
}

interface TextPropertyDescription extends BasePropertyDescription {
  type: "text"
  value?: string 
  default?: string
  widget?: "textarea" | "html" | "colorSelector" | "showWhen" | "none" | string
  maxLength?: number
  regexp?: {pattern: string, modifiers?: string}
  enterMode?: "p" | "div"
  tags: string[]
  font?: {size?: boolean, family?: boolean, color?: boolean, background?: boolean}
  important?: {description: string, example?: string},
  spectrum?: {
    flat?: boolean,
    showInput?: boolean,
    showInitial?: boolean,
    allowEmpty?: boolean,
    showAlpha?: boolean,
    disabled?: boolean,
    localStorageKey?: string,
    showPalette?: boolean,
    showPaletteOnly?: boolean,
    togglePaletteOnly?: boolean,
    showSelectionPalette?: boolean,
    clickoutFiresChange?: boolean,
    cancelText?: string,
    chooseText?: string,
    togglePaletteMoreText?: string,
    togglePaletteLessText?: string,
    containerClassName?: string,
    replacerClassName?: string,
    preferredFormat?: string,
    maxSelectionSize?: number,
    palette?: string[][],
    selectionPalette?: string[]
  }
}


interface BooleanPropertyDescription extends BasePropertyDescription {
  type: "boolean"
  value?: boolean
  default?: boolean
  widget?: "showWhen" | "none" | string
}

interface NumberPropertyDescription extends BasePropertyDescription {
  type: "number"
  value?: number
  default?: number
  widget?: "timecode" | "showWhen" | "none" | string
  min?: number
  max?: number
  steps?: number
  decimals?: number
}

interface ObjectPropertyDescription extends BasePropertyDescription {
  type: "object"
  value?: object 
  default?: object
  widget?: "showWhen" | "none" | string
}

interface ArrayPropertyDescription extends BasePropertyDescription {
  type: "array"
  value?: any[]
  default?: any[]
  widget?: "showWhen" | "none" | string
  min?: number
  max?: number
  entity?: string
  isSubContent?: boolean
  expanded?: boolean
}

interface FilePropertyDescription extends BasePropertyDescription {
  type: "file"
  value?: string
  widget?: "showWhen" | "none" | string
}

interface GroupPropertyDescription extends BasePropertyDescription {
  type: "group"
  value?: any
  widget?: "wizard" | "linkWidget" | "imageCoordinateSelector" | "duration" | "showWhen" | "none" | string
  isSubContent?: boolean
  expanded?: boolean
  fields?: PropertyDescription[]
  imageFieldPath?: string
}

interface ListPropertyDescription extends BasePropertyDescription {
  type: "list"
  value?: any[]
  widget?: "verticalTabs" | "showWhen" | "none" | string
  field?: PropertyDescription
  min?: number
  max?: number
  entity?: string
}

interface SelectPropertyDescription extends BasePropertyDescription {
  type: "select"
  value?: string
  default?: string
  widget?: "radioGroup" | "showWhen" | "none" | string
  options?: {label: string, value: string}[]
}

interface ImagePropertyDescription extends BasePropertyDescription {
  type: "image"
  value?: string
  widget?: "showWhen" | "none" | string
}

interface AudioPropertyDescription extends BasePropertyDescription {
  type: "audio"
  value?: string
  widget?: "showWhen" | "none" | string
}

interface VideoPropertyDescription extends BasePropertyDescription{
  type: "video"
  value?: string
  widget?: "showWhen" | "none" | string
}

interface LibraryPropertyDescription extends BasePropertyDescription {
  type: "library"
  value?: any
  default?: string
  widget?: "showWhen" | "none" | string
  options: string[]
}

type PropertyDescription = TextPropertyDescription | BooleanPropertyDescription | NumberPropertyDescription | ObjectPropertyDescription | ArrayPropertyDescription | FilePropertyDescription | GroupPropertyDescription | ListPropertyDescription | SelectPropertyDescription | ImagePropertyDescription | AudioPropertyDescription | VideoPropertyDescription | LibraryPropertyDescription
type DescriptionType = PropertyDescription["type"]
type Entry<T=DescriptionType> = [PropertyKey, PropertyDescription & {type: T}]
type Root = Record<PropertyKey, PropertyDescription>
type ChangeCallback = (name: PropertyKey, value: any) => void


@customElement("ww-widget-form")
export class WidgetForm extends ScopedElementsMixin(LitElement) {
  
  _widgetProperties: Record<PropertyKey, PropertyDescription>

  static supportedEditorWidgets = [
    "none",
    "showWhen",
    "textarea",
    "html",
    "colorSelector",
    "timecode",
    "wizard",
    "linkWidget",
    "imageCoordinateSelector",
    "duration",
    "verticalTabs",
    "radioGroup"
  ]

  static backlinkPropertyTree(node: Record<PropertyKey, PropertyDescription> | PropertyDescription, parent?: PropertyDescription) {
    if(node?.name && !(node as any).fields) { // leaf
      let _node = node as PropertyDescription
      _node.parent = parent
    }
    else if(node?.name && (node as any).fields) { // group branch
      let _node = node as GroupPropertyDescription
      _node.fields.forEach(desc => WidgetForm.backlinkPropertyTree(desc, _node))
    }
    else if(node?.name && (node as any).field) { // list branch
      let _node = node as ListPropertyDescription
      WidgetForm.backlinkPropertyTree(_node.field, _node)
    }
    else { // root
      let _node = node as  Record<PropertyKey, PropertyDescription>
      Object.values(_node).forEach(desc => WidgetForm.backlinkPropertyTree(desc))
    }
  }

  @property({attribute: false})
  get widgetProperties() {
    return this._widgetProperties
  }

  set widgetProperties(value: Record<PropertyKey, PropertyDescription>) {
    WidgetForm.backlinkPropertyTree(value)
    this._widgetProperties = value
  }



  emitWidgetPropertyChange = (name: PropertyKey, value: any) => this.dispatchEvent(
    new CustomEvent(
      "ww-widget-property-change",
      {composed: true, bubbles: true, detail: {name, value}}
    )
  )

  static get scopedElements() {
    return {
      "sl-input": SlInput,
      "sl-select": SlSelect,
      "sl-menu-item": SlMenuItem,
      "sl-textarea": SlTextarea,
      "sl-color-picker": SlColorPicker,
      "sl-checkbox": SlCheckbox,
      "sl-details": SlDetails,
      "sl-card": SlCard,
      "sl-radio": SlRadio,
      "sl-radio-group": SlRadioGroup,
      "sl-tab": SlTab,
      "sl-tab-panel": SlTabPanel,
      "sl-tab-group": SlTabGroup,
      "sl-alert": SlAlert,
      "ww-file-input": WwFileInput,
      "ww-image-coordinate-picker": WwImageCoordinatePicker,
      "ww-rich-text-editor": WwRichTextEditor,
    }
  }

  static Text([name, desc]: Entry<"text">, onChange: ChangeCallback, root: Root, show=true) {
    if(desc.widget === "textarea") {
      return html`<sl-textarea
        @sl-input=${e => onChange(name, e.target.value)}
        value=${desc.value ?? desc.default}
        class=${classMap({"text": true, [desc.importance ?? "low"]: true})}
        defaultValue=${desc.default}
        helpText=${desc.description}
        maxlength=${desc.maxLength}
        ?disabled=${!show}
      >
      ${WidgetForm.LabelTemplate([name, desc])}
      </sl-textarea>`
    }
    else if(desc.widget === "colorSelector") {
      return html`<sl-color-picker
        @sl-input=${e => onChange(name, e.target.value)}
        value=${desc.value ?? desc.default}
        class=${classMap({"text": true, "color": true, [desc.importance ?? "low"]: true})}
        defaultValue=${desc.default}
        helpText=${desc.description}
        format=${desc?.spectrum?.preferredFormat as any}
        .swatches=${desc?.spectrum?.palette?.flatMap(color => color) ?? []}
        ?opacity=${desc?.spectrum.showAlpha}
        ?disabled=${!show}
      >
      ${WidgetForm.LabelTemplate([name, desc])}
      </sl-color-picker>`
    }
    else if(desc.widget === "html") {
      return html`<ww-rich-text-editor
        value=${desc.value ?? desc.default}
        @change=${e => onChange(name, e.target.value)}
        class=${classMap({"text": true, "html": true, [desc.importance ?? "low"]: true})}
        defaultValue=${desc.default}
        helpText=${desc.description}
        ?disabled=${!show}
      >
      ${WidgetForm.LabelTemplate([name, desc])}
      </ww-rich-text-editor>`
    }
    else {
      return html`<sl-input
        @sl-input=${e => onChange(name, e.target.value)}
        value=${desc.value ?? desc.default}
        class=${classMap({"text": true, [desc.importance ?? "low"]: true})}
        defaultValue=${desc.default}
        helpText=${desc.description}
        maxlength=${desc.maxLength}
        pattern=${desc.regexp?.pattern}
        ?disabled=${!show}
      >
      ${WidgetForm.LabelTemplate([name, desc])}
      </sl-input>`
    }
  }

  static Boolean([name, desc]: Entry<"boolean">, onChange: ChangeCallback, root: Root, show=true) {
    return html`<sl-checkbox
      @sl-input=${e => onChange(name, e.target.value)}
      value=${desc.value ?? desc.default}
      class=${classMap({"boolean": true, [desc.importance ?? "low"]: true})}
      .defaultValue=${desc.default}
      helpText=${desc.description}
      ?disabled=${!show}
    >
    ${WidgetForm.LabelTemplate([name, desc])}
    </sl-checkbox>`
  }

  static Number([name, desc]: Entry<"number">, onChange: ChangeCallback, root: Root, show=true) {
    return html`<sl-input 
      type=${desc.widget === "timecode"? "time": "number"}
      @sl-input=${e => onChange(name, e.target.value)}
      value=${desc.value ?? desc.default}
      class=${classMap({"number": true, [desc.importance ?? "low"]: true})}
      defaultValue=${desc.default}
      helpText=${desc.description}
      min=${desc.min}
      max=${desc.max}
      step=${desc.steps}
      ?disabled=${!show}
      inputmode=${!desc.decimals? "numeric": "decimal"}
    >
    ${WidgetForm.LabelTemplate([name, desc])}
    </sl-input>`
  }

  static Object([name, desc]: Entry<"object">, onChange: ChangeCallback, root: Root, show=true) {
    return html`<sl-textarea
      @sl-input=${e => onChange(name, JSON.parse(e.target.value))}
      value=${JSON.stringify(desc.value ?? desc.default)}
      class=${classMap({"object": true, [desc.importance ?? "low"]: true})}
      defaultValue=${JSON.stringify(desc.default)}
      helpText=${desc.description}
      ?disabled=${!show}
    >
    ${WidgetForm.LabelTemplate([name, desc])}
    </sl-textarea>`
  }

  static Array([name, desc]: Entry<"array">, onChange: ChangeCallback, root: Root, show=true) {
    return html`<sl-textarea
      @sl-input=${e => onChange(name, JSON.parse(e.target.value))}
      value=${JSON.stringify(desc.value ?? desc.default)}
      class=${classMap({"array": true, [desc.importance ?? "low"]: true})}
      defaultValue=${JSON.stringify(desc.default)}
      helpText=${desc.description}
      ?disabled=${!show}
    >
    ${WidgetForm.LabelTemplate([name, desc])}
    </sl-textarea>`
  }

  static Group([name, desc]: Entry<"group">, onChange: ChangeCallback, root: Root, show=true) {
    if(desc.widget === "linkWidget") {
      const prefixDescription = (desc.fields[0] as SelectPropertyDescription)
      const prefixOptions = prefixDescription.options.map(({label, value}) => html`
        <sl-menu-item value=${value}>${label}</sl-menu-item>
      `)
      return html`<sl-input
        type="url"
        @sl-input=${e => onChange(name, e.target.value)}
        value=${desc.value}
        class=${classMap({"group": true, [desc.importance ?? "low"]: true})}
        helpText=${desc.description}
        inputmode="url"
        ?disabled=${!show}
      >
        ${WidgetForm.LabelTemplate([name, desc])}
        <sl-select ?disabled=${!show} slot="prefix">${prefixOptions}</sl-select>
      </sl-input>`
    }
    else if(desc.widget === "duration") {
      const numberDesc1 = desc.fields[0] as NumberPropertyDescription
      const numberDesc2 = desc.fields[1] as NumberPropertyDescription
      return html`<div>
        <sl-input 
          type="number"
          @sl-input=${e => onChange(`${String(name)}/${String(numberDesc1.name)}`, e.target.value)}
          value=${numberDesc1.value ?? numberDesc1.default}
          class=${classMap({"number": true, [numberDesc1.importance ?? "low"]: true})}
          defaultValue=${numberDesc1.default}
          helpText=${numberDesc1.description}
          min=${numberDesc1.min}
          max=${numberDesc1.max}
          step=${numberDesc1.steps}
          inputmode=${!numberDesc1.decimals? "numeric": "decimal"}
          ?disabled=${!show}
        >
        ${WidgetForm.LabelTemplate([numberDesc1.name, numberDesc1])}
        </sl-input>
        <sl-input 
          type="number"
          @sl-input=${e => onChange(`${String(name)}/${String(numberDesc2.name)}`, e.target.value)}
          value=${numberDesc2.value ?? numberDesc2.default}
          class=${classMap({"number": true, [numberDesc2.importance ?? "low"]: true})}
          defaultValue=${numberDesc2.default}
          helpText=${numberDesc2.description}
          min=${numberDesc2.min}
          max=${numberDesc2.max}
          step=${numberDesc2.steps}
          inputmode=${!numberDesc2.decimals? "numeric": "decimal"}
          ?disabled=${!show}
        >
        ${WidgetForm.LabelTemplate([numberDesc2.name, numberDesc2])}
        </sl-input>
      </div>`
    }
    else if(desc.widget === "imageCoordinateSelector") {
      const xDesc = desc.fields[0] as NumberPropertyDescription
      const yDesc = desc.fields[1] as NumberPropertyDescription
      const x = xDesc.value
      const y = yDesc.value
      const defaultCoordinates = xDesc.default && yDesc.default? [{x: xDesc.default, y: yDesc.default}]: undefined
      const imageField = WidgetForm.resolve(desc.imageFieldPath, root, desc)
      const src = imageField.value
      return html`<div>
        <ww-image-coordinate-picker 
          @change=${e => {
            onChange(`${String(name)}/${String(xDesc.name)}`, e.target.coordinates[0].x)
            onChange(`${String(name)}/${String(yDesc.name)}`, e.target.coordinates[0].y)
          }}
          .coordinates=${x && y? [{x, y}]: defaultCoordinates}
          class=${classMap({"group": true, [desc.importance]: true})}
          .defaultValue=${defaultCoordinates}
          src=${src}
          helpText=${desc.description}
          ?disabled=${!show}
        >
        ${WidgetForm.LabelTemplate([name, desc])}
        </ww-image-coordinate-picker>
      </div>`
    }
    else if(desc.widget === "wizard") {
      const TabEntry = (field: PropertyDescription, i: number) => html`
        <sl-tab panel=${field.name}>${i}. ${field.label}</sl-tab>
        <sl-tab-panel name=${field.name}>
          ${WidgetForm.EntryTemplate([field.name, field], (name, value) => onChange(`${desc.name}/${String(name)}`, value), root)}
        </sl-tab-panel>
      `
      return html`<sl-card class=${classMap({"group": true, [desc.importance ?? "low"]: true})}>
        <span slot="header">${WidgetForm.LabelTemplate([name, desc])}</span>
        <div class="help-text">${desc.description}</div>
        <sl-tab-group>
          ${desc.fields.map(TabEntry)}
        </sl-tab-group>
      </sl-card>
      `
    }
    else {
      return html`<sl-details class=${classMap({"group": true, [desc.importance ?? "low"]: true})}>
        ${WidgetForm.LabelTemplate([name, desc], "summary")}
        <div class="help-text">${desc.description}</div>
        ${desc.fields.map(field => WidgetForm.EntryTemplate([field.name, field], (name, value) => onChange(`${desc.name}/${String(name)}`, value), root))}
      </sl-details>`
    }
  }

  static List([name, desc]: Entry<"list">, onChange: ChangeCallback, root: Root, show=true) {
    const TabEntry = (field: PropertyDescription, i: number) => html`
    <sl-tab panel=${field.name}>${field.label}</sl-tab>
    <sl-tab-panel name=${field.name}>
      ${WidgetForm.EntryTemplate(field as any, (name, value) => onChange(`${desc.name}/#${i}/${String(name)}`, value), root)}
    </sl-tab-panel>
  `
    if(desc.widget === "verticalTabs") {
      return html`
        <sl-card class=${classMap({"list": true, [desc.importance ?? "low"]: true})}>
          <span slot="header" title=${desc.description}>
            ${WidgetForm.LabelTemplate([name, desc])}
          </span>
          <sl-tab-group placement="start">
            ${desc.value.map((value, i) => TabEntry({...desc.field, value}, i))}
          </sl-tab-group>
        </sl-card>
      `
    }
    else {
      return html`<sl-card class=${classMap({"list": true, [desc.importance ?? "low"]: true})}>
        <span slot="header" title=${desc.description}>
        ${WidgetForm.LabelTemplate([name, desc])}
        </span>
        ${desc.value?.map((v, i) => 
          WidgetForm.EntryTemplate([desc.name, {value: v, ...desc.field}], (name, value) => onChange(`${String(desc.name)}/#${i}/${String(name)}`, value), root)
        )}
      </sl-card>`
    }
  }

  static Select([name, desc]: Entry<"select">, onChange: ChangeCallback, root: Root, show=true) {
    if(desc.widget === "radioGroup") {
      return html`<sl-select
        @sl-input=${e => onChange(name, e.target.value)}
        value=${desc.value ?? desc.default}
        class=${classMap({"select": true, [desc.importance ?? "low"]: true})}
        defaultValue=${desc.default}
        helpText=${desc.description}
        ?disabled=${!show}
      >
        ${WidgetForm.LabelTemplate([name, desc])}
        ${desc.options.map(({label, value}) => html`
          <sl-menu-item value=${value}>${label}</sl-menu-item>
        `)}
      </sl-select>`
    }
    else {
      return html`<sl-radio-group
        @sl-input=${e => onChange(name, e.target.value)}
        value=${desc.value ?? desc.default}
        class=${classMap({"select": true, [desc.importance ?? "low"]: true})}
        defaultValue=${desc.default}
        helpText=${desc.description}
      >${desc.options.map(({label, value}) => html`
        <sl-radio ?disabled=${!show} value=${value}>${WidgetForm.LabelTemplate([name, desc])}</sl-radio>
      `)}</sl-radio-group>`
    }
  }

  static File([name, desc]: Entry<"file" | "image" | "audio" | "video">, onChange: ChangeCallback, root: Root, show=true) {
    return html`<ww-file-input
      accept=${desc.type === "file"? undefined: `${desc.type}/*`}
      @change=${e => e.target.files?.length > 0 && onChange(name, URL.createObjectURL(e.target.files.item(0)))}
      class=${classMap({[desc.type]: true, [desc.importance ?? "low"]: true})}
      helpText=${desc.description}
      ?disabled=${!show}
    >
    ${WidgetForm.LabelTemplate([name, desc])}
    </ww-file-input>`
  }

  static Image([name, desc]: Entry<"image">, onChange: ChangeCallback, root: Root, show=true) {
    return WidgetForm.File([name, desc], onChange, root)
  }

  static Audio([name, desc]: Entry<"audio">, onChange: ChangeCallback, root: Root, show=true) {
    return WidgetForm.File([name, desc], onChange, root)
  }

  static Video([name, desc]: Entry<"video">, onChange: ChangeCallback, root: Root, show=true) {
    return WidgetForm.File([name, desc], onChange, root)
  }

  static Library([name, desc]: Entry<"library">, onChange: ChangeCallback, root: Root, show=true) {
    return WidgetForm.Fallback([name, desc], onChange, root)
  }

  static Fallback([name, desc]: Entry<any>, onChange: ChangeCallback, root: Root, show=true) {
    return html`<sl-input
      class="unsupported-property"
      @sl-input=${e => onChange(name, JSON.parse(e.target.value))}
      value=${desc.value}
      helpText="Unsupported property type '${desc.type}' (processing as JSON)"
      ?disabled=${!show}
    >
    ${WidgetForm.LabelTemplate([name, desc])}
    </sl-input>`
  }

  static ShowWhenTemplate(entry: Entry, content: TemplateResult, show: boolean) {
    return html`<div class="show-when" inert=${!show}>
      <div class="show-when-overlay"></div>
      ${content}
    </div>`
  }

  static resolve(path: string, root: Root, start?: PropertyDescription): PropertyDescription {
    let parts = path.split("/")
    const isRelativePath = !path.startsWith("/")
    parts = isRelativePath && parts[0] !== "."? [".", ...parts]: parts
    if(isRelativePath && !start) {
      throw TypeError(`Need a value 'start' to resolve relative path ${path}`)
    }
    else {
      // H5P path resolution
      // ./a/b/c OR a/b/c -> sibling / child / child
      // ../a/b/c
      let pos = start as any
      for(const part of parts) {
        if(!pos) { // at the root
          pos = root[part]
        }
        else if(pos?.fields) { // at an object branch
          pos = pos.fields.find(field => field.name === part)
        }
        else if(pos?.field) { // at a list branch
          pos = {...pos.field, value: pos.value}
        }
        else if(part === ".") {
          pos = pos.parent
        }
        else if(part === "..") {
          pos = pos.parent.parent
        }
        else return null
      }
      return pos as PropertyDescription
    }
  }

  static showWhen([_, desc]: Entry, root: Root) {
    if(!desc.showWhen) {
      return true
    }
    let show = false
    for(let rule of desc.showWhen.rules) {
      const field = WidgetForm.resolve(rule.field, root, desc)
      const value = field.value ?? field["default"]
      if(["list", "library", "select"].includes(field.type)) {
        show = show || (!Array.isArray(rule.equals)
          ? rule.equals === value
          : rule.equals.includes(value))
      }
      else if(field.type === "boolean" || (field as any).type === Boolean) {
        show = show || rule.equals === value
      }
      else {
        return true
      }
    }
    return show
  }

  static EntryTemplate([name, desc]: Entry, onChange: ChangeCallback, root: Root) {
    let entryType = desc.type as any
    if([String, Boolean, Number, Object, Array].includes(entryType)) {
      desc.type = entryType = entryType === String? "text": entryType.name.toLowerCase()
    }
    let templateName = capitalize(entryType)
    const show = WidgetForm.showWhen([name, desc], root)
    const Template = WidgetForm[templateName] ?? WidgetForm.Fallback
    desc.widget && !WidgetForm.supportedEditorWidgets.includes(desc.widget)? console.log({desc, widget: desc.widget}): null
    const result = html`
      ${desc.widget && desc.widget !== "none" && !WidgetForm.supportedEditorWidgets.includes(desc.widget)
        ? html`<sl-alert variant="warning">${desc.widget} is not supported</sl-alert>`
        : null
      }
      ${Template([name, desc], onChange, root, show)}
    `
    return result
  }

  static LabelTemplate([name, desc]: Entry, slot="label") {
    return html`
      <label slot=${slot} for=${String(name)} class="label-container" ?data-required=${!desc.optional}>
        <span class="label">${desc.label}<span class="required-marker" title="Required for this widget">*</span></span>
        <span class="description">${desc.description}</span>
      </label>
    `
  }

  static get styles() {
    return css`
      .show-when {
        position: relative;
      }

      .show-when-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.25);
        z-index: 10;
      }

      .show-when-overlay[inert] {
        display: none;
      }

      sl-details::part(header) {
        padding: 10px;
      }

      .label-container {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        font-family: var(--sl-font-sans);
      }

      .label-container .label {
        font-size: var(--sl-font-size-medium);
        font-weight: 600;
      }

      .label-container .required-marker {
        display: none;
        font-weight: bold;
        color: var(--sl-color-primary-600);
      }

      .label-container[data-required] .required-marker {
        display: inline-block;
      }

      .label-container .description {
        font-size: var(--sl-font-size-small);
        color: var(--sl-color-neutral-600);
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
    `
  }

  render() {
    const onChange = this.emitWidgetPropertyChange
    const Template = WidgetForm.EntryTemplate
    const root = this.widgetProperties
    const normalEntries = Object.entries(root).filter(([, desc]) => !desc.common)
    const commonEntries = Object.entries(root).filter(([, desc]) => desc.common) 
    return html`<form>
      ${normalEntries.map(entry => Template(entry, onChange, root))}
      ${commonEntries.length === 0? null: html`
        <sl-details>
          <span slot="summary">Labels</span>
          ${commonEntries.map(entry => Template(entry, onChange, root))}
        </sl-details>
      `}
    </form>`
  }
}