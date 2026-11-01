import {LitElement, css, html, nothing} from "lit"
import {tokenize} from "@csstools/css-tokenizer"
import {ribbonIcon, ribbonOptionIcon} from "../ribbon-icons"
import {choiceGroupStyles} from "./choice-group.styles"
import {editorInteractionStyles} from "./editing-controls.styles"
import {colorHex, themeColorColumns as borderColorColumns} from "../css-color"
import {mediaSourceButtonStyles} from "./media-source.styles"
import {mediaCropInsets} from "../media"
import {dropdownChevronStyles} from "./dropdown-chevron.styles"
import {colorPaletteStyles, renderColorPalette} from "./color-palette"
import {ref} from "lit/directives/ref.js"
import {documentDialogStyles} from "./document-dialog.styles"
import {
  filterTypes, newFilterPreset, filterPresetValue, filterPresetLabel, loadFilterPresets, saveFilterPreset,
  filterPresetsStorageKey, filterPresetsChangeEvent, type FilterPreset, type FilterType,
} from "../filter-presets"
import "./style-combobox"
import type {StyleCombobox} from "./style-combobox"
import type {ElementStyleDeclaration, ElementStyleMutation, ElementStyleState} from "../editor-bridge"
import {
  cssWideKeywords,
  listMarkerTypes,
  listMarkerImageProperty,
  enumerationMarkerTypes,
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

// Match whole top-level functions, preserving custom filters, nested arguments,
// comments and URLs when a preset is removed from an authored filter list.
const filterPresetRanges = (value: string, preset: string) => {
  const ranges: {start: number, end: number}[] = []
  const style = document.createElement("span").style
  style.filter = preset
  const expected = style.filter
  let depth = 0, start = -1
  for(const [type, , from, to] of tokenize({css: value})) {
    if(type === "function-token" || type === "(-token") {
      if(depth === 0) start = from
      depth++
    }
    else if(type === ")-token" && depth > 0) {
      depth--
      if(depth === 0) {
        style.filter = ""
        style.filter = value.slice(start, to + 1)
        if(expected && style.filter === expected) ranges.push({start, end: to + 1})
      }
    }
  }
  return ranges
}

const simpleDimension = (value: string, units: readonly string[]) => {
  const match = value.trim().match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i)
  if(!match || !units.includes(match[2])) return null
  return {number: match[1], unit: match[2]}
}


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
    selectionKey: {attribute: false},
    mode: {type: String, reflect: true},
    orientation: {type: String, reflect: true},
    allowCustom: {type: Boolean, attribute: "allow-custom"},
    showPresets: {type: Boolean, attribute: "show-presets"},
    compactMenu: {state: true},
    galleryPage: {state: true},
    customEffect: {state: true},
    customFilters: {state: true},
    filterDraft: {state: true},
    filterError: {state: true},
    directionalProperty: {state: true},
    customProperty: {type: String, state: true},
    customValue: {type: String, state: true},
    customImportant: {type: Boolean, state: true},
    markerImageBusy: {state: true},
    markerImageError: {state: true},
    markerImageFilename: {state: true},
    markerImagePreview: {state: true},
  }

  static styles = css`
    ${editorInteractionStyles}
    ${documentDialogStyles}
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
    .effect-trigger { display: grid; place-items: center; width: 100%; min-width: 0; padding: .2rem; border: 0; background: transparent; cursor: pointer; overflow: hidden; }
    .effect-trigger .shadow-preview { width: 1rem; }
    .effect-trigger .filter-preview svg { width: 1.4rem; margin-inline: auto; }
    .effect-trigger .filter-preview { width: 2rem; }
    .effect-control .compact-input input { padding-right: .2rem; }
    .effect-popup { padding: 0.35rem; }
    .effect-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.35rem; padding: 0.3rem 0; min-width: 0; }
    .effect-popup .effect-presets button { display: grid; grid-template-columns: minmax(0, 1fr); place-items: center; justify-content: normal; min-width: 0; gap: 0; padding: 0.35rem; height: 2.7rem; overflow: hidden; border: 1px solid #c5ccd5; border-radius: 4px; background: transparent; cursor: pointer; }
    .effect-presets button[aria-pressed="true"] { border-color: #8eb6df; box-shadow: 0 0 0 1px #b9d7f5; }
    .shadow-preview { width: min(1.4rem, 100%); box-sizing: border-box; aspect-ratio: 1; background: #fff; border: 1px solid #c5ccd5; }
    .filter-preview { display: block; width: 100%; min-width: 0; }
    .filter-preview svg { display: block; width: 2rem; max-width: 100%; height: auto; }
    .effect-popup .effect-custom { border-top: 1px solid #d8dee6; margin-top: 0.3rem; }
    .effect-control .effect-presets {max-height: 16rem; overflow-y: auto;}
    .filter-dialog {font: .8rem/1.4 system-ui, sans-serif;}
    .filter-dialog form {display: grid; gap: 1rem;}
    .filter-dialog label {display: grid; gap: .3rem; min-width: 0;}
    .filter-dialog input, .filter-dialog select {box-sizing: border-box; width: 100%; min-width: 0; min-height: 2.25rem; padding: .4rem .5rem; border: 1px solid #cbd5e1; border-radius: .35rem; color: #202833; background: white; font: inherit;}
    .filter-dialog input[type="color"] {padding: .2rem;}
    .filter-parameters {display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: .75rem;}
    .filter-dialog figure {display: grid; justify-items: center; gap: .5rem; margin: 0; padding: 1rem; overflow: hidden; border: 1px solid #e2e8f0; border-radius: .35rem; background: #f8fafc;}
    .filter-dialog .filter-preview {width: 8rem;}
    .filter-dialog .filter-preview svg {width: 100%;}
    .filter-error {margin: 0; color: #b42318;}
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
    :host([mode="compact"]) .specialized-input {display: flex; align-items: stretch; min-height: 1.7rem; box-sizing: border-box; border: 1px solid #c5ccd5; border-radius: 4px; background: transparent;}
    :host([mode="compact"]) .specialized-input > input, :host([mode="compact"]) .specialized-input > select {flex: 1; width: 0; height: 100%; min-width: 0; padding: .2rem .35rem; border: 0; border-radius: 0; background: transparent; outline: none; box-shadow: none;}
    :host([mode="compact"]) .specialized-input input::placeholder {font-size: .5rem;}
    :host([mode="compact"]) .specialized-input .length-control {display: flex; flex: 1; min-width: 0;}
    :host([mode="compact"]) .specialized-input .length-control input {flex: 1; width: 0; border: 0; background: transparent;}
    :host([mode="compact"]) .specialized-input .length-control select {width: 2.8rem; border: 0; border-left: 1px solid #c5ccd5; border-radius: 0; background: transparent;}
    .specialized-input > input, .specialized-input > select {width: 100%; min-width: 0; border-radius: 4px;}
    .specialized-input style-combobox {flex: 1; min-width: 0;}
    .compact-row[data-property="object-view-box"] {flex-direction: column; align-items: stretch; gap: .3rem;}
    .compact-row[data-property="object-view-box"] > .field-label {flex: none; font-weight: bold;}
    .crop-edges {display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .3rem; width: 100%; min-width: 0;}
    .crop-edge {display: grid; gap: .15rem; min-width: 0;}
    .crop-edge .specialized-input {min-width: 0;}
    .crop-edge .crop-unit {align-self: center; padding-right: .3rem; color: #666;}
    :host([mode="compact"]) .specialized-input:has(> .crop-edges) {border: 0;}
    :host([mode="compact"]) .specialized-input:has(style-combobox) {border: 0; box-shadow: none;}
    style-combobox {flex: 1; min-width: 0;}
    :host([mode="compact"]) .specialized-input:has(.specialized-choice-group) {border: 0; align-items: center;}
    .field-label {display: flex; align-items: center; justify-content: space-between; gap: .15rem; min-width: 0;}
    .field-label .property-action {flex: 0 0 .9rem; width: .9rem; height: .9rem; margin-left: auto; padding: 0; border: 0; background: transparent; color: #666; font: inherit; cursor: pointer;}
    .directional-label {padding: 0; border: 0; background: transparent; font: inherit; cursor: pointer; text-align: left;}
    .directional-label[data-set] {text-decoration: underline dotted; text-underline-offset: .2em;}
    .directional-label:hover, .directional-label:focus-visible {color: #1e6bb8; text-decoration: underline solid; text-underline-offset: .2em;}
    .directional-dialog {box-sizing: border-box; width: min(44rem, calc(100vw - 2rem)); padding: 1rem; border: 1px solid #c5ccd5; border-radius: .4rem; color: #2f3742; background: white; font: .8rem/1.4 system-ui;}
    .directional-dialog::backdrop {background: #0004;}
    .directional-heading {display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem;}
    .directional-dialog h2 {margin: 0; font-size: 1rem;}
    .directional-close {display: grid; place-items: center; flex: 0 0 1.5rem; width: 1.5rem; height: 1.5rem; padding: 0; border: 0; border-radius: 4px; background: transparent; font-size: 1.2rem; cursor: pointer;}
    .directional-close:hover {background: #e8eef5;}
    .directional-close svg {display: block; width: 1rem; height: 1rem;}
    .directional-close:focus-visible {outline: 2px solid #3977c7; outline-offset: 2px;}
    .directional-grid {display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: "top right" "left bottom"; gap: 1rem; align-items: start;}
    .directional-part {min-width: 0;}
    .directional-part > strong {display: block; text-align: left; margin-bottom: .5rem;}
    .directional-actions {display: flex; justify-content: flex-end; margin-top: 1rem;}
    .directional-actions button {padding: .35rem .75rem; border: 1px solid #c5ccd5; border-radius: 4px; background: #f2f2f2; cursor: pointer;}
    .directional-part:is([data-direction="left"], [data-direction="bottom"]) .border-color-palette {top: auto; bottom: 100%;}
    .directional-part:is([data-direction="top"], [data-direction="left"]) .border-color-palette {left: 0; right: auto;}
    .directional-part .field-label {flex-basis: 4.5rem;}
    @media (max-width: 32rem) {
      .directional-part .compact-row {flex-direction: column; align-items: stretch; gap: .2rem;}
      .directional-part .compact-row > .field-label {flex: 0 0 auto; justify-content: flex-start;}
    }
    .compact-row > .field-label {flex: 0 0 4.4rem;}
    .effect-control.compact-row > .field-label {flex: none;}
    ${choiceGroupStyles}
    .specialized-choice-group {flex: 1;}
    .specialized-choice-group button {min-height: 1.6rem; padding: .15rem .2rem; font: inherit; font-size: .6rem;}
    .specialized-choice-group button span {display: flex; justify-content: center;}
    .specialized-choice-group svg {width: 1rem; height: 1rem; display: block;}
    [data-property="vertical-align"] .specialized-choice-group button {padding-inline: 0;}
    [data-property="vertical-align"] .specialized-choice-group svg {width: .75rem; height: .75rem;}
    :host([dense-choices]) .specialized-choice-group button {padding-inline: 0;}
    :host([dense-choices]) .specialized-choice-group svg {width: .75rem; height: .75rem;}
    :host([dense-choices]) :is([data-property="caption-side"], [data-property="empty-cells"]) .specialized-choice-group svg {width: 1rem; height: 1rem;}
    :host([dense-choices]) [data-property="text-wrap"] .specialized-choice-group button {height: 1.5rem; min-height: 0; padding-block: 0;}
    :host([dense-choices]) [data-property="text-wrap"] .specialized-choice-group svg {width: 1rem; height: 1rem;}
    .marker-control {width: 100%;}
    .marker-control [hidden] {display: none !important;}
    .marker-control .marker-popup {padding: .35rem; border-top: 1px solid #c5ccd5; border-radius: 4px;}
    .marker-control .specialized-choice-group button {display: grid; place-items: center; padding: .15rem .2rem;}
    .marker-more svg {transform: rotate(90deg);}
    .marker-preview {width: max-content; margin: 0; padding: 0; list-style-position: inside; font: .75rem/1.1rem system-ui, sans-serif;}
    .marker-preview li {display: list-item; padding: 0;}
    /* Align the native symbol rather than its trailing marker space. */
    .marker-preview[data-symbolic] {font-size: 1.25rem; line-height: 1; transform: translateX(calc(.5em - 3px));}
    .marker-image-dialog {--control-height: 2rem; box-sizing: border-box; width: min(24rem, calc(100vw - 2rem)); padding: 1rem; border: 1px solid #a8a8a8; border-radius: .4rem; color: inherit; background: white; font: .85rem/1.4 system-ui, sans-serif;}
    .marker-image-dialog::backdrop {background: #0004;}
    .marker-image-dialog h2 {margin: 0 0 .75rem; font-size: 1rem;}
    .marker-image-dialog form {display: block;}
    .marker-image-dialog label {display: grid; gap: .5rem; clear: both; margin-top: .75rem;}
    .marker-image-dialog input {box-sizing: border-box; width: 100%; min-width: 0; padding: .4rem; font: inherit;}
    .marker-image-dialog .marker-image-error {color: #b42318; margin: 0;}
    .marker-image-dialog .marker-image-actions {display: flex; justify-content: flex-end; gap: .5rem; margin-top: .5rem;}
    .marker-image-dialog button {padding: .4rem .7rem; border: 1px solid #c5ccd5; border-radius: 4px; background: #f2f2f2; font: inherit; cursor: pointer;}
    ${mediaSourceButtonStyles}
    .marker-image-upload {display: grid; gap: .5rem;}
    .marker-image-upload .file-options {width: fit-content;}
    .marker-image-filename {overflow-wrap: anywhere;}
    .marker-image-preview {float: right; box-sizing: border-box; width: 30%; aspect-ratio: 1; display: grid; grid-template-rows: minmax(0, 1fr) auto; place-items: center; gap: .25rem; margin: 0 0 .75rem 1rem; padding: .5rem; border: 1px solid #c5ccd5; border-radius: 4px; background: #f2f2f2;}
    .marker-image-preview[hidden] {display: none;}
    .marker-image-preview img {display: block; max-width: 100%; max-height: 100%; object-fit: contain;}
    .marker-image-preview figcaption {font-size: .75rem; color: #667085;}
    .specialized-choice-group button:hover {background: #edf3f9;}
    :host([mode="compact"]) .specialized-choice-group button:focus-visible {outline: 2px solid #8eb6df; outline-offset: -2px;}
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
      padding: .2rem;
    }
    .compact-input input::placeholder { font-size: 0.5rem; }
    .compact-unit { display: flex; align-items: center; justify-content: center; width: 1.1rem; box-sizing: border-box; font-size: 0.55rem; flex: 0 0 auto; border-left: 1px solid #c5ccd5; }
    [data-property="rotate"] .compact-unit { font-size: 0.85rem; }
    .compact-toggle {
      cursor: pointer;
    }
    .compact-toggle svg { width: 14px; height: 14px; display: block; transform: rotate(90deg); transition: transform 120ms ease; }
    .open .compact-toggle svg { transform: rotate(270deg); }
    .compact-options {
      position: absolute; z-index: 3; top: 100%; left: 0; width: 100%; box-sizing: border-box;
      border: 1px solid #c5ccd5; border-top: 0; border-radius: 0 0 4px 4px; background: white;
      box-shadow: 0 3px 6px #0002;
    }
    .compact-options:not(.marker-popup) button { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; width: 100%; text-align: left; padding: 0.35rem; border: 0; background: transparent; cursor: pointer; }
    .compact-option-value { color: #6b7787; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .compact-options button:hover, .compact-options button:focus { background: #e8eef5; }
    .border-group { display: flex; flex: 0 0 auto; align-items: stretch; height: 1.7rem; border: 1px solid #c5ccd5; border-right: 0; border-radius: 4px 0 0 4px; background: transparent; box-sizing: border-box; }
    .border-group input[type="color"] { width: 1.25rem; height: 100%; border: 0; border-left: 1px solid #c5ccd5; padding: 2px; background: transparent; }
    .border-group + .compact-value { position: static; }
    .border-group + .compact-value .compact-input { border-radius: 0 4px 4px 0; }
    .border-group + .compact-value.open .compact-input { border-radius: 0 4px 0 0; }
    .border-picker { position: relative; }
    .border-picker summary .border-sample { width: 0; height: .85rem; border-top: 0; border-left-width: 3px; margin: 0; }
    .border-picker summary { list-style: none; cursor: pointer; width: 1rem; height: 100%; display: grid; place-items: center; }
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
    .color-fields > [data-property] { display: flex; flex: 1; min-width: 0; }
    .color-fields > [data-property] + [data-property] { border-left: 1px solid #c5ccd5; }
    .border-color-picker { position: static; border-left: 1px solid #c5ccd5; }
    .border-group .border-color-picker {box-sizing: border-box; width: 1rem;}
    .border-group .border-color-picker > summary {width: 100%;}
    .border-color-picker > summary {
      display: grid; place-items: center; box-sizing: border-box;
      width: 1rem; height: 100%; padding: 3px; list-style: none; cursor: pointer;
    }
    .border-color-picker > summary::-webkit-details-marker { display: none; }
    .border-color-chip { width: 100%; height: 100%; box-shadow: inset 0 0 0 1px #0002; }
    .text-color-preview { font-size: 0.65rem; font-weight: 700; line-height: 1; padding-bottom: 2px; border-bottom: 4px solid; }
    ${colorPaletteStyles}
    .border-color-palette { position: absolute; z-index: 4; top: 100%; right: 0; }

    ${dropdownChevronStyles}


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
  selectionKey = ""
  mode: "basic" | "advanced" | "compact" = "basic"
  orientation: "horizontal" | "vertical" = "horizontal"
  allowCustom = false
  showPresets = false
  private galleryPage = 0
  private customEffect: string | null = null
  private customFilters: FilterPreset[] = []
  private filterDraft = newFilterPreset()
  private filterError = ""
  private filterSelectionKey = ""
  private compactMenu: string | null = null
  private directionalProperty: string | null = null
  private directionalSelectionKey = ""
  private markerImageBusy = false
  private markerImageError = ""
  private markerImageFilename = ""
  private markerImagePreview = ""
  private markerImageSource: File | string | null = null
  private markerImagePreviewTimer: number | null = null
  private markerImageRequest: AbortController | null = null
  private markerImageReader: FileReader | null = null
  private markerImageState: ElementStyleState | null = null
  private markerImageSelectionKey = ""
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
      ? this.renderRoot.querySelector(`#compact-${this.compactMenu}, [data-property="${this.compactMenu}"] .effect-trigger`)?.closest(".compact-value")
      : null
    if(!active || !path.includes(active)) this.compactMenu = null
    this.renderRoot.querySelectorAll<StyleCombobox>("style-combobox").forEach(combobox => {
      if(!path.includes(combobox)) combobox.close()
    })
    this.renderRoot.querySelectorAll<HTMLDetailsElement>(".border-picker[open], .border-color-picker[open]").forEach(picker => {
      if(!path.includes(picker)) picker.open = false
    })
  }

  private syncCompactPopupState = () => {
    this.toggleAttribute("popup-open", Boolean(this.compactMenu
      || this.renderRoot.querySelector("style-combobox[popup-open]")
      || this.renderRoot.querySelector(".border-picker[open], .border-color-picker[open]")))
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if(changed.has("selectionKey") && this.selectionKey !== this.directionalSelectionKey) {
      this.renderRoot.querySelector<HTMLDialogElement>(".directional-dialog")?.close()
    }
    if(changed.has("selectionKey") && this.selectionKey !== this.filterSelectionKey) {
      this.renderRoot.querySelector<HTMLDialogElement>(".filter-dialog")?.close()
    }
    if((changed.has("state") || changed.has("selectionKey")) && this.renderRoot.querySelector<HTMLDialogElement>(".marker-image-dialog")?.open && !this.markerImageSelectionUnchanged) {
      this.renderRoot.querySelector<HTMLDialogElement>(".marker-image-dialog")?.close()
      this.cancelMarkerImageRead()
    }
    this.syncCompactPopupState()
  }

  connectedCallback() {
    super.connectedCallback()
    this.ownerDocument.addEventListener("pointerdown", this.dismissMenus, true)
    this.ownerDocument.addEventListener("focusin", this.dismissMenus, true)
    this.customFilters = loadFilterPresets()
    this.ownerDocument.defaultView?.addEventListener("storage", this.refreshFilterPresets)
    this.ownerDocument.defaultView?.addEventListener(filterPresetsChangeEvent, this.refreshFilterPresets)
  }

  disconnectedCallback() {
    this.ownerDocument.removeEventListener("pointerdown", this.dismissMenus, true)
    this.ownerDocument.removeEventListener("focusin", this.dismissMenus, true)
    this.ownerDocument.defaultView?.removeEventListener("storage", this.refreshFilterPresets)
    this.ownerDocument.defaultView?.removeEventListener(filterPresetsChangeEvent, this.refreshFilterPresets)
    this.compactMenu = null
    this.cancelMarkerImageRead()
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(".marker-image-dialog")
    if(dialog?.open) dialog.close()
    this.renderRoot.querySelector<HTMLDialogElement>(".directional-dialog")?.close()
    this.renderRoot.querySelector<HTMLDialogElement>(".filter-dialog")?.close()
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
    const unsupported = definition.name === "position" && !this.state.context.positioning
      ? ["relative", "absolute", "sticky"] : []
    const options = (definition.values ?? []).filter(value => !unsupported.includes(value))
    const computed = this.state.computed[definition.name]?.trim() ?? ""
    return html`<style-combobox .label=${definition.label} .editable=${false} .value=${current}
      .options=${[{value: "", label: computed || "Default"},
        ...(current && !options.includes(current) && !unsupported.includes(current) ? [{value: current, label: current}] : []),
        ...options.map(value => ({value, label: value}))]}
      @combobox-change=${(event: CustomEvent<{value: string}>) => this.commitValue(definition.name, event.detail.value, declaration)}
    ></style-combobox>`
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
    const raw = current || computed || String(definition.min ?? 0)
    const effective = definition.name === "opacity" && raw.endsWith("%") ? String(parseFloat(raw) / 100) : raw
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
      placeholder=${this.mode === "compact" ? "Default" : this.state.computed[definition.name]?.trim() ?? ""}
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

  private renderCompactValue(name: string, label: string, presets: readonly number[], unit = "px", current = this.declaration(name)?.value ?? "") {
    const value = current === "none" && name === "scale" ? "1"
      : current === "none" && name === "rotate" ? "0deg" : current
    const percentage = name === "scale" || name === "opacity"
    const displayed = percentage && value.trim() && Number.isFinite(Number(value))
      ? String(Number((Number(value) * 100).toPrecision(15)))
      : unit && value.endsWith(unit) ? value.slice(0, -unit.length) : value
    const labels = name === "opacity" ? ["Invisible", "Faint", "Half", "Mostly opaque", "Opaque"]
      : name === "scale" ? ["Half", "Small", "Original", "Large", "One and a half"]
      : name === "rotate" ? ["Quarter left", "Eighth left", "Straight", "Eighth right", "Quarter right"]
      : ["Tiny", "Small", "Medium", "Large", "Huge"]
    return html`<style-combobox id=${`compact-${name}`} .label=${label} .showValue=${true}
      .value=${displayed} .unit=${unit} .joined=${name === "border-width" || /^border-(top|right|bottom|left)-width$/.test(name)} .persistent=${false} placeholder="Default"
      .options=${presets.map((preset, index) => ({value: String(preset), label: labels[index], description: `${preset}${unit === "deg" ? "°" : unit}`}))}
      @combobox-change=${(event: CustomEvent<{value: string}>) => {
        const raw = event.detail.value.trim()
        const next = raw ? percentage ? String(Number(raw) / 100) : `${raw}${unit}` : ""
        if(raw && (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) || !CSS.supports(name, next)
          || name === "opacity" && (Number(raw) < 0 || Number(raw) > 100))) {
          const combo = event.currentTarget as import("./style-combobox").StyleCombobox
          combo.value = displayed
          combo.close(true)
          return
        }
        this.commitCompactValue(name, next)
      }}></style-combobox>`
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
        ${renderColorPalette(label, current, choose, {automaticValue: property === "border-color" ? "currentColor" : ""})}
      </div>
    </details>`
  }

  private get documentRootTarget() {
    return this.state.target?.documentRoot === true || this.state.target?.localName === "body"
  }

  private refreshFilterPresets = (event: Event) => {
    if(event instanceof StorageEvent && event.key !== null && event.key !== filterPresetsStorageKey) return
    this.customFilters = loadFilterPresets()
  }

  private currentEffectValue(name: "box-shadow" | "filter") {
    const value = this.declaration(name)?.value
    return value && !cssWideKeywords.includes(value as typeof cssWideKeywords[number])
      ? value : this.state.computed[name] || "none"
  }

  private commitFilterPreset(css: string, toggle = true) {
    const current = this.currentEffectValue("filter")
    let stack = current === "none" ? "" : current
    const ranges = filterPresetRanges(stack, css)
    if(css === "none") stack = "none"
    else if(ranges.length && toggle) {
      for(const {start, end} of ranges.reverse()) stack = stack.slice(0, start) + stack.slice(end)
    }
    else if(!ranges.length) stack = `${stack} ${css}`
    this.commitValue("filter", stack.trim() || "none")
  }

  private async openFilterDialog() {
    this.filterDraft = newFilterPreset()
    this.filterError = ""
    this.filterSelectionKey = this.selectionKey
    this.compactMenu = null
    await this.updateComplete
    if(!this.isConnected || this.selectionKey !== this.filterSelectionKey) return
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(".filter-dialog")!
    if(!dialog.open) dialog.showModal()
  }

  private addCustomFilter(event: SubmitEvent) {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const dialog = form.closest("dialog")!
    if(!this.isConnected || !dialog.open || this.selectionKey !== this.filterSelectionKey || !form.reportValidity()) return
    const value = filterPresetValue(this.filterDraft)
    if(!value || !CSS.supports("filter", value)) {this.filterError = "Choose valid filter settings."; return}
    try { saveFilterPreset(this.filterDraft) }
    catch {this.filterError = "Could not save this filter. Check that browser storage is available and try again."; return}
    this.commitFilterPreset(value, false)
    dialog.close()
  }

  private renderFilterDialog() {
    const definition = filterTypes.find(filter => filter.type === this.filterDraft.type)!
    const value = filterPresetValue(this.filterDraft)
    const current = this.currentEffectValue("filter")
    const preview = value && !filterPresetRanges(current, value).length ? `${current === "none" ? "" : current} ${value}`.trim() : current
    const stop = (event: Event) => event.stopPropagation()
    const close = () => this.renderRoot.querySelector<HTMLDialogElement>(".filter-dialog")!.close()
    return html`<dialog class="document-dialog confirmation-dialog filter-dialog" aria-labelledby="filter-dialog-title"
      @pointerdown=${stop} @mousedown=${stop} @focusin=${stop} @focusout=${stop} @change=${stop} @keydown=${stop}
      @close=${() => {
        if(this.isConnected) this.renderRoot.querySelector<HTMLButtonElement>('[data-property="filter"] .effect-trigger')?.focus()
      }}>
      <header><h2 id="filter-dialog-title">Custom filter</h2>
        <button class="dialog-close" type="button" aria-label="Close custom filter" @click=${close}>${ribbonIcon("Reject")}</button>
      </header>
      <form @submit=${this.addCustomFilter}>
        <label>Filter type<select autofocus .value=${this.filterDraft.type} @change=${(event: Event) => {
          this.filterDraft = newFilterPreset((event.currentTarget as HTMLSelectElement).value as FilterType)
          this.filterError = ""
        }}>${filterTypes.map(filter => html`<option value=${filter.type}>${filter.label}</option>`)}</select></label>
        <div class="filter-parameters">
          ${definition.parameters.map((parameter, index) => html`<label>${parameter.label} (${parameter.unit})
            <input type="number" required step="any" min=${parameter.min ?? nothing} max=${parameter.max ?? nothing}
              .value=${Number.isFinite(this.filterDraft.values[index]) ? String(this.filterDraft.values[index]) : ""}
              @input=${(event: Event) => {
                this.filterDraft = {...this.filterDraft, values: this.filterDraft.values.map((value, i) => i === index ? (event.currentTarget as HTMLInputElement).valueAsNumber : value)}
                this.filterError = ""
              }}>
          </label>`)}
          ${this.filterDraft.type === "drop-shadow" ? html`<label>Color<input type="color" .value=${this.filterDraft.color}
            @input=${(event: Event) => this.filterDraft = {...this.filterDraft, color: (event.currentTarget as HTMLInputElement).value}}></label>` : nothing}
        </div>
        <figure><span class="filter-preview" style=${`filter:${preview}`}>${filterPreview}</span><figcaption>Preview</figcaption></figure>
        <p class="filter-error" role="alert" ?hidden=${!this.filterError}>${this.filterError}</p>
        <footer><button type="button" @click=${close}>Cancel</button><button class="primary" type="submit">Add filter</button></footer>
      </form>
    </dialog>`
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
    if(name === "filter") {
      for(const preset of this.customFilters) {
        const css = filterPresetValue(preset)!
        if(!presets.some(([, value]) => value === css)) presets.push([filterPresetLabel(preset), css])
      }
    }
    const value = this.declaration(name)?.value ?? ""
    const current = this.currentEffectValue(name)
    const stack = current === "none" ? "" : current
    const open = this.compactMenu === name
    return html`<div class="compact-row effect-control" data-property=${name}>
      ${this.renderCompactLabel(name, label, `label-${name}`)}
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
            aria-expanded=${open} aria-controls=${`presets-${name}`} title=${current}
            @click=${() => this.compactMenu = open ? null : name}>
            <span class=${name === "filter" ? "filter-preview" : "shadow-preview"} style=${`${name}:${current}`}>
              ${name === "filter" ? filterPreview : nothing}
            </span>
          </button>
          ${name === "box-shadow" ? html`<input ?hidden=${this.customEffect !== name} id=${`compact-${name}`} aria-label=${label} role="combobox" aria-autocomplete="none"
            aria-expanded=${open} aria-controls=${`presets-${name}`} .value=${value} placeholder="Default"
            @focus=${() => this.compactMenu = name}
            @input=${(event: Event) => (event.currentTarget as HTMLInputElement).setCustomValidity("")}
            @change=${(event: Event) => {
              const input = event.currentTarget as HTMLInputElement
              const next = input.value.trim()
              if(next && !CSS.supports(name, next)) {input.setCustomValidity(`Enter a valid CSS ${label.toLowerCase()}`); input.reportValidity(); return}
              input.setCustomValidity("")
              this.commitValue(name, next)
            }}>` : nothing}
          <button type="button" class="compact-toggle dropdown-chevron" aria-label=${`${label} presets`} aria-expanded=${open}
            @click=${() => this.compactMenu = open ? null : name}>${ribbonIcon("ChevronRight")}</button>
        </div>
        <div class="compact-options effect-popup" id=${`presets-${name}`} role="group" aria-label=${`${label} presets`} ?hidden=${!open}
          @pointerdown=${(event: PointerEvent) => event.preventDefault()} @mousedown=${(event: MouseEvent) => event.preventDefault()}>
          <div class="effect-presets">
            ${presets.map(([title, css]) => html`<button type="button" title=${title} aria-label=${`${label}: ${title}`}
              aria-pressed=${name === "filter" ? css === "none" ? !stack : filterPresetRanges(stack, css).length > 0 : value === css} @click=${() => {
                if(name === "filter") this.commitFilterPreset(css)
                else this.commitValue(name, css)
                this.customEffect = null
                if(name !== "filter") {
                  this.renderRoot.querySelector<HTMLInputElement>(`#compact-${name}`)!.value = css
                  this.compactMenu = null
                }
              }}>
              <span class=${name === "filter" ? "filter-preview" : "shadow-preview"} style=${`${name}:${css}`}>
                ${name === "filter" ? filterPreview : nothing}
              </span>
            </button>`)}
          </div>
          <button type="button" class="effect-custom" @click=${async () => {
            if(name === "filter") {await this.openFilterDialog(); return}
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

  private renderCompactChoices(definition: ElementStylePropertyDefinition) {
    const textChoices: Record<string, Record<string, string>> = {
      "paint-order": {normal: "Normal", "stroke fill markers": "Stroke first", "fill stroke markers": "Fill first"},
      "vector-effect": {none: "None", "non-scaling-stroke": "Fixed stroke"},
    }
    const computed = this.state.computed[definition.name]?.trim()
    const value = this.editableValue(definition.name) || (definition.name === "hyphens" ? computed || "manual"
      : definition.name === "list-style-position" ? computed || "inside"
      : !this.declaration(definition.name) && this.hasAttribute("dense-choices") ? definition.values![0] : computed)
    const rtl = this.state.computed.direction === "rtl"
    const current = ["text-align", "text-align-last"].includes(definition.name)
      ? value === "start" ? rtl ? "right" : "left" : value === "end" ? rtl ? "left" : "right" : value : value
    const columns = definition.name === "vertical-align" ? definition.values!.length : this.hasAttribute("dense-choices")
      ? Math.min(6, definition.values!.length)
      : Math.min(4, Math.ceil(definition.values!.length / (definition.values!.length > 4 ? 2 : 1)))
    return html`<div class="specialized-choice-group" ?data-default=${!this.declaration(definition.name)} style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`style-label-${definition.name}`}>
      ${definition.values!.map((value, index) => html`<button type="button"
        ?data-top-right=${index === columns - 1} ?data-bottom-left=${index === Math.floor((definition.values!.length - 1) / columns) * columns}
        aria-pressed=${current === value}
        title=${textChoices[definition.name]?.[value] ?? value[0].toUpperCase() + value.slice(1).replaceAll("-", " ")}
        aria-label=${textChoices[definition.name]?.[value] ?? value[0].toUpperCase() + value.slice(1).replaceAll("-", " ")}
        @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
        @click=${() => this.commitValue(definition.name, value)}><span aria-hidden="true">${ribbonOptionIcon(definition.name, value)}</span></button>`)}
    </div>`
  }

  private renderMarkerChoices(definition: ElementStylePropertyDefinition) {
    const name = definition.name
    const current = this.editableValue(name) || this.state.computed[name]?.trim()
    const open = this.compactMenu === name
    const ordered = this.state.target?.localName === "ol"
    const primary = (ordered ? ["decimal", "lower-alpha", "upper-alpha", "lower-roman"] : ["disc", "circle", "square"])
      .filter(value => definition.values!.includes(value))
    const remaining = definition.values!.filter(value => !primary.includes(value)
      && (value === "none" || (ordered ? enumerationMarkerTypes : listMarkerTypes).some(type => type === value)))
    const image = this.editableValue("list-style-image") || this.state.computed["list-style-image"]
    const hasImage = Boolean(image && image !== "none")
    const isDefault = !this.declaration(hasImage ? "list-style-image" : name)
    const columns = primary.length + 1
    const choice = (value: string, index: number, columns: number, count: number) => {
      const label = ({'"–"': "Dash", '"◆"': "Diamond", '"✓"': "Checkmark", '"→"': "Arrow", '"★"': "Star"} as Record<string, string>)[value]
        ?? value[0].toUpperCase() + value.slice(1).replaceAll("-", " ")
      return html`<button type="button" title=${label} aria-label=${label} aria-pressed=${!hasImage && current === value}
        ?data-top-right=${index === columns - 1} ?data-bottom-left=${index === Math.floor((count - 1) / columns) * columns}
        @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
        @click=${(event: MouseEvent) => {
          if(hasImage) this.dispatchEvent(new CustomEvent("element-style-change", {
            detail: {styles: {
              [name]: {value, priority: this.declaration(name)?.priority ?? ""},
              "list-style-image": {value: "none", priority: this.declaration("list-style-image")?.priority ?? ""},
              [listMarkerImageProperty]: null,
            }}, bubbles: true, composed: true,
          }))
          else this.commitValue(name, value)
          this.compactMenu = null
          if(remaining.includes(value) && this.shadowRoot?.activeElement === event.currentTarget) {
            this.renderRoot.querySelector<HTMLButtonElement>(`#compact-${name}`)?.focus()
          }
        }}>${value === "none" ? html`<span aria-hidden="true">${ribbonOptionIcon(name, value)}</span>`
          : html`<ol class="marker-preview" ?data-symbolic=${["disc", "circle", "square"].includes(value)} style=${`list-style-type: ${value}`} aria-hidden="true"><li></li></ol>`}</button>`
    }
    return html`<div class="compact-value marker-control" @keydown=${(event: KeyboardEvent) => {
      if(event.key !== "Escape" || !open) return
      event.preventDefault()
      event.stopPropagation()
      this.compactMenu = null
      this.renderRoot.querySelector<HTMLButtonElement>(`#compact-${name}`)?.focus()
    }}>
      <div class="specialized-choice-group" ?data-default=${isDefault} style=${`--choice-columns: ${columns}`} role="group" aria-labelledby=${`style-label-${name}`}>
        ${primary.map((value, index) => choice(value, index, columns, columns))}
        <button type="button" class="marker-more" id=${`compact-${name}`} title="More markers" aria-label="More markers"
          aria-expanded=${open} aria-controls="marker-options" aria-pressed=${hasImage || remaining.includes(current ?? "")}
          @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
          @click=${() => this.compactMenu = open ? null : name}><span aria-hidden="true">${ribbonIcon("ChevronRight")}</span></button>
      </div>
      <div class="compact-options marker-popup" id="marker-options" ?hidden=${!open}>
        <div class="specialized-choice-group" ?data-default=${isDefault} style="--choice-columns: 3" role="group" aria-label="More markers">
          ${remaining.map((value, index) => choice(value, index, 3, remaining.length + 1))}
          <button type="button" class="marker-image-option" title="Image marker" aria-label="Image marker" aria-pressed=${hasImage}
            style=${`grid-column: span ${3 - remaining.length % 3}`}
            @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
            @click=${() => this.openMarkerImageDialog()}><span aria-hidden="true">${ribbonIcon("Image")}</span></button>
        </div>
      </div>
    </div>`
  }

  private cancelMarkerImageRead() {
    if(this.markerImagePreviewTimer !== null) window.clearTimeout(this.markerImagePreviewTimer)
    this.markerImagePreviewTimer = null
    this.markerImageRequest?.abort()
    this.markerImageRequest = null
    this.markerImageReader?.abort()
    this.markerImageReader = null
    this.markerImageBusy = false
    this.markerImagePreview = ""
    this.markerImageSource = null
  }

  private async openMarkerImageDialog() {
    this.compactMenu = null
    this.markerImageError = ""
    this.markerImageFilename = ""
    this.cancelMarkerImageRead()
    this.markerImageState = this.state
    this.markerImageSelectionKey = this.selectionKey
    await this.updateComplete
    if(!this.isConnected) return
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>(".marker-image-dialog")!
    dialog.querySelector("form")!.reset()
    if(!dialog.open) dialog.showModal()
    const current = this.declaration(listMarkerImageProperty)?.value ?? this.editableValue("list-style-image")
    const embedded = /^url\(["']?(data:[^"')]+)["']?\)$/.exec(current)
    if(embedded) {
      dialog.querySelector<HTMLInputElement>('[name="url"]')!.value = embedded[1]
      void this.loadMarkerImage()
    }
  }

  private get markerImageSelectionUnchanged() {
    return this.selectionKey === this.markerImageSelectionKey
      && this.state.target?.localName === this.markerImageState?.target?.localName
      && this.state.target?.namespaceURI === this.markerImageState?.target?.namespaceURI
  }

  private applyMarkerImage(event: SubmitEvent) {
    event.preventDefault()
    if(this.markerImageBusy || !this.markerImagePreview) return
    const form = event.currentTarget as HTMLFormElement
    const source = form.querySelector<HTMLInputElement>('[name="file"]')!.files?.[0]
      ?? form.querySelector<HTMLInputElement>('[name="url"]')!.value.trim()
    if(source !== this.markerImageSource) return
    const dialog = form.closest("dialog")!
    if(!this.isConnected || !dialog.open || !this.markerImageSelectionUnchanged) return
    this.dispatchEvent(new CustomEvent("element-style-change", {
      detail: {styles: {
        "list-style-image": {value: `var(${listMarkerImageProperty})`, priority: this.declaration("list-style-image")?.priority ?? ""},
        [listMarkerImageProperty]: {value: `url(${JSON.stringify(this.markerImagePreview)})`, priority: this.declaration(listMarkerImageProperty)?.priority ?? ""},
      }}, bubbles: true, composed: true,
    }))
    dialog.close()
  }

  private async loadMarkerImage() {
    const form = this.renderRoot.querySelector<HTMLFormElement>(".marker-image-dialog form")!
    const dialog = form.closest("dialog")!
    const file = form.querySelector<HTMLInputElement>('[name="file"]')!.files?.[0]
    const link = form.querySelector<HTMLInputElement>('[name="url"]')!.value.trim()
    if(!file && !link) {this.markerImageError = "Upload an image or enter an image URL."; return}
    this.cancelMarkerImageRead()
    const request = new AbortController()
    this.markerImageRequest = request
    this.markerImageBusy = true
    this.markerImageError = ""
    try {
      let blob: Blob
      if(file) blob = file
      else {
        const url = new URL(link, this.ownerDocument.baseURI)
        if(!["http:", "https:", "data:"].includes(url.protocol)) throw new Error("Enter an HTTP, HTTPS, or data image URL.")
        const response = await fetch(url.href, {signal: request.signal, credentials: "omit"})
        if(!response.ok) throw new Error(`Could not load the image (${response.status}).`)
        blob = await response.blob()
      }
      if(request.signal.aborted) return
      if(!blob.type.startsWith("image/")) throw new Error("Choose an image file or a URL that returns an image.")
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        this.markerImageReader = reader
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the image."))
        reader.onerror = () => reject(new Error("Could not read the image."))
        reader.onabort = () => reject(new DOMException("Image loading cancelled", "AbortError"))
        reader.readAsDataURL(blob)
      })
      if(request.signal.aborted || this.markerImageRequest !== request || !this.isConnected || !dialog.open
        || !this.markerImageSelectionUnchanged) return
      this.markerImagePreview = data
      this.markerImageSource = file ?? link
    }
    catch(error) {
      if(!request.signal.aborted && this.markerImageRequest === request) {
        this.markerImageError = error instanceof TypeError ? "Could not load the image. Try uploading it instead."
          : error instanceof Error ? error.message : "Could not load the image."
      }
    }
    finally {
      if(this.markerImageRequest === request) {
        this.markerImageRequest = null
        this.markerImageReader = null
        this.markerImageBusy = false
      }
    }
  }

  private renderMarkerImageDialog() {
    const nativeEvent = (event: Event) => event.stopPropagation()
    return html`<dialog class="marker-image-dialog" aria-labelledby="marker-image-title"
      @pointerdown=${nativeEvent} @mousedown=${nativeEvent} @focusin=${nativeEvent} @focusout=${nativeEvent}
      @change=${nativeEvent} @keydown=${nativeEvent} @close=${() => {
        this.cancelMarkerImageRead()
        if(this.isConnected) this.renderRoot.querySelector<HTMLButtonElement>(".marker-more")?.focus()
      }}>
      <figure class="marker-image-preview" ?hidden=${!this.markerImagePreview}>
        <img src=${this.markerImagePreview || nothing} alt="Marker image preview" @error=${() => {
          this.cancelMarkerImageRead()
          this.markerImageError = "This image could not be displayed. Choose another image."
        }}><figcaption>Preview</figcaption>
      </figure>
      <h2 id="marker-image-title">Image marker</h2>
      <form @submit=${this.applyMarkerImage}>
        <div class="marker-image-upload"><span id="marker-image-upload-label">Upload image</span>
          <div class="file-options" role="group" aria-labelledby="marker-image-upload-label">
            <button class="file" type="button" aria-label="Select file" title="Select file" ?disabled=${this.markerImageBusy}
              @click=${() => this.renderRoot.querySelector<HTMLInputElement>('.marker-image-dialog [name="file"]')!.click()}>
              <span class="icon" aria-hidden="true">${ribbonIcon("Select file")}</span><span class="label">Select file</span>
            </button>
          </div>
          <span class="marker-image-filename" aria-live="polite" ?hidden=${!this.markerImageFilename}>${this.markerImageFilename}</span>
        </div>
        <input type="file" name="file" accept="image/*" hidden ?disabled=${this.markerImageBusy}
          @change=${(event: Event) => {
            const file = (event.currentTarget as HTMLInputElement).files?.[0]
            this.markerImageFilename = file?.name ?? ""
            if(file) {
              this.renderRoot.querySelector<HTMLInputElement>('.marker-image-dialog [name="url"]')!.value = ""
              void this.loadMarkerImage()
            }
          }}>
        <label>Or link to an image<input type="url" name="url" placeholder="https://example.com/marker.svg"
          @input=${(event: Event) => {
            this.renderRoot.querySelector<HTMLInputElement>('.marker-image-dialog [name="file"]')!.value = ""
            this.markerImageFilename = ""
            this.cancelMarkerImageRead()
            this.markerImageError = ""
            const input = event.currentTarget as HTMLInputElement
            if(input.value.trim() && input.validity.valid) this.markerImagePreviewTimer = window.setTimeout(() => {
              this.markerImagePreviewTimer = null
              void this.loadMarkerImage()
            }, 250)
          }}></label>
        <p role="status" ?hidden=${!this.markerImageBusy}>Loading preview…</p>
        <p class="marker-image-error" role="alert" ?hidden=${!this.markerImageError}>${this.markerImageError}</p>
        <div class="marker-image-actions"><button type="button" @click=${() => this.renderRoot.querySelector<HTMLDialogElement>(".marker-image-dialog")!.close()}>Cancel</button>
          <button type="submit" ?disabled=${this.markerImageBusy || !this.markerImagePreview}>Use marker</button></div>
      </form>
    </dialog>`
  }

  private renderSpecializedNumber(definition: ElementStylePropertyDefinition) {
    const suggestions = definition.name === "line-height"
      ? [{label: "Normal", value: "normal"}, {label: "Compact", value: "1.2"}, {label: "Comfortable", value: "1.5"}, {label: "Spacious", value: "2"}]
      : definition.name === "math-depth"
        ? [{label: "Normal", value: "0"}, {label: "Nested", value: "1"}, {label: "Deep", value: "2"}]
        : definition.name === "letter-spacing"
          ? [{label: "Tight", value: "-0.05em"}, {label: "Normal", value: "normal"}, {label: "Loose", value: "0.05em"}, {label: "Wide", value: "0.1em"}]
          : definition.name === "word-spacing"
            ? [{label: "Tight", value: "-0.1em"}, {label: "Normal", value: "normal"}, {label: "Loose", value: "0.1em"}, {label: "Wide", value: "0.25em"}]
            : definition.name === "text-indent"
              ? [{label: "None", value: "0"}, {label: "Small", value: "1em"}, {label: "Medium", value: "2em"}, {label: "Large", value: "4em"}]
              : [{label: "None", value: "0"}, {label: "Compact", value: "2px"}, {label: "Comfortable", value: "4px"}, {label: "Spacious", value: "8px"}]
    return html`<style-combobox .showValue=${true} .label=${definition.label}
      .value=${this.editableValue(definition.name)} placeholder="Default" .options=${suggestions}
      @combobox-change=${(event: CustomEvent<{value: string}>) => {
        const value = event.detail.value.trim()
        if(!value || CSS.supports(definition.name, value)) this.commitValue(definition.name, value)
        else {
          const combo = event.currentTarget as import("./style-combobox").StyleCombobox
          combo.value = this.editableValue(definition.name)
          combo.close(true)
        }
      }}></style-combobox>`
  }

  private renderCompactLabel(name: string, label: string, id = `style-label-${name}`, properties = [name]) {
    const directional = ["border-width", "padding", "margin", "border-radius"].includes(name)
    const hasDirections = (this.state.authoredProperties ?? Object.keys(this.state.inline)).some(property => name === "border-width"
      ? /^border-(top|right|bottom|left|block(?:-start|-end)?|inline(?:-start|-end)?)(?:-(width|style|color))?$/.test(property)
      : name === "border-radius" ? /^border-.+-radius$/.test(property)
      : new RegExp(`^${name}-(top|right|bottom|left|block(?:-start|-end)?|inline(?:-start|-end)?)$`).test(property))
    const imageMarker = name === "list-style-type" && this.declaration("list-style-image")
    const borderParts = ["border-width", "border-style", "border-color"]
    const hasBorder = name === "border-width" && Object.keys(this.state.inline)
      .some(property => /^border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?$/.test(property))
    return html`<span class="field-label">${directional ? html`<button type="button" id=${id} class="directional-label" ?data-set=${hasDirections}
      aria-haspopup="dialog" title=${`Set individual ${label.toLowerCase()} directions`}
      @click=${async () => {
        this.directionalProperty = name
        this.directionalSelectionKey = this.selectionKey
        await this.updateComplete
        if(!this.isConnected || this.selectionKey !== this.directionalSelectionKey) return
        this.renderRoot.querySelector<HTMLDialogElement>(".directional-dialog")!.showModal()
      }}>${label}</button>` : html`<span id=${id}>${label}</span>`}
      <button type="button" class="property-action" style=${properties.some(property => this.declaration(property)) || imageMarker || hasBorder ? "" : "visibility: hidden"}
        title=${`Clear ${label}`} aria-label=${`Clear ${label}`}
        @click=${() => name === "border-width" ? this.dispatchEvent(new CustomEvent("element-style-change", {
          detail: {styles: Object.fromEntries(borderParts.map(property => [property, null]))}, bubbles: true, composed: true,
        })) : imageMarker ? this.dispatchEvent(new CustomEvent("element-style-change", {
          detail: {styles: {"list-style-type": null, "list-style-image": null, [listMarkerImageProperty]: null}}, bubbles: true, composed: true,
        })) : properties.length > 1 ? this.dispatchEvent(new CustomEvent("element-style-change", {
          detail: {styles: Object.fromEntries(properties.map(property => [property, null]))}, bubbles: true, composed: true,
        })) : this.dispatchChange(name, null)}>×</button>
    </span>`
  }

  private renderBorderGroup(styleProperty = "border-style", colorProperty = "border-color", label = "Border") {
    const current = this.declaration(styleProperty)?.value || this.state.computed[styleProperty] || "solid"
    return html`<div class="border-group">
      <details class="border-picker" @toggle=${this.syncCompactPopupState}>
        <summary aria-label=${`${label} line style`} title=${`${label} line style`}>
          <span class="border-sample" style=${`border-left-style:${current}`} aria-hidden="true"></span>
        </summary>
        <div class="border-options">
          ${["solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"].map(style => html`
            <button type="button" aria-label=${styleProperty === "border-style" ? style : `${label}: ${style}`} title=${style} aria-pressed=${current === style}
              @click=${(event: Event) => {
                this.commitValue(styleProperty, style)
                const picker = (event.currentTarget as HTMLElement).closest("details")!
                picker.open = false
              }}><span class="border-sample" style=${`border-top-style:${style}`} aria-hidden="true"></span></button>
          `)}
          ${styleProperty !== "border-style" ? html`<button type="button" aria-label=${`Automatic ${label.toLowerCase()} line style`}
            @click=${(event: Event) => {
              this.commitValue(styleProperty, "")
              const picker = (event.currentTarget as HTMLElement).closest("details")!
              picker.open = false
            }}>Automatic</button>` : nothing}
        </div>
      </details>
      ${this.renderCompactColorPicker(colorProperty, `${label} color`)}
    </div>`
  }

  private renderDirectionalDialog() {
    if(!this.directionalProperty) return nothing
    const directions = ["top", "right", "left", "bottom"]
    const corners = ["top-left", "top-right", "bottom-left", "bottom-right"]
    const arrows = ["↖", "↗", "↙", "↘"]
    const explicitValue = (property: string) => !this.state.authoredProperties || this.state.authoredProperties.includes(property)
      ? this.declaration(property)?.value ?? "" : ""
    return html`<dialog class="directional-dialog" aria-labelledby="directional-title" @close=${() => this.directionalProperty = null}>
      <div class="directional-heading">
        <h2 id="directional-title">Directional styles</h2>
        <button type="button" class="directional-close" aria-label="Close directional styles" title="Close"
          @click=${() => this.renderRoot.querySelector<HTMLDialogElement>(".directional-dialog")!.close()}>${ribbonIcon("Reject")}</button>
      </div>
      <div class="directional-grid">
        ${directions.map((direction, index) => {
          const title = direction[0].toUpperCase() + direction.slice(1)
          const corner = corners[index]
          const field = (property: string, label: string, presets: readonly number[], border = false) => html`<div class="compact-row" data-property=${property}>
            <span class="field-label" title=${property === `border-${corner}-radius` ? `${corner.replace("-", " ")} corner` : nothing}>
              ${label === "Rounding" ? html`${label} <span aria-hidden="true">${arrows[index]}</span>` : label}
            </span>
            <div class="compact-controls">
              ${border ? this.renderBorderGroup(`border-${direction}-style`, `border-${direction}-color`, `${title} border`) : nothing}
              ${this.renderCompactValue(property, `${label === "Rounding" ? corner.replace("-", " ") : title} ${label.toLowerCase()}`, presets, "px", explicitValue(property))}
            </div>
          </div>`
          return html`<section class="directional-part" data-direction=${direction} style=${`grid-area:${direction}`} aria-label=${title}>
            <strong>${title}</strong>
            ${field(`border-${direction}-width`, "Border", [0.5, 1, 2, 4, 8], true)}
            ${field(`padding-${direction}`, "Padding", [2, 4, 8, 16, 32])}
            ${field(`margin-${direction}`, "Margin", [2, 4, 8, 16, 32])}
            ${field(`border-${corner}-radius`, "Rounding", [1, 2, 4, 8, 16])}
          </section>`
        })}
      </div>
      <div class="directional-actions"><button type="button" @click=${() => this.renderRoot.querySelector<HTMLDialogElement>(".directional-dialog")!.close()}>Done</button></div>
    </dialog>`
  }

  private renderMediaCrop(definition: ElementStylePropertyDefinition) {
    const value = this.declaration("object-view-box")?.value ?? this.state.computed["object-view-box"] ?? "none"
    const edges = mediaCropInsets(value)
    // Leave other authored shapes, units and rounded insets editable as CSS.
    if(!edges) return this.renderInput(definition, this.declaration("object-view-box"))
    return html`<div class="crop-edges" role="group" aria-label="Crop edges in percent">
      ${["Top", "Right", "Bottom", "Left"].map((edge, index) => html`<label class="crop-edge">
        <span class="specialized-input">
          <input type="number" min="0" max="100" step="any" aria-label=${`Crop ${edge.toLowerCase()} (%)`}
            .value=${String(edges[index])}
            @change=${(event: Event) => {
              const input = event.currentTarget as HTMLInputElement
              const next = [...edges]
              next[index] = input.valueAsNumber
              if(!input.validity.valid || !Number.isFinite(next[index]) || next[0] + next[2] >= 100 || next[1] + next[3] >= 100) {
                input.value = String(edges[index])
                return
              }
              this.commitValue("object-view-box", next.every(value => value === 0) ? "" : `inset(${next.map(value => `${value}%`).join(" ")})`)
            }}><span class="crop-unit" aria-hidden="true">%</span>
        </span><span>${edge}</span>
      </label>`)}
    </div>`
  }

  private renderCompactProperty(definition: ElementStylePropertyDefinition) {
    const mediaCrop = definition.name === "object-view-box" && definition.label === "Crop"
    return html`<div class="compact-row" data-property=${definition.name}>
      ${this.renderCompactLabel(definition.name, mediaCrop ? "Crop" : definition.label)}
      <div class="compact-controls specialized-input">
        ${mediaCrop ? this.renderMediaCrop(definition) : definition.name === "list-style-type" && definition.control === "select" && definition.values?.length
          ? this.renderMarkerChoices(definition) : definition.control === "number" || definition.control === "length" || ["line-height", "border-spacing", "math-depth"].includes(definition.name)
          ? this.renderSpecializedNumber(definition) : definition.control === "select" && definition.values?.length && definition.values.length <= 8
          && (definition.values.every(value => value.length <= 14) || ["paint-order", "vector-effect"].includes(definition.name))
          ? this.renderCompactChoices(definition) : this.renderInput(definition, this.declaration(definition.name))}
      </div>
    </div>`
  }

  private renderStyleGallery() {
    const shadow = this.galleryPage % 2 === 1 ? "0 4px 8px #0003" : "none"
    const cellTarget = ["td", "th"].includes(this.state.target?.localName ?? "")
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
        title=${`${preset.name}: #${preset.background}${this.documentRootTarget ? "" : `, 1px solid #${preset.border}${cellTarget ? "" : ", 4px corners"}, 8px padding`}`}
        style=${`background:#${preset.background};border-color:#${preset.border};box-shadow:${shadow};color:${saturated ? "#fff" : "#2f3742"}`}
        @click=${() => {
          const values: Record<string, string> = {"background-color": `#${preset.background}`}
          if(!this.documentRootTarget) Object.assign(values, {
            "border-width": "1px", "border-style": "solid", "border-color": `#${preset.border}`,
            "padding": "8px", "color": saturated ? "#ffffff" : "#2f3742",
            ...(!cellTarget ? {"border-radius": "4px", "box-shadow": shadow} : {}),
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
    const properties = (this.propertyNames ?? ["width", "height", "margin", "border-width", "padding", "background-color"])
      .filter(name => !this.documentRootTarget || name === "background-color")
    const combinedColors = properties.includes("color") && properties.includes("background-color")
    return html`<div @combobox-toggle=${this.syncCompactPopupState} @mouseenter=${() => this.dispatchTargetHover(true)} @mouseleave=${() => this.dispatchTargetHover(false)}
      @change=${(event: Event) => {
        // Native change events do not cross the component's shadow boundary.
        if(event.target instanceof HTMLInputElement) this.dispatchEvent(new CustomEvent("ribbon-input-commit", {
          detail: {input: event.target}, bubbles: true, composed: true,
        }))
      }}>
      ${this.showPresets ? this.renderStyleGallery() : nothing}
      ${properties.map(name => {
        if(name === "list-style-image" && this.propertyNames?.includes("list-style-type")) return nothing
        if(name === "opacity") return html`<div class="compact-row" data-property="opacity">
          ${this.renderCompactLabel(name, "Opacity")}
          <div class="compact-controls">${this.renderRange({name, label: "Opacity", section: "Visibility", control: "range", min: 0, max: 1, step: 0.01}, this.declaration(name))}</div>
        </div>`
        if(combinedColors && (name === "color" || name === "background-color")) {
          if(name !== properties.find(property => property === "color" || property === "background-color")) return nothing
          return html`<div class="compact-row">
            ${this.renderCompactLabel("color", "Color", "style-label-color", ["color", "background-color"])}
            <div class="compact-controls background-control color-fields" role="group" aria-labelledby="style-label-color">
              <span data-property="color">${this.renderCompactColorPicker("color", "Text color")}</span>
              <span data-property="background-color">${this.renderCompactColorPicker("background-color", "Background color")}</span>
            </div>
          </div>`
        }
        const definition = this.definitions.find(definition => definition.name === name)
        if(definition) return this.renderCompactProperty(definition)
        if(name === "box-shadow" || name === "filter") {
          const effects = (this.propertyNames ?? []).filter(property => property === "box-shadow" || property === "filter") as ("box-shadow" | "filter")[]
          return name === effects[0] ? html`<div class="effect-fields">${effects.map(property => this.renderCompactEffect(property))}</div>` : nothing
        }
        if(name === "background-color" || name === "color") return html`<div class="compact-row" data-property=${name}>
          ${this.renderCompactLabel(name, name === "color" ? "Text color" : "Background")}
          <div class="compact-controls background-control">${this.renderCompactColorPicker(name, name === "color" ? "Text color" : "Background color")}</div>
        </div>`
        const label = name === "border-width" ? "Border" : name === "border-radius" ? "Rounding" : name[0].toUpperCase() + name.slice(1)
        return html`<div class="compact-row" data-property=${name}>
          ${this.renderCompactLabel(name, label)}
          <div class="compact-controls">
          ${name === "border-width" ? this.renderBorderGroup() : nothing}
          ${this.renderCompactValue(name, label, name === "rotate" ? [-90, -45, 0, 45, 90] : name === "scale" ? [50, 75, 100, 125, 150] : name === "opacity" ? [0, 25, 50, 75, 100] : name === "border-width" ? [0.5, 1, 2, 4, 8] : name === "border-radius" ? [1, 2, 4, 8, 16] : name === "width" || name === "height" ? [50, 100, 200, 400, 800] : [2, 4, 8, 16, 32], name === "rotate" ? "deg" : name === "scale" || name === "opacity" ? "%" : "px")}
          </div>
        </div>`
      })}
      ${this.propertyNames?.includes("list-style-type") ? this.renderMarkerImageDialog() : nothing}
      ${properties.includes("filter") ? this.renderFilterDialog() : nothing}
      ${this.renderDirectionalDialog()}
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
