import { LitElement, html, css } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { LitPickerElement } from "."
import { PICKER_COMMAND_PROPERTIES } from "#viewmodel/index.js"
import { CSSTransformValue } from "#model/index.js"
import { kebapCaseToCamelCase } from "#model/utility/index.js"

type DisplayOutside = "inline" | "block"
type DisplayInside = "flow" | "flow-root" | "table" | "flex" | "grid" | "ruby" | "math"
type DisplayInternal = "table-row-group" | "table-header-group" | "table-footer-group" | "table-row" | "table-cell" | "table-column-group" | "table-column" | "table-caption" | "ruby-base" | "ruby-text" | "ruby-base-container" | "ruby-text-container"
type DisplayBox = "none" | "contents"

const displayOutsideValues = ["inline", "block"]
const displayInsideValues = ["flow", "flow-root", "table", "flex", "grid", "ruby", "math"]
const displayInternalValues = ["table-row-group", "table-header-group", "table-footer-group", "table-row", "table-cell", "table-column-group", "table-column", "table-caption", "ruby-base", "ruby-text", "ruby-base-container", "ruby-text-container"]

type DisplayTuple<
  Outside extends DisplayOutside = DisplayOutside,
  Inside extends DisplayInside = DisplayInside
> = [Outside, Inside] | [Outside, Inside, "list-item"]

function parseDisplayStyle(display: string): DisplayTuple | DisplayBox | DisplayInternal {
  const keywords = display.split(/\s/)
  if(["none", "contents"].includes(display) && keywords.length === 1) {
    return display as "none" | "contents"
  }
  else if(display.startsWith("inline-") && keywords.length === 1) {
    return display.split("-") as ["inline", DisplayInside]
  }
  else if(keywords.length === 1 && displayInternalValues.includes(display)) {
    return display as DisplayInternal
  }
  else if(keywords.includes("list-item")) {
    const outside = keywords.find(kw => displayOutsideValues.includes(kw)) ?? "block"
    const inside = keywords.find(kw => ["flow", "flow-root"].includes(kw)) ?? "flow"
    if(inside !== "flow" && inside !== "flow-root") {
      throw Error(`Invalid display value: Expected 'flow' or 'flow-root' with 'list-item', found ${inside}`)
    }
    return [outside as DisplayOutside, inside, "list-item"]
  }
  else if(keywords.length === 1 || keywords.length === 2) {
    const outside = keywords.find(kw => displayOutsideValues.includes(kw)) ?? "block"
    const inside = keywords.find(kw => displayInsideValues.includes(kw)) ?? "flow"
    return [outside, inside].filter(kw => kw) as DisplayTuple
  }
  else {
    throw Error("Invalid display value")
  }
}

export class CSSDisplayValue {
  #outside: DisplayOutside | DisplayInternal | "contents" | "none"
  #inside?: DisplayInside
  #listItem: boolean = false

  get outside() {
    return this.#outside
  }

  set outside(v) {
    if(v === "contents" || v === "none" || displayInternalValues.includes(v)) {
      this.#outside = v
      this.#inside = undefined
      this.#listItem = false
    }
    else {
      this.#outside = v
    }
  }

  get inside() {
    return this.#inside
  }

  set inside(v) {
    if(this.#outside === "contents" || this.#outside === "none" || displayInternalValues.includes(this.#outside)) {
      this.#outside = "block"
    }
    if(v !== "flow" && v !== "flow-root" && this.#listItem) {
      this.#listItem = false
    }
    this.#inside = v
  }

  get listItem() {
    return this.#listItem
  }

  set listItem(v) {
    if(v && this.#inside !== "flow" && this.#inside !== "flow-root") {
      this.#inside = "flow"
    }
    this.#listItem = v
  }

  constructor(outside: DisplayOutside | DisplayInternal | "contents" | "none" = "block", inside: DisplayInside = "flow", listItem=false) {
    if(outside === "contents" || outside === "none" || displayInternalValues.includes(outside)) {
      this.outside = outside
    }
    else if(listItem && inside !== "flow" && inside !== "flow-root") {
      throw TypeError("<display-inside> value of 'list-item' must be 'flow' or 'flow-root'")
    }
    else {
      this.outside = outside
      this.inside = inside
      this.listItem = listItem
    }
  }

  static parse(str: string) {
    const result = parseDisplayStyle(str)
    if(typeof result === "string") {
      return new this(result)
    }
    else {
      return new this(result[0], result[1], result[2] === "list-item")
    }
  }

  toString() {
    return !this.inside
      ? this.outside
      : `${this.outside} ${this.inside}${this.listItem? " list-item": ""}` 
  }
}

@customElement("ww-box-picker")
export class BoxPicker extends LitPickerElement<(typeof PICKER_COMMAND_PROPERTIES)["boxStyle"][number]> {

  TransformHandler = (name: string) => (el?: HTMLElement) => {
    if(!el) {
      const str = `${kebapCaseToCamelCase(name)}(0px)`
      this.updateTransformComponent(str, true)
    }
    else {
      const str = `${kebapCaseToCamelCase(name)}(${this.getInputValue(name)})`
      this.updateTransformComponent(str)
    }
  }

  handlers = {
    "position-omni": (el?: HTMLElement) => {
      const v = (el as any)?.value as BoxPicker["positionOmni"]
      if(!el) {
        this.resolveChange("position", el, "")
        this.resolveChange("float", el, "")
        if(this.getCurrentValue("display")) {
          const display = CSSDisplayValue.parse(this.getCurrentValue("display"))
          display.outside = "block"
          this.resolveChange("display", el, String(display))
        }
      }
      else if(["relative", "absolute", "fixed", "sticky"].includes(v)) {
        this.resolveChange("position", el)
      }
      else if(v === "float-left" || v === "float-right") {
        this.resolveChange("float", el, v.split("-").at(-1))
      }
      else if(v === "inline" || v === "block") {
        const display = CSSDisplayValue.parse(this.getCurrentValue("display") || v)
        display.outside = v
        this.resolveChange("display", el, String(display))
        this.resolveChange("float", el, "")
      }
    },
    "translate-x": this.TransformHandler("translate-x"),
    "translate-y": this.TransformHandler("translate-y"),
    "translate-z": this.TransformHandler("translate-z"),
    "scale-x": this.TransformHandler("scale-x"),
    "scale-y": this.TransformHandler("scale-y"),
    "scale-z": this.TransformHandler("scale-z"),
    "rotate-x": this.TransformHandler("rotate-x"),
    "rotate-y": this.TransformHandler("rotate-y"),
    "rotate-z": this.TransformHandler("rotate-z"),
    "skew-x": this.TransformHandler("skew-x"),
    "skew-y": this.TransformHandler("skew-y"),
    "perspective": this.TransformHandler("perspective"),
  }

  propertyNames = PICKER_COMMAND_PROPERTIES.boxStyle

  element?: HTMLElement

  get container() {
    if(!this.element) {
      return undefined
    }
    else {
      let container = this.element.parentElement
      let type = undefined 
      while(!type && container) {
        const containerStyle = getComputedStyle(container)
        const [_, inside, __] = parseDisplayStyle(containerStyle.display)
        if(inside === "contents") {
          container = this.element.parentElement
        }
        else {
          return container
        }
      }
    }
  }

  get containerDisplayInside() {
    return !this.container
      ? undefined
      : parseDisplayStyle(getComputedStyle(this.container).display)[1] as DisplayInside
  }

