import {css, html} from "lit"
import {documentLayoutConversionReason, type DocumentLayoutMode, type DocumentLayoutState} from "../document-layout"

export const templateModes = ["document", "canvas", "slides"] as const
export const templateLabel = (mode: DocumentLayoutMode) => mode[0].toUpperCase() + mode.slice(1)

/** Shared with the layout gallery so both pickers use the same visual language. */
export const layoutPreviewStyles = css`
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

    .template-preview {
      position: relative;
      height: 4.6rem;
      flex: 0 0 auto;
      place-items: center;
    }

    .template-preview .layout-preset-item { box-sizing: border-box; overflow: hidden; }
    .template-preview .mock-page { width: 2.9rem; max-width: 60%; height: 100%; padding: 0.35rem; background: white; }
    .template-preview .mock-heading { width: 62%; height: 0.3rem; margin-bottom: 0.2rem; }
    .template-preview .mock-image { height: 1rem; margin-top: 0.3rem; border-radius: 0.1rem; background: #d4e3f1; }
    .template-preview.canvas { background-image: radial-gradient(#ccd7e3 0.65px, transparent 0.65px); background-size: 7px 7px; }
    .template-preview.canvas .layout-preset-item { position: absolute; width: 35%; height: 42%; }
    .template-preview.canvas .layout-preset-item:nth-child(1) { left: 10%; top: 12%; }
    .template-preview.canvas .layout-preset-item:nth-child(2) { right: 10%; top: 27%; width: 29%; }
    .template-preview.canvas .layout-preset-item:nth-child(3) { left: 22%; bottom: 8%; width: 32%; height: 25%; }
    .template-preview.slides .mock-slide { width: 74%; height: auto; aspect-ratio: 16 / 9; max-height: 85%; padding: 0.4rem; background: white; box-shadow: 3px 3px 0 #e5eef7, 4px 4px 0 #b8c8d9; }
    .template-preview.slides .mock-image { width: 34%; align-self: end; margin-top: -0.5rem; height: 1.5rem; }
`

export function renderTemplatePreview(mode: DocumentLayoutMode) {
  const lines = html`<span class="layout-preset-line mock-heading"></span><span class="layout-preset-line"></span><span class="layout-preset-line short"></span>`
  return html`
    <span class="layout-preset-preview template-preview ${mode}" aria-hidden="true">
      ${mode === "canvas" ? [0, 1, 2].map(() => html`<span class="layout-preset-item">${lines}</span>`)
        : html`<span class="layout-preset-item ${mode === "document" ? "mock-page" : "mock-slide"}">${lines}<span class="mock-image"></span></span>`}
    </span>
    <span class="layout-preset-name">${templateLabel(mode)}</span>
  `
}

export function renderTemplateCard(mode: DocumentLayoutMode, state: DocumentLayoutState, disabled: boolean, select: (mode: DocumentLayoutMode) => void) {
  const selected = mode === state.mode
  const reason = documentLayoutConversionReason(state, mode)
  return html`<button
    class="layout-preset document-layout-change"
    data-mode=${mode}
    type="button"
    aria-pressed=${String(selected)}
    title=${reason ?? (selected ? `Current template: ${templateLabel(mode)}` : templateLabel(mode))}
    aria-label=${reason ? `${templateLabel(mode)}: ${reason}` : templateLabel(mode)}
    ?disabled=${disabled || selected || Boolean(reason)}
    @pointerdown=${(event: PointerEvent) => { if(event.button === 0) event.preventDefault() }}
    @mousedown=${(event: MouseEvent) => { if(event.button === 0) event.preventDefault() }}
    @click=${() => select(mode)}
  >${renderTemplatePreview(mode)}</button>`
}
