import {css, html} from "lit"
import {documentLayoutConversionReason, type DocumentLayoutMode, type DocumentLayoutState} from "../document-layout"

export const documentLayoutModes = ["document", "canvas", "slides"] as const
export const documentLayoutLabel = (mode: DocumentLayoutMode) => mode[0].toUpperCase() + mode.slice(1)

/** Shared with the layout gallery so both pickers use the same visual language. */
export const documentLayoutPreviewStyles = css`
    .layout-preset {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.3rem;
      min-width: 0;
      min-height: 7rem;
      padding: 0.35rem;
      border: 1px solid #c8d2df;
      border-radius: 0.35rem;
      color: #2f3742;
      background: #ffffff;
      font: inherit;
      font-size: 0.66rem;
      text-align: start;
      cursor: pointer;
      transition: var(--ww-ui-transition, border-color 120ms ease, background-color 120ms ease);
    }

    .layout-preset:hover {
      border-color: #8eb6df;
      background: #f6faff;
    }

    .layout-preset:focus-visible {
      outline: 2px solid #3977c7;
      outline-offset: 1px;
    }

    .layout-preset-preview {
      box-sizing: border-box;
      display: grid;
      flex: 1 1 auto;
      align-items: stretch;
      min-height: 4.6rem;
      padding: 0.25rem;
      border: 1px solid #d8dee6;
      border-radius: 0.2rem;
      background: #f8fafc;
      overflow: hidden;
    }

    .layout-preset-item {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      min-width: 0;
      min-height: 0;
      padding: 0.18rem;
      border: 1px solid #b8c8d9;
      border-radius: 0.15rem;
      background: #e5eef7;
    }

    .layout-preset-line {
      display: block;
      width: 72%;
      height: 0.18rem;
      margin-top: 0.18rem;
      border-radius: 999px;
      background: #9db4ca;
    }

    .layout-preset-line.short {
      width: 46%;
    }

    .layout-preset-name {
      display: block;
      overflow: hidden;
      font-weight: 650;
      line-height: 0.85rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .layout-preset[aria-pressed="true"] {
      border-color: #3977c7;
      background: #edf5fd;
    }

    .layout-preset:disabled { cursor: default; }
    .layout-preset:disabled:not([aria-pressed="true"]) { opacity: 0.5; }

    .document-layout-preview {
      position: relative;
      height: 4.6rem;
      flex: 0 0 auto;
      place-items: center;
    }

    .document-layout-preview .layout-preset-item { box-sizing: border-box; overflow: hidden; }
    .document-layout-preview .mock-page { width: 2.9rem; max-width: 60%; height: 100%; padding: 0.35rem; background: white; }
    .document-layout-preview .mock-heading { width: 62%; height: 0.3rem; margin-bottom: 0.2rem; }
    .document-layout-preview .mock-image { height: 1rem; margin-top: 0.3rem; border-radius: 0.1rem; background: #d4e3f1; }
    .document-layout-preview.canvas { background-image: radial-gradient(#ccd7e3 0.65px, transparent 0.65px); background-size: 7px 7px; }
    .document-layout-preview.canvas .layout-preset-item { position: absolute; width: 35%; height: 42%; }
    .document-layout-preview.canvas .layout-preset-item:nth-child(1) { left: 10%; top: 12%; }
    .document-layout-preview.canvas .layout-preset-item:nth-child(2) { right: 10%; top: 27%; width: 29%; }
    .document-layout-preview.canvas .layout-preset-item:nth-child(3) { left: 22%; bottom: 8%; width: 32%; height: 25%; }
    .document-layout-preview.slides .mock-slide { position: relative; display: block; width: 74%; height: auto; aspect-ratio: 16 / 9; max-height: 85%; padding: 0; background: white; box-shadow: 3px 3px 0 #e5eef7, 4px 4px 0 #b8c8d9; }
    .document-layout-preview.slides .mock-slide > span { position: absolute; margin: 0; }
    .document-layout-preview.slides .layout-preset-line { left: 8%; top: 38%; width: 45%; }
    .document-layout-preview.slides .mock-heading { top: 12%; width: 62%; }
    .document-layout-preview.slides .layout-preset-line.short { top: 52%; width: 32%; }
    .document-layout-preview.slides .mock-image { right: 8%; top: 38%; width: 30%; height: 48%; }
`

export function renderDocumentLayoutPreview(mode: DocumentLayoutMode) {
  const lines = html`<span class="layout-preset-line mock-heading"></span><span class="layout-preset-line"></span><span class="layout-preset-line short"></span>`
  return html`
    <span class="layout-preset-preview document-layout-preview ${mode}" aria-hidden="true">
      ${mode === "canvas" ? [0, 1, 2].map(() => html`<span class="layout-preset-item">${lines}</span>`)
        : html`<span class="layout-preset-item ${mode === "document" ? "mock-page" : "mock-slide"}">${lines}<span class="mock-image"></span></span>`}
    </span>
    <span class="layout-preset-name">${documentLayoutLabel(mode)}</span>
  `
}

export function renderDocumentLayoutCard(mode: DocumentLayoutMode, state: DocumentLayoutState, disabled: boolean, select: (mode: DocumentLayoutMode) => void) {
  const selected = mode === state.mode
  const reason = documentLayoutConversionReason(state, mode)
  return html`<button
    class="layout-preset document-layout-change"
    data-mode=${mode}
    type="button"
    aria-pressed=${String(selected)}
    title=${reason ?? (selected ? `Current layout: ${documentLayoutLabel(mode)}` : documentLayoutLabel(mode))}
    aria-label=${reason ? `${documentLayoutLabel(mode)}: ${reason}` : documentLayoutLabel(mode)}
    ?disabled=${disabled || selected || Boolean(reason)}
    @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
    @mousedown=${(event: MouseEvent) => { if(event.button === 0) event.preventDefault() }}
    @click=${() => select(mode)}
  >${renderDocumentLayoutPreview(mode)}</button>`
}