  get containerHasColumnLayout() {
    return this.container && (getComputedStyle(this.container).columnCount !== "auto" || getComputedStyle(this.container).columnWidth !== "auto")
  }

  get elementIsListItem() {
    return this.element && parseDisplayStyle(getComputedStyle(this.element).display)[2] === "list-item"
  }

  get elementIsTableCell() {
    return this.element && parseDisplayStyle(getComputedStyle(this.element).display)[1] === "table-cell"
  }

  get elementIsInline() {
    return this.element && parseDisplayStyle(getComputedStyle(this.element).display)[0] === "inline"
  }

  get transformValue() {
    const v = this.getCurrentValue("transform")
    return !v || navigator.userAgent.search(/gecko/i)>0? undefined: CSSTransformValue.parse(v)
  }

  updateTransformComponent(v: string, remove=false) { // DEBUG
    const changeTransforms = Array.from(CSSTransformValue.parse(v))
    console.log(changeTransforms)
    let transforms = Array.from(this.transformValue ?? [])
    for(const value of changeTransforms) {
      const i = transforms.findIndex(t => t.constructor === value.constructor)
      if(remove) {
        transforms[i] = undefined as any
      }
      else if(i === -1) {
        transforms.push(value)
      }
      else if(value instanceof CSSTranslate) {
        const dimension = ["x", "y", "z"][[value.x, value.y, value.z].findIndex((v: any) => v.value)] as "x" | "y" | "z"
        transforms[i] = Object.assign(transforms[i], {[dimension]: value[dimension]})
      }
      else if(value instanceof CSSScale) {
        const dimension = ["x", "y", "z"][[value.x, value.y, value.z].findIndex(v => v !== 1)] as "x" | "y" | "z"
        transforms[i] = Object.assign(transforms[i], {[dimension]: value[dimension]})
      }
      else if(value instanceof CSSRotate) {
        const dimension = ["x", "y", "z"][[value.x, value.y, value.z].findIndex(v => v)] as "x" | "y" | "z"
        transforms[i] = Object.assign(transforms[i], {"angle": value.angle,[dimension]: value[dimension]})
      }
      else if(value instanceof CSSSkewX) {
        (transforms[i] as CSSSkewX).ax = value.ax
      }
      else if(value instanceof CSSSkewY) {
        (transforms[i] as CSSSkewY).ay = value.ay
      }
      else if(value instanceof CSSPerspective) {
        (transforms[i] as CSSPerspective).length = value.length
      }
      else {
        transforms.push(value)
      }
    }
    const finalTransforms = transforms.filter(t => t)
    const final = finalTransforms.length? new CSSTransformValue(finalTransforms): ""
    this.setPartialValue("transform", String(final))
  }

  getTransformComponent(name: "translate-x" | "translate-y" | "translate-z" | "scale-x" | "scale-y" | "scale-z" | "rotate-x" | "rotate-y" | "rotate-z" | "skew-x" | "skew-y" | "perspective") {
    const transforms = Array.from(this.transformValue ?? [])
    const d = name.split("-").at(-1) as "x" | "y" | "z"
    if(name.startsWith("translate-")) {
      return String((transforms.find(t => t instanceof CSSTranslate) ?? {x: "", y: "", z: ""})[d])
    }
    else if(name.startsWith("scale-")) {
      const value = (transforms.find(t => t instanceof CSSScale) ?? {x: undefined, y: undefined, z: undefined})[d] as CSSUnitValue
      return value? String(value.value * 100) + "%": ""
    }
    else if(name.startsWith("rotate-")) {
      return String((transforms.find(t => t instanceof CSSRotate && t[d]) as CSSRotate ?? {angle: ""}).angle)
    }
    else if(name === "skew-x") {
      return String((transforms.find(t => t instanceof CSSSkewX) ?? {ax: ""}).ax)
    }
    else if(name === "skew-y") {
      return String((transforms.find(t => t instanceof CSSSkewY) ?? {ay: ""}).ay)
    }
    else if(name.startsWith("perspective")) {
      return String(transforms.find(t => t instanceof CSSPerspective)?.length ?? "")
    }
  }
  
	static get styles() {
		return css`
        :host {
      display: contents;
    }

    :host(:not([advanced])) .advanced {
      display: none !important;
    }

    h2 {
      position: relative;
      text-align: right;
      font-size: 1rem;
      font-weight: bold;
      margin-bottom: 0.125rem;
      margin-top: 0;
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: baseline;
      &::after {
        content: "";
        display: block;
        background: black;
        width: 100%;
        height: 2px;
        position: absolute;
        top: 100%;
      }
    }

    section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      & form {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }
    }

    :is(ww-combobox, ww-css-property-input)::part(label) {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    sl-radio-group::part(button-group), sl-radio-group::part(button-group__base), sl-radio-button {
      width: 100%;
    }

    sl-icon {
      font-size: 1.25rem;
    }

    .color-input {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5em;
      font-size: var(--sl-input-label-font-size-small);
    }

    sl-range {
      width: 92.5%;
      &::part(form-control-label) {
        font-size: var(--sl-input-label-font-size-small);
      }
    }

    .wrapping-radio-group::part(button-group) {
      width: 100%;
    }

    .wrapping-radio-group::part(button-group__base) {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      grid-auto-rows: 1fr;
    }

    .wrapping-radio-group sl-radio-button {
      &::part(label) {
        padding: 0 var(--sl-spacing-2x-small);
      }
    }

    .wrapping-radio-group sl-radio-button:first-of-type::part(button) {
      border-bottom-left-radius: 0;
      margin-left: -1px;
    }

    .wrapping-radio-group sl-radio-button:last-of-type::part(button) {
      border-top-right-radius: 0;
    }

    .transform-group {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-auto-rows: min-content;
      gap: 0.5rem;

      & .double-column {
        grid-column: span 2;
      }
    }

    #box {
      sl-icon-button {
        vertical-align: sub;
        font-size: var(--sl-font-size-medium);
        &::part(base) {
          padding: 0;
        }
      }
    }

    .size-input {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-auto-rows: 1fr;
      align-items: end;
      gap: 0.5rem;
    }

    .spacing-group {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
      grid-auto-rows: min-content;
      gap: 0.5rem;

      & > :nth-child(2) {
        position: relative;
        &::part(form-control-label) {
          position: absolute;
          right: 100%;
          height: 100%;
          margin-right: 0.2rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          font-size: 0.75rem;
        }
      }

      & > :nth-child(3) {
        position: relative;
        &::part(form-control-label) {
          position: absolute;
          top: 100%;
          margin-top: 0.1rem;
          font-size: 0.75rem;
        }
      }

      & > :nth-child(4) {
        position: relative;
        &::part(form-control-label) {
          position: absolute;
          bottom: 100%;
          right: 0;
          margin-bottom: 0.1rem;
          font-size: 0.75rem;
        }
      }

      & > :nth-child(5) {
        position: relative;
        &::part(form-control-label) {
          position: absolute;
          left: 100%;
          height: 100%;
          margin-left: 0.2rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          font-size: 0.75rem;
        }
      }

      & > :first-child {
        grid-column: span 4;
      }

      & > :is(:nth-child(2), :nth-child(5)) {
        grid-column: 2 / 4;
      }

      & > :is(:nth-child(3), :nth-child(4)) {
        grid-column: span 2;
        grid-row: 3;
      }
    }

    sl-color-picker[slot=label] {
      &::part(trigger) {
        width: 0.9rem;
        height: 0.9rem;
        border: 1px solid darkgray;
      }

      &::part(trigger)::before {
        box-shadow: inset 0 0 0 1px var(--sl-input-border-color),
        inset 0 0 0 1px var(--sl-color-neutral-0);
      }
    }

    :is(.spacing-group, .overflow-group):not([data-open]) {
      & > *:not(:first-child) {
        display: none;
      }
    }

    .spacing-group css-numeric-input:not(:first-child)::part(base) {
      font-size: var(--sl-font-size-x-small);
    }

    .size-input:not([data-open]) {
      & > *:not(:first-child):not(:nth-child(2)) {
        display: none;
      }
    }

    #item {
      border: 2px solid darkgray;
      border-radius: 5px;
      padding: 10px;
      padding-top: calc(10px + 0.375rem);
      position: relative;
      margin-top: 0.5rem;

      & h2 {
        font-size: var(--sl-font-size-x-small);
        position: absolute;
        left: 7px;
        top: -0.5rem;
        padding: 0 3px;
        background: white;
        &::after {
          display: none;
        }
      }
    }



    [name]:has(css-global-input[value="none"]) {
      --sl-color-primary-600: var(--sl-color-neutral-600);
      --sl-color-primary-700: var(--sl-color-neutral-700);
      --sl-input-icon-color: var(--sl-color-neutral-600);
    }

    [name]:has(css-global-input:not(:is([value="none"], [value="custom"]))) {
      --sl-color-primary-600: var(--sl-color-amber-600);
      --sl-color-primary-700: var(--sl-color-amber-700);
      --sl-input-icon-color: var(--sl-color-amber-600);
    }

    [name=border-top]::part(form-control-label) {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      width: 45px;
    }

    [name=border-left]::part(form-control-label) {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: 45px;
    }

    [name=border-right]::part(form-control-label) {
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      width: 45px;
    }

    [name=border-bottom]::part(form-control-label) {
      display: flex;
      flex-direction: column-reverse !important;
      align-items: flex-start;
      width: 45px;
    }

    .border-style-group {
      display: flex;
      align-items: center;
      float: right;
      gap: 0.25rem;
    }

    [name=list-style-type] sl-radio-button:not([value=none])::part(label) {
      display: flex;
      justify-content: flex-end;
      margin-left: auto;
    }

    [name=list-style-type] [value=custom]::part(label) {
      font-size: 0.5rem;
    }

    .list-preview {
      display: list-item;
      list-style-position: inside;
    }

    .overflow-group {
      & sl-select::part(form-control-label) {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    }

    :is([name=overflow-x], [name=overflow-y])::part(combobox) {
      padding-inline: var(--sl-spacing-x-small);
    }

    sl-checkbox[slot=label] {
      align-self: center;
      margin-bottom: 0;
      &::part(base) {
        display: flex;
        align-items: center;
      }
    }

    css-numeric-input:is([name=border-width], [name=outline-width]) {
      &::part(form-control-label) {
        width: 100%;
      }
    }
    `
  }

