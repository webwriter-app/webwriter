import { LitElement, html, css, TemplateResult } from "lit"
import { customElement, property } from "lit/decorators.js"
import { localized, msg } from "@lit/localize"
import { LitPickerElement } from "."
import { PICKER_COMMAND_PROPERTIES } from "#viewmodel/index.js"
import { ifDefined } from "lit/directives/if-defined.js"


@customElement("ww-interactivity-picker") // @ts-ignore: accent-color/caret-color not in mdn-data
export class InteractivityPicker extends LitPickerElement<(typeof PICKER_COMMAND_PROPERTIES)["interactivityStyle"][number]> {

  // @ts-ignore: accent-color/caret-color not in mdn-data
  propertyNames = PICKER_COMMAND_PROPERTIES.interactivityStyle

  @property({type: Boolean, attribute: true, reflect: true})  
  cursorsOpen = false

  @property({type: String, attribute: true, reflect: true})
  activeSpacing: "scroll-margin" | "scroll-padding" | undefined
  
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

    sl-radio-group::part(button-group) {
      width: 100%;
    }

    sl-radio-group::part(button-group__base) {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      grid-auto-rows: 1fr;
    }

    sl-radio-group[name=cursor]:not([data-open]) > sl-radio-button:not(:is(:nth-of-type(1), :nth-of-type(2), :nth-of-type(3), :nth-of-type(4), :nth-of-type(5), :nth-of-type(6), :nth-of-type(7), :nth-of-type(8), :nth-of-type(9), :nth-of-type(10), :nth-of-type(11), :nth-of-type(12))) {
      display: none !important;
    }

    sl-radio-group[name=cursor] sl-icon-button[slot=label] {

      vertical-align: sub;
      font-size: var(--sl-font-size-medium);

      &::part(base) {
        padding: 0;
      }
    }

    sl-radio-group[name=cursor] sl-radio-button {
      &::part(label) {
        padding: 0 var(--sl-spacing-2x-small);
      }
    }

    sl-radio-group[name=cursor] sl-radio-button:first-of-type::part(button) {
      border-bottom-left-radius: 0;
      margin-left: -1px;
    }

    sl-radio-group[name=cursor] sl-radio-button:last-of-type::part(button) {
      border-top-right-radius: 0;
    }

    sl-radio-button.custom {
      grid-column: span 4;
    }

    sl-radio-group[name=resize] sl-radio-button {
      &::part(label) {
        padding: 0 var(--sl-spacing-2x-small);
      }
    }

    sl-radio-group[name=user-select] sl-radio-button {
      &::part(label) {
        padding: 0 var(--sl-spacing-2x-small);
      }
    }

    sl-radio-group[name=user-select] sl-radio-button:first-of-type::part(button) {
      border-bottom-left-radius: 0;
      margin-left: -1px;
    }

    sl-radio-group[name=user-select] sl-radio-button:last-of-type::part(button) {
      border-top-right-radius: 0;
    }

    sl-switch[name=scrollbar-width]::part(base) {
      width: 100%;
    }

