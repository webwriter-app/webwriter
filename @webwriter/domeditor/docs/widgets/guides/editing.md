# Support editing

A widget can change its controls when the authoring tool changes the document mode. In edit mode, authors can use controls to change the content or settings. In read mode, readers can see the content and use its interactive controls.

![Pencil editing interface beside reader controls](../../images/widgets/editing.svg)

Edit the heading in the preview. Switch to **Reading** to use **Show note**.

<!-- live-example: Edit mode -->

```js vanilla
class EditNote extends HTMLElement {
  static observedAttributes = ["contenteditable"]

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <slot></slot>
      <p id="hint"></p>
      <button id="toggle" type="button">Show note</button>
      <p id="note" hidden>Meet at the north gate.</p>`
    this.shadowRoot.querySelector("#toggle").addEventListener("click", () => {
      const note = this.shadowRoot.querySelector("#note")
      note.hidden = !note.hidden
    })
  }

  connectedCallback() {
    this.renderMode()
  }

  attributeChangedCallback() {
    this.renderMode()
  }

  renderMode() {
    const editing = this.isContentEditable
    this.shadowRoot.querySelector("#hint").textContent = editing ? "Edit the heading in the document." : ""
    this.shadowRoot.querySelector("#toggle").hidden = editing
  }
}

customElements.define("ww-edit-note", EditNote)
```

```html
<ww-edit-note contenteditable="">
  <p>Field trip meeting point</p>
</ww-edit-note>
```

<!-- /live-example -->

<!-- library:vanilla -->
Use [`this.isContentEditable`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/isContentEditable) to identify the mode.

```css
/* In the widget's shadow styles */
:host([contenteditable]) .user-controls { display: none; }
:host(:not([contenteditable])) .author-hint { display: none; }
```

These selectors check for the presence of the [`contenteditable`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable) attribute. If the widget accepts `contenteditable="false"`, use `isContentEditable` in the script to check the mode.

Observe `contenteditable` if a change of mode requires a script update. Declare [options and actions](../reference/options-actions.md) for author settings. The authoring tool shows these controls in the Widget drawer.

<!-- /library -->
<!-- library:lit -->
Use `this.editable` in your `LitElementWw` template and input handlers. The base class requests an update when the edit mode changes on the widget or an ancestor.

```js
toggleCoordinates() {
  if(this.editable) return
  this.showCoordinates = !this.showCoordinates
}

render() {
  return html`
    <slot></slot>
    <button ?hidden=${this.editable} @click=${this.toggleCoordinates}>
      ${this.showCoordinates ? "Hide coordinates" : "Show coordinates"}
    </button>
    <p ?hidden=${this.editable || !this.showCoordinates}>${this.coordinates}</p>
    <p ?hidden=${!this.editable}>Set the location, then use Preview.</p>`
}
```

Import `html` from `lit`. Declare `showCoordinates` as [local reactive state](https://lit.dev/docs/components/properties/#internal-reactive-state). Declare [options and actions](../reference/options-actions.md) for author settings. The authoring tool shows these controls in the Widget drawer.
<!-- /library -->

Keep the widget controls in the [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM). Use the edit mode property for your library. Test both modes in **Preview**. Save the document. Open the document again. Check that the widget shows the saved content.

## Controls in edit mode

## Checks in read mode