  @property({type: String, attribute: true, reflect: true})
  activeSpacing: "margin" | "border" | "padding" | "size" | "overflow" | undefined

  @property({type: String, attribute: true, reflect: true})
  get positionOmni(): "inline" | "block" | "float-left" | "float-right" | "relative" | "absolute" | "fixed" | "sticky" | "" {
    const position = this.getCurrentValue("position") as "relative" | "absolute" | "fixed" | "sticky" | ""
    const displayOutside = ["block", "inline"].includes(CSSDisplayValue.parse(this.getCurrentValue("display")).outside)? CSSDisplayValue.parse(this.getCurrentValue("display")).outside as "block" | "inline": ""
    const float = this.getCurrentValue("float") && this.getCurrentValue("float") !== "none"
      ? (this.getCurrentValue("float") === "left"? "float-left": "float-right")
      : ""
    const value = float || position || displayOutside
    return value === "relative" && !this.advanced? float || displayOutside: value
  }

  BorderStyleGroup(direction?: "top" | "right" | "bottom" | "left" | "outline") {
    let colorName, styleName
    if(direction === "outline") {
      colorName = "outline-color" as const
      styleName = "outline-style" as const
    }
    else {
      colorName = direction? `border-${direction}-color` as const: "border-color"
      styleName = direction? `border-${direction}-style` as const: "border-style"
    }
    return html`<div class="border-style-group" slot="label">
      <sl-color-picker slot="label" size="small" name="border-color" hoist name=${colorName as any} @click=${(e: any) => {e.stopImmediatePropagation(); e.preventDefault()}} value=${this.getCurrentValue(colorName as any)}></sl-color-picker>
      <css-line-type-input name=${styleName as any} @click=${(e: any) => {e.stopImmediatePropagation(); e.preventDefault()}} value=${this.getCurrentValue(styleName as any) || "solid"}></css-line-type-input>
      ${!direction? html`
        <css-border-radius-input name="border-radius" value=${this.getCurrentValue("border-radius")} @click=${(e: any) => {e.stopImmediatePropagation(); e.preventDefault()}}></css-border-radius-input>
      `: undefined}
    </div>`
  } 

