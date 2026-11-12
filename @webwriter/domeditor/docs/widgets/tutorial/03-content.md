# 3. Add editable content

Replace the fixed invitation with a default [`<slot>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot). The slot displays the widget's child elements in the [shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM). The child elements stay in the light DOM. Authors can edit them in the document. Add a default invitation inside the slot. The slot displays this invitation when the widget has no child content.

```html
<ww-ghost-disco>
  <p>Join the midnight dance party.</p>
</ww-ghost-disco>
```

Add `editingConfig` at the top level of the [package manifest](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/). This configuration lets authors edit paragraphs in the widget in WebWriter.

```json
{
  "editingConfig": {
    "./widgets/ww-ghost-disco": {"label": "Ghost Disco", "content": "p+"}
  }
}
```

Replace the previous source with the complete script for this step. If your package uses a build step, build it again. Then refresh the local package.

<!-- library:vue optional -->
Replace both the component and its registration module. Keep the component import set to `./ww-ghost-disco.vue`.
<!-- /library -->

[Open the preview](../examples/preview.html?example=ghost-disco&step=3)

<iframe title="Ghost Disco · Add editable content" src="../examples/preview.html?example=ghost-disco&amp;step=3" width="100%" height="360" loading="lazy"></iframe>

Continue with [4. Add interactions and state](04-state.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/03-disco-content.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/03-disco-content.js -->
<!-- /library -->

</details>
