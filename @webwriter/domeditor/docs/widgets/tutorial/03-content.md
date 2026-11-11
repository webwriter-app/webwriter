# 3. Add editable content

Replace the fixed invitation with a default `<slot>`. Authors can now edit the invitation in the document, and the shadow DOM displays the authored children in place. Put a fallback invitation inside the slot for empty widgets.

```html
<ww-ghost-disco>
  <p>Join the midnight dance party.</p>
</ww-ghost-disco>
```

Add this top-level `editingConfig` to the package manifest so WebWriter allows editable paragraphs inside the widget.

```json
{
  "editingConfig": {
    "./widgets/ww-ghost-disco": {"label": "Ghost Disco", "content": "p+"}
  }
}
```

Replace the previous source with this step’s complete script. For Vue, replace the component and registration module and keep the component import set to `./ww-ghost-disco.vue`. Rebuild compiled versions before refreshing the local package.

[Open the preview](../examples/preview.html?example=ghost-disco&step=3)

<iframe title="Ghost Disco · Add editable content" src="../examples/preview.html?example=ghost-disco&amp;step=3" width="100%" height="360" loading="lazy"></iframe>

Next: [4. Add interactions and state](04-state.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/03-disco-content.js -->

<!-- library:vue -->
**Vue registration module**

<!-- script:../examples/vue/03-disco-content.js -->
<!-- /library -->

</details>
