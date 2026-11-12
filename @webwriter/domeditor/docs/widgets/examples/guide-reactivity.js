import {LitElementWw, computed, html, signal} from "@webwriter/lit"
import {css} from "lit"
import {mountWidgetEffects} from "../../../src/widget-effects.ts"

class WwColorSource extends LitElementWw {
  #color = signal("#4263a8")
  signals = {color: computed(() => this.#color.get())}

  render() {
    return html`<label>
      Source color
      <input type="color" .value=${this.#color.get()}
        @input=${event => this.#color.set(event.currentTarget.value)}>
    </label>`
  }
}

class WwLinkedSwatch extends LitElementWw {
  static styles = css`
    .swatch {
      display: inline-block;
      inline-size: 2.5rem;
      block-size: 1.5rem;
      border: 1px solid currentColor;
      border-radius: .25rem;
      vertical-align: middle;
    }
  `
  #source = signal(null)

  static effects = {
    "color-from": {
      label: "Swatch color",
      connect(source, lifetime) {
        this.#source.set(source)
        lifetime.addEventListener("abort", () => this.#source.set(null), {once: true})
      },
    },
  }

  render() {
    const value = this.#source.get()?.get()
    const color = typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value : null
    return html`<output aria-live="polite">
      ${color ? html`<span class="swatch" aria-hidden="true" style=${`background: ${color}`}></span>
        Swatch color ${color}` : "Swatch disconnected"}
    </output>`
  }
}

customElements.define("ww-color-source", WwColorSource)
customElements.define("ww-linked-swatch", WwLinkedSwatch)

export function mount(root) {
  root.innerHTML = `
    <ww-color-source id="palette"></ww-color-source>
    <p><ww-linked-swatch color-from="#palette[color]"></ww-linked-swatch></p>
    <label><input type="checkbox" checked> Link the swatch to the source</label>
  `
  const swatch = root.querySelector("ww-linked-swatch")
  root.querySelector('input[type="checkbox"]').addEventListener("change", event => {
    if(event.currentTarget.checked) swatch.setAttribute("color-from", "#palette[color]")
    else swatch.removeAttribute("color-from")
  })
  const runtime = mountWidgetEffects(root)
  return () => runtime.destroy()
}
