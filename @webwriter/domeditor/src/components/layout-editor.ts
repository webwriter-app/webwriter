import {LitElement, css, html, nothing} from "lit"
import type {ElementStyleMutation, ElementStyleState} from "../editor-bridge"
import {
  elementStyleCategories,
  type ElementStylePropertyDefinition,
} from "../element-styles"
import {layoutStyleProperties, type LayoutSelectionState, type LayoutTrackState} from "../layouts"
import type {ElementStyleChangeDetail} from "./element-style-editor"
import "./element-style-editor"

/** The target of a declaration changed from the layout toolbox. */
export type LayoutStyleTarget = "container" | "item"

export type LayoutEditorAction =
  | {
    type: "setLayoutStyles"
    styles: Record<string, ElementStyleMutation>
    target?: LayoutStyleTarget
  }
  | {type: "insertLayoutTrack"; axis: "row" | "column"; index: number}
  | {type: "removeLayoutTrack"; axis: "row" | "column"; index: number}
  | {type: "setLayoutTrackSize"; axis: "row" | "column"; index: number; value: string}

export type LayoutActionDetail = LayoutEditorAction
export type LayoutAction = LayoutEditorAction

type LayoutStateWithItemStyle = LayoutSelectionState & {itemStyle?: ElementStyleState}

const emptyTrack = (): LayoutTrackState => ({tracks: null, automatic: 0, reason: null})
const emptyLayoutState = (): LayoutSelectionState => ({
  kind: "grid",
  item: false,
  columns: emptyTrack(),
  rows: emptyTrack(),
  style: emptyStyleState(),
})

const emptyStyleState = (): ElementStyleState => ({
  target: null,
  inline: {},
  computed: {},
  context: {display: "", parentDisplay: ""},
})

const allDefinitions = () => elementStyleCategories.flatMap(category => [
  ...category.basic,
  ...category.advanced,
])

const definitionsByName = new Map<string, ElementStylePropertyDefinition>(
  allDefinitions().map(definition => [definition.name, definition]),
)

const definitionsFor = (names: readonly string[]) => names
  .map(name => definitionsByName.get(name))
  .filter((definition): definition is ElementStylePropertyDefinition => Boolean(definition))

const advancedDefinitions = allDefinitions().filter(definition =>
  layoutStyleProperties.includes(definition.name as typeof layoutStyleProperties[number]),
)

const commonPropertyNames = [
  "width",
  "max-inline-size",
  "min-inline-size",
  "gap",
  "row-gap",
  "column-gap",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "justify-content",
  "align-items",
  "align-content",
  "justify-items",
] as const

const flexPropertyNames = ["flex-direction", "flex-wrap"] as const
const gridPropertyNames = ["grid-auto-flow", "grid-auto-columns", "grid-auto-rows"] as const
const flexItemPropertyNames = ["order", "flex-grow", "flex-shrink", "flex-basis", "flex", "align-self"] as const
const gridItemPropertyNames = ["grid-column", "grid-row", "grid-area", "align-self", "justify-self"] as const

/** Detailed controls for a DOM-derived grid or flex selection. Structural
 * commands are emitted as declarative actions for the owning feature. */
export class LayoutEditor extends LitElement {
  static properties = {
    state: {attribute: false},
    styleState: {attribute: false},
  }

