import {css, html} from "lit"
import {colorHex, isCssColor, safeCssColor, themeColorColumns} from "../css-color"
import {ribbonIcon} from "../ribbon-icons"

const standardColors = ["c00000", "ff0000", "ffc000", "ffff00", "92d050", "00b050", "00b0f0", "0070c0", "002060", "7030a0"]

export const colorPaletteStyles = css`
    .border-color-palette {
      anchor-name: --color-palette;
      width: max(100%, 12rem); max-width: calc(100vw - 2rem);
      box-sizing: border-box; padding: 0.4rem; border: 1px solid #c5ccd5; border-radius: 4px;
      background: white; box-shadow: 0 0 0 2px var(--compact-focus-color, #8eb6df), 0 3px 6px #0002;
    }
    .color-grid { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 3px; }
    .color-column { display: grid; gap: 0; }
    .color-column .color-swatch:first-child { margin-bottom: 0.4rem; }
    .border-color-palette .color-swatch {
      width: 100%; height: auto; aspect-ratio: 1; min-width: 0; border: 0; border-radius: 0;
      padding: 0; cursor: pointer; box-shadow: inset 0 0 0 1px #0001;
    }
    .border-color-palette .color-swatch:hover,
    .border-color-palette .color-swatch:focus-visible,
    .border-color-palette .color-swatch[aria-pressed="true"] { outline: 2px solid #8eb6df; outline-offset: -2px; }
    .color-standard, .color-suggested { border-top: 1px solid #d8dee6; margin-top: 0.4rem; padding-top: 0.4rem; }
    .palette-action {
      display: flex; align-items: center; gap: 0.4rem; width: 100%; padding: 0.35rem;
      background: transparent; border: 0; text-align: left; cursor: pointer;
    }
    .palette-action:hover, .palette-action:focus-visible { background: #e8eef5; }
    .palette-action:focus-visible { box-shadow: inset 0 0 0 2px var(--compact-focus-color, #8eb6df); }
    .palette-action svg { width: 1rem; height: 1rem; }
    .palette-action .border-color-chip { width: 1rem; height: 1rem; background: currentColor; }
    .palette-automatic { border-bottom: 1px solid #d8dee6; margin-bottom: 0.4rem; }
    .palette-custom { position: relative; anchor-name: --color-option; border-top: 1px solid #d8dee6; margin-top: 0.4rem; }
    .palette-custom input[type="color"] {
      position: fixed; position-anchor: --color-option; left: calc(anchor(--color-palette right) + 4px); top: calc(anchor(top) - 1px);
      box-sizing: border-box; width: 1px; height: 1px; padding: 0; border: 0;
      opacity: 0; pointer-events: none;
    }
`

/** Shared palette contents; the containing control owns popup placement and dismissal. */
export function renderColorPalette(label: string, value: string, choose: (event: Event, value: string) => void, {automaticValue = "", disabled = false, persistent = false, swatches = [] as readonly string[]} = {}) {
  const selected = colorHex(value, "")
  const swatch = (hex: string) => html`<button type="button" class="color-swatch" ?disabled=${disabled}
    style=${`background:#${hex}`} aria-label=${`Color #${hex}`} title=${`#${hex}`}
    aria-pressed=${selected === `#${hex}`} @click=${(event: Event) => choose(event, `#${hex}`)}></button>`
  return html`
    <button type="button" class="palette-action palette-automatic" ?disabled=${disabled} @click=${(event: Event) => choose(event, automaticValue)}>
      <span class="border-color-chip"></span>Automatic
    </button>
    <div class="color-grid">${themeColorColumns.map(column => html`<div class="color-column">${column.map(swatch)}</div>`)}</div>
    ${swatches.some(isCssColor) ? html`<div class="color-grid color-suggested">${swatches.filter(isCssColor).map(color => html`<button type="button" class="color-swatch" ?disabled=${disabled}
      style=${`background:${safeCssColor(color)}`} aria-label=${`Color ${color}`} title=${color}
      aria-pressed=${value.trim().toLowerCase() === color.trim().toLowerCase()} @click=${(event: Event) => choose(event, color)}></button>`)}</div>` : ""}
    <div class="color-grid color-standard">${standardColors.map(swatch)}</div>
    <div class="palette-custom">
      <button type="button" class="palette-action" ?disabled=${disabled} aria-label="Custom" @click=${(event: Event) => {
        const control = (event.currentTarget as HTMLElement).parentElement!
        const input = control.querySelector<HTMLInputElement>('input[type="color"]')!
        input.dispatchEvent(new CustomEvent("ribbon-input-pointerdown", {
          detail: {input}, bubbles: true, composed: true,
        }))
        if(typeof input.showPicker === "function") input.showPicker()
        else input.click()
      }}>${ribbonIcon("Theme")}Custom…</button>
      <input type="color" ?disabled=${disabled} tabindex="-1" ?data-ribbon-input-persistent=${persistent} aria-label=${`Custom ${label.toLowerCase()}`} .value=${selected || "#000000"}
        @change=${(event: Event) => choose(event, (event.currentTarget as HTMLInputElement).value)}>
    </div>
  `
}
