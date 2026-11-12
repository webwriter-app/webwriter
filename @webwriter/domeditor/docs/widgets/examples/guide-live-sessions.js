const template = document.createElement("template")
template.innerHTML = `
  <p>Sort your observations into categories.</p>
  <p role="status">The glossary is off.</p>
  <details hidden>
    <summary>Open glossary</summary>
    <p>A category is a group of observations with something in common.</p>
  </details>
`

class WorkshopGlossary extends HTMLElement {
  static observedAttributes = ["allow-glossary"]

  static permissions = {
    allowGlossary: {
      attribute: "allow-glossary",
      label: {_: "Allow glossary"},
      description: {_: "Let participants open a glossary during the activity."},
    },
  }

  constructor() {
    super()
    this.attachShadow({mode: "open", delegatesFocus: true})
      .append(template.content.cloneNode(true))
  }

  get allowGlossary() {
    return this.hasAttribute("allow-glossary")
  }

  set allowGlossary(value) {
    this.toggleAttribute("allow-glossary", Boolean(value))
  }

  attributeChangedCallback() {
    const glossary = this.shadowRoot.querySelector("details")
    const status = this.shadowRoot.querySelector('[role="status"]')
    glossary.hidden = !this.allowGlossary
    status.textContent = this.allowGlossary ? "" : "The glossary is off."
    if(!this.allowGlossary) glossary.open = false
  }
}

customElements.define("ww-workshop-glossary", WorkshopGlossary)

export function mount(root) {
  root.innerHTML = `
    <label><input type="checkbox" checked> Allow glossary (author setting simulation)</label>
    <p><strong>Participant view</strong></p>
    <ww-workshop-glossary allow-glossary></ww-workshop-glossary>
  `
  const checkbox = root.querySelector('input[type="checkbox"]')
  const widget = root.querySelector("ww-workshop-glossary")
  checkbox.addEventListener("change", () => {
    widget.toggleAttribute("allow-glossary", checkbox.checked)
  })
}