  ItemInputs() {
    const containerType = this.containerDisplayInside
    const inColumns = this.containerHasColumnLayout
    const isListItem = this.elementIsListItem

    const columnItemContent = !inColumns? undefined: html`
      <sl-switch class="advanced" size="small" name="column-span" data-defaultValue="none" data-otherValue="all" ?checked=${this.getCurrentValue("column-span") === "all"}>
        <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("column-span")}>${msg("Span all columns")}</css-global-input>
      </sl-switch>
    `

    const listItemContent = !isListItem? undefined: html`
      <sl-radio-group class="wrapping-radio-group" size="small" name="list-style-type" value=${this.getCurrentValue("list-style-type") || "disc"}>
        <sl-radio-button value="none" style="grid-column: span 4">${msg("None")}</sl-radio-button>
        <sl-radio-button value="disc">
          <span class="list-preview" style="list-style-type: disc"></span>
        </sl-radio-button>
        <sl-radio-button value="circle">
          <span class="list-preview" style="list-style-type: circle"></span>
       </sl-radio-button>
        <sl-radio-button value="square">
          <span class="list-preview" style="list-style-type: square"></span>
       </sl-radio-button>
        <sl-radio-button value="decimal">
          <span class="list-preview" style="list-style-type: decimal"></span>
       </sl-radio-button>
        <sl-radio-button value="armenian">
          <span class="list-preview" style="list-style-type: armenian"></span>
       </sl-radio-button>
        <sl-radio-button value="bengali">
          <span class="list-preview" style="list-style-type: bengali"></span>
       </sl-radio-button>
        <sl-radio-button value="cambodian">
          <span class="list-preview" style="list-style-type: cambodian"></span>
       </sl-radio-button>
        <sl-radio-button value="cjk-decimal">
          <span class="list-preview" style="list-style-type: cjk-decimal"></span>
       </sl-radio-button>
        <sl-radio-button value="cjk-earthly-branch">
          <span class="list-preview" style="list-style-type: cjk-earthly-branch"></span>
       </sl-radio-button>
        <sl-radio-button value="cjk-heavenly-stem">
          <span class="list-preview" style="list-style-type: cjk-heavenly-stem"></span>
       </sl-radio-button>
        <sl-radio-button value="cjk-ideographic">
          <span class="list-preview" style="list-style-type: cjk-ideographic"></span>
       </sl-radio-button>
        <sl-radio-button value="decimal-leading-zero">
          <span class="list-preview" style="list-style-type: decimal-leading-zero"></span>
       </sl-radio-button>
        <sl-radio-button value="devanagari">
          <span class="list-preview" style="list-style-type: devanagari"></span>
       </sl-radio-button>
        <sl-radio-button value="disclosure-closed">
          <span class="list-preview" style="list-style-type: disclosure-closed"></span>
       </sl-radio-button>
        <sl-radio-button value="disclosure-open">
          <span class="list-preview" style="list-style-type: disclosure-open"></span>
       </sl-radio-button>
        <sl-radio-button value="ethiopic-numeric">
          <span class="list-preview" style="list-style-type: ethiopic-numeric"></span>
       </sl-radio-button>
        <sl-radio-button value="hebrew">
          <span class="list-preview" style="list-style-type: hebrew"></span>
       </sl-radio-button>
        <sl-radio-button value="hiragana">
          <span class="list-preview" style="list-style-type: hiragana"></span>
       </sl-radio-button>
        <sl-radio-button value="hiragana-iroha">
          <span class="list-preview" style="list-style-type: hiragana-iroha"></span>
       </sl-radio-button>
        <sl-radio-button value="japanese-formal">
          <span class="list-preview" style="list-style-type: japanese-formal"></span>
       </sl-radio-button>
        <sl-radio-button value="japanese-informal">
          <span class="list-preview" style="list-style-type: japanese-informal"></span>
       </sl-radio-button>
        <sl-radio-button value="kannada">
          <span class="list-preview" style="list-style-type: kannada"></span>
       </sl-radio-button>
        <sl-radio-button value="katakana">
          <span class="list-preview" style="list-style-type: katakana"></span>
       </sl-radio-button>
        <sl-radio-button value="katakana-iroha">
          <span class="list-preview" style="list-style-type: katakana-iroha"></span>
       </sl-radio-button>
        <sl-radio-button value="khmer">
          <span class="list-preview" style="list-style-type: khmer"></span>
       </sl-radio-button>
        <sl-radio-button value="korean-hangul-formal">
          <span class="list-preview" style="list-style-type: korean-hangul-formal"></span>
       </sl-radio-button>
        <sl-radio-button value="korean-hanja-formal">
          <span class="list-preview" style="list-style-type: korean-hanja-formal"></span>
       </sl-radio-button>
        <sl-radio-button value="korean-hanja-informal">
          <span class="list-preview" style="list-style-type: korean-hanja-informal"></span>
       </sl-radio-button>
        <sl-radio-button value="lao">
          <span class="list-preview" style="list-style-type: lao"></span>
       </sl-radio-button>
        <sl-radio-button value="lower-alpha">
          <span class="list-preview" style="list-style-type: lower-alpha"></span>
       </sl-radio-button>
        <sl-radio-button value="lower-armenian">
          <span class="list-preview" style="list-style-type: lower-armenian"></span>
       </sl-radio-button>
        <sl-radio-button value="lower-greek">
          <span class="list-preview" style="list-style-type: lower-greek"></span>
       </sl-radio-button>
        <sl-radio-button value="lower-latin">
          <span class="list-preview" style="list-style-type: lower-latin"></span>
       </sl-radio-button>
        <sl-radio-button value="lower-roman">
          <span class="list-preview" style="list-style-type: lower-roman"></span>
       </sl-radio-button>
        <sl-radio-button value="malayalam">
          <span class="list-preview" style="list-style-type: malayalam"></span>
       </sl-radio-button>
        <sl-radio-button value="mongolian">
          <span class="list-preview" style="list-style-type: mongolian"></span>
       </sl-radio-button>
        <sl-radio-button value="myanmar">
          <span class="list-preview" style="list-style-type: myanmar"></span>
       </sl-radio-button>
        <sl-radio-button value="oriya">
          <span class="list-preview" style="list-style-type: oriya"></span>
       </sl-radio-button>
        <sl-radio-button value="persian">
          <span class="list-preview" style="list-style-type: persian"></span>
       </sl-radio-button>
        <sl-radio-button value="simp-chinese-formal">
          <span class="list-preview" style="list-style-type: simp-chinese-formal"></span>
       </sl-radio-button>
        <sl-radio-button value="simp-chinese-informal">
          <span class="list-preview" style="list-style-type: simp-chinese-informal"></span>
       </sl-radio-button>
        <sl-radio-button value="tamil">
          <span class="list-preview" style="list-style-type: tamil"></span>
       </sl-radio-button>
        <sl-radio-button value="telugu">
          <span class="list-preview" style="list-style-type: telugu"></span>
       </sl-radio-button>
        <sl-radio-button value="thai">
          <span class="list-preview" style="list-style-type: thai"></span>
       </sl-radio-button>
        <sl-radio-button value="tibetan">
          <span class="list-preview" style="list-style-type: tibetan"></span>
       </sl-radio-button>
        <sl-radio-button value="trad-chinese-formal">
          <span class="list-preview" style="list-style-type: trad-chinese-formal"></span>
       </sl-radio-button>
        <sl-radio-button value="trad-chinese-informal">
          <span class="list-preview" style="list-style-type: trad-chinese-informal"></span>
       </sl-radio-button>
        <sl-radio-button value="upper-alpha">
          <span class="list-preview" style="list-style-type: upper-alpha"></span>
       </sl-radio-button>
        <sl-radio-button value="upper-armenian">
          <span class="list-preview" style="list-style-type: upper-armenian"></span>
       </sl-radio-button>
        <sl-radio-button value="upper-latin">
          <span class="list-preview" style="list-style-type: upper-latin"></span>
       </sl-radio-button>
        <sl-radio-button value="upper-roman">
          <span class="list-preview" style="list-style-type: upper-roman"></span>
       </sl-radio-button>
        <sl-radio-button value="custom">${msg("Custom")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("list-style-type")} slot="label" ?disabled=${!this.advanced}>${msg("List marker")}</css-global-input>
        <sl-checkbox size="small" style="float: right" slot="label" name="list-style-position" data-defaultValue="outside" data-otherValue="inside" ?checked=${this.getCurrentValue("list-style-position") === "inside"}>
          <css-global-input value=${this.getGlobalValue("list-style-position")} ?disabled=${!this.advanced}>${msg("Inside")}</css-global-input>
      </sl-checkbox>
      </sl-radio-group>
    `

    let itemContent
    if(containerType === "flex") {
      itemContent = html`
        <css-numeric-input size="small" name="order" type="integer" value=${this.getCurrentValue("order") || "0"}>
          <css-global-input value=${this.getGlobalValue("order")} slot="label" ?disabled=${!this.advanced}>${msg("Order")}</css-global-input>
        </css-numeric-input>
        <sl-radio-group class="wrapping-radio-group" size="small" name="align-self" value=${this.getCurrentValue("align-self") || "normal"}>
          <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
          <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-top"></sl-icon></sl-radio-button>
          <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-middle"></sl-icon></sl-radio-button>
          <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-bottom"></sl-icon></sl-radio-button>
          <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
          <sl-radio-button class="advanced" value="self-start">${msg("Self start")}</sl-radio-button>
          <sl-radio-button class="advanced" value="self-end">${msg("Self end")}</sl-radio-button>
          <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
          <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
          <sl-radio-button class="advanced" value="anchor-center">${msg("Anchor center")}</sl-radio-button>
          <css-global-input value=${this.getGlobalValue("align-self")} slot="label" ?disabled=${!this.advanced}>${msg("Align")}</css-global-input>
          <sl-checkbox class="advanced" size="small" name="align-self-unsafe" slot="label">${msg("Force")}</sl-checkbox>
        </sl-radio-group>
        <css-numeric-input size="small" name="flex-shrink" type="number" min="0" value=${this.getCurrentValue("flex-shrink") || "1"}>
          <css-global-input value=${this.getGlobalValue("flex-shrink")} slot="label" ?disabled=${!this.advanced}>${msg("Flex shrink")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" name="flex-grow" type="number" min="0" value=${this.getCurrentValue("flex-grow") || "0"}>
          <css-global-input value=${this.getGlobalValue("flex-grow")} slot="label" ?disabled=${!this.advanced}>${msg("Flex grow")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" name="flex-basis" type="length percentage" min="0" value=${this.getCurrentValue("flex-grow") || "auto"}>
          <css-global-input value=${this.getGlobalValue("flex-basis")} slot="label" ?disabled=${!this.advanced}>${msg("Flex basis")}</css-global-input>
        </css-numeric-input>
      `
    }
    else if(containerType === "grid") {
      itemContent = html`
        <css-numeric-input size="small" name="order" type="integer" value=${this.getCurrentValue("order") || "0"}>
          <css-global-input value=${this.getGlobalValue("order")} slot="label" ?disabled=${!this.advanced}>${msg("Order")}</css-global-input>
        </css-numeric-input>
        <ww-css-property-input size="small" name="grid-area" plaintext value=${this.getCurrentValue("grid-area") || "auto"}>
          <css-global-input value=${this.getGlobalValue("grid-area")} slot="label" ?disabled=${!this.advanced}>${msg("Grid area")}</css-global-input>
        </ww-css-property-input>
        <sl-radio-group class="wrapping-radio-group" size="small" name="align-self" value=${this.getCurrentValue("align-self").replace(/\s+unsafe\s+/, "") || "normal"}>
          <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
          <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-top"></sl-icon></sl-radio-button>
          <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-middle"></sl-icon></sl-radio-button>
          <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-bottom"></sl-icon></sl-radio-button>
          <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
          <sl-radio-button class="advanced" value="self-start">${msg("Self start")}</sl-radio-button>
          <sl-radio-button class="advanced" value="self-end">${msg("Self end")}</sl-radio-button>
          <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
          <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
          <sl-radio-button class="advanced" value="anchor-center">${msg("Anchor center")}</sl-radio-button>
          <css-global-input value=${this.getGlobalValue("align-self")} slot="label" ?disabled=${!this.advanced}>${msg("Align")}</css-global-input>
          <sl-checkbox class="advanced" size="small" name="align-self-unsafe" slot="label" ?checked=${this.getCurrentValue("align-self").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
        </sl-radio-group>
        <sl-radio-group class="wrapping-radio-group" size="small" name="justify-self" value=${this.getCurrentValue("justify-self").replace(/\s+unsafe\s+/, "") || "normal"}>
          <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
          <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-left"></sl-icon></sl-radio-button>
          <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-center"></sl-icon></sl-radio-button>
          <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-right"></sl-icon></sl-radio-button>
          <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
          <sl-radio-button class="advanced" value="self-start">${msg("Self start")}</sl-radio-button>
          <sl-radio-button class="advanced" value="self-end">${msg("Self end")}</sl-radio-button>
          <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
          <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
          <sl-radio-button class="advanced" value="anchor-center">${msg("Anchor center")}</sl-radio-button>
          <css-global-input value=${this.getGlobalValue("justify-self")} slot="label" ?disabled=${!this.advanced}>${msg("Justify")}</css-global-input>
          <sl-checkbox class="advanced" size="small" name="justify-self-unsafe" slot="label" ?checked=${this.getCurrentValue("justify-self").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
        </sl-radio-group>
      `
    }
    return [itemContent, listItemContent, columnItemContent]
  }

