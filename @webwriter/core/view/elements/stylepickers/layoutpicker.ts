import { LitElement, html, css, TemplateResult } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { CSSDisplayValue, LitPickerElement } from "."
import { PICKER_COMMAND_PROPERTIES } from "#viewmodel/index.js"
import { ifDefined } from "lit/directives/if-defined.js"

/*
display
flex-direction
flex-flow
flex-wrap
grid
gap
place-content
place-items
list-style
box-decoration-break
columns
column-rule
column-gap
image-orientation
image-rendering
image-resolution
place-self
vertical-align
inset
float
clear
position
z-index
order
break-before
break-inside
break-after
orphans
widows
overflow
overflow-clip-margin
flex
grid-area
*/


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

@customElement("ww-layout-picker")
export class LayoutPicker extends LitPickerElement<(typeof PICKER_COMMAND_PROPERTIES)["layoutStyle"][number]> {

  handlers = {
    "display-inside": (el?: HTMLElement) => {
      const v = (el as any)?.value as DisplayInside | "contents" | "none"
      if(!el) {
        const display = CSSDisplayValue.parse(this.getCurrentValue("display"))
        display.inside = undefined
        this.setPartialValue("display", String(display))
      }
      else if(v === "contents" || v === "none") {
        const display = CSSDisplayValue.parse(this.getCurrentValue("display") || v)
        display.outside = v
        this.resolveChange("display", el, String(display))
      }
      else {
        const display = CSSDisplayValue.parse(this.getCurrentValue("display") || v)
        display.inside = v
        this.resolveChange("display", el, String(display))
      }
    }
  }

  propertyNames = PICKER_COMMAND_PROPERTIES.layoutStyle

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