  static styles = css`
    :host {
      box-sizing: border-box;
      display: block;
      min-width: 0;
      color: #2f3742;
      font: 0.72rem/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; }

    button, input { color: inherit; font: inherit; }

    .layout-editor {
      display: grid;
      gap: 0.6rem;
      min-width: 0;
      padding: 0.55rem;
    }

    .mode-switch {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.3rem;
    }

    .mode-switch button,
    .track-button,
    .reset-button {
      min-height: 1.75rem;
      padding: 0.2rem 0.4rem;
      border: 1px solid #c9d0da;
      border-radius: 0.3rem;
      background: #fff;
      cursor: pointer;
    }

    .mode-switch button[aria-pressed="true"] {
      border-color: #3977c7;
      color: #1e4f87;
      background: #e8eef5;
      font-weight: 650;
    }

    .mode-switch button:focus-visible,
    .track-button:focus-visible,
    .reset-button:focus-visible,
    input:focus-visible,
    summary:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .panel {
      min-width: 0;
      padding-top: 0.45rem;
      border-top: 1px solid #d8dee6;
    }

    .panel-title,
    .track-title {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      margin: 0 0 0.35rem;
      font-size: 0.76rem;
      font-weight: 650;
    }

    .track-list {
      display: grid;
      gap: 0.35rem;
    }

    .track-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.25rem;
      align-items: center;
    }

    .track-row input {
      width: 100%;
      min-width: 0;
      min-height: 1.7rem;
      padding: 0.2rem 0.35rem;
      border: 1px solid #c9d0da;
      border-radius: 0.28rem;
      background: #fff;
    }

    .track-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.2rem;
      grid-column: 1 / -1;
    }

    .track-button {
      min-height: 1.5rem;
      padding-inline: 0.35rem;
      color: #526b86;
      font-size: 0.65rem;
    }

    .track-button.remove { color: #8b3940; }

    .automatic {
      display: block;
      margin-top: 0.35rem;
      color: #526b86;
      font-size: 0.67rem;
    }

    .capability {
      margin: 0.3rem 0 0;
      color: #7a4b14;
      font-size: 0.67rem;
    }

    details { min-width: 0; }

    summary {
      padding: 0.25rem 0;
      color: #1e4f87;
      cursor: pointer;
      font-weight: 650;
    }

    element-style-editor {
      min-height: 0;
    }
  `

  state: LayoutSelectionState = emptyLayoutState()
  styleState: ElementStyleState = emptyStyleState()

  private get layoutState(): LayoutStateWithItemStyle {
    return this.state as LayoutStateWithItemStyle
  }

  private emit(action: LayoutEditorAction) {
    this.dispatchEvent(new CustomEvent<LayoutActionDetail>("layout-action", {
      detail: action,
      bubbles: true,
      composed: true,
    }))
  }

  private setMode(kind: "grid" | "flex") {
    if(this.state.kind === kind) return
    this.emit({type: "setLayoutStyles", styles: {display: kind}, target: "container"})
  }

  private handleStyleChange(event: Event, target: LayoutStyleTarget) {
    const detail = (event as CustomEvent<ElementStyleChangeDetail>).detail
    if(!detail || typeof detail.property !== "string") return
    // The owning layout action is the only mutation route for this editor;
    // prevent generic element-style listeners higher in the toolbox from
    // applying the same declaration a second time.
    event.stopPropagation()
    this.emit({
      type: "setLayoutStyles",
      styles: {[detail.property]: detail.mutation},
      target,
    })
  }

  private trackAction(
    type: "insertLayoutTrack" | "removeLayoutTrack",
    axis: "row" | "column",
    index: number,
  ) {
    this.emit({type, axis, index} as LayoutEditorAction)
  }

  private setTrackSize(axis: "row" | "column", index: number, value: string) {
    this.emit({type: "setLayoutTrackSize", axis, index, value})
  }

  private renderTrack(axis: "row" | "column", index: number, value: string, trackState: LayoutTrackState) {
    const label = `${axis === "column" ? "Column" : "Row"} ${index + 1}`
    const structuralDisabled = Boolean(trackState.reason)
    const atTrackLimit = trackState.tracks !== null && trackState.tracks.length >= 100
    const onlyTrack = trackState.tracks?.length === 1
    return html`
      <div class="track-row" data-axis=${axis} data-track-index=${index}>
        <input
          aria-label=${`${label} size`}
          .value=${value}
          @change=${(event: Event) => this.setTrackSize(axis, index, (event.currentTarget as HTMLInputElement).value.trim())}
        >
        <button
          class="reset-button"
          type="button"
          aria-label=${`Reset ${label} size`}
          title=${`Reset ${label} size`}
          @click=${() => this.setTrackSize(axis, index, "auto")}
        >Reset</button>
        <div class="track-actions">
          <button class="track-button" type="button" ?disabled=${structuralDisabled || atTrackLimit} @click=${() => this.trackAction("insertLayoutTrack", axis, index)}>Add before</button>
          <button class="track-button" type="button" ?disabled=${structuralDisabled || atTrackLimit} @click=${() => this.trackAction("insertLayoutTrack", axis, index + 1)}>Add after</button>
          <button class="track-button remove" type="button" ?disabled=${structuralDisabled || onlyTrack} @click=${() => this.trackAction("removeLayoutTrack", axis, index)}>Remove</button>
        </div>
      </div>
    `
  }

