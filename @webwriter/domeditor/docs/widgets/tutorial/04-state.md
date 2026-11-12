# 4. Add interactions and state

Define a [reflected `lighting` property](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Reflected_attributes) with two values, `moonlight` and `neon`. WebWriter saves this setting in the `lighting` HTML attribute. Update the display when the attribute changes. Use Moonlight when the attribute is missing.

```html
<ww-ghost-disco lighting="neon"><p>Join the midnight dance party.</p></ww-ghost-disco>
```

At this step, the widget keeps the selected dance move in temporary state. Set the move when the reader selects a button. Update the ghost's pose and the status text for that move. Set [`aria-pressed`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed) to `true` on the selected button. Select **Float** in the preview. Then select **Twirl**.

Read [`isContentEditable`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/isContentEditable) to check if the widget is editable. Show the invitation in edit mode. Hide the reader controls in this mode.

<!-- library:lit optional -->
`LitElementWw` exposes the editing state through its `editable` property.
<!-- /library -->

Replace the previous source with the complete script for this step. If your package uses a build step, build it again. Then refresh the local package.

<!-- library:vue optional -->
Replace both the component and its registration module. Keep the component import set to `./ww-ghost-disco.vue`.
<!-- /library -->

[Open the preview](../examples/preview.html?example=ghost-disco&step=4)

<iframe title="Ghost Disco · Add interactions and state" src="../examples/preview.html?example=ghost-disco&amp;step=4" width="100%" height="360" loading="lazy"></iframe>

Continue with [5. Expose options and actions](05-options.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/04-disco-state.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/04-disco-state.js -->
<!-- /library -->

</details>
