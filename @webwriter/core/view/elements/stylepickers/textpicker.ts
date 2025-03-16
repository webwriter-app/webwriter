import { LitElement, html, css, TemplateResult, PropertyValues } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { FONT_SIZES, WEB_SAFE_FONTS } from "./fontpicker"
import { kebapCaseToCamelCase } from "#model/utility/index.js"
import { CSSPropertySpecs } from "#model/index.js"
import { LitPickerElement } from "."
import { ifDefined } from "lit/directives/if-defined.js"
import { PICKER_COMMAND_PROPERTIES } from "#viewmodel/index.js"

/* Structure
DECORATION
  css-text-decoration
    css-text-underline-offset
    css-text-underline-position
  css-text-shadow
  css-text-transform
  css-text-emphasis
ALIGNMENT
  css-text-align
    css-text-align-last
    css-text-justify
  css-text-indent
  css-writing-mode
  css-text-orientation
    css-text-combine-upright
SPACING
  css-text-wrap
  css-white-space
    css-white-space-collapse
    css-tab-size
  css-word-spacing
    css-text-spacing-trim
  css-word-wrap
  css-word-break
    css-hyphens
    css-hyphenate-limit-chars
  css-line-break
  css-overflow-wrap
FONT
  css-font
    css-letter-spacing
*/

@customElement("ww-text-picker") // @ts-ignore: alignment-baseline/dominant-baseline not in mdn-data
export class TextPicker extends LitPickerElement<(typeof PICKER_COMMAND_PROPERTIES)["textStyle"][number]> {

  // @ts-ignore: alignment-baseline/dominant-baseline not in mdn-data
  propertyNames = PICKER_COMMAND_PROPERTIES.textStyle
  
  static styles = css`
    :host {
      display: contents;
    }

    :host(:not([advanced])) .advanced {
      display: none;
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

    sl-radio-group[name=text-transform] sl-radio-button {
      &::part(label) {
        padding: 0 var(--sl-spacing-2x-small);
      }
    }

    sl-radio-group[name=text-decoration-line] sl-radio-button {
      &::part(label) {
        padding: 0 var(--sl-spacing-2x-small);
      }
    }

    sl-select[name=font-synthesis]::part(tag__base) {
      padding: var(--sl-spacing-3x-small);
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

    #text-decoration, #text-emphasis {
      display: contents;
    }

    .decoration-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      & > :first-child {

        &::part(label) {
          display: flex;
        }

        & sl-icon-button {
          vertical-align: sub;
          font-size: var(--sl-font-size-medium);
          &::part(base) {
            padding: 0;
          }
        }
      }

      & > :not(:first-child):not([slot]) {
        margin-left: 1rem;
      }
    }

    .decoration-group:not([data-open]) {
      & > *:not(:first-child) {
        display: none;
      }
    }

    .decoration-group css-numeric-input:not(:first-child)::part(base) {
      font-size: var(--sl-font-size-x-small);
    }

    [name=text-decoration-style] sl-radio-button::part(label) {
      padding: 0 var(--sl-spacing-2x-small);
    }
  `

  @property({type: String, attribute: true, reflect: true})
  activeDecoration: "text-decoration" | "text-emphasis" | undefined

