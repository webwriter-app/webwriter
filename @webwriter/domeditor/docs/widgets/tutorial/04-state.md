# 4. Add interactions and state

<!-- library:vanilla -->
Store the correct answer in an attribute. Keep the user's current choice in a property for now:

```js
static observedAttributes = ["answer", "contenteditable"]
choice = ""

get answer() { return this.getAttribute("answer") ?? "false" }

attributeChangedCallback() { this.update() }

choose(value) {
  if(this.isContentEditable) return
  this.choice = value
  this.update()
}
```

Connect the buttons in the constructor, after creating the shadow template:

```js
this.shadowRoot.querySelectorAll("button").forEach(button => {
  button.addEventListener("click", () => this.choose(button.value))
})
```

Add `update()` to display feedback:

```js
update() {
  const output = this.shadowRoot.querySelector("output")
  output.textContent = this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""
}
```



The [complete script](#complete-script) hides user controls while editing. In **Preview**, choose **False** to see “Correct!”. The `answer` attribute is saved; the temporary choice is lost on reload. Attribute changes also refresh the feedback.
<!-- /library -->

<!-- library:lit -->
Store the correct answer in an attribute. Keep the user's current choice in a property for now:


```js
static properties = {choice: {state: true}}

constructor() {
  super()
  this.choice = ""
}

get answer() { return this.getAttribute("answer") ?? "false" }

choose(value) {
  if(this.isContentEditable) return
  this.choice = value
}
```

The choice is reactive local state. Observe authored settings and editing mode as well:

```js
static get observedAttributes() {
  return [...super.observedAttributes, "answer", "contenteditable"]
}

attributeChangedCallback(name, oldValue, value) {
  super.attributeChangedCallback(name, oldValue, value)
  this.requestUpdate()
}
```

Connect the buttons in `render()` and let Lit update the feedback:

```js
render() {
  return html`
    <slot><p>Add a question.</p></slot>
    <div class="controls" ?hidden=${this.isContentEditable}>
      <button type="button" @click=${() => this.choose("true")}>True</button>
      <button type="button" @click=${() => this.choose("false")}>False</button>
    </div>
    <output aria-live="polite">${this.choice ? (this.choice === this.answer ? "Correct!" : "Try again.") : ""}</output>`
}
```

`@click` attaches a listener; `?hidden` sets a boolean attribute. Keep `.controls[hidden] { display: none; }` in the shadow styles.


The [complete script](#complete-script) hides user controls while editing. In **Preview**, choose **False** to see “Correct!”. The `answer` attribute is saved; the temporary choice is lost on reload. Attribute changes also refresh the feedback.
<!-- /library -->

<!-- library:react -->
<!-- include:../examples/react/04-state.md -->

The `answer` attribute is saved; the choice is temporary until the collaboration step. In **Preview**, choose **False** to see “Correct!”.

After editing the source, run `npm run build` before refreshing your local package. The embedded preview builds its imports automatically.
<!-- /library -->

<!-- library:vue -->
<!-- include:../examples/vue/04-state.md -->

The `answer` attribute is saved; the choice is temporary until the collaboration step. In **Preview**, choose **False** to see “Correct!”.

Replace `ww-quiz.vue` with this step’s complete component and `ww-quiz.js` with its registration module. Keep the component import in the registration module set to `./ww-quiz.vue`. After editing either file, run `npm run build` before refreshing your local package. The embedded preview compiles them automatically.
<!-- /library -->

<!-- library:angular -->
<!-- include:../examples/angular/04-state.md -->

The `answer` attribute is saved; the choice is temporary until the collaboration step. In **Preview**, choose **False** to see “Correct!”.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<!-- library:svelte -->
<!-- include:../examples/svelte/04-state.md -->

The `answer` attribute is saved; the choice is temporary until the collaboration step. In **Preview**, choose **False** to see “Correct!”.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/04-state.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/04-state.js -->
<!-- /library -->

</details>

[Open preview](../examples/preview.html?step=4)

<iframe title="Step 4: answer checking" src="../examples/preview.html?step=4" width="100%" height="210" loading="lazy"></iframe>

Next: [expose options and actions](05-options.md).
