# 3. Add editable content

<!-- library:vanilla -->
Let the author supply the question. Replace the shadow template's question with a slot:

```html
<slot><p>Add a question.</p></slot>
```

Add this top-level field to `package.json`:

```json
"editingConfig": {
  "./widgets/ww-quiz": {"content": "p+"}
}
```

The editor can now edit paragraphs inside the widget. In the developer console's HTML view, give the widget a question:

```html
<ww-quiz><p>The Moon is a star.</p></ww-quiz>
```

The slot displays the paragraph without copying it into shadow DOM. If another editor changes the question, the displayed content changes too.
<!-- /library -->

<!-- library:lit -->
Let the author supply the question. Replace the shadow template's question with a slot:

```html
<slot><p>Add a question.</p></slot>
```

Add this top-level field to `package.json`:

```json
"editingConfig": {
  "./widgets/ww-quiz": {"content": "p+"}
}
```

The editor can now edit paragraphs inside the widget. In the developer console's HTML view, give the widget a question:

```html
<ww-quiz><p>The Moon is a star.</p></ww-quiz>
```

The slot displays the paragraph without copying it into shadow DOM. If another editor changes the question, the displayed content changes too.
<!-- /library -->

<!-- library:react -->
<!-- include:../examples/react/03-content.md -->

Add this top-level field to `package.json`:

```json
"editingConfig": {
  "./widgets/ww-quiz": {"content": "p+"}
}
```

The editor can now edit paragraphs inside the widget. Give the widget an authored question:

```html
<ww-quiz><p>The Moon is a star.</p></ww-quiz>
```

The slot displays the paragraph without copying it into shadow DOM. Later document edits update the displayed question too.

After editing the source, run `npm run build` before refreshing your local package. The embedded preview builds its imports automatically.
<!-- /library -->

<!-- library:vue -->
<!-- include:../examples/vue/03-content.md -->

Add this top-level field to `package.json`:

```json
"editingConfig": {
  "./widgets/ww-quiz": {"content": "p+"}
}
```

The editor can now edit paragraphs inside the widget. Give the widget an authored question:

```html
<ww-quiz><p>The Moon is a star.</p></ww-quiz>
```

The slot displays the paragraph without copying it into shadow DOM. Later document edits update the displayed question too.

Replace `ww-quiz.vue` with this step’s complete component and `ww-quiz.js` with its registration module. Keep the component import in the registration module set to `./ww-quiz.vue`. After editing either file, run `npm run build` before refreshing your local package. The embedded preview compiles them automatically.
<!-- /library -->

<!-- library:angular -->
<!-- include:../examples/angular/03-content.md -->

Add this top-level field to `package.json`:

```json
"editingConfig": {
  "./widgets/ww-quiz": {"content": "p+"}
}
```

The editor can now edit paragraphs inside the widget. Give the widget an authored question:

```html
<ww-quiz><p>The Moon is a star.</p></ww-quiz>
```

The slot displays the paragraph without copying it into shadow DOM. Later document edits update the displayed question too.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<!-- library:svelte -->
<!-- include:../examples/svelte/03-content.md -->

Add this top-level field to `package.json`:

```json
"editingConfig": {
  "./widgets/ww-quiz": {"content": "p+"}
}
```

The editor can now edit paragraphs inside the widget. Give the widget an authored question:

```html
<ww-quiz><p>The Moon is a star.</p></ww-quiz>
```

The slot displays the paragraph without copying it into shadow DOM. Later document edits update the displayed question too.

After editing your source, run `npm run build` before refreshing the local package. The embedded preview compiles it automatically.
<!-- /library -->

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/03-content.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/03-content.js -->
<!-- /library -->

</details>

[Open preview](../examples/preview.html?step=3)

<iframe title="Step 3: slotted question" src="../examples/preview.html?step=3" width="100%" height="210" loading="lazy"></iframe>

Next: [add interactions and state](04-state.md).
