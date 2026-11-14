# 2. Authoring

[Support editing](../guides/editing.md)

Let authors edit the invitation in the document while readers see the dance controls.

## Put the invitation in the document

Display the document’s invitation through the widget’s default slot. Add a paragraph to Ghost Disco in the document. The slot’s own paragraph appears when the widget has no invitation.

**`index.html`**

```html
<ww-ghost-disco>
  <p>Join the midnight dance party.</p>
</ww-ghost-disco>
```


Merge this entry into `package.json`. The content expression `p+` allows one or more paragraphs. WebWriter lets the author edit those paragraphs in the document.

**`package.json`**

```json package
{
  "editingConfig": {
    "./widgets/ww-ghost-disco": {
      "label": "Ghost Disco",
      "content": "p+"
    }
  }
}
```


## Add the dance floor

Show the invitation hint in Editing mode and the dance buttons in Reading mode. Replace the placeholder with a slot, a decorative ghost, and two native buttons. The buttons will select a move in step 4.

<!-- library:vanilla optional -->
Replace the placeholder string inside the constructor with a template literal containing the markup below. Put the styles from the next subsection before the markup, inside the same string. Then add the methods to the class.

**`ww-ghost-disco.js`**

```html
<div class="stage">
  <slot><p>Join the midnight dance party.</p></slot>
  <span class="ghost" aria-hidden="true">👻</span>
  <div class="controls">
    <button type="button" value="float">Float</button>
    <button type="button" value="twirl">Twirl</button>
  </div>
  <p class="author-hint" hidden>Edit the invitation in the document.</p>
  <output aria-live="polite">Pick a dance move.</output>
</div>
```

**`ww-ghost-disco.js`**

```js
static observedAttributes = ["contenteditable"]

connectedCallback() { this.updateMode() }
attributeChangedCallback() { this.updateMode() }

updateMode() {
  this.shadowRoot.querySelector(".controls").hidden = this.isContentEditable
  this.shadowRoot.querySelector(".author-hint").hidden = !this.isContentEditable
}
```
<!-- /library -->

<!-- library:lit optional -->
Replace `render()`. The base class supplies `this.editable`. Import `css` beside `html` for the next subsection.

**`ww-ghost-disco.js`**

```js
render() {
  return html`
    <div class="stage">
      <slot><p>Join the midnight dance party.</p></slot>
      <span class="ghost" aria-hidden="true">👻</span>
      <div class="controls" ?hidden=${this.editable}>
        <button type="button" value="float">Float</button>
        <button type="button" value="twirl">Twirl</button>
      </div>
      <p class="author-hint" ?hidden=${!this.editable}>Edit the invitation in the document.</p>
      <output aria-live="polite">Pick a dance move.</output>
    </div>`
}
```
<!-- /library -->

<!-- library:react optional -->
Replace the `GhostDisco` function. The style string comes from the next subsection. Add the observed attribute and callback to the host class, then replace `refresh()`.

**`ww-ghost-disco.jsx`**

```jsx
function GhostDisco({editing}) {
  return (
    <div className="stage">
      <style>{styles}</style>
      <slot><p>Join the midnight dance party.</p></slot>
      <span className="ghost" aria-hidden="true">👻</span>
      <div className="controls" hidden={editing}>
        <button type="button" value="float">Float</button>
        <button type="button" value="twirl">Twirl</button>
      </div>
      <p className="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
      <output aria-live="polite">Pick a dance move.</output>
    </div>
  )
}
```

**`ww-ghost-disco.jsx`**

```jsx
static observedAttributes = ["contenteditable"]

attributeChangedCallback() { if(this.root) this.refresh() }

refresh() {
  this.root.render(<GhostDisco editing={this.isContentEditable} />)
}
```
<!-- /library -->

<!-- library:vue optional -->
Replace the component with this script and template. The host passes its editing state to the component. Replace the registration module with the second block.

**`ww-ghost-disco.vue`**

```vue
<script setup>
defineProps({editing: Boolean})
</script>

<template>
  <div class="stage">
    <slot><p>Join the midnight dance party.</p></slot>
    <span class="ghost" aria-hidden="true">👻</span>
    <div class="controls" :hidden="editing">
      <button type="button" value="float">Float</button>
      <button type="button" value="twirl">Twirl</button>
    </div>
    <p class="author-hint" :hidden="!editing">Edit the invitation in the document.</p>
    <output aria-live="polite">Pick a dance move.</output>
  </div>
</template>
```

**`ww-ghost-disco.js`**

```js
import {defineCustomElement} from "vue/dist/vue.runtime.esm-browser.js"
import GhostDisco from "./ww-ghost-disco.vue"

class WwGhostDisco extends defineCustomElement(GhostDisco) {
  static observedAttributes = ["contenteditable"]

  connectedCallback() {
    this.editing = this.isContentEditable
    super.connectedCallback()
  }

  attributeChangedCallback() { this.editing = this.isContentEditable }
}

customElements.define("ww-ghost-disco", WwGhostDisco)
```
<!-- /library -->

<!-- library:angular optional -->
Replace the decorator’s `template` string and the empty component class. Add `ChangeDetectorRef`, `ElementRef`, and `inject` to the imports from `@angular/core`. Keep the custom element registration from setup.

