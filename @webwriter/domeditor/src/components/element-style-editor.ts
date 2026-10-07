import {LitElement, css, html, nothing} from "lit"
import {ribbonIcon} from "../ribbon-icons"
import {ref} from "lit/directives/ref.js"
import type {ElementStyleDeclaration, ElementStyleMutation, ElementStyleState} from "../editor-bridge"
import {
  cssWideKeywords,
  elementStylePropertyNameSet,
  type ElementStylePropertyDefinition,
} from "../element-styles"

export type ElementStyleChangeDetail = {
  property: string
  mutation: ElementStyleMutation
}

const emptyStyleState = (): ElementStyleState => ({
  target: null,
  inline: {},
  computed: {},
  context: {display: "", parentDisplay: ""},
})

const filterPreview = html`<svg viewBox="0 0 32 24" aria-hidden="true"><rect width="32" height="24" rx="2" fill="#5b9bd5"/><circle cx="24" cy="6" r="3" fill="#ffc000"/><path d="M0 24 10 8 20 24M12 24 24 12 32 24" fill="#70ad47"/></svg>`

const simpleDimension = (value: string, units: readonly string[]) => {
  const match = value.trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i)
  if(!match || !units.includes(match[2])) return null
  return {number: match[1], unit: match[2]}
}

const colorHex = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if(/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if(/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split("").map(character => character.repeat(2)).join("")}`
  }
  const rgb = normalized.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/)
  if(!rgb) return "#000000"
  return `#${rgb.slice(1, 4).map(channel => Math.min(255, Number(channel)).toString(16).padStart(2, "0")).join("")}`
}

// Fixed theme columns: base color followed by five shades, like a desktop color palette.
const borderColorColumns = [
  ["ffffff", "f2f2f2", "d9d9d9", "bfbfbf", "a6a6a6", "808080"],
  ["000000", "808080", "595959", "404040", "262626", "0d0d0d"],
  ["e7e6e6", "d0cece", "aeaaaa", "757171", "3b3838", "171616"],
  ["44546a", "d6dce4", "adb9ca", "8497b0", "333f50", "222a35"],
  ["5b9bd5", "deebf7", "bdd7ee", "9dc3e6", "2e75b6", "1f4e78"],
  ["ed7d31", "fbe5d6", "f8cbad", "f4b183", "c55a11", "833c0c"],
  ["f04b22", "faddd5", "f7b7a5", "f38e72", "bd3210", "7e210b"],
  ["ffc000", "fff2cc", "ffe699", "ffd966", "bf9000", "806000"],
  ["8064a2", "e4dfec", "ccc1d9", "b2a1c7", "60497a", "403152"],
  ["70ad47", "e2efda", "c6e0b4", "a9d18e", "548235", "375623"],
] as const
const boxStylePresets = [
  {name: "White", background: borderColorColumns[0][0], border: borderColorColumns[1][0]},
  {name: "Gray", background: borderColorColumns[0][1], border: borderColorColumns[1][1]},
  {name: "Blue", background: borderColorColumns[4][1], border: borderColorColumns[4][0]},
  {name: "Green", background: borderColorColumns[9][1], border: borderColorColumns[9][0]},
  {name: "Orange", background: borderColorColumns[5][1], border: borderColorColumns[5][0]},
  {name: "Yellow", background: borderColorColumns[7][1], border: borderColorColumns[7][0]},
  {name: "Red", background: borderColorColumns[6][1], border: borderColorColumns[6][0]},
  {name: "Purple", background: borderColorColumns[8][1], border: borderColorColumns[8][0]},
] as const

const standardBorderColors = ["c00000", "ff0000", "ffc000", "ffff00", "92d050", "00b050", "00b0f0", "0070c0", "002060", "7030a0"]

const sectionGroups = (definitions: readonly ElementStylePropertyDefinition[]) => {
  const groups = new Map<string, ElementStylePropertyDefinition[]>()
  definitions.forEach(definition => groups.set(
    definition.section,
    [...(groups.get(definition.section) ?? []), definition],
  ))
  return Array.from(groups)
}

