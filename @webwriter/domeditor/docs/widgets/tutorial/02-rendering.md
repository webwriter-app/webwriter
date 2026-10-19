# 2. Render the interface

<!-- library:vanilla -->
The interface needs a question, two buttons, and an output. The [complete script](#complete-script) also includes basic styles.

Replace the shadow template:

```js
this.attachShadow({mode: "open"}).innerHTML = `
  <p>The Moon is a star.</p>
  <div class="controls">
    <button type="button" value="true">True</button>
    <button type="button" value="false">False</button>
  </div>
  <output aria-live="polite"></output>`
```



Keep controls in shadow DOM so they do not become authored content. Use native buttons for keyboard support. The buttons do nothing yet.
<!-- /library -->

<!-- library:lit -->
The interface needs a question, two buttons, and an output. The [complete script](#complete-script) also includes basic styles.


Replace `render()` with this template. Lit creates and updates the shadow DOM for you:

```js
render() {
  return html`
    <p>The Moon is a star.</p>
    <div class="controls">
      <button type="button" value="true">True</button>
      <button type="button" value="false">False</button>
    </div>
    <output aria-live="polite"></output>`
}
```

Define shadow styles through `static styles = css` and a CSS template. Import `LitElementWw` from `@webwriter/lit`, and import `html` and `css` from `lit`; the complete script includes a starting stylesheet.


Keep controls in shadow DOM so they do not become authored content. Use native buttons for keyboard support. The buttons do nothing yet.
<!-- /library -->

<!-- library:react -->
<!-- include:../examples/react/02-rendering.md -->

Keep controls in shadow DOM so they do not become authored content. Use native buttons for keyboard support. The buttons do nothing yet.

After editing the source, run `npm run build` before refreshing your local package. The embedded preview builds its imports automatically.
<!-- /library -->

<!-- library:vue -->
<!-- include:../examples/vue/02-rendering.md -->

Keep controls in shadow DOM so they do not become authored content. Use native buttons for keyboard support. The buttons do nothing yet.

Replace `ww-quiz.vue` with this step’s complete component and `ww-quiz.js` with its registration module. Keep the component import in the registration module set to `./ww-quiz.vue`. After editing either file, run `npm run build` before refreshing your local package. The embedded preview compiles them automatically.
<!-- /library -->

<!-- library:angular -->
<!-- include:../examples/angular/02-rendering.md -->

Keep controls in shadow DOM so they do not become authored content. Use native buttons for keyboard support. The buttons do nothing yet.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<!-- library:svelte -->
<!-- include:../examples/svelte/02-rendering.md -->

Keep controls in shadow DOM so they do not become authored content. Use native buttons for keyboard support. The buttons do nothing yet.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/02-rendering.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/02-rendering.js -->
<!-- /library -->

</details>

<iframe title="Step 2: question and controls" src="../examples/preview.html?step=2" width="100%" height="210" loading="lazy"></iframe>

Next: [add editable content](03-content.md).
