# 4. Add interactions and state

The author’s lighting belongs in a reflected `lighting` property with two values, `moonlight` and `neon`. This setting is an HTML attribute, so it survives saving and responds to changes made by WebWriter. Use Moonlight when the attribute is missing.

```html
<ww-ghost-disco lighting="neon"><p>Join the midnight dance party.</p></ww-ghost-disco>
```

The selected dance move starts as temporary widget state. Connect the buttons so that each sets the move, changes the ghost’s pose, updates the status text, and marks the selected button with `aria-pressed`. Try **Float** and **Twirl** in the preview.

While the document is editable, show the author’s invitation and hide the reader controls. The widget can read its editing state through `isContentEditable`, or through `editable` in `LitElementWw`.

Replace the previous source with this step’s complete script. For Vue, replace the component and registration module and keep the component import set to `./ww-ghost-disco.vue`. Rebuild compiled versions before refreshing the local package.

[Open the preview](../examples/preview.html?example=ghost-disco&step=4)

<iframe title="Ghost Disco · Add interactions and state" src="../examples/preview.html?example=ghost-disco&amp;step=4" width="100%" height="360" loading="lazy"></iframe>

Next: [5. Expose options and actions](05-options.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/04-disco-state.js -->

<!-- library:vue -->
**Vue registration module**

<!-- script:../examples/vue/04-disco-state.js -->
<!-- /library -->

</details>
