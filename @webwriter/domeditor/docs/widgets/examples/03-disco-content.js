class WwGhostDisco extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <style>
        :host { display: block; max-inline-size: var(--ww-widget-max, 45rem); margin-inline: auto; }
        .stage { box-sizing: border-box; padding: 1rem; border: 1px solid currentColor; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
        .stage[data-lighting="neon"] { background: #321952; color: #fcf1ff; }
        .ghost { display: block; margin-block: .75rem; font-size: 2.75rem; line-height: 1.2; }
        .ghost[data-move="float"] { transform: translateY(-.3rem); }
        .ghost[data-move="twirl"] { transform: rotate(24deg); }
        .controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
        .controls[hidden] { display: none; }
        button { font: inherit; padding: .375rem .75rem; }
        button[aria-pressed="true"] { outline: 2px solid currentColor; outline-offset: 2px; }
        output { display: block; margin-block-start: .75rem; }
      </style>
      <div class="stage" data-lighting="moonlight">
        <slot><p>Join the midnight dance party.</p></slot>
        <span class="ghost" aria-hidden="true">👻</span>
        <div class="controls">
          <button type="button" value="float">Float</button>
          <button type="button" value="twirl">Twirl</button>
        </div>
        <output aria-live="polite">Pick a dance move.</output>
      </div>`
  }
}

if(!customElements.get("ww-ghost-disco")) customElements.define("ww-ghost-disco", WwGhostDisco)