  AlignmentPane() {
    return html`<section>
      <h2 class="advanced">${msg("Alignment")}</h2>
      <sl-radio-group size="small" name="text-align" value=${this.getCurrentValue("text-align") || "left"}>
        <sl-radio-button value="left" title=${msg("Align left")}><sl-icon name="align-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="center" title=${msg("Align center")}><sl-icon name="align-center"></sl-icon></sl-radio-button>
        <sl-radio-button value="right" title=${msg("Align right")}><sl-icon name="align-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="justify" title=${msg("Justify")}><sl-icon name="align-justified"></sl-icon></sl-radio-button>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-align")}>${msg("Align text")}</css-global-input>
      </sl-radio-group>
      <sl-radio-group class="advanced" size="small" name="text-align-last" value=${this.getCurrentValue("text-align-last") || "left"}>
        <sl-radio-button value="left"><sl-icon name="align-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="center"><sl-icon name="align-center"></sl-icon></sl-radio-button>
        <sl-radio-button value="right"><sl-icon name="align-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="justify"><sl-icon name="align-justified"></sl-icon></sl-radio-button>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-align-last")}>${msg("Align last text line")}</css-global-input>
      </sl-radio-group>
      <css-numeric-input class="advanced" size="small" name="text-indent" type="length percentage" value=${this.getCurrentValue("text-indent") || "0"} data-defaultValue="left">>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-indent")}>${msg("Indent first text line")}</css-global-input>
        <sl-icon slot="prefix" name="indent-increase"></sl-icon>
      </css-numeric-input>
      <sl-select class="advanced" size="small" name="writing-mode" value=${this.getCurrentValue("writing-mode") || "horizontal-tb"} data-defaultValue=${"horizontal-tb"}>
        <sl-option value="horizontal-tb">${msg("Horizontal, top-to-bottom")}</sl-option>
        <sl-option value="vertical-rl">${msg("Vertical, right-to-left")}</sl-option>
        <sl-option value="vertical-lr">${msg("Vertical, left-to-right")}</sl-option>
        <sl-option value="sideways-rl">${msg("Sideways, right-to-left")}</sl-option>
        <sl-option value="sideways-lr">${msg("Sideways, left-to-right")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("writing-mode")}>${msg("Writing mode")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="alignment-baseline" value=${this.getCurrentValue("alignment-baseline" as any) || "baseline"}>
        <sl-option value="baseline">${msg("Baseline")}</sl-option>
        <sl-option value="text-top">${msg("Text top")}</sl-option>
        <sl-option value="middle">${msg("Middle")}</sl-option>
        <sl-option value="central">${msg("Central")}</sl-option>
        <sl-option value="text-bottom">${msg("Text bottom")}</sl-option>
        <sl-option value="mathematical">${msg("Mathematical")}</sl-option>
        <sl-option value="alphabetic">${msg("Alphabetic")}</sl-option>
        <sl-option value="ideographic">${msg("Ideographic")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("alignment-baseline" as any)}>${msg("Alignment baseline")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="dominant-baseline" value=${this.getCurrentValue("dominant-baseline" as any) || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="text-top">${msg("Text top")}</sl-option>
        <sl-option value="middle">${msg("Middle")}</sl-option>
        <sl-option value="central">${msg("Central")}</sl-option>
        <sl-option value="text-bottom">${msg("Text bottom")}</sl-option>
        <sl-option value="mathematical">${msg("Mathematical")}</sl-option>
        <sl-option value="alphabetic">${msg("Alphabetic")}</sl-option>
        <sl-option value="ideographic">${msg("Ideographic")}</sl-option>
        <sl-option value="hanging">${msg("Hanging")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("dominant-baseline")}>${msg("Dominant baseline")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="text-orientation" value=${this.getCurrentValue("text-orientation") || "mixed"}>
        <sl-option value="mixed">${msg("Mixed")}</sl-option>
        <sl-option value="upright">${msg("Upright")}</sl-option>
        <sl-option value="sideways">${msg("Sideways")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-orientation")}>${msg("Orientation")}</css-global-input>
      </sl-select>
      <sl-switch class="advanced" size="small" name="text-combine-upright" data-defaultValue="none" data-otherValue="all" ?checked=${this.getCurrentValue("text-combine-upright") === "all"}>
        <css-global-input ?disabled=${!this.advanced}  value=${this.getGlobalValue("text-combine-upright")}>${msg("Combine upright")}</css-global-input>
      </sl-switch>
    </section>`
  }