  /*
  position
  inset
  z-index
  <item-dependent>
  */
  PositionPane() {

    const inlinePositioned = this.positionOmni !== "inline"? undefined: html`
      <sl-radio-group class="wrapping-radio-group" size="small" name="vertical-align" value=${this.getCurrentValue("vertical-align") || "baseline"}>
        <sl-radio-button value="baseline" title=${msg("Baseline")}>
          <sl-icon name="baseline"></sl-icon>
        </sl-radio-button>
        <sl-radio-button value="bottom" title=${msg("Bottom")}>
          <sl-icon name="layout-align-bottom"></sl-icon>
        </sl-radio-button>
        <sl-radio-button value="middle" title=${msg("Middle")}><sl-icon name="layout-align-middle"></sl-icon></sl-radio-button>
        <sl-radio-button value="top" title=${msg("Top")}><sl-icon name="layout-align-top"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="sub" title=${msg("Sub")}>
          <sl-icon name="subscript"></sl-icon>
        </sl-radio-button>
        <sl-radio-button class="advanced" value="super" title=${msg("Super")}>
          <sl-icon name="superscript"></sl-icon>
        </sl-radio-button>
        <sl-radio-button class="advanced" value="text-top" title=${msg("Text top")}><sl-icon name="overline"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="text-bottom" title=${msg("Text bottom")}><sl-icon name="underline"></sl-icon></sl-radio-button>
        <css-global-input value=${this.getGlobalValue("vertical-align")} slot="label" ?disabled=${!this.advanced}>${msg("Vertical align")}</css-global-input>
      </sl-radio-group>
    `
    const insetPositioned = !["relative", "absolute", "fixed", "sticky"].includes(this.positionOmni)? undefined: html`<div class="spacing-group" data-open>
      <css-global-input value=${this.getGlobalValue("inset")} ?disabled=${!this.advanced}>${msg("Inset")}</css-global-input>
      <css-numeric-input size="small" name="top" type="length percentage" placeholder="auto" value=${this.getCurrentValue("top") || "auto"}>
        <css-global-input value=${this.getGlobalValue("top")} slot="label" ?disabled=${!this.advanced}>${msg("Top")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="left" type="length percentage" placeholder="auto" value=${this.getCurrentValue("left") || "auto"}>
        <css-global-input value=${this.getGlobalValue("left")} slot="label" ?disabled=${!this.advanced}>${msg("Left")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="right" type="length percentage" placeholder="auto" value=${this.getCurrentValue("right") || "auto"}>
        <css-global-input value=${this.getGlobalValue("right")} slot="label" ?disabled=${!this.advanced}>${msg("Right")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="bottom" type="length percentage" placeholder="auto" value=${this.getCurrentValue("bottom") || "auto"}>
        <css-global-input value=${this.getGlobalValue("bottom")} slot="label" ?disabled=${!this.advanced}>${msg("Bottom")}</css-global-input>
      </css-numeric-input>
    </div>
    <css-numeric-input name="z-index" type="integer" placeholder="auto" value=${this.getCurrentValue("z-index") || "auto"}>
      <css-global-input value=${this.getGlobalValue("z-index")} slot="label" ?disabled=${!this.advanced}>${msg("Layer")}</css-global-input>
    </css-numeric-input>
    `

    return html`<section id="item">
      <h2>${msg("Position in container")}</h2>
      <sl-select name="position-omni" value=${this.positionOmni || "block"}>
        <sl-option value="inline">${msg("Inline")}</sl-option>
        <sl-option value="block">${msg("Block")}</sl-option>
        <sl-option value="float-left">${msg("Float left")}</sl-option>
        <sl-option value="float-right">${msg("Float right")}</sl-option>
        <sl-option value="relative" class="advanced">${msg("Relative")}</sl-option>
        <sl-option value="absolute" class="advanced">${msg("Absolute")}</sl-option>
        <sl-option value="fixed">${msg("Fixed")}</sl-option>
        <sl-option value="sticky" class="advanced">${msg("Sticky")}</sl-option>
        <css-global-input value=${this.getGlobalValue("position")} slot="label" ?disabled=${!this.advanced}>${msg("Position")}</css-global-input>
      </sl-select>
      <sl-select size="small" class="advanced" name="clear" value=${this.getCurrentValue("clear") || "none"}>
        <sl-option value="none">${msg("None")}</sl-option>
        <sl-option value="left">${msg("Left")}</sl-option>
        <sl-option value="right">${msg("Right")}</sl-option>
        <sl-option value="both">${msg("Both")}</sl-option>
        <sl-option value="inline-start">${msg("Inline start")}</sl-option>
        <sl-option value="inline-end">${msg("Inline end")}</sl-option>
        <css-global-input value=${this.getGlobalValue("clear")} slot="label" ?disabled=${!this.advanced}>${msg("Clear")}</css-global-input>
        
      </sl-select>
      ${insetPositioned}
      ${inlinePositioned}
      ${this.ItemInputs()}
    </section>`
  }