/** A serializable inline-style projection rendered as native, CSS-aware inputs. */
export class ElementStyleEditor extends LitElement {
  static properties = {
    definitions: {attribute: false},
    /** Optional narrow view over the supplied definitions for composed editors. */
    propertyNames: {attribute: false},
    state: {attribute: false},
    mode: {type: String, reflect: true},
    orientation: {type: String, reflect: true},
    allowCustom: {type: Boolean, attribute: "allow-custom"},
    showPresets: {type: Boolean, attribute: "show-presets"},
    compactMenu: {state: true},
    galleryPage: {state: true},
    customEffect: {state: true},
    customProperty: {type: String, state: true},
    customValue: {type: String, state: true},
    customImportant: {type: Boolean, state: true},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      min-width: 0;
      color: #2f3742;
      font: 0.68rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    :host([mode="basic"]) {
      height: 100%;
    }

    :host([mode="advanced"]) {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    :host([orientation="vertical"]) {
      font-size: 0.7rem;
    }

    :host([orientation="vertical"][mode="basic"]),
    :host([orientation="vertical"][mode="advanced"]) {
      height: auto;
    }

    :host([orientation="vertical"][mode="advanced"]) {
      display: block;
    }

    button,
    input,
    select {
      box-sizing: border-box;
      color: inherit;
      font: inherit;
    }

    .gallery-pages { display: grid; grid-template-columns: 0.75rem minmax(0, 1fr) 0.75rem; gap: 0.25rem; align-items: center; }
    .gallery-page { padding: 0; border: 0; background: transparent; cursor: pointer; }
    .gallery-page:first-child svg { transform: rotate(180deg); }
    .gallery-page:disabled { opacity: 0.3; cursor: default; }
    .gallery-page svg { width: 0.75rem; height: 0.75rem; }
    .effect-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; }
    .effect-control.compact-row { display: flex; flex-direction: column; align-items: stretch; gap: 0.3rem; }
    .effect-control.compact-row label { flex: none; }
    .effect-control .compact-input { height: 1.7rem; }
    .effect-control [hidden] { display: none !important; }
    .effect-control .effect-presets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .effect-trigger { display: grid; place-items: center; width: 100%; min-width: 0; padding: 0.2rem 1.3rem 0.2rem 0.55rem; border: 0; background: transparent; cursor: pointer; overflow: hidden; }
    .effect-trigger .shadow-preview { width: 1rem; }
    .effect-trigger .filter-preview svg { width: 1.4rem; margin-inline: auto; }
    .effect-trigger .filter-preview { width: 2rem; }
    .effect-control .compact-toggle { right: 0; }
    .effect-control .compact-input input { padding-right: 1.3rem; }
    .effect-popup { padding: 0.35rem; }
    .effect-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.35rem; padding: 0.3rem 0; min-width: 0; }
    .effect-popup .effect-presets button { display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; justify-content: normal; min-width: 0; gap: 0; padding: 0.35rem; height: 2.7rem; overflow: hidden; border: 1px solid #c5ccd5; border-radius: 4px; background: transparent; cursor: pointer; }
    .effect-presets button[aria-pressed="true"] { border-color: #8eb6df; box-shadow: 0 0 0 1px #b9d7f5; }
    .shadow-preview { width: min(1.4rem, 100%); box-sizing: border-box; aspect-ratio: 1; background: #fff; border: 1px solid #c5ccd5; }
    .filter-preview { display: block; width: 100%; min-width: 0; }
    .filter-preview svg { display: block; width: 2rem; max-width: 100%; height: auto; }
    .effect-popup .effect-custom { border-top: 1px solid #d8dee6; margin-top: 0.3rem; }
    .effect-control button:focus-visible, .gallery-page:focus-visible { outline: 2px solid #b9d7f5; outline-offset: 2px; }
    .style-gallery {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: repeat(2, 2rem); gap: 0.5rem; margin: 0.2rem 0 0.65rem;
    }
    .style-gallery button {
      min-width: 0; padding: 0; border: 1px solid; border-radius: 4px; cursor: pointer;
    }
    :host([mode="compact"]) .style-gallery button:focus-visible {
      outline: 2px solid #b9d7f5; outline-offset: 2px;
    }
    .style-gallery button:hover { box-shadow: 0 0 0 2px #b9d7f5; }
    .compact-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-width: 0;
      margin: 0.4rem 0;
    }
    .compact-row label, .compact-label { flex: 0 0 4.4rem; }
    .compact-controls {
      position: relative; display: flex; flex: 1; min-width: 0; border-radius: 4px;
      --compact-focus-color: #b9d7f5;
    }
    .compact-controls:focus-within { box-shadow: 0 0 0 2px var(--compact-focus-color); }
    .compact-controls:has(.compact-value.open) { box-shadow: none; }
    .compact-controls:has(.compact-value.open)::before {
      content: ""; position: absolute; inset: -2px -2px 0;
      border: 2px solid var(--compact-focus-color); border-bottom: 0;
      border-radius: 6px 6px 0 0; pointer-events: none;
    }
    .compact-value.open .compact-options::after {
      content: ""; position: absolute; inset: 0 -3px -3px;
      border: 2px solid var(--compact-focus-color); border-top: 0;
      border-radius: 0 0 6px 6px; pointer-events: none;
    }
    .compact-controls:has(.compact-value.open) .border-group { border-bottom-left-radius: 0; }
    .border-picker[open] .border-options { box-shadow: 0 0 0 2px var(--compact-focus-color); }
    :host([mode="compact"]) .compact-controls input {
      height: 100%; border-radius: 0; outline: none; box-shadow: none;
    }
    :host([mode="compact"]) input[type="color"] { border-left-color: #c5ccd5; }
    :host([mode="compact"]) button:focus,
    :host([mode="compact"]) summary:focus { outline: none; }
    .compact-options button:focus-visible,
    .border-options button:focus-visible {
      box-shadow: inset 0 0 0 2px var(--compact-focus-color); background: #e8eef5;
    }
    .compact-value { position: relative; min-width: 0; flex: 1; }
    .compact-input {
      position: relative; display: flex; align-items: stretch; height: 1.7rem; box-sizing: border-box;
      border: 1px solid #c5ccd5; border-radius: 4px; background: transparent;
    }
    .compact-value.open .compact-input { border-radius: 4px 4px 0 0; }
    .compact-input input {
      width: 0; min-width: 0; flex: 1; border: 0; background: transparent;
      padding: 0.2rem 0.35rem;
    }
    .compact-input input::placeholder { font-size: 0.5rem; }
    .compact-unit { display: flex; align-items: center; justify-content: center; width: 1.1rem; box-sizing: border-box; font-size: 0.55rem; flex: 0 0 auto; border-left: 1px solid #c5ccd5; }
    [data-property="rotate"] .compact-unit { font-size: 0.85rem; }
    .compact-toggle {
      position: absolute; inset-block: 0; right: 1.1rem; width: 1.7rem;
      display: flex; align-items: center; justify-content: flex-end;
      border: 0; background: transparent;
      padding: 0 0.2rem; cursor: pointer;
    }
    .compact-toggle svg { width: 14px; height: 14px; display: block; transform: rotate(90deg); transition: transform 120ms ease; }
    .open .compact-toggle svg { transform: rotate(270deg); }
    .compact-options {
      position: absolute; z-index: 3; top: 100%; left: 0; width: 100%; box-sizing: border-box;
      border: 1px solid #c5ccd5; border-top: 0; border-radius: 0 0 4px 4px; background: white;
      box-shadow: 0 3px 6px #0002;
    }
    .compact-options button { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; width: 100%; text-align: left; padding: 0.35rem; border: 0; background: transparent; cursor: pointer; }
    .compact-option-value { color: #6b7787; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .compact-options button:hover, .compact-options button:focus { background: #e8eef5; }
    .border-group { display: flex; flex: 0 0 auto; align-items: stretch; height: 1.7rem; border: 1px solid #c5ccd5; border-right: 0; border-radius: 4px 0 0 4px; background: transparent; box-sizing: border-box; }
    .border-group input[type="color"] { width: 1.25rem; height: 100%; border: 0; border-left: 1px solid #c5ccd5; padding: 2px; background: transparent; }
    .border-group + .compact-value { position: static; }
    .border-group + .compact-value .compact-input { border-radius: 0 4px 4px 0; }
    .border-group + .compact-value.open .compact-input { border-radius: 0 4px 0 0; }
    .border-picker { position: relative; }
    .border-picker summary .border-sample { width: 0.85rem; }
    .border-picker summary { list-style: none; cursor: pointer; width: 1.3rem; height: 100%; display: grid; place-items: center; }
    .border-picker summary::-webkit-details-marker { display: none; }
    .border-sample { display: block; width: 1.2rem; border-top-width: 3px; margin: 0.45rem 0; }
    .border-options {
      position: absolute; z-index: 3; background: white; padding: 0.3rem;
      border: 1px solid #c5ccd5; border-radius: 4px; display: grid; grid-template-columns: repeat(2, 2rem);
    }
    .border-options button { background: white; border: 0; cursor: pointer; }
    .background-control { border: 1px solid #c5ccd5; height: 1.7rem; box-sizing: border-box; }
    .background-control .border-color-picker { width: 100%; border-left: 0; }
    .background-control .border-color-picker > summary { width: 100%; }
    .border-color-picker { position: static; border-left: 1px solid #c5ccd5; }
    .border-color-picker > summary {
      display: grid; place-items: center; box-sizing: border-box;
      width: 1.25rem; height: 100%; padding: 3px; list-style: none; cursor: pointer;
    }
    .border-color-picker > summary::-webkit-details-marker { display: none; }
    .border-color-chip { width: 100%; height: 100%; box-shadow: inset 0 0 0 1px #0002; }
    .text-color-preview { font-size: 0.65rem; font-weight: 700; line-height: 1; padding-bottom: 2px; border-bottom: 4px solid; }
    .border-color-palette {
      position: absolute; z-index: 4; top: 100%; right: 0;
      width: max(100%, 12rem); max-width: calc(100vw - 2rem);
      box-sizing: border-box; padding: 0.4rem; border: 1px solid #c5ccd5; border-radius: 4px;
      background: white; box-shadow: 0 0 0 2px var(--compact-focus-color), 0 3px 6px #0002;
    }
    .color-grid { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 3px; }
    .color-column { display: grid; gap: 0; }
    .color-column .color-swatch:first-child { margin-bottom: 0.4rem; }
    .border-color-palette .color-swatch {
      width: 100%; height: auto; aspect-ratio: 1; min-width: 0; border: 0; border-radius: 0;
      padding: 0; cursor: pointer; box-shadow: inset 0 0 0 1px #0001;
    }
    .border-color-palette .color-swatch:hover,
    :host([mode="compact"]) .border-color-palette .color-swatch:focus-visible,
    .border-color-palette .color-swatch[aria-pressed="true"] { outline: 2px solid #8eb6df; outline-offset: -2px; }
    .color-standard { border-top: 1px solid #d8dee6; margin-top: 0.4rem; padding-top: 0.4rem; }
    .palette-action {
      display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.35rem;
      background: transparent; border: 0; text-align: left; cursor: pointer;
    }
    .palette-action:hover, .palette-action:focus-visible { background: #e8eef5; }
    .palette-action:focus-visible { box-shadow: inset 0 0 0 2px var(--compact-focus-color); }
    .palette-action svg { width: 1rem; height: 1rem; }
    .palette-action .border-color-chip { width: 1rem; height: 1rem; background: currentColor; }
    .palette-automatic { border-bottom: 1px solid #d8dee6; margin-bottom: 0.4rem; }
    .palette-custom { position: relative; border-top: 1px solid #d8dee6; margin-top: 0.4rem; }
    .palette-custom input[type="color"] {
      position: absolute; inset: 0; width: 100%; height: 100%;
      opacity: 0; pointer-events: none;
    }


    .basic-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: repeat(2, minmax(0, 1fr));
      height: 100%;
      gap: 0.25rem 0.3rem;
      padding: 0.1rem 0;
    }

    :host([orientation="vertical"]) .basic-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(3, minmax(2.6rem, auto));
      height: auto;
      gap: 0.45rem 0.65rem;
      padding: 0.15rem 0 0.25rem;
    }

    .advanced {
      box-sizing: border-box;
      height: 100%;
      padding: 0 0.65rem 0.45rem 0.15rem;
      overflow-x: hidden;
      overflow-y: scroll;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    :host([orientation="vertical"]) .advanced {
      height: auto;
      padding: 0 0 0.2rem;
      overflow: visible;
    }

    .advanced-divider {
      position: relative;
      flex: 0 0 auto;
      margin: 1rem 0.65rem 0.15rem 0.15rem;
      color: inherit;
      font-size: 0.64rem;
      font-weight: 650;
      text-align: center;
    }

    :host([orientation="vertical"]) .advanced-divider {
      display: none;
    }

    .advanced-divider::before {
      position: absolute;
      top: 50%;
      right: 0;
      left: 0;
      height: 2px;
      background: #9cabbc;
      content: "";
      transform: translateY(-50%);
    }

    .advanced-divider span {
      position: relative;
      padding: 0 0.45rem;
      background: #f2f2f2;
    }

    .editor-fields {
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
    }

    :host([mode="advanced"]) .editor-fields {
      flex: 1 1 auto;
      height: auto;
      min-height: 0;
    }

    .style-section {
      padding: 0.45rem 0;
    }

    .style-section + .style-section {
      border-top: 1px solid #d8dee6;
    }

    .section-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.25rem 0.4rem;
      padding: 0 0.35rem;
    }

    :host([orientation="vertical"]) .section-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.45rem 0.65rem;
      padding: 0;
    }

    .property {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto minmax(1.35rem, auto);
      min-width: 0;
      gap: 0.02rem 0.18rem;
    }

    :host([mode="basic"]) .property {
      grid-template-rows: 0.88rem minmax(1.25rem, auto);
    }

    :host([orientation="vertical"]) .property {
      grid-template-rows: 1rem minmax(1.65rem, auto);
      gap: 0.08rem 0.2rem;
    }

    :host([mode="basic"]) .property-action {
      display: none;
    }

    .property-label {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      min-width: 0;
      height: 0.88rem;
      padding: 0 0.12rem;
      border: 0;
      border-radius: 0.2rem;
      background: transparent;
      cursor: pointer;
      text-align: left;
    }

    .property-label:hover,
    .property-label:focus-visible {
      color: #1e4f87;
      background: #e8eef5;
      outline: none;
    }

    .label-text {
      min-width: 0;
      overflow: hidden;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .property-label[data-keyword="inherit"] .label-text {
      text-decoration: 2px overline var(--sl-color-amber-600, #d97706);
    }

    .property-label[data-keyword="initial"] .label-text {
      text-decoration: 2px line-through var(--sl-color-amber-600, #d97706);
    }

    .property-label[data-keyword="unset"] .label-text {
      text-decoration: 2px overline line-through var(--sl-color-amber-600, #d97706);
    }

    .property-label[data-keyword="revert"] .label-text {
      text-decoration: 2px underline double var(--sl-color-amber-600, #d97706);
    }

    input,
    select,
    .compound {
      grid-column: 1;
      width: 100%;
      min-width: 0;
      height: 1.45rem;
    }

    :host([orientation="vertical"]) input,
    :host([orientation="vertical"]) select,
    :host([orientation="vertical"]) .compound,
    :host([orientation="vertical"]) .color-trigger,
    :host([orientation="vertical"]) .toggle-control,
    :host([orientation="vertical"]) .property-action {
      height: 1.65rem;
    }

    input,
    select {
      padding: 0.16rem 0.3rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      background: transparent;
      outline: none;
    }

    input:hover,
    select:hover,
    .color-trigger:hover {
      border-color: #9cabbc;
    }

    input:focus,
    select:focus,
    .color-trigger:focus-visible {
      border-color: #3977c7;
      box-shadow: 0 0 0 1px #3977c7;
    }

    input::placeholder {
      color: #8794a3;
      opacity: 1;
    }

    input[type="number"] {
      appearance: textfield;
    }

    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
      margin: 0;
      appearance: none;
    }

    select[data-computed],
    .toggle-control[data-computed] {
      color: #8794a3;
    }

    select option {
      color: #2f3742;
    }

    select option[value=""] {
      color: #8794a3;
    }

    .compound {
      display: flex;
      flex-flow: row nowrap;
      width: 100%;
    }

    .compound select,
    .color-popover input {
      field-sizing: content;
      width: auto;
      white-space: nowrap;
    }

    .compound input {
      flex: 1 1 0;
      width: 100%;
      min-width: 0;
      border-radius: 0.28rem 0 0 0.28rem;
    }

    .compound select {
      appearance: none;
      flex: 0 0 auto;
      min-width: 1.8rem;
      padding-inline: 0.15rem;
      border-left: 0;
      border-radius: 0 0.28rem 0.28rem 0;
      text-align: center;
    }

    .color-control {
      grid-column: 1;
      width: 1.55rem;
    }

    .color-trigger {
      display: block;
      width: 1.55rem;
      height: 1.45rem;
      padding: 0.12rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      background: transparent;
      cursor: pointer;
      outline: none;
    }

    .color-swatch {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 0.12rem;
      background: var(--style-color);
    }

    .color-popover {
      position: fixed;
      position-try-fallbacks: flip-block, flip-inline;
      inset: auto;
      top: anchor(bottom);
      left: anchor(left);
      box-sizing: border-box;
      width: min(14rem, calc(100vw - 1rem));
      margin: 0.2rem 0 0;
      padding: 0.35rem;
      border: 1px solid #a8a8a8;
      border-radius: 0.35rem;
      color: #2f3742;
      background: #fff;
      box-shadow: 0 0.4rem 1rem rgb(0 0 0 / 16%);
    }

    .color-popover-row {
      display: flex;
      flex-flow: row nowrap;
      width: 100%;
      min-width: 0;
    }

    .color-popover input[type="color"] {
      flex: 0 0 1.55rem;
      width: 1.55rem;
      padding: 0.12rem;
      border-radius: 0.28rem 0 0 0.28rem;
    }

    .color-popover input[type="text"] {
      flex: 1 1 auto;
      min-width: 0;
      border-left: 0;
      border-radius: 0 0.28rem 0.28rem 0;
    }

    .range-control {
      display: flex;
      grid-column: 1;
      align-items: center;
      width: 100%;
      min-width: 0;
    }

    .range-control input[type="range"] {
      width: 100%;
      min-width: 0;
      height: 1.2rem;
      padding: 0;
      border: 0;
      box-shadow: none;
      background: transparent;
    }

    .range-control input[type="range"][data-computed],
    .toggle-control[data-computed] input {
      accent-color: #8794a3;
    }

    .toggle-control {
      display: flex;
      grid-column: 1;
      align-items: center;
      gap: 0.35rem;
      width: 100%;
      height: 1.45rem;
      padding: 0 0.32rem;
      border: 0;
      background: transparent;
    }

    .toggle-control input {
      width: auto;
      height: auto;
      margin: 0;
      padding: 0;
      box-shadow: none;
    }

    .property-action {
      display: grid;
      place-items: center;
      width: 1.45rem;
      height: 1.45rem;
      padding: 0;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      color: #526b86;
      background: #f9fafb;
      cursor: pointer;
    }

    .property-action:hover {
      border-color: #8ca7c5;
      color: #1e4f87;
      background: #e8eef5;
    }

    .property-action:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: -1px;
    }

    .custom-form {
      display: grid;
      grid-template-columns: minmax(4.5rem, 0.9fr) minmax(5rem, 1.4fr) auto auto;
      gap: 0.25rem;
      align-items: end;
      padding: 0 0.35rem 0.4rem;
    }

    :host([orientation="vertical"]) .custom-form {
      grid-template-columns: minmax(0, 1fr) auto;
      padding: 0 0 0.5rem;
    }

    :host([orientation="vertical"]) .custom-form label {
      grid-column: 1 / -1;
    }

    :host([orientation="vertical"]) .custom-form .important {
      grid-column: 1;
      justify-self: start;
    }

    .custom-form label {
      display: grid;
      min-width: 0;
      gap: 0.02rem;
      color: #526b86;
      font-size: 0.6rem;
      font-weight: 600;
    }

    .custom-form button {
      height: 1.45rem;
      padding: 0 0.45rem;
      border: 1px solid #8ca7c5;
      border-radius: 0.28rem;
      color: #1e4f87;
      background: #e8eef5;
      cursor: pointer;
    }

    .custom-form .important {
      width: 1.45rem;
      padding: 0;
    }

    .custom-declarations {
      display: grid;
      gap: 0.25rem;
      padding: 0 0.35rem 0.4rem;
    }

    :host([orientation="vertical"]) .custom-declarations {
      padding: 0 0 0.5rem;
    }

    .custom-declaration {
      display: grid;
      grid-template-columns: minmax(4.5rem, 0.9fr) minmax(5rem, 1.4fr) auto;
      align-items: center;
      gap: 0.25rem;
    }

    :host([orientation="vertical"]) .custom-declaration {
      grid-template-columns: minmax(3.5rem, 0.75fr) minmax(0, 1.25fr) auto;
    }

    .custom-declaration code {
      min-width: 0;
      overflow: hidden;
      color: #526b86;
      font-size: 0.62rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (prefers-reduced-motion: reduce) {
      * {
        scroll-behavior: auto !important;
      }
    }
  `

  definitions: readonly ElementStylePropertyDefinition[] = []
  propertyNames: readonly string[] | null = null
  state: ElementStyleState = emptyStyleState()
  mode: "basic" | "advanced" | "compact" = "basic"
  orientation: "horizontal" | "vertical" = "horizontal"
  allowCustom = false
  showPresets = false
  private galleryPage = 0
  private customEffect: string | null = null
  private compactMenu: string | null = null
  readonly dismissMenus = (event?: Event) => {
    const path = event?.composedPath() ?? []
    const focused = event?.type === "pointerdown" && this.mode === "compact" ? this.shadowRoot?.activeElement : null
    // Toolbox buttons prevent pointer focus by design. Explicitly blur an
    // input on outside clicks so its native change/blur lifecycle still runs.
    if(focused instanceof HTMLInputElement
      && !path.includes(focused)
      && !path.some(target => target instanceof HTMLElement && target.classList.contains("compact-options"))
      && !path.some(target => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable)) {
      focused.blur()
    }
    const active = this.compactMenu
      ? this.renderRoot.querySelector(`#compact-${this.compactMenu}`)?.closest(".compact-value")
      : null
    if(!active || !path.includes(active)) this.compactMenu = null
    this.renderRoot.querySelectorAll<HTMLDetailsElement>(".border-picker[open], .border-color-picker[open]").forEach(picker => {
      if(!path.includes(picker)) picker.open = false
    })
  }

  private syncCompactPopupState = () => {
    this.toggleAttribute("popup-open", Boolean(this.compactMenu
      || this.renderRoot.querySelector(".border-picker[open], .border-color-picker[open]")))
  }

  protected updated() {
    this.syncCompactPopupState()
  }

  connectedCallback() {
    super.connectedCallback()
    this.ownerDocument.addEventListener("pointerdown", this.dismissMenus, true)
    this.ownerDocument.addEventListener("focusin", this.dismissMenus, true)
  }

  disconnectedCallback() {
    this.ownerDocument.removeEventListener("pointerdown", this.dismissMenus, true)
    this.ownerDocument.removeEventListener("focusin", this.dismissMenus, true)
    this.compactMenu = null
    super.disconnectedCallback()
  }

  private customProperty = ""
  private customValue = ""
  private customImportant = false

  private declaration(name: string) {
    return this.state.inline[name]
  }

  private get visibleDefinitions() {
    const names = this.propertyNames ? new Set(this.propertyNames) : null
    return this.definitions.filter(({name}) => (!names || names.has(name))
      && (!this.documentRootTarget || name === "background" || name.startsWith("background-")))
  }

  private editableValue(name: string) {
    const value = this.declaration(name)?.value ?? ""
    return cssWideKeywords.includes(value as typeof cssWideKeywords[number]) ? "" : value
  }

  private dispatchChange(property: string, mutation: ElementStyleMutation) {
    if(this.documentRootTarget && property !== "background" && !property.startsWith("background-")) return
    this.dispatchEvent(new CustomEvent<ElementStyleChangeDetail>("element-style-change", {
      detail: {property, mutation},
      bubbles: true,
      composed: true,
    }))
  }

  private dispatchTargetHover(hovered: boolean) {
    this.dispatchEvent(new CustomEvent("element-style-target-hover", {
      detail: {hovered},
      bubbles: true,
      composed: true,
    }))
  }

  private commitValue(name: string, value: string, declaration = this.declaration(name)) {
    this.dispatchChange(name, value === "" ? null : {
      value,
      priority: declaration?.priority ?? "",
    })
  }

  private cycleKeyword(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    const index = cssWideKeywords.indexOf(declaration?.value as typeof cssWideKeywords[number])
    const keyword = index < 0 ? cssWideKeywords[0] : cssWideKeywords[index + 1]
    if(keyword) this.commitValue(definition.name, keyword, declaration)
    else this.dispatchChange(definition.name, null)
  }

  private renderLabel(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    const keyword = cssWideKeywords.includes(declaration?.value as typeof cssWideKeywords[number])
      ? declaration!.value
      : null
    return html`
      <button
        id=${`style-label-${definition.name}`}
        class="property-label"
        type="button"
        data-keyword=${keyword ?? nothing}
        title=${`Cycle global value for ${definition.label}`}
        aria-label=${`Cycle global value for ${definition.label}. Current value: ${keyword ?? "no global value"}`}
        @click=${() => this.cycleKeyword(definition)}
      >
        <span class="label-text">${definition.label}</span>
      </button>
    `
  }

  private renderSelect(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const current = this.editableValue(definition.name)
    const options = definition.values ?? []
    const hasUnlistedValue = Boolean(current && !options.includes(current))
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    return html`
      <select
        aria-labelledby=${`style-label-${definition.name}`}
        data-computed=${!current && computed ? "" : nothing}
        .value=${current}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLSelectElement).value,
          declaration,
        )}
      >
        <option value="">${computed || "Not set"}</option>
        ${hasUnlistedValue ? html`<option value=${current}>${current}</option>` : nothing}
        ${options.map(option => html`<option value=${option}>${option}</option>`)}
      </select>
    `
  }

  private renderLength(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const units = definition.units ?? []
    const authored = this.editableValue(definition.name)
    const parsed = simpleDimension(authored, units)
    const computedValue = this.state.computed[definition.name]?.trim() ?? ""
    const computed = simpleDimension(computedValue, units)
    if(authored && !parsed) {
      return html`<input
        type="text"
        aria-labelledby=${`style-label-${definition.name}`}
        .value=${authored}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLInputElement).value.trim(),
          declaration,
        )}
      />`
    }
    if(!authored && computedValue && !computed) {
      return html`<input
        type="text"
        aria-labelledby=${`style-label-${definition.name}`}
        placeholder=${computedValue}
        @change=${(event: Event) => this.commitValue(
          definition.name,
          (event.currentTarget as HTMLInputElement).value.trim(),
          declaration,
        )}
      />`
    }
    const unit = parsed?.unit ?? computed?.unit ?? units[0] ?? ""
    return html`
      <span class="compound">
        <input
          type="number"
          aria-labelledby=${`style-label-${definition.name}`}
          .value=${parsed?.number ?? ""}
          placeholder=${computed?.number ?? ""}
          step="any"
          @change=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement
            const selectedUnit = input.nextElementSibling as HTMLSelectElement | null
            this.commitValue(definition.name, input.value ? `${input.value}${selectedUnit?.value ?? unit}` : "", declaration)
          }}
        />
        <select
          ${ref(element => {
            if(!(element instanceof HTMLSelectElement)) return
            queueMicrotask(() => {
              if(element.isConnected) element.value = unit
            })
          })}
          aria-label=${`${definition.label} unit`}
          data-computed=${!parsed && computed ? "" : nothing}
          .value=${unit}
          @change=${(event: Event) => {
            const select = event.currentTarget as HTMLSelectElement
            const input = select.previousElementSibling as HTMLInputElement | null
            const numeric = input?.value || input?.placeholder || ""
            if(numeric) this.commitValue(definition.name, `${numeric}${select.value}`, declaration)
          }}
        >${units.map(option => html`<option value=${option} ?selected=${option === unit}>${option}</option>`)}</select>
      </span>
    `
  }

  private renderColor(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const current = this.editableValue(definition.name)
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    const popupId = `style-color-${definition.name}`
    const anchorName = `--${popupId}`
    return html`
      <span class="color-control">
        <button
          class="color-trigger"
          type="button"
          aria-label=${`Edit ${definition.label}`}
          aria-haspopup="dialog"
          popovertarget=${popupId}
          style=${`anchor-name: ${anchorName}; --style-color: ${colorHex(current || computed)}`}
        ><span class="color-swatch" aria-hidden="true"></span></button>
        <div
          id=${popupId}
          class="color-popover"
          popover="auto"
          role="dialog"
          aria-labelledby=${`style-label-${definition.name}`}
          style=${`position-anchor: ${anchorName}`}
        >
          <span class="color-popover-row">
            <input
              type="color"
              aria-label=${`${definition.label} picker`}
              .value=${colorHex(current || computed)}
              @change=${(event: Event) => this.commitValue(
                definition.name,
                (event.currentTarget as HTMLInputElement).value,
                declaration,
              )}
            />
            <input
              type="text"
              aria-label=${`${definition.label} CSS value`}
              .value=${current}
              placeholder=${computed}
              @change=${(event: Event) => this.commitValue(
                definition.name,
                (event.currentTarget as HTMLInputElement).value.trim(),
                declaration,
              )}
            />
          </span>
        </div>
      </span>
    `
  }

  private renderRange(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const current = this.editableValue(definition.name)
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    const effective = current || computed || String(definition.min ?? 0)
    const commit = (event: Event) => this.commitValue(
      definition.name,
      (event.currentTarget as HTMLInputElement).value,
      declaration,
    )
    return html`
      <span class="range-control">
        <input
          type="range"
          aria-labelledby=${`style-label-${definition.name}`}
          min=${definition.min ?? 0}
          max=${definition.max ?? 100}
          step=${definition.step ?? 1}
          data-computed=${!current && computed ? "" : nothing}
          .value=${effective}
          @change=${commit}
        />
      </span>
    `
  }

  private renderToggle(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    const [off = "none", on = "auto"] = definition.values ?? []
    const computed = this.state.computed[definition.name]?.trim()
    const current = this.editableValue(definition.name)
    const checked = (current || computed) === on
    return html`
      <label class="toggle-control" data-computed=${!current && computed ? "" : nothing}>
        <input
          type="checkbox"
          aria-labelledby=${`style-label-${definition.name}`}
          .checked=${checked}
          @change=${(event: Event) => this.commitValue(
            definition.name,
            (event.currentTarget as HTMLInputElement).checked ? on : off,
            declaration,
          )}
        />
        <span>${checked ? on : off}</span>
      </label>
    `
  }

  private renderInput(definition: ElementStylePropertyDefinition, declaration?: ElementStyleDeclaration) {
    if(definition.control === "select") return this.renderSelect(definition, declaration)
    if(definition.control === "length") return this.renderLength(definition, declaration)
    if(definition.control === "color") return this.renderColor(definition, declaration)
    if(definition.control === "range") return this.renderRange(definition, declaration)
    if(definition.control === "toggle") return this.renderToggle(definition, declaration)
    const current = this.editableValue(definition.name)
    return html`<input
      type=${definition.control === "number" ? "number" : "text"}
      aria-labelledby=${`style-label-${definition.name}`}
      .value=${current}
      placeholder=${this.state.computed[definition.name]?.trim() ?? ""}
      min=${definition.min ?? nothing}
      max=${definition.max ?? nothing}
      step=${definition.step ?? (definition.control === "number" ? "any" : nothing)}
      @change=${(event: Event) => this.commitValue(
        definition.name,
        (event.currentTarget as HTMLInputElement).value.trim(),
        declaration,
      )}
    />`
  }

  private renderProperty(definition: ElementStylePropertyDefinition) {
    const declaration = this.declaration(definition.name)
    return html`
      <div class="property" data-property=${definition.name}>
        ${this.renderLabel(definition)}
        ${this.renderInput(definition, declaration)}
        ${declaration ? html`
          <button
            class="property-action"
            type="button"
            title=${`Clear ${definition.label}`}
            aria-label=${`Clear ${definition.label}`}
            @click=${() => this.dispatchChange(definition.name, null)}
          >×</button>
        ` : nothing}
      </div>
    `
  }

  private submitCustom(event: SubmitEvent) {
    event.preventDefault()
    const property = this.customProperty.trim()
    const value = this.customValue.trim()
    if(!property || property.includes(";") || !value) return
    this.dispatchChange(property, {value, priority: this.customImportant ? "important" : ""})
    this.customProperty = ""
    this.customValue = ""
    this.customImportant = false
  }

  private renderCustomProperties() {
    const declarations = Object.entries(this.state.inline)
      .filter(([name]) => !elementStylePropertyNameSet.has(name))
    return html`
      <div class="style-section custom-properties">
        <form class="custom-form" @submit=${this.submitCustom}>
          <label>Property
            <input
              name="property"
              autocomplete="off"
              placeholder="--name or property"
              .value=${this.customProperty}
              @input=${(event: Event) => this.customProperty = (event.currentTarget as HTMLInputElement).value}
            />
          </label>
          <label>Value
            <input
              name="value"
              autocomplete="off"
              placeholder="CSS value"
              .value=${this.customValue}
              @input=${(event: Event) => this.customValue = (event.currentTarget as HTMLInputElement).value}
            />
          </label>
          <button
            class="important"
            type="button"
            title="Toggle !important"
            aria-label="Toggle !important"
            aria-pressed=${this.customImportant}
            @click=${() => this.customImportant = !this.customImportant}
          >!</button>
          <button type="submit">Add</button>
        </form>
        ${declarations.length ? html`
          <div class="custom-declarations">
            ${declarations.map(([name, declaration]) => html`
              <div class="custom-declaration">
                <code title=${name}>${name}</code>
                <input
                  aria-label=${`${name} value`}
                  .value=${declaration.value}
                  @change=${(event: Event) => this.commitValue(
                    name,
                    (event.currentTarget as HTMLInputElement).value.trim(),
                    declaration,
                  )}
                />
                <button
                  class="property-action"
                  type="button"
                  aria-label=${`Clear ${name}`}
                  @click=${() => this.dispatchChange(name, null)}
                >×</button>
              </div>
            `)}
          </div>
        ` : nothing}
      </div>
    `
  }

  private commitCompactValue(name: string, value: string) {
    this.commitValue(name, value)
  }

  private renderCompactValue(name: string, label: string, presets: readonly number[], unit = "px") {
    const current = this.declaration(name)?.value ?? ""
    const value = current === "none" && name === "scale" ? "1"
      : current === "none" && name === "rotate" ? "0deg" : current
    const displayed = name === "scale" && value.trim() && Number.isFinite(Number(value))
      ? String(Number((Number(value) * 100).toPrecision(15)))
      : unit && value.endsWith(unit) ? value.slice(0, -unit.length) : value
    const open = this.compactMenu === name
    return html`<div class=${`compact-value${open ? " open" : ""}`}
      @keydown=${(event: KeyboardEvent) => {
        if(event.key === "Escape") {
          this.compactMenu = null
          if(event.target instanceof HTMLInputElement) this.dispatchEvent(new CustomEvent("ribbon-input-cancel", {
            detail: {input: event.target}, bubbles: true, composed: true,
          }))
          event.stopPropagation()
        }
        if(event.key === "Enter" && event.target instanceof HTMLInputElement && !event.isComposing) {
          event.preventDefault()
          event.target.blur()
          this.compactMenu = null
        }
        if(event.key === "ArrowDown" && presets.length) {
          event.preventDefault()
          this.compactMenu = name
          void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLButtonElement>(`#presets-${name} button`)?.focus())
        }
      }}>
      <div class="compact-input">
        <input id=${`compact-${name}`} aria-label=${label} inputmode="decimal"
          role=${presets.length ? "combobox" : nothing} aria-autocomplete=${presets.length ? "none" : nothing}
          aria-expanded=${presets.length ? String(open) : nothing} aria-controls=${presets.length ? `presets-${name}` : nothing}
          .value=${displayed} placeholder="Default"
          @focus=${() => { if(presets.length) this.compactMenu = name }}
          @blur=${(event: FocusEvent) => {
            const options = this.renderRoot.querySelector(`#presets-${name}`)
            if(event.relatedTarget instanceof Node && options?.contains(event.relatedTarget)) return
            if(this.compactMenu === name) this.compactMenu = null
          }}
          @change=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement
            const raw = input.value.trim()
            const next = raw ? name === "scale" ? String(Number(raw) / 100) : `${raw}${unit}` : ""
            if(raw && (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) || !CSS.supports(name, next))) {
              input.value = displayed
              return
            }
            this.commitCompactValue(name, next)
          }}>
        ${presets.length ? html`<button type="button" class="compact-toggle" aria-label=${`${label} presets`}
          aria-expanded=${open} aria-controls=${`presets-${name}`}
          @click=${() => this.compactMenu = open ? null : name}>${ribbonIcon("ChevronRight")}</button>` : nothing}
        ${unit ? html`<span class="compact-unit" aria-hidden="true">${unit === "deg" ? "°" : unit}</span>` : nothing}
      </div>
      ${presets.length ? html`<div class="compact-options" id=${`presets-${name}`} role="listbox" aria-label=${`${label} presets`} ?hidden=${!open}
        @pointerdown=${(event: PointerEvent) => event.preventDefault()}
        @mousedown=${(event: MouseEvent) => event.preventDefault()}>
        ${presets.map((preset, index) => html`<button type="button" role="option" aria-selected=${value === `${preset}${unit}`}
          @click=${(event: MouseEvent) => {
            const keyboardFocus = this.shadowRoot?.activeElement === event.currentTarget
            this.commitCompactValue(name, `${preset}${unit}`)
            const input = this.renderRoot.querySelector<HTMLInputElement>(`#compact-${name}`)!
            input.value = String(preset)
            if(keyboardFocus) input.focus()
            this.compactMenu = null
          }}><span>${["Tiny", "Small", "Medium", "Large", "Huge"][index]}</span><span class="compact-option-value">${preset}${unit === "deg" ? "°" : unit}</span></button>`)}
      </div>` : nothing}
    </div>`
  }

  private renderCompactColorPicker(property = "border-color", label = "Border color") {
    const current = this.declaration(property)?.value || this.state.computed[property] || ""
    const selected = colorHex(current)
    const choose = (event: Event, value: string) => {
      const keyboardFocus = this.shadowRoot?.activeElement === event.currentTarget
      this.commitValue(property, value)
      const picker = (event.currentTarget as HTMLElement).closest("details")!
      picker.open = false
      if(keyboardFocus && !(event.currentTarget instanceof HTMLInputElement)) picker.querySelector("summary")!.focus()
    }
    const swatch = (hex: string) => html`<button type="button" class="color-swatch"
      style=${`background:#${hex}`} aria-label=${`Color #${hex}`} title=${`#${hex}`}
      aria-pressed=${selected === `#${hex}`} @click=${(event: Event) => choose(event, `#${hex}`)}></button>`
    return html`<details class="border-color-picker" @toggle=${this.syncCompactPopupState} @keydown=${(event: KeyboardEvent) => {
      if(event.key !== "Escape") return
      event.stopPropagation()
      const picker = event.currentTarget as HTMLDetailsElement
      picker.open = false
      picker.querySelector("summary")!.focus()
    }}>
      <summary aria-label=${label} title=${label}>${property === "color"
        ? html`<span class="text-color-preview" style=${`border-color:${current || selected}`}>Abc</span>`
        : html`<span class="border-color-chip" style=${`background:${current || (property === "background-color" ? "transparent" : selected)}`}></span>`}</summary>
      <div class="border-color-palette" role="group" aria-label=${`${label} palette`}>
        <button type="button" class="palette-action palette-automatic" @click=${(event: Event) => choose(event, property === "border-color" ? "currentColor" : "")}>
          <span class="border-color-chip"></span>Automatic
        </button>
        <div class="color-grid">${borderColorColumns.map(column => html`<div class="color-column">${column.map(swatch)}</div>`)}</div>
        <div class="color-grid color-standard">${standardBorderColors.map(swatch)}</div>
        <div class="palette-custom">
          <button type="button" class="palette-action" @click=${(event: Event) => {
            const control = (event.currentTarget as HTMLElement).parentElement!
            const input = control.querySelector<HTMLInputElement>('input[type="color"]')!
            this.dispatchEvent(new CustomEvent("ribbon-input-pointerdown", {
              detail: {input}, bubbles: true, composed: true,
            }))
            if(typeof input.showPicker === "function") input.showPicker()
            else input.click()
          }}>${ribbonIcon("Theme")}Custom…</button>
          <input type="color" tabindex="-1" aria-label=${`Custom ${label.toLowerCase()}`} .value=${selected}
            @change=${(event: Event) => choose(event, (event.currentTarget as HTMLInputElement).value)}>
        </div>
      </div>
    </details>`
  }

  private get documentRootTarget() {
    return this.state.target?.documentRoot === true || this.state.target?.localName === "body"
  }

  private renderCompactEffect(name: "box-shadow" | "filter") {
    const label = name === "box-shadow" ? "Shadow" : "Filter"
    const presets = name === "box-shadow" ? [
      ["None", "none"], ["Soft", "0 2px 4px #0003"], ["Medium", "0 4px 8px #0003"],
      ["Large", "0 8px 16px #0004"], ["Hard", "4px 4px 0 #0006"], ["Inset", "inset 0 2px 6px #0005"],
    ] : [
      ["None", "none"], ["Grayscale", "grayscale(1)"], ["Sepia", "sepia(1)"],
      ["Blur", "blur(2px)"], ["Vivid", "saturate(2)"], ["Invert", "invert(1)"],
    ]
    const value = this.declaration(name)?.value ?? ""
    const open = this.compactMenu === name
    return html`<div class="compact-row effect-control" data-property=${name}>
      <label id=${`label-${name}`} for=${`compact-${name}`}>${label}</label>
      <div class="compact-controls"><div class=${`compact-value ${open ? "open" : ""}`}
        @focusout=${(event: FocusEvent) => {
          if(event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return
          if(this.compactMenu === name) this.compactMenu = null
          this.customEffect = null
        }} @keydown=${(event: KeyboardEvent) => {
          if(event.key === "Enter" && event.target instanceof HTMLInputElement || event.key === "Escape") {
            event.preventDefault()
            if(event.target instanceof HTMLElement) event.target.blur()
            this.compactMenu = null
            this.customEffect = null
          }
        }}>
        <div class="compact-input">
          <button type="button" class="effect-trigger" ?hidden=${this.customEffect === name} aria-labelledby=${`label-${name}`}
            aria-expanded=${open} aria-controls=${`presets-${name}`} title=${value || "Default"}
            @click=${() => this.compactMenu = open ? null : name}>
            <span class=${name === "filter" ? "filter-preview" : "shadow-preview"} style=${`${name}:${value || this.state.computed[name] || "none"}`}>
              ${name === "filter" ? filterPreview : nothing}
            </span>
          </button>
          <input ?hidden=${this.customEffect !== name} id=${`compact-${name}`} aria-label=${label} role="combobox" aria-autocomplete="none"
            aria-expanded=${open} aria-controls=${`presets-${name}`} .value=${value} placeholder="Default"
            @focus=${() => this.compactMenu = name}
            @input=${(event: Event) => (event.currentTarget as HTMLInputElement).setCustomValidity("")}
            @change=${(event: Event) => {
              const input = event.currentTarget as HTMLInputElement
              const next = input.value.trim()
              if(next && !CSS.supports(name, next)) {input.setCustomValidity(`Enter a valid CSS ${label.toLowerCase()}`); input.reportValidity(); return}
              input.setCustomValidity("")
              this.commitValue(name, next)
            }}>
          <button type="button" class="compact-toggle" aria-label=${`${label} presets`} aria-expanded=${open}
            @click=${() => this.compactMenu = open ? null : name}>${ribbonIcon("ChevronRight")}</button>
        </div>
        <div class="compact-options effect-popup" id=${`presets-${name}`} role="group" aria-label=${`${label} presets`} ?hidden=${!open}
          @pointerdown=${(event: PointerEvent) => event.preventDefault()} @mousedown=${(event: MouseEvent) => event.preventDefault()}>
          <div class="effect-presets">
            ${presets.map(([title, css]) => html`<button type="button" title=${title} aria-label=${`${label}: ${title}`}
              aria-pressed=${value === css} @click=${() => {
                this.commitValue(name, css)
                this.customEffect = null
                this.renderRoot.querySelector<HTMLInputElement>(`#compact-${name}`)!.value = css
                this.compactMenu = null
              }}>
              <span class=${name === "filter" ? "filter-preview" : "shadow-preview"} style=${`${name}:${css}`}>
                ${name === "filter" ? filterPreview : nothing}
              </span>
            </button>`)}
          </div>
          <button type="button" class="effect-custom" @click=${async () => {
            this.customEffect = name
            await this.updateComplete
            const input = this.renderRoot.querySelector<HTMLInputElement>(`#compact-${name}`)!
            input.focus()
            input.select()
            this.compactMenu = null
          }}>Custom ${label.toLowerCase()}…</button>
        </div>
      </div></div>
    </div>`
  }

  private renderStyleGallery() {
    const shadow = this.galleryPage % 2 === 1 ? "0 4px 8px #0003" : "none"
    const saturated = this.galleryPage >= 2
    const columns = [1, 3, 4, 9, 5, 7, 6, 8]
    const presets = boxStylePresets.map((preset, index) => ({...preset,
      background: saturated ? borderColorColumns[columns[index]][4] : preset.background,
      border: saturated ? borderColorColumns[columns[index]][5] : preset.border,
    }))
    return html`<div class="gallery-pages">
      <button class="gallery-page" aria-label="Previous style presets" ?disabled=${this.galleryPage === 0}
        @click=${() => this.galleryPage--}>${ribbonIcon("ChevronRight")}</button>
      <div class="style-gallery" role="group" aria-label=${`Style presets, page ${this.galleryPage + 1} of 4`}>
      ${presets.map(preset => html`<button type="button" aria-label=${`${preset.name} style preset`}
        title=${`${preset.name}: #${preset.background}${this.documentRootTarget ? "" : `, 1px solid #${preset.border}, 4px corners, 8px padding`}`}
        style=${`background:#${preset.background};border-color:#${preset.border};box-shadow:${shadow};color:${saturated ? "#fff" : "#2f3742"}`}
        @click=${() => {
          const values: Record<string, string> = {"background-color": `#${preset.background}`}
          if(!this.documentRootTarget) Object.assign(values, {
            "border-width": "1px", "border-style": "solid", "border-color": `#${preset.border}`, "border-radius": "4px",
            "padding": "8px", "box-shadow": shadow, "color": saturated ? "#ffffff" : "#2f3742",
          })
          const styles = Object.fromEntries(Object.entries(values).map(([property, value]) => [property, {
            value, priority: this.declaration(property)?.priority ?? "",
          }]))
          this.dispatchEvent(new CustomEvent("element-style-change", {detail: {styles}, bubbles: true, composed: true}))
        }}>Abc</button>`)}
      </div>
      <button class="gallery-page" aria-label="Next style presets" ?disabled=${this.galleryPage === 3}
        @click=${() => this.galleryPage++}>${ribbonIcon("ChevronRight")}</button>
    </div>`
  }

  private renderCompact() {
    const borderStyle = this.declaration("border-style")?.value || this.state.computed["border-style"] || "solid"
    return html`<div @mouseenter=${() => this.dispatchTargetHover(true)} @mouseleave=${() => this.dispatchTargetHover(false)}
      @change=${(event: Event) => {
        // Native change events do not cross the component's shadow boundary.
        if(event.target instanceof HTMLInputElement) this.dispatchEvent(new CustomEvent("ribbon-input-commit", {
          detail: {input: event.target}, bubbles: true, composed: true,
        }))
      }}>
      ${this.showPresets ? this.renderStyleGallery() : nothing}
      ${(this.propertyNames ?? ["width", "height", "margin", "border-width", "padding", "background-color"])
        .filter(name => !this.documentRootTarget || name === "background-color").map(name => {
        if(name === "box-shadow" || name === "filter") {
          const effects = (this.propertyNames ?? []).filter(property => property === "box-shadow" || property === "filter") as ("box-shadow" | "filter")[]
          return name === effects[0] ? html`<div class="effect-fields">${effects.map(property => this.renderCompactEffect(property))}</div>` : nothing
        }
        if(name === "background-color" || name === "color") return html`<div class="compact-row" data-property=${name}>
          <span class="compact-label">${name === "color" ? "Text color" : "Background"}</span>
          <div class="compact-controls background-control">${this.renderCompactColorPicker(name, name === "color" ? "Text color" : "Background color")}</div>
        </div>`
        const label = name === "border-width" ? "Border" : name === "border-radius" ? "Rounding" : name[0].toUpperCase() + name.slice(1)
        return html`<div class="compact-row" data-property=${name}>
          <label for=${`compact-${name}`}>${label}</label>
          <div class="compact-controls">
          ${name === "border-width" ? html`<div class="border-group">
            <details class="border-picker" @toggle=${this.syncCompactPopupState}>
              <summary aria-label="Border line style" title="Border line style">
                <span class="border-sample" style=${`border-top-style:${borderStyle}`} aria-hidden="true"></span>
              </summary>
              <div class="border-options">
                ${["solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"].map(style => html`
                  <button type="button" aria-label=${style} title=${style} aria-pressed=${borderStyle === style}
                    @click=${(event: Event) => {
                      this.commitValue("border-style", style)
                      const picker = (event.currentTarget as HTMLElement).closest("details")!
                      picker.open = false
                    }}><span class="border-sample" style=${`border-top-style:${style}`} aria-hidden="true"></span></button>
                `)}
              </div>
            </details>
            ${this.renderCompactColorPicker()}
          </div>` : nothing}
          ${this.renderCompactValue(name, label, name === "rotate" || name === "scale" ? [] : name === "border-width" ? [0.5, 1, 2, 4, 8] : name === "border-radius" ? [1, 2, 4, 8, 16] : name === "width" || name === "height" ? [50, 100, 200, 400, 800] : [2, 4, 8, 16, 32], name === "rotate" ? "deg" : name === "scale" ? "%" : "px")}
          </div>
        </div>`
      })}
    </div>`
  }

  render() {
    if(this.mode === "compact") return this.renderCompact()
    if(this.mode === "basic") {
      return html`
        <fieldset
          class="editor-fields"
          @mouseenter=${() => this.dispatchTargetHover(true)}
          @mouseleave=${() => this.dispatchTargetHover(false)}
        >
          <div class="basic-grid">${this.visibleDefinitions.map(definition => this.renderProperty(definition))}</div>
        </fieldset>
      `
    }
    return html`
      <div class="advanced-divider"><span>Options</span></div>
      <fieldset
        class="editor-fields"
        @mouseenter=${() => this.dispatchTargetHover(true)}
        @mouseleave=${() => this.dispatchTargetHover(false)}
      >
        <div class="advanced">
          ${sectionGroups(this.visibleDefinitions).map(([, definitions]) => html`
            <div class="style-section">
              <div class="section-controls">${definitions.map(definition => this.renderProperty(definition))}</div>
            </div>
          `)}
          ${this.allowCustom && !this.documentRootTarget ? this.renderCustomProperties() : nothing}
        </div>
      </fieldset>
    `
  }
}

if(!customElements.get("element-style-editor")) {
  customElements.define("element-style-editor", ElementStyleEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "element-style-editor": ElementStyleEditor
  }
}