  DecorationPane() {
    return html`<section>
      <h2 class="advanced">${msg("Decoration")}</h2>
      <div class="decoration-group" id="text-decoration" ?data-open=${this.activeDecoration === "text-decoration"}>
        <sl-radio-group size="small" name="text-decoration-line"  value=${this.getCurrentValue("text-decoration-line") || "none"}>
          <sl-radio-button class="text" value="none">${msg("None")}</sl-radio-button>
          <sl-radio-button value="underline"><sl-icon name="underline"></sl-icon></sl-radio-button>
          <sl-radio-button value="overline"><sl-icon name="overline"></sl-icon></sl-radio-button>
          <sl-radio-button value="line-through"><sl-icon name="strikethrough"></sl-icon></sl-radio-button>
          <sl-icon-button name=${this.activeDecoration === "text-decoration"? "chevron-down": "chevron-right"} slot="label" @click=${(e: any) => {e.preventDefault(); e.stopImmediatePropagation(); this.activeDecoration = this.activeDecoration === "text-decoration"? undefined: "text-decoration"}}></sl-icon-button>
          <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-decoration-line")}>${msg("Decoration")}</css-global-input>
        </sl-radio-group>
        <sl-radio-group size="small" name="text-decoration-style"  value=${this.getCurrentValue("text-decoration-style") || "solid"}>
          <sl-radio-button value="solid"><sl-icon name="minus"></sl-icon></sl-radio-button>
          <sl-radio-button value="double"><sl-icon name="equal"></sl-icon></sl-radio-button>
          <sl-radio-button value="dotted"><sl-icon name="line-dotted"></sl-icon></sl-radio-button>
          <sl-radio-button value="dashed"><sl-icon name="line-dashed"></sl-icon></sl-radio-button>
          <sl-radio-button value="wavy"><sl-icon name="arrow-wave-right-up"></sl-icon></sl-radio-button>
          <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-decoration-style")}>${msg("Decoration line")}</css-global-input>
        </sl-radio-group>
        <css-numeric-input size="small" name="text-decoration-thickness" type="length percentage" value=${this.getCurrentValue("text-decoration-thickness") || "0px"}>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-decoration-thickness")}>${msg("Decoration thickness")}</css-global-input>
        </css-numeric-input>
        <div class="color-input">
          <sl-color-picker size="small" name="text-decoration-color" hoist no-format-toggle value=${this.getCurrentValue("text-decoration-color")}></sl-color-picker>
          <label for="text-decoration-color">
            <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("text-decoration-color")}>${msg("Decoration color")}</css-global-input>
          </label>
        </div>
        <sl-select class="advanced" size="small" name="text-decoration-skip-ink"  value=${this.getCurrentValue("text-decoration-skip-ink") || "auto"}>
          <sl-option value="none">${msg("Skip no overlaps")}</sl-option>
          <sl-option value="auto">${msg("Skip overlaps (auto)")}</sl-option>
          <sl-option value="all">${msg("Skip all overlaps")}</sl-option>
          <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("text-decoration-skip-ink")}>${msg("Skip overlaps")}</css-global-input>
        </sl-select>
        <css-numeric-input class="advanced" size="small" name="text-underline-offset" type="length percentage" placeholder=${msg("auto")} value=${this.getCurrentValue("text-underline-offset") || "0px"}>
          <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("text-underline-offset")}>${msg("Underline offset")}</css-global-input>
        </css-numeric-input>
        <sl-select class="advanced" size="small" name="text-underline-position" value=${this.getCurrentValue("text-underline-position") || "auto"}>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <sl-option value="left">${msg("Left")}</sl-option>
          <sl-option value="right">${msg("Right")}</sl-option>
          <sl-option value="under">${msg("Under")}</sl-option>
          <sl-option value="under left">${msg("Under left")}</sl-option>
          <sl-option value="under right">${msg("Under right")}</sl-option>
          <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("text-underline-position")}>${msg("Underline position")}</css-global-input>
        </sl-select>
      </div>
      <div id="text-emphasis" class="advanced decoration-group" ?data-open=${this.activeDecoration === "text-emphasis"}>
        <ww-combobox size="small" class="advanced" name="text-emphasis-style-character" label=${msg("Text emphasis")} placeholder="none" value=${this.getCurrentValue("text-emphasis-style").replace("filled", "").trim() || "•"}>
          <sl-option data-name="dot" value="•">•</sl-option>
          <sl-option data-name="circle" value="●">●</sl-option>
          <sl-option data-name="double-circle" value="◉">◉</sl-option>
          <sl-option data-name="triangle" value="▲">▲</sl-option>
          <sl-option data-name="sesame" value="﹅">﹅</sl-option>
          <sl-icon-button name=${this.activeDecoration === "text-emphasis"? "chevron-down": "chevron-right"} slot="label" @click=${(e: any) => {e.preventDefault(); e.stopImmediatePropagation(); this.activeDecoration = this.activeDecoration === "text-emphasis"? undefined: "text-emphasis"}}></sl-icon-button>
          <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-emphasis-style")}>${msg("Emphasis")}</css-global-input>
          <sl-checkbox style="margin-left: auto;" slot="label" size="small" class="advanced"  name="text-emphasis-style-fill" ?checked=${this.getCurrentValue("text-emphasis-style").split(/\s+/).includes("filled")} @click=${(e: any) => {e.preventDefault(); e.stopImmediatePropagation()}}>
          ${msg("Fill")}
        </sl-checkbox>
        </ww-combobox>
        <sl-select size="small" class="advanced"  name="text-emphasis-position" value=${this.getCurrentValue("text-emphasis-position") || "auto"}>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <sl-option value="over left">${msg("Over Left")}</sl-option>
          <sl-option value="over right">${msg("Over Right")}</sl-option>
          <sl-option value="under left">${msg("Under Left")}</sl-option>
          <sl-option value="under right">${msg("Under Right")}</sl-option>
          <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-emphasis-position")}>${msg("Emphasis position")}</css-global-input>
        </sl-select>
        <div class="color-input advanced">
          <sl-color-picker size="small" name="text-emphasis-color" hoist no-format-toggle value=${this.getCurrentValue("text-emphasis-color")}></sl-color-picker>
          <label for="text-emphasis-color">
            <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("text-emphasis")}>${msg("Emphasis color")}</css-global-input>
          </label>
        </div>
      </div>
      <ww-css-property-input class="advanced" size="small" name="text-shadow" value=${this.getCurrentValue("text-shadow") || "none"}>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-shadow")}>${msg("Text shadow")}</css-global-input>
      </ww-css-property-input>
      <!--<css-shadow-input size="small" name="text-shadow" label=${msg("Text shadow")}></css-shadow-input>-->
      <sl-radio-group size="small" name="text-transform"  value=${this.getCurrentValue("text-transform") || "none"}>
        <sl-radio-button class="text" value="none">${msg("None")}</sl-radio-button>
        <sl-radio-button value="uppercase"><sl-icon name="letter-case-upper"></sl-icon></sl-radio-button>
        <sl-radio-button value="capitalize"><sl-icon name="letter-case"></sl-icon></sl-radio-button>
        <sl-radio-button value="lowercase"><sl-icon name="letter-case-lower"></sl-icon></sl-radio-button>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-transform")}>${msg("Transform text")}</css-global-input>
      </sl-radio-group>
    </section>`
  }