  /*
  box-sizing
  aspect-ratio
  width
    min-width
    max-width
  height
    min-height
    max-height
  padding
  margin
  outline
    outline-offset
  border
    border-radius
    border-image
    border-left
    border-right
    border-top
    border-bottom
  overflow
    overflow-clip-margin
  */
  BoxPane() {
    return html`<section id="box">
      <h2 class="advanced">${msg("Spacing")}</h2>
      <div class="transform-group overflow-group" ?data-open=${this.activeSpacing === "overflow"}>
        <sl-select name="overflow" class="double-column" size="small" value=${this.getCurrentValue("overflow") || "visible"}>
          <sl-option value="visible">${msg("Visible")}</sl-option>
          <sl-option value="hidden">${msg("Hidden")}</sl-option>
          <sl-option value="clip">${msg("Clip")}</sl-option>
          <sl-option value="scroll">${msg("Scroll")}</sl-option>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <span slot="label">
            <sl-icon-button name=${this.activeSpacing === "overflow"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "overflow"? undefined: "overflow"}></sl-icon-button>
            <css-global-input value=${this.getGlobalValue("overflow")} slot="label" ?disabled=${!this.advanced}>${msg("Overflow")}</css-global-input>
          </span>
          <sl-checkbox slot="label" class="advanced" size="small" name="overflow-anchor" data-defaultValue="auto" data-otherValue="none" ?checked=${this.getCurrentValue("overflow-anchor") === "none"}>
            <css-global-input value=${this.getGlobalValue("overflow-anchor")} ?disabled=${!this.advanced}>${msg("No anchor")}</css-global-input>
          </sl-checkbox>
        </sl-select>
        <sl-select name="overflow-x" size="small" value=${this.getCurrentValue("overflow-x") || "visible"}>
          <sl-option value="visible">${msg("Visible")}</sl-option>
          <sl-option value="hidden">${msg("Hidden")}</sl-option>
          <sl-option value="clip">${msg("Clip")}</sl-option>
          <sl-option value="scroll">${msg("Scroll")}</sl-option>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <css-global-input value=${this.getGlobalValue("overflow-x")} slot="label" ?disabled=${!this.advanced}>${msg("Overflow (x)")}</css-global-input>
        </sl-select>
        <sl-select name="overflow-y" size="small" value=${this.getCurrentValue("overflow-y") || "visible"}>
          <sl-option value="visible">${msg("Visible")}</sl-option>
          <sl-option value="hidden">${msg("Hidden")}</sl-option>
          <sl-option value="clip">${msg("Clip")}</sl-option>
          <sl-option value="scroll">${msg("Scroll")}</sl-option>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <css-global-input value=${this.getGlobalValue("overflow-y")} slot="label" ?disabled=${!this.advanced}>${msg("Overflow (y)")}</css-global-input>
        </sl-select>
      </div>
      <div class="spacing-group" id="margin" ?data-open=${this.activeSpacing === "margin"}>
        <css-numeric-input name="margin" type="length percentage" value=${this.getCurrentValue("margin") || "0px"} placeholder=${this.getCurrentValue("margin").split(/\s+/).length > 1? "*": ""}>
          <sl-icon-button name=${this.activeSpacing === "margin"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "margin"? undefined: "margin"}></sl-icon-button>
          <css-global-input value=${this.getGlobalValue("margin")} slot="label" ?disabled=${!this.advanced}>${msg("Margin")}</css-global-input>
          <sl-icon slot="prefix" name="box-margin"></sl-icon>
        </css-numeric-input>
        <css-numeric-input name="margin-top" type="length percentage" value=${this.getCurrentValue("margin-top") || "0px"}>
        <css-global-input value=${this.getGlobalValue("margin-top")} slot="label" ?disabled=${!this.advanced}>${msg("Top")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="margin-left" type="length percentage" value=${this.getCurrentValue("margin-left") || "0px"}>
        <css-global-input value=${this.getGlobalValue("margin-left")} slot="label" ?disabled=${!this.advanced}>${msg("Left")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="margin-right" type="length percentage" value=${this.getCurrentValue("margin-right") || "0px"}>
        <css-global-input value=${this.getGlobalValue("margin-right")} slot="label" ?disabled=${!this.advanced}>${msg("Right")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="margin-bottom" type="length percentage" value=${this.getCurrentValue("margin-bottom") || "0px"}>
        <css-global-input value=${this.getGlobalValue("margin-bottom")} slot="label" ?disabled=${!this.advanced}>${msg("Bottom")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="spacing-group" id="border" ?data-open=${this.activeSpacing === "border"}>
        <css-numeric-input name="border-width" type="length percentage" value=${this.getCurrentValue("border-width") || "0px"} placeholder=${this.getCurrentValue("border-width").split(/\s+/).length > 1? "*": ""}>
          <sl-icon-button name=${this.activeSpacing === "border"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "border"? undefined: "border"}></sl-icon-button>
          <css-global-input value=${this.getGlobalValue("border")} slot="label" ?disabled=${!this.advanced}>${msg("Border")}</css-global-input>
          ${this.BorderStyleGroup()}
          <sl-icon slot="prefix" name="square"></sl-icon>
        </css-numeric-input>
        <css-numeric-input name="border-top" type="length percentage" value=${this.getCurrentValue("border-top") || "0px"}>
          <css-global-input value=${this.getGlobalValue("border-top")} slot="label" ?disabled=${!this.advanced}>${msg("Top")}</css-global-input>
          ${this.BorderStyleGroup("top")}
        </css-numeric-input>
        <css-numeric-input name="border-left" type="length percentage" value=${this.getCurrentValue("border-left") || "0px"}>
          <css-global-input value=${this.getGlobalValue("border-left")} slot="label" ?disabled=${!this.advanced}>${msg("Left")}</css-global-input>
          ${this.BorderStyleGroup("left")}
        </css-numeric-input>
        <css-numeric-input name="border-right" type="length percentage" value=${this.getCurrentValue("border-right") || "0px"}>
          <css-global-input value=${this.getGlobalValue("border-right")} slot="label" ?disabled=${!this.advanced}>${msg("Right")}</css-global-input>
          ${this.BorderStyleGroup("right")}
        </css-numeric-input>
        <css-numeric-input name="border-bottom" type="length percentage" value=${this.getCurrentValue("border-bottom") || "0px"}>
          <css-global-input value=${this.getGlobalValue("border-bottom")} slot="label" ?disabled=${!this.advanced}>${msg("Bottom")}</css-global-input>
          ${this.BorderStyleGroup("bottom")}
        </css-numeric-input>
      </div>
      <div class="spacing-group" id="padding" ?data-open=${this.activeSpacing === "padding"}>
        <css-numeric-input name="padding" type="length percentage" value=${this.getCurrentValue("padding") || "0px"} placeholder=${this.getCurrentValue("padding").split(/\s+/).length > 1? "*": ""}>
          <sl-icon-button name=${this.activeSpacing === "padding"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "padding"? undefined: "padding"}></sl-icon-button>
          <css-global-input value=${this.getGlobalValue("padding")} slot="label" ?disabled=${!this.advanced}>${msg("Padding")}</css-global-input>
          <sl-icon slot="prefix" name="box-padding"></sl-icon>
        </css-numeric-input>
        <css-numeric-input name="padding-top" type="length percentage" value=${this.getCurrentValue("padding-top") || "0px"}>
        <css-global-input value=${this.getGlobalValue("padding-top")} slot="label" ?disabled=${!this.advanced}>${msg("Top")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="padding-left" type="length percentage" value=${this.getCurrentValue("padding-left") || "0px"}>
        <css-global-input value=${this.getGlobalValue("padding-left")} slot="label" ?disabled=${!this.advanced}>${msg("Left")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="padding-right" type="length percentage" value=${this.getCurrentValue("padding-right") || "0px"}>
        <css-global-input value=${this.getGlobalValue("padding-right")} slot="label" ?disabled=${!this.advanced}>${msg("Right")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="padding-bottom" type="length percentage" value=${this.getCurrentValue("padding-bottom") || "0px"}>
        <css-global-input value=${this.getGlobalValue("padding-bottom")} slot="label" ?disabled=${!this.advanced}>${msg("Bottom")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="size-input" id="size" ?data-open=${this.activeSpacing === "size"}>
        <css-numeric-input name="width" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("width") || "auto"}>
          <sl-icon-button class="advanced" name=${this.activeSpacing === "size"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "size"? undefined: "size"}></sl-icon-button>
          <css-global-input value=${this.getGlobalValue("width")} slot="label" ?disabled=${!this.advanced}>${msg("Width")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="height" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("height") || "auto"}>
        <css-global-input value=${this.getGlobalValue("height")} slot="label" ?disabled=${!this.advanced}>${msg("Height")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="min-width" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("min-width") || "auto"}>
          <css-global-input value=${this.getGlobalValue("min-width")} slot="label" ?disabled=${!this.advanced}>${msg("Minimum (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="min-height" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("min-height") || "auto"}>
          <css-global-input value=${this.getGlobalValue("min-width")} slot="label" ?disabled=${!this.advanced}>${msg("Minimum (y)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="max-width" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("max-width") || "auto"}>
          <css-global-input value=${this.getGlobalValue("max-width")} slot="label" ?disabled=${!this.advanced}>${msg("Maximum (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="max-height" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("max-height") || "auto"}>
          <css-global-input value=${this.getGlobalValue("max-height")} slot="label" ?disabled=${!this.advanced}>${msg("Maximum (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="aspect-ratio-x" value=${this.getCurrentValue("aspect-ratio").split(/\s+/).at(0) || "auto"}>
          <css-global-input value=${this.getGlobalValue("aspect-ratio")} slot="label" ?disabled=${!this.advanced}>${msg("Asp. ratio (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input name="aspect-ratio-y" value=${this.getCurrentValue("aspect-ratio").split(/\s+/).at(-1) || "auto"}>
          <css-global-input value=${this.getGlobalValue("aspect-ratio")} slot="label" ?disabled=${!this.advanced}>${msg("Asp. ratio (y)")}</css-global-input>
        </css-numeric-input>
      </div>
      <css-numeric-input class="advanced" name="outline-width" type="length percentage" value=${this.getCurrentValue("outline-width") || "0px"}>
        <css-global-input value=${this.getGlobalValue("outline-width")} slot="label" ?disabled=${!this.advanced}>${msg("Outline")}</css-global-input>
        <span slot="label">
          ${this.BorderStyleGroup("outline")}
        </span>
        <sl-icon slot="prefix" name="border-sides"></sl-icon>
      </css-numeric-input>
      <sl-switch class="advanced" size="small" name="box-sizing" data-defaultValue="content-box" data-otherValue="border-box" ?checked=${this.getCurrentValue("box-sizing") === "border-box"}>
        <css-global-input value=${this.getGlobalValue("box-sizing")} ?disabled=${!this.advanced}>${msg("Border box sizing")}</css-global-input>
      </sl-switch>
    </section>`
  }

