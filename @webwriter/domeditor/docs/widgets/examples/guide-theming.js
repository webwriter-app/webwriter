import {defaultDocumentThemes} from "../../../src/document-theme-options.ts"

const timeline = document.createElement("template")
timeline.innerHTML = `
  <style>
    :host {
      display: block;
      color: var(--ww-text-color, inherit);
      font-family: var(--ww-font-family, inherit);
    }
    ol { list-style: none; padding: 0; margin: 0; }
    li {
      position: relative;
      display: grid;
      grid-template-columns: .875rem minmax(0, 1fr);
      column-gap: .85rem;
      padding-block: .4rem;
    }
    li:not(:last-child)::before {
      content: "";
      position: absolute;
      inset-inline-start: .4375rem;
      inset-block: 1.25rem -.65rem;
      border-inline-start: 1px solid currentColor;
      opacity: .4;
    }
    .marker {
      z-index: 1;
      inline-size: .875rem;
      block-size: .875rem;
      box-sizing: border-box;
      margin-block-start: .35rem;
      border: 1px solid currentColor;
      border-radius: 50%;
      background: var(--ww-theme-accent-1, currentColor);
    }
    li:nth-child(2) .marker { background: var(--ww-theme-accent-2, currentColor); }
    li:nth-child(3) .marker { background: var(--ww-theme-accent-3, currentColor); }
    time { display: block; font-size: .875em; }
  </style>
  <ol role="list" aria-label="Garden milestones">
    <li>
      <span class="marker" aria-hidden="true"></span>
      <div><time datetime="2027-04-03">April 3</time><strong>Plan the garden beds</strong></div>
    </li>
    <li>
      <span class="marker" aria-hidden="true"></span>
      <div><time datetime="2027-04-17">April 17</time><strong>Plant the seedlings</strong></div>
    </li>
    <li>
      <span class="marker" part="opening-marker" aria-hidden="true"></span>
      <div><time datetime="2027-05-08">May 8</time><strong>Open the garden</strong></div>
    </li>
  </ol>
`

class WwGardenTimeline extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).append(timeline.content.cloneNode(true))
  }
}

customElements.define("ww-garden-timeline", WwGardenTimeline)

export function mount(root) {
  root.innerHTML = `
    <style>
      .timeline-controls { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.25rem; margin-block-end: .875rem; }
      .timeline-controls label { display: inline-flex; align-items: center; gap: .4rem; }
      .timeline-controls select { font: inherit; }
      .timeline-document {
        padding: .85rem 1rem;
        border: 1px solid #b8c7d6;
        border-radius: .5rem;
        background: #fff;
        color: var(--ww-text-color, inherit);
        font-family: var(--ww-font-family, inherit);
      }
      .timeline-document h2 { margin: 0 0 .25rem; font-size: 1.15em; }
      .timeline-document[data-highlight] ww-garden-timeline::part(opening-marker) {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
    </style>
    <div class="timeline-controls">
      <label>Document theme <select></select></label>
      <label><input name="serif" type="checkbox"> Serif text</label>
      <label><input name="highlight" type="checkbox"> Highlight opening</label>
    </div>
    <section class="timeline-document" aria-labelledby="garden-heading">
      <h2 id="garden-heading">Community garden</h2>
      <ww-garden-timeline></ww-garden-timeline>
    </section>
  `
  const themeSelect = root.querySelector("select")
  const serif = root.querySelector('[name="serif"]')
  const highlight = root.querySelector('[name="highlight"]')
  const sample = root.querySelector(".timeline-document")

  themeSelect.replaceChildren(...defaultDocumentThemes.map(({name}) => {
    const option = document.createElement("option")
    option.value = name
    option.textContent = name
    return option
  }))
  themeSelect.value = "Ocean"

  const updateTheme = () => {
    const {styles} = defaultDocumentThemes.find(({name}) => name === themeSelect.value) ?? defaultDocumentThemes[0]
    sample.removeAttribute("style")
    for(const [property, {value, priority}] of Object.entries(styles)) sample.style.setProperty(property, value, priority)
    if(serif.checked) sample.style.setProperty("--ww-font-family", "Georgia, serif")
  }
  themeSelect.addEventListener("change", updateTheme)
  serif.addEventListener("change", updateTheme)
  highlight.addEventListener("change", () => sample.toggleAttribute("data-highlight", highlight.checked))
  updateTheme()
}