**`ww-ghost-disco.ts`**

```html
<div class="stage">
  <slot><p>Join the midnight dance party.</p></slot>
  <span class="ghost" aria-hidden="true">👻</span>
  <div class="controls" [hidden]="editing">
    <button type="button" value="float">Float</button>
    <button type="button" value="twirl">Twirl</button>
  </div>
  <p class="author-hint" [hidden]="!editing">Edit the invitation in the document.</p>
  <output aria-live="polite">Pick a dance move.</output>
</div>
```

**`ww-ghost-disco.ts`**

```ts
class GhostDisco {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement
  private readonly changeDetector = inject(ChangeDetectorRef)
  private readonly observer = new MutationObserver(() => this.changeDetector.markForCheck())

  get editing(): boolean { return this.host.isContentEditable }

  ngOnInit(): void {
    this.observer.observe(this.host, {attributes: true, attributeFilter: ["contenteditable"]})
  }

  ngOnDestroy(): void { this.observer.disconnect() }
}
```
<!-- /library -->

<!-- library:svelte optional -->
Keep `<svelte:options>`. Replace the placeholder with this script and markup.

**`ww-ghost-disco.svelte`**

```svelte
<script>
  const host = $host()
  let editing = $state(false)
  $effect(() => {
    const update = () => { editing = host.isContentEditable }
    const observer = new MutationObserver(update)
    observer.observe(host, {attributes: true, attributeFilter: ["contenteditable"]})
    update()
    return () => observer.disconnect()
  })
</script>

<div class="stage">
  <slot><p>Join the midnight dance party.</p></slot>
  <span class="ghost" aria-hidden="true">👻</span>
  <div class="controls" hidden={editing}>
    <button type="button" value="float">Float</button>
    <button type="button" value="twirl">Twirl</button>
  </div>
  <p class="author-hint" hidden={!editing}>Edit the invitation in the document.</p>
  <output aria-live="polite">Pick a dance move.</output>
</div>
```
<!-- /library -->

## Add the shadow styles

Give the dance floor its stage layout and make sure the controls respect the `hidden` attribute. Use the same rules for each library.

<!-- library:vanilla optional -->
Put the rules in a `<style>` element before the stage inside the constructor string.
<!-- /library -->

<!-- library:lit optional -->
Put the rules in a `static styles` field with the `css` tag.
<!-- /library -->

<!-- library:react optional -->
Put the rules in a `const styles` template string above the component.
<!-- /library -->

<!-- library:vue optional -->
Put the rules in a `<style>` block after the template.
<!-- /library -->

<!-- library:angular optional -->
Put the rules in a template string in the decorator's `styles` array.
<!-- /library -->

<!-- library:svelte optional -->
Put the rules in a `<style>` block after the markup.
<!-- /library -->

<!-- library:vanilla optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:lit optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:react optional -->
**`ww-ghost-disco.jsx`**
<!-- /library -->

<!-- library:vue optional -->
**`ww-ghost-disco.vue`**
<!-- /library -->

<!-- library:angular optional -->
**`ww-ghost-disco.ts`**
<!-- /library -->

<!-- library:svelte optional -->
**`ww-ghost-disco.svelte`**
<!-- /library -->

```css
:host { display: block; }
.stage { padding: 1rem; border: 1px solid #90a6cd; border-radius: .75rem; background: #e5edff; color: #172c5a; text-align: center; }
.ghost { display: block; margin-block: .75rem; font-size: 2.75rem; }
.controls { display: flex; flex-wrap: wrap; justify-content: center; gap: .5rem; }
.controls[hidden] { display: none; }
button { font: inherit; padding: .375rem .75rem; }
output { display: block; margin-block-start: .75rem; }
```

Save your changes. If setup used a build command, run it again. Refresh the local package. In the result, edit the invitation in **Editing** and switch to **Reading** to reveal the buttons.

## Results

<!-- live-example: Ghost Disco · Authoring -->

<!-- live-package: 01-setup.md . -->

<!-- live-file: react build.mjs ../examples/react/build.mjs -->

<!-- live-file: vue build.mjs ../examples/vue/build.mjs -->

<!-- live-file: angular build.mjs ../examples/angular/build.mjs -->

<!-- live-file: svelte build.mjs ../examples/svelte/build.mjs -->

<!-- live-file: vue compile.mjs ../examples/vue/compile.mjs -->

<!-- live-source: vanilla ../examples/disco/02-disco-editing.js -->

<!-- live-source: lit ../examples/disco/lit/02-disco-editing.js -->

<!-- live-source: react ../examples/disco/react/02-disco-editing.jsx -->

<!-- live-source: vue ../examples/disco/vue/02-disco-editing.vue -->

<!-- live-source: vue-registration ../examples/disco/vue/02-disco-editing.js -->

<!-- live-source: angular ../examples/disco/angular/02-disco-editing.ts -->

<!-- live-source: svelte ../examples/disco/svelte/02-disco-editing.svelte -->

```html
<ww-ghost-disco>
  <p>Join the midnight dance party.</p>
</ww-ghost-disco>
```

<!-- /live-example -->