  /*
  box-shadow
  transform (translate, rotate, scale)
    transform-box
    transform-origin
    transform-style
    backface-visibility
    perspective
    perspective-origin
    offset
  */
  TransformPane() {
    return html`<section>
      <h2 class="advanced">${msg("Transform")}</h2>
      <sl-select class="advanced" size="small" name="transform-box" value=${this.getCurrentValue("transform-box") || "view-box"}>
        <sl-option value="content-box">${msg("Content box")}</sl-option>
        <sl-option value="border-box">${msg("Border box")}</sl-option>
        <sl-option value="fill-box">${msg("Fill box")}</sl-option>
        <sl-option value="stroke-box">${msg("Stroke box")}</sl-option>
        <sl-option value="view-box">${msg("View box")}</sl-option>
        <css-global-input value=${this.getGlobalValue("transform-box")} slot="label" ?disabled=${!this.advanced}>${msg("Reference box")}</css-global-input>
      </sl-select>
      <div class="transform-group">
        <css-numeric-input size="small" type="length percentage" name="translate-x" value=${this.getTransformComponent("translate-x") || "0px"}>
          <css-global-input value=${this.getGlobalValue("translate")} slot="label" ?disabled=${!this.advanced}>${msg("Move (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" type="length percentage" name="translate-y" value=${this.getTransformComponent("translate-y") || "0px"}>
          <css-global-input value=${this.getGlobalValue("translate")} slot="label" ?disabled=${!this.advanced}>${msg("Move (y)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" type="length" name="translate-z" class="advanced double-column" value=${this.getTransformComponent("translate-z") || "0px"}>
          <css-global-input value=${this.getGlobalValue("translate")} slot="label" ?disabled=${!this.advanced}>${msg("Move (z)")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="transform-group">
        <css-numeric-input size="small" type="percentage" name="scale-x" value=${this.getTransformComponent("scale-x") || "100%"}>
          <css-global-input value=${this.getGlobalValue("scale")} slot="label" ?disabled=${!this.advanced}>${msg("Scale (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" type="percentage" name="scale-y" value=${this.getTransformComponent("scale-y") || "100%"}>
          <css-global-input value=${this.getGlobalValue("scale")} slot="label" ?disabled=${!this.advanced}>${msg("Scale (y)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" type="percentage" name="scale-z" class="advanced double-column" value=${this.getTransformComponent("scale-z") || "100%"}>
          <css-global-input value=${this.getGlobalValue("scale")} slot="label" ?disabled=${!this.advanced}>${msg("Scale (z)")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="transform-group">
        <css-numeric-input class="advanced" size="small" type="angle" name="rotate-x" value=${this.getTransformComponent("rotate-x") || "0px"}>
          <css-global-input value=${this.getGlobalValue("rotate")} slot="label" ?disabled=${!this.advanced}>${msg("Rotate (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" size="small" type="angle" name="rotate-y" value=${this.getTransformComponent("rotate-y") || "0px"}>>
          <css-global-input value=${this.getGlobalValue("rotate")} slot="label" ?disabled=${!this.advanced}>${msg("Rotate (y)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="double-column" size="small" type="angle" name="rotate-z" value=${this.getTransformComponent("rotate-z") || "0px"}>>
          <css-global-input value=${this.getGlobalValue("rotate")} slot="label" ?disabled=${!this.advanced}>${this.advanced? msg("Rotate (z)"): msg("Rotate")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="advanced transform-group">
        <css-numeric-input size="small" type="angle" name="skew-x" value=${this.getTransformComponent("skew-x") || "0deg"}>
          <span slot="label">${msg("Skew (x)")}</span>
        </css-numeric-input>
        <css-numeric-input size="small" type="angle" name="skew-y" .value=${this.getTransformComponent("skew-y") || "0deg"}>
          <span slot="label">${msg("Skew (y)")}</span>
        </css-numeric-input>
      </div>
      <css-numeric-input class="advanced" name="perspective" min="0" type="length" value=${this.getTransformComponent("perspective") || "0px"}>>
          <css-global-input value=${this.getGlobalValue("perspective")} slot="label" ?disabled=${!this.advanced}>${msg("Perspective")}</css-global-input>
        </css-numeric-input>
      <div class="advanced transform-group">
        <css-numeric-input size="small" type="length percentage" name="perspective-origin-x" value=${this.getCurrentValue("perspective-origin").split(/\s+/).at(0) || "50%"}>
          <css-global-input value=${this.getGlobalValue("perspective-origin")} slot="label" ?disabled=${!this.advanced}>${msg("Perspective origin (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" type="length percentage" name="perspective-origin-y" value=${this.getCurrentValue("perspective-origin").split(/\s+/).at(-1) || "50%"}>
          <css-global-input value=${this.getGlobalValue("perspective-origin")} slot="label" ?disabled=${!this.advanced}>${msg("Perspective origin (y)")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="advanced transform-group">
        <css-numeric-input size="small" type="length percentage" name="transform-origin-x" value=${this.getCurrentValue("transform-origin").split(/\s+/).at(0) || "50%"}>
          <css-global-input value=${this.getGlobalValue("transform-origin")} slot="label" ?disabled=${!this.advanced}>${msg("Transform origin (x)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" type="length percentage" name="transform-origin-y" value=${(this.getCurrentValue("transform-origin").split(/\s+/).at(1) ?? this.getCurrentValue("transform-origin").split(/\s+/).at(1)) || "50%"}>
          <css-global-input value=${this.getGlobalValue("transform-origin")} slot="label" ?disabled=${!this.advanced}>${msg("Transform origin (y)")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input size="small" class="double-column" type="length" name="transform-origin-z" value=${this.getCurrentValue("transform-origin").split(/\s+/).at(2) || "50%"}>
          <css-global-input value=${this.getGlobalValue("transform-origin")} slot="label" ?disabled=${!this.advanced}>${msg("Transform origin (z)")}</css-global-input>
        </css-numeric-input>
      </div>
      <css-numeric-input class="advanced" size="small" type="percentage" name="zoom" value=${this.getCurrentValue("zoom") || "100%"}>
          <css-global-input value=${this.getGlobalValue("zoom")} slot="label" ?disabled=${!this.advanced}>${msg("Zoom")}</css-global-input>
        <sl-icon slot="prefix" name="zoom-scan"></sl-icon>
      </css-numeric-input>
      <sl-switch class="advanced" size="small" name="transform-style" data-defaultValue="flat" data-otherValue="preserve-3d" ?checked=${this.getCurrentValue("transform-style") === "preserve-3d"}>
        <css-global-input value=${this.getGlobalValue("transform-style")} ?disabled=${!this.advanced}>${msg("Preserve 3D")}</css-global-input>
      </sl-switch>
      <sl-switch class="advanced" size="small" name="backface-visibility" data-defaultValue="visible" data-other-value="hidden" ?checked=${this.getCurrentValue("backface-visibility") === "hidden"}>
        <css-global-input value=${this.getGlobalValue("backface-visibility")} ?disabled=${!this.advanced}>${msg("Hide backface (3D)")}</css-global-input>
      </sl-switch>
    </section>`
  }