  get elementDisplayInside() {
    return CSSDisplayValue.parse(this.getCurrentValue("display")).inside
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

  get elementIsReplaced() {
    return ["img", "video", "iframe", "embed", "fencedframe", "audio", "canvas", "object"].includes(this.element?.tagName.toLowerCase() as any)
  }
  
  static styles = css`
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

    [name=text-wrap] {

      &::part(base) {
        width: 100%;
      }

      &::part(label) {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }

      & sl-select {
        width: 90px;
      }

      & sl-option::part(checked-icon) {
        display: none;
      }
    }

    sl-radio-group::part(button-group), sl-radio-group::part(button-group__base), sl-radio-button {
      width: 100%;
    }

    sl-icon {
      font-size: 1.25rem;
    }

    [name=text-decoration-style] sl-icon {
      font-size: 0.7rem;
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

    :host:has(sl-select[name=display-inside]:not([value=table]):not([value=ruby])) sl-select[name=display-internal] {
      display: none;
    } 

    sl-select[name=display-inside] {

      sl-option {
        width: 100%;
        aspect-ratio: 1;

        &[value=none] {
          aspect-ratio: unset;

          &::part(label) {
            padding: var(--sl-spacing-small);
          }
        }

        &::part(base) {
          height: 100%;
          padding: 0;
        }

        &::part(label) {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        &::part(checked-icon) {
          display: none;
        }

        sl-icon {
          font-size: 40px;
        }

        span {
          font-size: 12px;
        }
      }
    }

    :host(:not([advanced])) #layout {
      display: block;

      & [name=display-inside] {
        aspect-ratio: unset;
      }
    }

    #layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: min-content min-content;
      gap: 5px;

      & [name=display-inside] {
        grid-row: span 2;
        aspect-ratio: 1;

        &::part(combobox) {
          height: 100px;
          width: 100px;
          padding-inline: var(--sl-spacing-2x-small);
          padding-block: var(--sl-spacing-x-small);
          display: grid;
          grid-template-columns: 1fr min-content;
          grid-template-rows: 1fr min-content;
        }
        
        &::part(prefix) {
          align-content: center;
          justify-content: center;
        }

        &::part(display-input) {
          grid-row: 2;
          grid-column: 1;
          text-align: center;
          font-weight: bolder;
          font-size: 0.8em;
        }

        &::part(expand-icon) {
          grid-row: 2;
          grid-column: 2;
          margin-inline-start: 0;
        }

        sl-icon[slot=prefix] {
          font-size: 56px;
          margin: 0;
          color: var(--sl-input-color);
        }
      }

      & [name=display-internal] {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;

        &::part(combobox) {
          padding-inline: var(--sl-spacing-2x-small);
        }

        &::part(form-control-label) {
          font-size: var(--sl-font-size-2x-small);
        }

        & sl-option::part(checked-icon) {
          display: none;
        }

        & sl-option::part(label) {
          font-size: 0.8em;
        }
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

    sl-radio-group[name=column-rule-style] sl-radio-button:is(:nth-child(1), :nth-child(2)) {
      grid-column: span 2;
    }

    sl-radio-group:is([name=align-items], [name=object-fit], [name=justify-items], [name=align-self], [name=justify-self]) sl-radio-button:first-child {
      grid-column: span 4;
    }

    sl-radio-group[name=column-rule-style] sl-radio-button:is(:nth-child(1), :nth-child(2)) {
      grid-column: span 2;
    }

    sl-radio-group:is([name=align-content], [name=justify-content]) sl-radio-button:is(:nth-last-of-type(1), :nth-last-of-type(2)) {
      grid-column: span 4;
    }

    sl-radio-group[name=align-items] sl-radio-button:is([value=self-start], [value=self-end], [value="first baseline"], [value="last baseline"]) {
      grid-column: span 2;
    }

    sl-radio-group[name=align-items] sl-radio-button[value=anchor-center] {
      grid-column: span 4;
    }

    sl-radio-group.wrapping-radio-group[name=place-items]::part(button-group__base) {
      grid-template-columns: 1fr 1fr 1fr;
      grid-auto-rows: 1fr;
    }

    sl-radio-group.wrapping-radio-group[name=place-items] sl-radio-button:is([value=custom], :first-child) {
      grid-column: span 3;
    }

    sl-radio-group.wrapping-radio-group[name=place-items] sl-icon {
      font-size: 28px;
    }

    sl-radio-group[name=place-items] sl-radio-button[value=custom]::part(label) {
      padding: 0 var(--sl-spacing-2x-small);
      display: flex;
      gap: var(--sl-spacing-2x-small);
    }

    sl-radio-group[name=place-items] sl-radio-button[value=custom] sl-select {
      &::part(combobox), &::part(display-input) {
        height: 24px;
        min-height: unset;
      }
    }

    sl-switch[name=flex-wrap]::part(base) {
      width: 100%;
    }

    sl-switch[name=flex-wrap]::part(label) {
      width: 100%;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    :is(sl-select, sl-radio-group)::part(form-control-label) {
      display: flex;
      justify-content: space-between;
      width: 100%;
      align-items: center;
    }

    section:not([data-active]) {
      display: none;
    }
  `

  ColumnsPane() {
    return html`<section id="columns" data-active>
      <h2 class="advanced">${msg("Columns")}</h2>
      <div class="input-group">
        <css-numeric-input min="0" step="1" size="small" name="column-count" type="integer" placeholder="auto" value=${this.getCurrentValue("column-count") || "auto"}>
          <css-global-input value=${this.getGlobalValue("column-count")} slot="label" ?disabled=${!this.advanced}>${msg("Columns")}</css-global-input>
          <sl-icon slot="prefix" name="columns"></sl-icon>
        </css-numeric-input>
        <css-numeric-input class="advanced" size="small" name="column-width" type="length" min="0" placeholder=${msg("auto")} value=${this.getCurrentValue("column-width") || "auto"}>
          <css-global-input value=${this.getGlobalValue("column-width")} slot="label" ?disabled=${!this.advanced}>${msg("Width")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" size="small" name="column-gap" type="length percentage" min="0" placeholder=${msg("normal")} value=${this.getCurrentValue("column-gap") || "normal"}>
          <css-global-input value=${this.getGlobalValue("column-gap")} slot="label" ?disabled=${!this.advanced}>${msg("Gap")}</css-global-input>
        </css-numeric-input>
      </div>
      <sl-checkbox class="advanced" size="small" name="column-fill" data-defaultValue="auto" data-otherValue="balance" ?checked=${this.getCurrentValue("column-fill") === "balance"}>
        <css-global-input value=${this.getGlobalValue("column-fill")} ?disabled=${!this.advanced}>${msg("Balance columns")}</css-global-input>
      </sl-checkbox>
      <sl-radio-group class="advanced wrapping-radio-group" size="small" name="column-rule-style" value=${this.getCurrentValue("column-rule-style") || "none"}>
        <sl-radio-button value="none">${msg("None")}</sl-radio-button>
        <sl-radio-button class="advanced" value="hidden">${msg("Hidden")}</sl-radio-button>
        <sl-radio-button value="solid"><sl-icon name="minus"></sl-icon></sl-radio-button>
        <sl-radio-button value="double"><sl-icon name="equal"></sl-icon></sl-radio-button>
        <sl-radio-button value="dotted"><sl-icon name="line-dotted"></sl-icon></sl-radio-button>
        <sl-radio-button value="dashed"><sl-icon name="line-dashed"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="groove"><sl-icon name="minus"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="ridge"><sl-icon name="minus"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="inset"><sl-icon name="minus"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="outset"><sl-icon name="minus"></sl-icon></sl-radio-button>
        <css-global-input value=${this.getGlobalValue("column-rule-style")} slot="label" ?disabled=${!this.advanced}>${msg("Column rule")}</css-global-input>
      </sl-radio-group>
      <css-numeric-input class="advanced" size="small" name="column-rule-width" type="length percentage" placeholder="medium" value=${this.getCurrentValue("column-rule-width") || "medium"}>
        <css-global-input value=${this.getGlobalValue("column-rule-width")} slot="label" ?disabled=${!this.advanced}>${msg("Column rule width")}</css-global-input>
      </css-numeric-input>
      <div class="advanced color-input">
        <sl-color-picker size="small" name="column-rule-color" hoist no-format-toggle value=${this.getCurrentValue("column-rule-color")}></sl-color-picker>
        <label for="column-rule-color">
          <css-global-input value=${this.getGlobalValue("column-rule-color")} slot="label" ?disabled=${!this.advanced}>${msg("Column rule color")}</css-global-input>
        </label>
      </div>
    </section>`
  }

  SectioningPane() {
    return html`<section id="sectioning" class="advanced" data-active>
      <h2 class="advanced">${msg("Sectioning")}</h2>
      <sl-select size="small" name="break-before" hoist value=${this.getCurrentValue("break-before") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="avoid">${msg("Avoid")}</sl-option>
        <sl-option value="always">${msg("Always")}</sl-option>
        <sl-option value="all">${msg("All")}</sl-option>
        <sl-option value="avoid-page">${msg("Avoid page")}</sl-option>
        <sl-option value="page">${msg("Page")}</sl-option>
        <sl-option value="left">${msg("Left")}</sl-option>
        <sl-option value="right">${msg("Right")}</sl-option>
        <sl-option value="recto">${msg("Recto")}</sl-option>
        <sl-option value="verso">${msg("Verso")}</sl-option>
        <sl-option value="avoid-column">${msg("Avoid column")}</sl-option>
        <sl-option value="column">${msg("Column")}</sl-option>
        <sl-option value="avoid-region">${msg("Avoid region")}</sl-option>
        <sl-option value="region">${msg("Region")}</sl-option>
        <css-global-input value=${this.getGlobalValue("break-before")} slot="label" ?disabled=${!this.advanced}>${msg("Break before")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="break-inside" hoist  value=${this.getCurrentValue("break-inside") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="avoid">${msg("Avoid")}</sl-option>
        <sl-option value="avoid-page">${msg("Avoid page")}</sl-option>
        <sl-option value="avoid-column">${msg("Avoid column")}</sl-option>
        <sl-option value="avoid-region">${msg("Avoid region")}</sl-option>
        <css-global-input value=${this.getGlobalValue("break-inside")} slot="label" ?disabled=${!this.advanced}>${msg("Break inside")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="break-after" hoist value=${this.getCurrentValue("break-after") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="avoid">${msg("Avoid")}</sl-option>
        <sl-option value="always">${msg("Always")}</sl-option>
        <sl-option value="all">${msg("All")}</sl-option>
        <sl-option value="avoid-page">${msg("Avoid page")}</sl-option>
        <sl-option value="page">${msg("Page")}</sl-option>
        <sl-option value="left">${msg("Left")}</sl-option>
        <sl-option value="right">${msg("Right")}</sl-option>
        <sl-option value="recto">${msg("Recto")}</sl-option>
        <sl-option value="verso">${msg("Verso")}</sl-option>
        <sl-option value="avoid-column">${msg("Avoid column")}</sl-option>
        <sl-option value="column">${msg("Column")}</sl-option>
        <sl-option value="avoid-region">${msg("Avoid region")}</sl-option>
        <sl-option value="region">${msg("Region")}</sl-option>
        <css-global-input value=${this.getGlobalValue("break-after")} slot="label" ?disabled=${!this.advanced}>${msg("Break after")}</css-global-input>
      </sl-select>
    </section>`
  }

  // Layout Options

  FlexPane() {
    return html`<section id="flex" ?data-active=${this.elementDisplayInside === "flex"}>
      <h2 class="advanced">${msg("Flex")}</h2>
      <sl-radio-group size="small" name="flex-direction" value=${this.getCurrentValue("flex-direction") || "row"}>
        <sl-radio-button value="row" title=${msg("Row")}><sl-icon name="arrow-autofit-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="column" title=${msg("Column")}><sl-icon name="arrow-autofit-down"></sl-icon></sl-radio-button>
        <sl-radio-button value="row-reverse" title=${msg("Row Reverse")}><sl-icon name="arrow-autofit-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="column-reverse" title=${msg("Column Reverse")}><sl-icon name="arrow-autofit-up"></sl-icon></sl-radio-button>
        <css-global-input value=${this.getGlobalValue("flex-direction")} slot="label" ?disabled=${!this.advanced}>${msg("Flex direction")}</css-global-input>
      </sl-radio-group>
      <sl-radio-group class="wrapping-radio-group" ?data-inactive=${this.elementDisplayInside !== "flex"} size="small" name="align-items" value=${this.getCurrentValue("align-items") || "normal"}>
        <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
        <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-top"></sl-icon></sl-radio-button>
        <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-middle"></sl-icon></sl-radio-button>
        <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-bottom"></sl-icon></sl-radio-button>
        <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="self-start">${msg("Self start")}</sl-radio-button>
        <sl-radio-button class="advanced" value="self-end">${msg("Self end")}</sl-radio-button>
        <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
        <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
        <sl-radio-button class="advanced" value="anchor-center">${msg("Anchor center")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("align-items")} slot="label" ?disabled=${!this.advanced}>${msg("Align")}</css-global-input>
        <sl-checkbox class="advanced" size="small" name="align-items-unsafe" slot="label" data-defaultValue="" data-otherValue="unsafe" ?checked=${this.getCurrentValue("align-items").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
      </sl-radio-group>
      <sl-radio-group class="wrapping-radio-group" ?data-inactive=${this.elementDisplayInside !== "flex"} size="small" name="justify-content" value=${this.getCurrentValue("justify-content").replace(/\s*unsafe\s*/, "") || "normal"}>
        <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
        <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-center"></sl-icon></sl-radio-button>
        <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-between" title=${msg("Space between")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-around" title=${msg("Space around")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-evenly" title=${msg("Space evenly")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
        <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("justify-content")} slot="label" ?disabled=${!this.advanced}>${msg("Justify")}</css-global-input>
        <sl-checkbox class="advanced" size="small" name="align-items-unsafe" slot="label" data-defaultValue="" data-otherValue="unsafe" ?checked=${this.getCurrentValue("justify-content").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
      </sl-radio-group>
      <css-numeric-input size="small" name="row-gap" ?data-inactive=${this.elementDisplayInside !== "flex"} type="length percentage" min="0" placeholder=${msg("normal")} value=${this.getCurrentValue("row-gap") || "0px"}>
        <css-global-input value=${this.getGlobalValue("row-gap")} slot="label" ?disabled=${!this.advanced}>${msg("Row gap")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="column-gap" ?data-inactive=${this.elementDisplayInside !== "flex"} type="length percentage" min="0" placeholder=${msg("normal")} value=${this.getCurrentValue("column-gap") || "0px"}>
        <css-global-input value=${this.getGlobalValue("column-gap")} slot="label" ?disabled=${!this.advanced}>${msg("Column gap")}</css-global-input>
      </css-numeric-input>
      <sl-switch size="small" name="flex-wrap" data-defaultValue="nowrap" data-otherValue="wrap" ?checked=${this.getCurrentValue("flex-wrap") === "wrap"}>
        <css-global-input value=${this.getGlobalValue("flex-wrap")} ?disabled=${!this.advanced}>${msg("Wrap")}</css-global-input>
        <sl-checkbox size="small" data-defaultValue="wrap" data-otherValue="wrap-reverse" ?checked=${this.getCurrentValue("flex-wrap") === "wrap-reverse"}>${msg("Reverse")}</sl-checkbox>
      </sl-switch>
    </section>`
  }

  GridPane() {
    return html`<section id="grid" ?data-active=${this.elementDisplayInside === "grid"}>
      <h2 class="advanced">${msg("Grid")}</h2>
      <sl-radio-group class="wrapping-radio-group" size="small" name="align-content" ?data-inactive=${this.elementDisplayInside !== "grid"} value=${this.getCurrentValue("align-content").replace(/\s*unsafe\s*/, "") || "normal"}>
        <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
        <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-top"></sl-icon></sl-radio-button>
        <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-middle"></sl-icon></sl-radio-button>
        <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-bottom"></sl-icon></sl-radio-button>
        <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-around" title=${msg("Space around")}><sl-icon name="layout-distribute-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-between" title=${msg("Space between")}><sl-icon name="layout-distribute-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-evenly" title=${msg("Space evenly")}><sl-icon name="layout-distribute-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
        <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("align-content")} slot="label" ?disabled=${!this.advanced}>${msg("Align content")}</css-global-input>
        <sl-checkbox class="advanced" size="small" name="align-content-unsafe" slot="label" data-defaultValue="" data-otherValue="unsafe" ?checked=${this.getCurrentValue("align-content").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
      </sl-radio-group>
      <sl-radio-group class="wrapping-radio-group" size="small" name="justify-content" ?data-inactive=${this.elementDisplayInside !== "grid"} value=${this.getCurrentValue("justify-content").replace(/\s*unsafe\s*/, "") || "normal"}>
        <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
        <sl-radio-button value="start" title=${msg("Start")}><sl-icon name="layout-align-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="center" title=${msg("Center")}><sl-icon name="layout-align-center"></sl-icon></sl-radio-button>
        <sl-radio-button value="end" title=${msg("End")}><sl-icon name="layout-align-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="stretch" title=${msg("Stretch")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-around" title=${msg("Space around")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-between" title=${msg("Space between")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="space-evenly" title=${msg("Space evenly")}><sl-icon name="layout-distribute-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="first baseline">${msg("First baseline")}</sl-radio-button>
        <sl-radio-button class="advanced" value="last baseline">${msg("Last baseline")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("justify-content")} slot="label" ?disabled=${!this.advanced}>${msg("Justify")}</css-global-input>
        <sl-checkbox class="advanced" size="small" name="justify-content-unsafe" slot="label" data-defaultValue="" data-otherValue="unsafe" ?checked=${this.getCurrentValue("justify-content").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
      </sl-radio-group>
      <sl-radio-group class="wrapping-radio-group" size="small" name="place-items" ?data-inactive=${this.elementDisplayInside !== "grid"} value=${this.getCurrentValue("place-items" as any) || "normal"}>
        <sl-radio-button value="normal" title=${msg("Auto")}>${msg("Auto")}</sl-radio-button>
        <sl-radio-button value="start start"><sl-icon name="align-box-left-top"></sl-icon></sl-radio-button>
        <sl-radio-button value="center start"><sl-icon name="align-box-center-top"></sl-icon></sl-radio-button>
        <sl-radio-button value="end start"><sl-icon name="align-box-right-top"></sl-icon></sl-radio-button>
        <sl-radio-button value="start center"><sl-icon name="align-box-left-middle"></sl-icon></sl-radio-button>
        <sl-radio-button value="center center"><sl-icon name="align-box-center-middle"></sl-icon></sl-radio-button>
        <sl-radio-button value="end center"><sl-icon name="align-box-right-middle"></sl-icon></sl-radio-button>
        <sl-radio-button value="start end"><sl-icon name="align-box-left-bottom"></sl-icon></sl-radio-button>
        <sl-radio-button value="center end"><sl-icon name="align-box-center-bottom"></sl-icon></sl-radio-button>
        <sl-radio-button value="end end"><sl-icon name="align-box-left-bottom" style="transform: scale(-1, 1) "></sl-icon></sl-radio-button>
        <sl-radio-button class="advanced" value="custom">
          <sl-select size="small" name="align-items" placeholder=${msg("Custom align")} value=${this.getCurrentValue("align-items") || "stretch"}>
            <sl-option value="self-start">${msg("Self start")}</sl-option>
            <sl-option value="self-start">${msg("Self start")}</sl-option>
            <sl-option value="self-end">${msg("Self end")}</sl-option>
            <sl-option value="first baseline">${msg("First baseline")}</sl-option>
            <sl-option value="last baseline">${msg("Last baseline")}</sl-option>
            <sl-option value="anchor-center">${msg("Anchor center")}</sl-option>
          </sl-select>
          <sl-select size="small" name="justify-items" placeholder=${msg("Custom justify")} value=${this.getCurrentValue("justify-items") || "stretch"}>
            <sl-option value="self-start">${msg("Self start")}</sl-option>
            <sl-option value="self-end">${msg("Self end")}</sl-option>
            <sl-option value="first baseline">${msg("First baseline")}</sl-option>
            <sl-option value="last baseline">${msg("Last baseline")}</sl-option>
            <sl-option value="anchor-center">${msg("Anchor center")}</sl-option>
          </sl-select>
        </sl-radio-button>
        <css-global-input value=${this.getGlobalValue("place-items" as any)} slot="label" ?disabled=${!this.advanced}>${msg("Cell placement")}</css-global-input>
        <sl-checkbox class="advanced" size="small" name="align-items-unsafe" slot="label" data-defaultValue="" data-otherValue="unsafe" ?checked=${this.getCurrentValue("align-items").split(/\s+/).includes("unsafe")}>${msg("Force")}</sl-checkbox>
      </sl-radio-group>
      <sl-checkbox size="small" ?data-inactive=${this.elementDisplayInside !== "grid"} name="align-items-stretch" data-defaultValue="" data-otherValue="stretch" ?checked=${this.getCurrentValue("align-items").split(/\s+/).includes("stretch")}>
        ${msg("Stretch cell content")}
      </sl-checkbox>
      <sl-select size="small" name="grid-auto-flow" value=${this.getCurrentValue("grid-auto-flow") || "row"}>
        <sl-option value="row">${msg("Row")}</sl-option>
        <sl-option value="column">${msg("Column")}</sl-option>
        <sl-option value="row dense">${msg("Row dense")}</sl-option>
        <sl-option value="column dense">${msg("Column dense")}</sl-option>
        <css-global-input value=${this.getGlobalValue("grid-auto-flow")} slot="label" ?disabled=${!this.advanced}>${msg("Grid auto flow")}</css-global-input>
      </sl-select>
      <ww-css-property-input size="small" name="grid-template" plaintextvalue=${this.getCurrentValue("grid-template") || "none"}>
        <css-global-input value=${this.getGlobalValue("grid-template")} slot="label" ?disabled=${!this.advanced}>${msg("Grid template")}</css-global-input>
      </ww-css-property-input>
      <css-numeric-input size="small" name="grid-auto-rows" type="length percentage flex" multiple min="0" value=${this.getCurrentValue("grid-auto-rows") || "auto"}>
        <css-global-input value=${this.getGlobalValue("grid-auto-rows")} slot="label" ?disabled=${!this.advanced}>${msg("Grid auto rows")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="grid-auto-columns" type="length percentage flex" multiple min="0" value=${this.getCurrentValue("grid-auto-columns") || "auto"}>
        <css-global-input value=${this.getGlobalValue("grid-auto-columns")} slot="label" ?disabled=${!this.advanced}>${msg("Grid auto columns")}</css-global-input>
      </css-numeric-input>
      <!--<css-grid-template-input size="small" name="grid-template" label=${msg("Grid template")}>Grid template</css-grid-template-input>-->
      <css-numeric-input size="small" name="row-gap" ?data-inactive=${this.elementDisplayInside !== "grid"} type="length percentage" min="0" placeholder=${msg("normal")} value=${this.getCurrentValue("row-gap") || "normal"}>
        <css-global-input value=${this.getGlobalValue("row-gap")} slot="label" ?disabled=${!this.advanced}>${msg("Row gap")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="column-gap" ?data-inactive=${this.elementDisplayInside !== "grid"} type="length percentage" min="0" placeholder=${msg("normal")} value=${this.getCurrentValue("column-gap") || "normal"}>
        <css-global-input value=${this.getGlobalValue("column-gap")} slot="label" ?disabled=${!this.advanced}>${msg("Column gap")}</css-global-input>
      </css-numeric-input>
    </section>`
  }

  TablePane() {
    return html`<section id="table" ?data-active=${this.elementDisplayInside === "table"}>
      <h2 class="advanced">${msg("Table")}</h2>
      <css-numeric-input size="small" name="border-spacing-x" type="length" value=${this.getCurrentValue("border-spacing").split(/\s+/).at(0) || "0px"}>
        <css-global-input value=${this.getGlobalValue("border-spacing")} slot="label" ?disabled=${!this.advanced}>${msg("Border spacing (x)")}</css-global-input>
      </css-numeric-input>
      <css-numeric-input size="small" name="border-spacing-y" type="length" value=${this.getCurrentValue("border-spacing").split(/\s+/).at(-1) || "0px"}>
        <css-global-input value=${this.getGlobalValue("border-spacing")} slot="label" ?disabled=${!this.advanced}>${msg("Border spacing (y)")}</css-global-input>
      </css-numeric-input>
      <sl-checkbox size="small" name="table-layout" data-defaultValue="auto" data-otherValue="fixed" ?checked=${this.getCurrentValue("table-layout") === "fixed"}>
        <css-global-input value=${this.getGlobalValue("table-layout")} ?disabled=${!this.advanced}>${msg("Fixed table layout")}</css-global-input>
      </sl-checkbox>
      <sl-checkbox size="small" name="border-collapse" data-defaultValue="separate" data-otherValue="collapse" ?checked=${this.getCurrentValue("table-layout") === "collapse"}>
        <css-global-input value=${this.getGlobalValue("border-collapse")} ?disabled=${!this.advanced}>${msg("Shared cell borders")}</css-global-input>
      </sl-checkbox>
      <sl-checkbox size="small" name="caption-side" data-defaultValue="top" data-otherValue="bottom" ?checked=${this.getCurrentValue("caption-side") === "bottom"}>
        <css-global-input value=${this.getGlobalValue("caption-side")} ?disabled=${!this.advanced}>${msg("Caption at bottom")}</css-global-input>
      </sl-checkbox>
      <sl-checkbox size="small" name="empty-cells" data-defaultValue="show" data-otherValue="hide" ?checked=${this.getCurrentValue("empty-cells") === "hide"}>
        <css-global-input value=${this.getGlobalValue("empty-cells")} ?disabled=${!this.advanced}>${msg("Hide empty cells")}</css-global-input>
      </sl-checkbox>
    </section>`
  }

  TableCellPane() {
    return html`<section id="table-cell" ?data-active=${this.elementIsTableCell}>
      <h2 class="advanced">${msg("Table")}</h2>
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
    </section>`
  }

  MathPane() {
    return html`<section id="math" ?data-active=${this.elementDisplayInside === "math"}>
      <h2 class="advanced">${msg("Math")}</h2>
      <sl-switch size="small" name="math-style" data-defaultValue="normal" data-otherValue="compact" ?checked=${this.getCurrentValue("math-style") === "compact"}>
        <css-global-input value=${this.getGlobalValue("math-style")} ?disabled=${!this.advanced}>${msg("Compact math")}</css-global-input>
      </sl-switch>
      <sl-switch size="small" name="math-shift" data-defaultValue="normal" data-otherValue="compact" ?checked=${this.getCurrentValue("math-shift") === "compact"}>
        <css-global-input value=${this.getGlobalValue("math-shift")} ?disabled=${!this.advanced}>${msg("Compact superscr.")}</css-global-input>
      </sl-switch>
      <css-numeric-input size="small" name="math-depth" type="integer" value=${this.getCurrentValue("math-depth") || "0"}>
        <css-global-input value=${this.getGlobalValue("math-depth")} ?disabled=${!this.advanced}>${msg("Math depth")}</css-global-input>
      </css-numeric-input>
    </section>`
  }

  MediaPane() {
    return html`<section id="media" ?data-active=${this.elementIsReplaced}>
      <h2 class="advanced">${msg("Media")}</h2>
      <sl-radio-group class="wrapping-radio-group" size="small" name="object-fit" value=${this.getCurrentValue("object-fit") || "fill"}>
        <sl-radio-button value="none">${msg("None")}</sl-radio-button>
        <sl-radio-button value="fill" title=${msg("Fill")}><sl-icon name="arrows-maximize"></sl-icon></sl-radio-button>
        <sl-radio-button value="contain" title=${msg("Contain")}><sl-icon name="arrows-move"></sl-icon></sl-radio-button>
        <sl-radio-button value="cover" title=${msg("Cover")}><sl-icon name="crop"></sl-icon></sl-radio-button>
        <sl-radio-button value="scale-down" title=${msg("Scale down")}><sl-icon name="arrows-minimize"></sl-icon></sl-radio-button>
        <css-global-input value=${this.getGlobalValue("object-fit")} slot="label" ?disabled=${!this.advanced}>${msg("Object fit")}</css-global-input>
      </sl-radio-group>
      <ww-css-property-input class="advanced" size="small" name="object-position" plaintext value=${this.getCurrentValue("object-position") || "50% 50%"}></ww-css-property-input>
      <sl-select class="advanced" size="small" name="image-rendering" value=${this.getCurrentValue("image-rendering") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="smooth">${msg("Smooth")}</sl-option>
        <sl-option value="crisp-edges">${msg("Crisp edges")}</sl-option>
        <sl-option value="pixelated">${msg("Pixelated")}</sl-option>
        <css-global-input value=${this.getGlobalValue("image-rendering")} slot="label" ?disabled=${!this.advanced}>${msg("Image rendering")}</css-global-input>
      </sl-select>
      <css-numeric-input class="advanced" size="small" name="image-resolution" type="resolution" value=${this.getCurrentValue("image-resolution").replace(/(\s+snap)|(snap\s+)/, "") || "1dppx"}>
        <css-global-input value=${this.getGlobalValue("image-resolution")} slot="label" ?disabled=${!this.advanced}>${msg("Image resolution")}</css-global-input>
      </css-numeric-input>
      <sl-checkbox size="small" class="advanced" name="image-resolution-snap" data-defaultValue="" data-otherValue="snap" ?checked=${this.getCurrentValue("image-resolution").split(/\s+/).includes("snap")}>
        <css-global-input value=${this.getGlobalValue("image-resolution")} ?disabled=${!this.advanced}>${msg("Snap resolution pixels")}</css-global-input>
      </sl-checkbox>
      <sl-switch size="small" class="advanced" name="image-orientation" data-defaultValue="none" data-otherValue="from-image" ?checked=${this.getCurrentValue("image-orientation") === "from-image"}>
        <css-global-input value=${this.getGlobalValue("image-orientation")} ?disabled=${!this.advanced}>${msg("Orient from metadata")}</css-global-input>
      </sl-switch>
    </section>`
  }

  RubyPane() {
    return html`<section id="ruby" ?data-active=${this.elementDisplayInside === "ruby"}>
      <h2 class="advanced">${msg("Ruby")}</h2>
      <sl-select size="small" name="ruby-align" value=${this.getCurrentValue("ruby-align") || "space-around"}>
          <sl-option value="start">${msg("Start")}</sl-option>
          <sl-option value="center">${msg("Center")}</sl-option>
          <sl-option value="space-between">${msg("Space between")}</sl-option>
          <sl-option value="space-around">${msg("Space around")}</sl-option>
          <css-global-input value=${this.getGlobalValue("ruby-align")} slot="label" ?disabled=${!this.advanced}>${msg("Ruby alignment")}</css-global-input>
        </sl-select>
        <sl-select size="small" name="ruby-position" value=${this.getCurrentValue("ruby-position") || "alternate"}>
          <sl-option value="over">${msg("Over")}</sl-option>
          <sl-option value="under">${msg("Under")}</sl-option>
          <sl-option value="inter-character">${msg("Inter-character")}</sl-option>
          <sl-option value="alternate">${msg("Alternate")}</sl-option>
          <sl-option value="alternate over">${msg("Alternate over")}</sl-option>
          <sl-option value="alternate under">${msg("Alternate under")}</sl-option>
          <css-global-input value=${this.getGlobalValue("ruby-position")} slot="label" ?disabled=${!this.advanced}>${msg("Ruby position")}</css-global-input>
        </sl-select>
    </section>`
  }

  LayoutPane() {
    return html`<section id="layout" data-active>
      <sl-select name="display-inside" hoist value=${parseDisplayStyle(this.getCurrentValue("display"))[1]}>
        <sl-icon slot="prefix" name="arrow-autofit-down"></sl-icon>
        <sl-option class="text" value="none">${msg("None")}</sl-option>
        <sl-option value="flow">
          <sl-icon name="arrow-autofit-down"></sl-icon>
          <span>${msg("Flow")}</span>
        </sl-option>
        <sl-option value="flex">
          <sl-icon name="arrow-autofit-content"></sl-icon>
          <span>${msg("Flex")}</span>
        </sl-option>
        <sl-option value="grid">
          <sl-icon name="layout-grid-filled"></sl-icon>
          <span>${msg("Grid")}</span>
        </sl-option>
        <sl-option class="advanced" value="table">
          <sl-icon name="table"></sl-icon>
          <span>${msg("Table")}</span>
        </sl-option>
        <sl-option class="advanced" value="list-item">
          <sl-icon name="list-details"></sl-icon>
          <span>${msg("List item")}</span>
        </sl-option>
        <sl-option value="contents">
          <sl-icon name="border-corners"></sl-icon>
          <span>${msg("Contents")}</span>
        </sl-option>
        <sl-option class="advanced" value="math">
          <sl-icon name="math-symbols"></sl-icon>
          <span>${msg("Math")}</span>
        </sl-option>
        <sl-option class="advanced" value="ruby">
          <sl-icon name="language"></sl-icon>
          <span>${msg("Ruby")}</span>
        </sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced}>${msg("Display")}</css-global-input>
      </sl-select>
      <div>
        <sl-checkbox class="advanced" size="small" disabled name="display-flow-root" data-defaultValue="flow" data-otherValue="flow-root" ?checked=${parseDisplayStyle(this.getCurrentValue("display"))[1] === "flow-root"}>${msg("Root")}</sl-checkbox>
      </div>
      <sl-select class="advanced" size="small" name="display-internal" hoist label=${msg("Role")} value=${parseDisplayStyle(this.getCurrentValue("display"))[1]}>
        <sl-option value="table">${msg("Table")}</sl-option>
        <sl-option value="table-caption">${msg("Table caption")}</sl-option>
        <sl-option value="table-header-group">${msg("Table header group")}</sl-option>
        <sl-option value="table-footer-group">${msg("Table footer group")}</sl-option>
        <sl-option value="table-row-group">${msg("Table row group")}</sl-option>
        <sl-option value="table-column-group">${msg("Table column group")}</sl-option>
        <sl-option value="table-row">${msg("Table row")}</sl-option>
        <sl-option value="table-column">${msg("Table column")}</sl-option>
        <sl-option value="table-cell">${msg("Table cell")}</sl-option>
        <sl-option value="ruby-base-container">${msg("Ruby base container")}</sl-option>
        <sl-option value="ruby-text-container">${msg("Ruby text container")}</sl-option>
        <sl-option value="ruby-base">${msg("Ruby base")}</sl-option>
        <sl-option value="ruby-text">${msg("Ruby text")}</sl-option>
      </sl-select>
    </section>`
  }

  render() {
    return [
      this.LayoutPane(),
      this.FlexPane(),
      this.GridPane(),
      this.TablePane(),
      this.TableCellPane(),
      this.MediaPane(),
      this.MathPane(),
      this.RubyPane(),
      this.ColumnsPane(),
      this.SectioningPane()
    ]

  }
}