  SpacingPane() {
    /*
      css-text-wrap
      css-white-space
        css-white-space-collapse
        css-tab-size
      css-word-spacing
        css-text-spacing-trim
      css-word-break
      css-hyphens
      css-line-break
      css-overflow-wrap
    */
    return html`<section>
      <h2 class="advanced">${msg("Spacing")}</h2>
      <css-numeric-input name="line-height" type="number length percentage" placeholder="normal" value=${this.getCurrentValue("line-height") || "normal"}>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("line-height")}>${msg("Line height")}</css-global-input>
        <sl-icon slot="prefix" name="line-height"></sl-icon>
      </css-numeric-input>
      <sl-switch size="small" name="text-wrap-mode" data-defaultValue="wrap" data-otherValue="nowrap" ?checked=${this.getCurrentValue("text-wrap-mode") === "nowrap"}>
        <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("text-wrap")}>${msg("No text wrap")}</css-global-input>
        <sl-select class="advanced" size="small" name="text-wrap-style" ?disabled=${this.getCurrentValue("text-wrap-style") === "nowrap"} value=${this.getCurrentValue("text-wrap") || "auto"} @click=${(e: any) => {e.preventDefault(); e.stopPropagation()}}>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <sl-option value="balance">${msg("Balance")}</sl-option>
          <sl-option value="stable">${msg("Stable")}</sl-option>
          <sl-option value="pretty">${msg("Pretty")}</sl-option>
          <sl-option value="avoid-orphans">${msg("Avoid orphans")}</sl-option>
        </sl-select>
      </sl-switch>
      <sl-switch size="small" name="hyphens" data-defaultValue="none" data-otherValue="auto" ?checked=${this.getCurrentValue("hyphens") === "auto"}>
        <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("hyphens")}>${msg("Hyphenate")}</css-global-input>
      </sl-switch>
      <sl-select class="advanced" size="small" name="line-break" value=${this.getCurrentValue("line-break") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="anywhere">${msg("Anywhere")}</sl-option>
        <sl-option value="loose">${msg("Loose")}</sl-option>
        <sl-option value="normal">${msg("Normal")}</sl-option>
        <sl-option value="loose">${msg("Strict")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("line-break")}>${msg("Line break (CJK lang.)")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="word-break"  value=${this.getCurrentValue("word-break") || "normal"}>
        <sl-option value="normal">${msg("Normal")}</sl-option>
        <sl-option value="break-all">${msg("Break all")}</sl-option>
        <sl-option value="keep-all">${msg("Keep all")}</sl-option>
        <sl-option value="break-word">${msg("Break word")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("word-break")}>${msg("Word break")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="white-space-collapse" value=${this.getCurrentValue("white-space-collapse") || "collapse"}>
        <sl-option value="collapse">${msg("Collapse")}</sl-option>
        <sl-option value="preserve">${msg("Preserve breaks and spaces")}</sl-option>
        <sl-option value="preserve-breaks">${msg("Preserve breaks")}</sl-option>
        <sl-option value="preserve-spaces">${msg("Preserve spaces")}</sl-option>
        <sl-option value="break-spaces">${msg("Break spaces")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("white-space-collapse")}>${msg("White space")}</css-global-input>
      </sl-select>
      <css-numeric-input class="advanced" size="small" name="tab-size" type="number length" min="0" value=${this.getCurrentValue("tab-size") || "8"}>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("tab-size")}>${msg("Tab size")}</css-global-input>
        <sl-icon slot="prefix" name="chevron-right-pipe"></sl-icon>
      </css-numeric-input>
      <css-numeric-input class="advanced" size="small" name="word-spacing" type="length" value=${this.getCurrentValue("word-spacing") || "normal"} placeholder="normal">
        <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("word-spacing")}>${msg("Word spacing")}</css-global-input>
        <sl-icon slot="prefix" name="space"></sl-icon>
      </css-numeric-input>
      <sl-select class="advanced" size="small" name="text-spacing-trim" value=${this.getCurrentValue("text-spacing-trim") || "normal"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="space-all">${msg("Space all")}</sl-option>
        <sl-option value="normal">${msg("Normal")}</sl-option>
        <sl-option value="space-first">${msg("Space first")}</sl-option>
        <sl-option value="trim-start">${msg("Trim start")}</sl-option>
        <sl-option value="trim-both">${msg("Trim both")}</sl-option>
        <sl-option value="trim-all">${msg("Trim all")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-spacing-trim")}>${msg("Text spacing trim")}</css-global-input>
      </sl-select>
      <ww-combobox class="advanced" size="small" name="text-overflow" suggestions placeholder="clip" value=${this.getCurrentValue("text-overflow") || "clip"}>
        <sl-option value="clip"><i>${msg("Clip")}</i></sl-option>
        <sl-option value="ellipsis"><i>${msg("Ellipsis")}</i></sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-overflow")}>${msg("Text overflow")}</css-global-input>
      </ww-combobox>
    </section>`
  }

