import {LitElementWw, html, signal} from "@webwriter/lit"

class DanceScoreboard extends LitElementWw {
  #source = signal(null)

  static effects = {
    "move-from": {
      label: "Dance move source",
      connect(source, lifetime) {
        this.#source.set(source)
        lifetime.addEventListener("abort", () => this.#source.set(null), {once: true})
      },
    },
  }

  render() {
    const move = this.#source.get()?.get()
    return html`<output aria-live="polite">Dance board: ${move || "waiting for a move"}</output>`
  }
}

customElements.define("ww-dance-scoreboard", DanceScoreboard)