  private renderTracks(axis: "row" | "column", trackState: LayoutTrackState) {
    const label = axis === "column" ? "Column tracks" : "Row tracks"
    const tracks = trackState.tracks
    return html`
      <section class="panel track-panel" data-axis=${axis} aria-labelledby=${`${axis}-tracks-title`}>
        <h3 class="track-title" id=${`${axis}-tracks-title`}>
          <span>${label}</span>
          ${tracks ? html`<span>${tracks.length} explicit</span>` : nothing}
        </h3>
        ${tracks === null ? html`
          <p class="capability" role="status">${trackState.reason ?? "Explicit track editing is unavailable for this layout."}</p>
        ` : html`
          <div class="track-list">
            ${tracks.map((value, index) => this.renderTrack(axis, index, value, trackState))}
          </div>
          ${trackState.reason ? html`<p class="capability" role="status">${trackState.reason}</p>` : nothing}
        `}
        ${trackState.automatic > 0 ? html`
          <span class="automatic">${trackState.automatic} automatic ${axis}${trackState.automatic === 1 ? "" : "s"} are sized by the browser.</span>
        ` : nothing}
      </section>
    `
  }

  private renderStyleEditor(
    definitions: readonly ElementStylePropertyDefinition[],
    propertyNames: readonly string[],
    state: ElementStyleState,
    target: LayoutStyleTarget,
    mode: "basic" | "advanced" = "advanced",
  ) {
    return html`
      <element-style-editor
        .definitions=${definitions}
        .propertyNames=${propertyNames}
        .state=${state}
        mode=${mode}
        orientation="vertical"
        @element-style-change=${(event: Event) => this.handleStyleChange(event, target)}
      ></element-style-editor>
    `
  }

  private renderCommonControls() {
    return html`
      <section class="panel common-panel">
        <h3 class="panel-title">Size, spacing and alignment</h3>
        ${this.renderStyleEditor(
          definitionsFor(commonPropertyNames),
          commonPropertyNames,
          this.styleState,
          "container",
          "basic",
        )}
      </section>
    `
  }

  private renderModeControls() {
    if(this.state.kind === "columns") return html`<section class="panel mode-panel"><h3 class="panel-title">Columns</h3><p>Content flows independently in each column and stacks on narrow pages.</p></section>`
    if(this.state.kind === "flex") {
      return html`
        <section class="panel mode-panel">
          <h3 class="panel-title">Flex container</h3>
          ${this.renderStyleEditor(definitionsFor(flexPropertyNames), flexPropertyNames, this.styleState, "container", "basic")}
        </section>
      `
    }
    return html`
      <section class="panel mode-panel">
        <h3 class="panel-title">Grid container</h3>
        ${this.renderStyleEditor(definitionsFor(gridPropertyNames), gridPropertyNames, this.styleState, "container", "basic")}
      </section>
      ${this.renderTracks("column", this.state.columns)}
      ${this.renderTracks("row", this.state.rows)}
    `
  }

  private renderItemControls() {
    if(!this.state.item || this.state.kind === "columns") return nothing
    const itemState = this.layoutState.itemStyle ?? this.styleState
    const names = this.state.kind === "flex" ? flexItemPropertyNames : gridItemPropertyNames
    return html`
      <section class="panel item-panel">
        <h3 class="panel-title">${this.state.kind === "flex" ? "Flex item" : "Grid item"}</h3>
        ${this.renderStyleEditor(definitionsFor(names), names, itemState, "item", "basic")}
      </section>
    `
  }

  private renderAdvancedControls() {
    return html`
      <section class="panel advanced-panel">
        <details>
          <summary>Advanced CSS</summary>
          ${this.renderStyleEditor(advancedDefinitions, advancedDefinitions.map(definition => definition.name), this.styleState, "container", "advanced")}
        </details>
      </section>
    `
  }

  render() {
    return html`
      <div class="layout-editor">
        <div class="mode-switch" role="group" aria-label="Layout mode" ?hidden=${this.state.kind === "columns"}>
          <button type="button" aria-pressed=${this.state.kind === "grid"} @click=${() => this.setMode("grid")}>Grid</button>
          <button type="button" aria-pressed=${this.state.kind === "flex"} @click=${() => this.setMode("flex")}>Flex</button>
        </div>
        ${this.renderModeControls()}
        ${this.renderItemControls()}
        ${this.renderCommonControls()}
        ${this.renderAdvancedControls()}
      </div>
    `
  }
}

if(!customElements.get("layout-editor")) {
  customElements.define("layout-editor", LayoutEditor)
}

declare global {
  interface HTMLElementTagNameMap {
    "layout-editor": LayoutEditor
  }
}