  /*
  (shape)
    shape-image-threshold
    shape-margin
    shape-outside
    shape-rendering
  (clip)
    clip-path
    clip-rule
  mask
    mask-border
    mask-type
  */
  ShapePane() {
    return html`<section class="advanced" id="shape">
      <h2>${msg("Shape")}</h2>
      <ww-css-property-input size="small" name="shape-outside" value=${this.getCurrentValue("shape-outside") || "none"}>
        <css-global-input value=${this.getGlobalValue("shape-outside")} slot="label" ?disabled=${!this.advanced}>${msg("Shape (outside)")}</css-global-input>
      </ww-css-property-input>
      <ww-css-property-input size="small" name="shape-image-threshold" value=${this.getCurrentValue("shape-image-threshold") || "0.0"}></ww-css-property-input>
      <ww-css-property-input size="small" name="shape-margin" value=${this.getCurrentValue("shape-margin") || "0px"}>
        <css-global-input value=${this.getGlobalValue("shape-margin")} slot="label" ?disabled=${!this.advanced}>${msg("Shape margin")}</css-global-input>
      </ww-css-property-input>
      <sl-select size="small" name="shape-rendering" value=${this.getCurrentValue("shape-rendering") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="crispEdges">${msg("Crisp edges")}</sl-option>
        <sl-option value="geometricPrecision">${msg("Geometric precision")}</sl-option>
        <sl-option value="optimizeSpeed">${msg("Optimize speed")}</sl-option>
        <css-global-input value=${this.getGlobalValue("shape-rendering")} slot="label" ?disabled=${!this.advanced}>${msg("Shape rendering")}</css-global-input>
      </sl-select>
      <ww-css-property-input size="small" name="clip-path" value=${this.getCurrentValue("clip-path") || "none"}>
        <css-global-input value=${this.getGlobalValue("clip-path")} slot="label" ?disabled=${!this.advanced}>${msg("Clip path")}</css-global-input>
        <sl-checkbox size="small" slot="label" name="clip-rule" data-defaultValue="nonzero" data-otherValue="evenodd" ?checked=${this.getCurrentValue("clip-rule") === "evenodd"}>
          <css-global-input value=${this.getGlobalValue("clip-rule")} ?disabled=${!this.advanced}>${msg("Even-odd")}</css-global-input>
      </sl-checkbox>
      </ww-css-property-input>
      <ww-css-property-input size="small" name="mask" value=${this.getCurrentValue("mask") || "none"}>
        <css-global-input value=${this.getGlobalValue("mask")} slot="label" ?disabled=${!this.advanced}>${msg("Mask")}</css-global-input>
        <sl-checkbox size="small" slot="label" name="mask-type" data-defaultValue="luminance" data-otherValue="alpha" ?checked=${this.getCurrentValue("mask-type") === "alpha"}>
        <css-global-input value=${this.getGlobalValue("mask-type")} ?disabled=${!this.advanced}>${msg("Alpha")}</css-global-input>
      </sl-checkbox>
      </ww-css-property-input>
    </section>`
  }

	render() {
    return [
      this.PositionPane(),
      this.BoxPane(),
      navigator.userAgent.search(/gecko/i)>0? undefined: this.TransformPane(),
      this.ShapePane()
    ]
  }
}