    sl-switch[name=scrollbar-width]::part(label) {
      width: 100%;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
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
      gap: 0.35em;
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

    sl-radio-group[name=user-select] sl-radio-button:nth-child(1) {
      grid-column: span 4;
    }

    .two-column {
      display: flex;
      flex-direction: row;
      gap: 0.5rem;
    }

    .spacing-group {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
      grid-auto-rows: min-content;
      gap: 0.5rem;

      sl-icon-button {
        vertical-align: sub;
        font-size: var(--sl-font-size-medium);
        &::part(base) {
          padding: 0;
        }
      }

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

      & sl-color-picker[slot=label] {
        &::part(trigger) {
          width: 0.9rem;
          height: 0.9rem;
          border: 1px solid darkgray;
        }

        &::part(trigger)::before {
          display: none;
        }

      }
    }

    .spacing-group:not([data-open]) {
      & > *:not(:first-child) {
        display: none;
      }
    }

    .spacing-group css-numeric-input:not(:first-child)::part(base) {
      font-size: var(--sl-font-size-x-small);
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
  `

  AnimationPane() {
    return html`<section class="advanced">
      <h2 class="advanced">${msg("Animation")}</h2>
      <ww-css-property-input name="animation" plaintext value=${this.getCurrentValue("animation") || "none"}>
          <css-global-input value=${this.getGlobalValue("animation")} slot="label" ?disabled=${!this.advanced}>${msg("Animation")}</css-global-input>
      </ww-css-property-input>
      <ww-css-property-input name="animation-composition" plaintext value=${this.getCurrentValue("animation-composition") || "replace"}>
        <css-global-input value=${this.getGlobalValue("animation-composition")} slot="label" ?disabled=${!this.advanced}>${msg("Animation composition")}</css-global-input>
      </ww-css-property-input>
      <ww-css-property-input name="transition" plaintext value=${this.getCurrentValue("transition") || "none"}>
        <css-global-input value=${this.getGlobalValue("transition")} slot="label" ?disabled=${!this.advanced}>${msg("Transition")}</css-global-input>
      </ww-css-property-input>
    </section>`
  }

  AppearancePane() {
    return html`<section>
      <h2 class="advanced">${msg("Appearance")}</h2>
      <div class="color-input advanced">
        <sl-color-picker size="small" name="accent–color" hoist no-format-toggle value=${this.getCurrentValue("accent–color")}></sl-color-picker>
        <label for="accent-color">
          <css-global-input value=${this.getGlobalValue("accent-color" as any)} slot="label" ?disabled=${!this.advanced}>${msg("Accent color")}</css-global-input>
        </label>
      </div>
      <div class="color-input advanced">
        <sl-color-picker size="small" name="caret–color" hoist no-format-toggle value=${this.getCurrentValue("caret-color" as any)}></sl-color-picker>
        <label for="caret-color">
          <css-global-input value=${this.getGlobalValue("caret-color" as any)} slot="label" ?disabled=${!this.advanced}>${msg("Caret color")}</css-global-input>
        </label>
      </div>
      <sl-radio-group size="small" name="cursor" ?data-open=${this.cursorsOpen} value=${this.getCurrentValue("cursor") || "auto"}>
        <sl-icon-button name=${this.cursorsOpen? "chevron-down": "chevron-right"} slot="label" @click=${() => this.cursorsOpen = !this.cursorsOpen}></sl-icon-button>
        <css-global-input value=${this.getGlobalValue("cursor")} slot="label" ?disabled=${!this.advanced}>${msg("Cursor")}</css-global-input>
        <sl-radio-button class="text" value="auto" style="cursor: auto">${msg("Auto")}</sl-radio-button>
        <sl-radio-button class="text" value="none" style="cursor: none">${msg("None")}</sl-radio-button>
        <sl-radio-button value="default" style="cursor: default"><sl-icon name="pointer"></sl-icon></sl-radio-button>
        <sl-radio-button value="context-menu" style="cursor: context-menu"><sl-icon name="pointer-cog"></sl-icon></sl-radio-button> <!-- missing -->
        <sl-radio-button value="help" style="cursor: help"><sl-icon name="pointer-question"></sl-icon></sl-radio-button>
        <sl-radio-button value="pointer" style="cursor: pointer"><sl-icon name="pointer"></sl-icon></sl-radio-button>
        <sl-radio-button value="progress" style="cursor: progress"><sl-icon name="hourglass-low"></sl-icon></sl-radio-button> <!-- missing -->
        <sl-radio-button value="alias" style="cursor: alias"><sl-icon name="pointer-share"></sl-icon></sl-radio-button>
        <sl-radio-button value="copy" style="cursor: copy"><sl-icon name="pointer-plus"></sl-icon></sl-radio-button>
        <sl-radio-button value="no-drop" style="cursor: no-drop"><sl-icon name="pointer-cancel"></sl-icon></sl-radio-button>
        <sl-radio-button value="grab" style="cursor: grab"><sl-icon name="hand-stop"></sl-icon></sl-radio-button>
        <sl-radio-button value="grabbing" style="cursor: grabbing"><sl-icon name="hand-grab"></sl-icon></sl-radio-button>
        <sl-radio-button value="wait" style="cursor: wait"><sl-icon name="hourglass-low"></sl-icon></sl-radio-button>
        <sl-radio-button value="not-allowed" style="cursor: not-allowed"><sl-icon name="ban"></sl-icon></sl-radio-button>
        <sl-radio-button value="zoom-in" style="cursor: zoom-in"><sl-icon name="zoom-in"></sl-icon></sl-radio-button>
        <sl-radio-button value="zoom-out" style="cursor: zoom-out"><sl-icon name="zoom-out"></sl-icon></sl-radio-button>
        <sl-radio-button value="move" style="cursor: move"><sl-icon name="arrows-move"></sl-icon></sl-radio-button>
        <sl-radio-button value="cell" style="cursor: cell"><sl-icon name="grid-goldenratio"></sl-icon></sl-radio-button> <!-- missing -->
        <sl-radio-button value="crosshair" style="cursor: crosshair"><sl-icon name="plus"></sl-icon></sl-radio-button>
        <sl-radio-button value="text" style="cursor: text"><sl-icon name="cursor-text"></sl-icon></sl-radio-button>
        <sl-radio-button value="text-vertical" style="cursor: text-vertical"><sl-icon style="transform: rotate(90deg)" name="cursor-text"></sl-icon></sl-radio-button>
        <sl-radio-button value="all-scroll" style="cursor: all-scroll"><sl-icon name="direction-arrows"></sl-icon></sl-radio-button>
        <sl-radio-button value="col-resize" style="cursor: col-resize"><sl-icon name="arrow-bar-both"></sl-icon></sl-radio-button>
        <sl-radio-button value="row-resize" style="cursor: row-resize"><sl-icon style="transform: rotate(90deg)" name="arrow-bar-both"></sl-icon></sl-radio-button>
        <sl-radio-button value="n-resize" style="cursor: n-resize"><sl-icon name="arrow-up"></sl-icon></sl-radio-button>
        <sl-radio-button value="e-resize" style="cursor: e-resize"><sl-icon name="arrow-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="s-resize" style="cursor: s-resize"><sl-icon name="arrow-down"></sl-icon></sl-radio-button>
        <sl-radio-button value="w-resize" style="cursor: w-resize"><sl-icon name="arrow-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="ne-resize" style="cursor: ne-resize"><sl-icon name="arrow-up-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="nw-resize" style="cursor: nw-resize"><sl-icon name="arrow-up-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="se-resize" style="cursor: se-resize"><sl-icon name="arrow-down-right"></sl-icon></sl-radio-button>
        <sl-radio-button value="sw-resize" style="cursor: sw-resize"><sl-icon name="arrow-down-left"></sl-icon></sl-radio-button>
        <sl-radio-button value="ew-resize" style="cursor: ew-resize"><sl-icon name="arrows-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button value="ns-resize" style="cursor: ns-resize"><sl-icon name="arrows-vertical"></sl-icon></sl-radio-button>
        <sl-radio-button value="nesw-resize" style="cursor: nesw-resize"><sl-icon style="transform: rotate(-45deg)" name="arrows-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button value="nwse-resize" style="cursor: nwse-resize"><sl-icon style="transform: rotate(45deg)" name="arrows-horizontal"></sl-icon></sl-radio-button>
        <!--<sl-radio-button class="custom advanced" value="custom">
          ${msg("Custom")}
        </sl-radio-button>-->
      </sl-radio-group>
      <sl-switch class="advanced" size="small" class="advanced" name="appearance" data-defaultValue="none" data-otherValue="auto" ?checked=${this.getCurrentValue("appearance") === "auto"}>
        <css-global-input value=${this.getGlobalValue("appearance")} ?disabled=${!this.advanced}>${msg("Platform-specific look")}</css-global-input>
      </sl-switch>
    </section>`
  } 

  InteractionsPane() {
    return html`<section>
      <h2 class="advanced">${msg("Interactions")}</h2>
      <sl-radio-group size="small" name="resize" value=${this.getCurrentValue("resize") || "none"}>
        <sl-radio-button class="text" value="none">${msg("None")}</sl-radio-button>
        <sl-radio-button value="both" title=${msg("Resize both horizontally and vertically")}><sl-icon name="arrows-diagonal-2"></sl-icon></sl-radio-button>
        <sl-radio-button value="horizontal"><sl-icon name="arrows-move-horizontal"></sl-icon></sl-radio-button>
        <sl-radio-button value="vertical"><sl-icon name="arrows-move-vertical"></sl-icon></sl-radio-button>
        <css-global-input value=${this.getGlobalValue("resize")} slot="label" ?disabled=${!this.advanced}>${msg("Allow resizing")}</css-global-input>
      </sl-radio-group>
      <sl-radio-group size="small" name="user-select" label=${msg("Allow selection")} value=${this.getCurrentValue("user-select") || "auto"}>
        <sl-radio-button class="text" value="none">${msg("None")}</sl-radio-button>
        <sl-radio-button class="text" value="auto">${msg("Auto")}</sl-radio-button>
        <sl-radio-button class="text" value="text">${msg("Text")}</sl-radio-button>
        <sl-radio-button class="text" value="contain">${msg("Contain")}</sl-radio-button>
        <sl-radio-button class="text" value="all">${msg("All")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("user-select")} slot="label" ?disabled=${!this.advanced}>${msg("Allow selection")}</css-global-input>
      </sl-radio-group>
      <sl-select class="advanced" size="small" name="touch-action" value=${this.getCurrentValue("touch-action") || "auto"}>
        <sl-option value="auto">${msg("Auto")}</sl-option>
        <sl-option value="none">${msg("None")}</sl-option>
        <sl-option value="pan-x">${msg("Pan (x)")}</sl-option>
        <sl-option value="pan-left">${msg("Pan (left)")}</sl-option>
        <sl-option value="pan-right">${msg("Pan (right)")}</sl-option>
        <sl-option value="pan-y">${msg("Pan (y)")}</sl-option>
        <sl-option value="pan-up">${msg("Pan (up)")}</sl-option>
        <sl-option value="pan-down">${msg("Pan (down)")}</sl-option>
        <sl-option value="pinch-zoom">${msg("Pinch zoom")}</sl-option>
        <sl-option value="manipulation">${msg("Manipulation")}</sl-option>
        <css-global-input value=${this.getGlobalValue("touch-action")} slot="label" ?disabled=${!this.advanced}>${msg("Allow touch actions")}</css-global-input>
      </sl-select>
    </section>`
  } 

  ScrollingPane() {
    return html`<section>
      <h2 class="advanced">${msg("Scrolling")}</h2>
      <sl-switch size="small" name="scrollbar-width" data-defaultValue="auto" data-otherValue="none" ?checked=${this.getCurrentValue("scrollbar-width") !== "none"}>
        <css-global-input value=${this.getGlobalValue("scrollbar-width")} ?disabled=${!this.advanced}>${msg("Scrollbar")}</css-global-input>
        <sl-checkbox size="small" data-defaultValue="auto" data-otherValue="thin" ?checked=${this.getCurrentValue("scrollbar-width") === "thin"}>${msg("Thin")}</sl-checkbox>
      </sl-switch>
      <div class="color-input advanced">
        <sl-color-picker size="small" name="scrollbar-color" hoist no-format-toggle value=${this.getCurrentValue("scrollbar-color")}></sl-color-picker>
        <label for="scrollbar-color">
          <css-global-input value=${this.getGlobalValue("scrollbar-color")} slot="label" ?disabled=${!this.advanced}>${msg("Scrollbar color")}</css-global-input>
        </label>
      </div>
      <div class="spacing-group advanced" id="scroll-margin" ?data-open=${this.activeSpacing === "scroll-margin"}>
        <css-numeric-input name="scroll-margin" type="length percentage" value=${this.getCurrentValue("scroll-margin") || "0px"}>
          <sl-icon-button name=${this.activeSpacing === "scroll-margin"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "scroll-margin"? undefined: "scroll-margin"}></sl-icon-button>
          <css-global-input value=${this.getGlobalValue("scroll-margin")} slot="label" ?disabled=${!this.advanced}>${msg("Scroll margin")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-margin-top" type="length percentage" value=${this.getCurrentValue("scroll-margin-top") || "0px"}>
          <css-global-input value=${this.getGlobalValue("scroll-margin-top")} slot="label" ?disabled=${!this.advanced}>${msg("Top")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-margin-left" type="length percentage" value=${this.getCurrentValue("scroll-margin-left") || "0px"}>
          <css-global-input value=${this.getGlobalValue("scroll-margin-left")} slot="label" ?disabled=${!this.advanced}>${msg("Left")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-margin-right" type="length percentage" value=${this.getCurrentValue("scroll-margin-right") || "0px"}>
          <css-global-input value=${this.getGlobalValue("scroll-margin-right")} slot="label" ?disabled=${!this.advanced}>${msg("Right")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-margin-bottom" label=${msg("Bottom")} type="length percentage" value=${this.getCurrentValue("scroll-margin-bottom") || "0px"} min=0>
          <css-global-input value=${this.getGlobalValue("scroll-margin-bottom")} slot="label" ?disabled=${!this.advanced}>${msg("Bottom")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="spacing-group advanced" id="scroll-padding" ?data-open=${this.activeSpacing === "scroll-padding"}>
        <css-numeric-input name="scroll-padding" type="length percentage" value=${this.getCurrentValue("scroll-padding") || "0px"}>
          <sl-icon-button name=${this.activeSpacing === "scroll-padding"? "chevron-down": "chevron-right"} slot="label" @click=${() => this.activeSpacing = this.activeSpacing === "scroll-padding"? undefined: "scroll-padding"}></sl-icon-button>
          <css-global-input value=${this.getGlobalValue("scroll-padding")} slot="label" ?disabled=${!this.advanced}>${msg("Scroll padding")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-padding-top" type="length percentage" value=${this.getCurrentValue("scroll-padding-top") || "0px"}>
          <css-global-input value=${this.getGlobalValue("scroll-padding-top")} slot="label" ?disabled=${!this.advanced}>${msg("Top")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-padding-left" type="length percentage" value=${this.getCurrentValue("scroll-padding-left") || "0px"}>
          <css-global-input value=${this.getGlobalValue("scroll-padding-left")} slot="label" ?disabled=${!this.advanced}>${msg("Left")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-padding-right" type="length percentage" value=${this.getCurrentValue("scroll-padding-right") || "0px"}>
          <css-global-input value=${this.getGlobalValue("scroll-padding-right")} slot="label" ?disabled=${!this.advanced}>${msg("Right")}</css-global-input>
        </css-numeric-input>
        <css-numeric-input class="advanced" name="scroll-padding-bottom" label=${msg("Bottom")} type="length percentage" value=${this.getCurrentValue("scroll-padding-bottom") || "0px"} min=0>
          <css-global-input value=${this.getGlobalValue("scroll-padding-bottom")} slot="label" ?disabled=${!this.advanced}>${msg("Bottom")}</css-global-input>
        </css-numeric-input>
      </div>
      <div class="two-column">
        <sl-select class="advanced" size="small" name="overscroll-behavior-x" value=${this.getCurrentValue("overscroll-behavior-x") || "auto"}>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <sl-option value="contain">${msg("Contain")}</sl-option>
          <sl-option value="none">${msg("None")}</sl-option>
          <css-global-input value=${this.getGlobalValue("overscroll-behavior-x")} slot="label" ?disabled=${!this.advanced}>${msg("Overscroll (x)")}</css-global-input>
        </sl-select>
        <sl-select class="advanced" size="small" name="overscroll-behavior-y" value=${this.getCurrentValue("overscroll-behavior-y") || "auto"}>
          <sl-option value="auto">${msg("Auto")}</sl-option>
          <sl-option value="contain">${msg("Contain")}</sl-option>
          <sl-option value="none">${msg("None")}</sl-option>
          <css-global-input value=${this.getGlobalValue("overscroll-behavior-y")} slot="label" ?disabled=${!this.advanced}>${msg("Overscroll (y)")}</css-global-input>
        </sl-select>
      </div>
      <sl-switch class="advanced" size="small" name="scrollbar-gutter" data-defaultValue="auto" data-otherValue="stable" ?checked=${this.getCurrentValue("scrollbar-gutter").replace(/\s+both-edges\s+/, "") === "stable"}> 
        <css-global-input value=${this.getGlobalValue("scrollbar-gutter")} ?disabled=${!this.advanced}>${msg("Scrollbar gutter")}</css-global-input>
        <sl-checkbox size="small" name="scrollbar-gutter-both-edges" data-defaultValue="stable" data-otherValue="stable both-edges" ?checked=${this.getCurrentValue("scrollbar-gutter") === "stable both-edges" || this.getCurrentValue("scrollbar-gutter") === "both-edges stable"}>${msg("Both edges")}</sl-checkbox>
      </sl-switch>
      <sl-radio-group class="advanced" size="small" name="scroll-snap-type-direction" value=${this.getCurrentValue("scroll-snap-type").split(/\s+/).find(k => ["none", "x", "y", "both"].includes(k)) || "none"}>
        <sl-radio-button class="text" value="none">${msg("None")}</sl-radio-button>
        <sl-radio-button class="text" value="x">${"x"}</sl-radio-button>
        <sl-radio-button class="text" value="y">${"y"}</sl-radio-button>
        <sl-radio-button class="text" value="both">${msg("Both")}</sl-radio-button>
        <css-global-input value=${this.getGlobalValue("scroll-snap-type")} slot="label" ?disabled=${!this.advanced}>${msg("Scroll snap")}</css-global-input>
      </sl-radio-group>
      <sl-checkbox class="advanced" size="small" name="scroll-snap-type-proximity" data-defaultValue="mandatory" data-otherValue="proximity" ?checked=${this.getCurrentValue("scroll-snap-type").split(/\s+/).find(k => ["mandatory", "proximity"].includes(k)) === "mandatory"}>
        <css-global-input value=${this.getGlobalValue("scroll-snap-type")} ?disabled=${!this.advanced}>${msg("Mandatory snap")}</css-global-input>
      </sl-checkbox>
      <sl-checkbox class="advanced" size="small" name="scroll-snap-stop" data-defaultValue="normal" data-otherValue="always" ?checked=${this.getCurrentValue("scroll-snap-stop") === "normal"}>
        <css-global-input value=${this.getGlobalValue("scroll-snap-stop")} ?disabled=${!this.advanced}>${msg("May scroll over stops")}</css-global-input>
      </sl-checkbox>
      <sl-select class="advanced" size="small" name="scroll-snap-align-inline" value=${this.getCurrentValue("scroll-snap-align").split(/\s+/).at(-1) || "none"}>
        <sl-option value="none">${msg("None")}</sl-option>
        <sl-option value="start">${msg("Start")}</sl-option>
        <sl-option value="center">${msg("Center")}</sl-option>
        <sl-option value="end">${msg("End")}</sl-option>
        <css-global-input value=${this.getGlobalValue("scroll-snap-align")} slot="label" ?disabled=${!this.advanced}>${msg("Scroll snap align (x)")}</css-global-input>
      </sl-select>
      <sl-select class="advanced" size="small" name="scroll-snap-align-block" value=${this.getCurrentValue("scroll-snap-align").split(/\s+/).at(0) || "none"}>
        <sl-option value="none">${msg("None")}</sl-option>
        <sl-option value="start">${msg("Start")}</sl-option>
        <sl-option value="center">${msg("Center")}</sl-option>
        <sl-option value="end">${msg("End")}</sl-option>
        <css-global-input value=${this.getGlobalValue("scroll-snap-align")} slot="label" ?disabled=${!this.advanced}>${msg("Scroll snap align (y)")}</css-global-input>
      </sl-select>
      <sl-switch size="small" name="scroll-behavior" data-defaultValue="auto" data-otherValue="smooth" ?checked=${this.getCurrentValue("scroll-behavior") === "smooth"}>
        <css-global-input value=${this.getGlobalValue("scroll-behavior")} ?disabled=${!this.advanced}>${msg("Smooth scroll")}</css-global-input>
      </sl-switch>

    </section>`
  } 

  render() {
    return [
      this.AnimationPane(),
      this.AppearancePane(),
      this.InteractionsPane(),
      this.ScrollingPane()
    ]
  }
}