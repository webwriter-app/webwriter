import {computed, signal} from "@webwriter/lit"

export function withParticipation(Base) {
  return class extends Base {
    static formAssociated = true
    static permissions = {
      allowTips: {
        attribute: "allow-tips",
        label: {_: "Allow dance tips"},
        description: {_: "Let participants see a dance tip."},
      },
    }
    static aggregate = {
      shape: "selection",
      title: "Dance moves",
      items: [{id: "float", label: "Float"}, {id: "twirl", label: "Twirl"}],
      value: data => data?.move || undefined,
    }

    get allowTips() { return this.hasAttribute("allow-tips") }
    set allowTips(value) { this.toggleAttribute("allow-tips", Boolean(value)) }

    #internals = this.attachInternals()
    #move = signal("")
    signals = {move: computed(() => this.#move.get())}
    #observer = new MutationObserver(() => this.syncResponse())

    connectedCallback() {
      super.connectedCallback?.()
      this.#observer.observe(this, {subtree: true, childList: true, characterData: true})
      this.syncResponse()
    }

    disconnectedCallback() {
      this.#observer.disconnect()
      super.disconnectedCallback?.()
    }

    syncResponse() {
      const data = this.querySelector(':scope > script[type="application/json"][slot="data"]')
      let move = ""
      try {
        const value = JSON.parse(data?.textContent || "{}")?.move
        if(value === "float" || value === "twirl") move = value
      } catch { /* The base widget reports invalid data. */ }
      if(move !== this.#move.get()) this.removeAttribute("submitted")
      this.#move.set(move)
      this.#internals.setFormValue(move || null)
      this.#internals.setValidity(move ? {} : {valueMissing: true}, move ? "" : "Choose a dance move.")
    }

    reportValidity() { return this.#internals.reportValidity() }
  }
}
