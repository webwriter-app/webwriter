# Support editing

Authors configure widgets, and readers interact with the finished document. A map marker widget can let authors set the location and let readers show or hide its coordinates.

![Pencil editing interface beside reader controls](../../images/widgets/editing.svg)

<!-- library:vanilla -->
Use `this.isContentEditable` to distinguish the two views.

```css
/* In the widget's shadow styles */
:host([contenteditable]) .user-controls { display: none; }
:host(:not([contenteditable])) .author-hint { display: none; }
```

These selectors suit the editor's runtime empty `contenteditable` attribute. If your widget permits authored `contenteditable="false"`, use `isContentEditable` in script to handle that value too.

Observe `contenteditable` if changing mode requires a script update. Expose simple author settings through [options and actions](../reference/options-actions.md), which WebWriter displays in the Widget drawer.

<!-- /library -->
<!-- library:lit -->
Use `this.editable` in your `LitElementWw` template and interaction handlers. The base requests an update when the widget or an ancestor changes editing mode:

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

Import `html` from `lit` and declare `showCoordinates` as local reactive state. Expose simple author settings through [options and actions](../reference/options-actions.md), which WebWriter displays in the Widget drawer.
<!-- /library -->

Keep widget controls in shadow DOM and use the runtime editability signal described above. WebWriter tracks its own selection and hover state in memory. Test both modes using **Preview**, and save and reopen the document to check the resulting state.
