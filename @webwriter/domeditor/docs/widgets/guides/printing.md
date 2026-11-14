# Support printing

A widget can show a [print view](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing) that keeps important information easy to read on paper. It can show content that normally needs input and hide controls that require a screen. It can also give readers a way to complete an activity on paper.

![An observation log provides space for handwritten notes on paper](../../images/widgets/printing.svg)

Select **Preview print view** to swap the screen input for a line for handwritten notes.

<!-- live-example: Print friendly notes -->

```js vanilla
class PrintNotes extends HTMLElement {
  static observedAttributes = ["data-print-preview"]

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <style>
        :host { display: block; }
        section { padding: .75rem; border: 1px solid #b8c7d6; border-radius: .5rem; }
        .preview-controls { margin-block-end: .6rem; }
        .paper-notes { display: none; min-block-size: 3rem; border-block-end: 1px solid currentColor; }
        :host([data-print-preview]) .entry-controls { display: none; }
        :host([data-print-preview]) .paper-notes { display: block; }
        @media print {
          .entry-controls, .preview-controls { display: none; }
          .paper-notes { display: block; }
        }
      </style>
      <section>
        <div class="preview-controls"><button type="button" aria-pressed="false">Preview print view</button></div>
        <slot></slot>
        <label class="entry-controls">Observation <input type="text"></label>
        <div class="paper-notes">Observation:</div>
      </section>`
    this.shadowRoot.querySelector("button").addEventListener("click", () => {
      this.toggleAttribute("data-print-preview")
    })
  }

  attributeChangedCallback() {
    const button = this.shadowRoot.querySelector("button")
    button.setAttribute("aria-pressed", String(this.hasAttribute("data-print-preview")))
  }
}

customElements.define("ww-print-notes", PrintNotes)
```

```html
<ww-print-notes>
  <strong>Trail observation log</strong>
  <p>Record one detail from the walk.</p>
</ww-print-notes>
```

<!-- /live-example -->

```css
/* In the widget's shadow styles */
.paper-notes { display: none; }

@media print {
  .entry-controls { display: none; }
  .paper-notes {
    display: block;
    min-block-size: 3rem;
    border-block-end: 1px solid currentColor;
  }
}
```

Add a `.paper-notes` element in the shadow DOM. Give it a label such as “Observations.” If the print view needs a script, listen for [`beforeprint`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeprint_event) and [`afterprint`](https://developer.mozilla.org/en-US/docs/Web/API/Window/afterprint_event) on `window`. Remove the listeners when the widget disconnects.

Use print preview. Check the text, borders, and page breaks. If the widget has no print view, show a short explanation on paper.

## Content and controls on paper

## Page breaks and print checks