  FontPane() {
    return html`<section class="advanced">
      <h2 class="advanced">${msg("Font")}</h2>
      <ww-combobox size="small" name="font-family" suggestions placeholder=${msg("normal")} value=${this.getCurrentValue("font-family")}>
        <sl-option value="">${msg("Normal")}</sl-option>
        ${WEB_SAFE_FONTS.map(v => html`<sl-option value=${v.name}>${v.name.startsWith('"')? v.name.slice(1, -1): v.name}</sl-option>`)}
        <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("font-family")}>${msg("Font family")}</css-global-input>
      </ww-combobox>
      <css-numeric-input size="small" name="font-size" type="length percentage" min="0" placeholder=${msg("normal")} value=${this.getCurrentValue("font-size") || "medium"}>
        <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("font-size")}>${msg("Font size")}</css-global-input>
      </css-numeric-input>
      <sl-range size="small" name="font-stretch" min="50" step="12.5" max="200" value=${this.getCurrentValue("font-stretch") || "100"}>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-stretch")}>${msg("Font stretch")}</css-global-input></sl-range>
      <css-numeric-input size="small" name="letter-spacing" type="length" value=${this.getCurrentValue("letter-spacing") || "normal"} placeholder="normal">
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("letter-spacing")}>${msg("Letter spacing")}</css-global-input>
        <sl-icon slot="prefix" name="letter-spacing"></sl-icon>
      </css-numeric-input>
      <sl-select size="small" name="font-kerning" value="auto" value=${this.getCurrentValue("font-kerning") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="normal">${msg("Normal")}</sl-option>
        <sl-option value="none">${msg("None")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced}  value=${this.getGlobalValue("font-kerning")}>${msg("Font kerning")}</css-global-input>
      </sl-select>
      <sl-range size="small" name="font-weight" min="100" step="100" max="900" value=${this.getCurrentValue("font-weight") || "400"}>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-weight")}>${msg("Font weight")}</css-global-input>
      </sl-range>
      <sl-switch size="small" name="font-style" data-defaultValue="normal" data-otherValue="italic" ?checked=${["italic", "oblique"].includes(this.getCurrentValue("font-style"))}>
        <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("font-style")}>${msg("Italic")}</css-global-input>
      </sl-switch>
      <sl-select size="small" name="font-synthesis" multiple value=${this.getCurrentValue("font-synthesis") || "weight style small-caps position"}>
        <sl-option value="weight">${msg("Weight")}</sl-option>
        <sl-option value="style">${msg("Style")}</sl-option>
        <sl-option value="small-caps">${msg("Small caps")}</sl-option>
        <sl-option value="position">${msg("Position")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-synthesis")}>${msg("Synthesize typefaces")}</css-global-input>
     </sl-select>
     <sl-select size="small" name="text-rendering"  value=${this.getCurrentValue("text-rendering") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="optimizeSpeed">${msg("Optimize speed")}</sl-option>
        <sl-option value="optimizeLegibility">${msg("Optimize legibility")}</sl-option>
        <sl-option value="geometricPrecision">${msg("Geometric precision")}</sl-option>
        <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("text-rendering")}>${msg("Text rendering")}</css-global-input>
    </sl-select>
    <ww-css-property-input size="small" name="font-feature-settings" value=${this.getCurrentValue("font-feature-settings") || "normal"}>
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-feature-settings")}>${msg("Font feature settings")}</css-global-input>
    </ww-css-property-input>
    <ww-css-property-input size="small" name="font-variant" value=${this.getCurrentValue("font-variant") || "normal"}>
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-variant")}>${msg("Font variant")}</css-global-input>
    </ww-css-property-input>
    <ww-css-property-input size="small" name="font-size-adjust" value=${this.getCurrentValue("font-size-adjust") || "none"}>
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-size-adjust")}>${msg("Font size adjust")}</css-global-input>
    </ww-css-property-input>
    <ww-css-property-input size="small" name="font-palette" value=${this.getCurrentValue("font-palette") || "normal"}>
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-palette")}>${msg("Font palette")}</css-global-input>
    </ww-css-property-input>
    <ww-css-property-input size="small" name="font-language-override" value=${this.getCurrentValue("font-language-override") || "normal"}>
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("font-language-override")}>${msg("Font language override")}</css-global-input>
    </ww-css-property-input>
    <ww-css-property-input size="small" name="quotes" value=${this.getCurrentValue("quotes")} placeholder="normal">
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("quotes")}>${msg("Quotes character")}</css-global-input>
    </ww-css-property-input>
    <ww-css-property-input size="small" name="hyphenate-character" value=${this.getCurrentValue("hyphenate-character") || "auto"}>
      <css-global-input slot="label" ?disabled=${!this.advanced} value=${this.getGlobalValue("hyphenate-character")}>${msg("Hyphenate character")}</css-global-input>
    </ww-css-property-input>
    <sl-switch size="small" name="font-optical-sizing" data-defaultValue="auto" data-otherValue="none" ?checked=${this.getCurrentValue("font-optical-sizing") === "none"}>
      <css-global-input ?disabled=${!this.advanced} value=${this.getGlobalValue("font-optical-sizing")}>${msg("No optical font sizing")}</css-global-input>
    </sl-switch>
    </section>`
  }

  render() {
    return [
      this.AlignmentPane(),
      this.DecorationPane(),
      this.SpacingPane(),
      this.FontPane()
    ]
  }
}