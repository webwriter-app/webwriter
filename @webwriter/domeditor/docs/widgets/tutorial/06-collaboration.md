# 6. Support collaboration

Store the selected move in a [scoped data block](../guides/sharing.md). Set `sharedData: true` beside `content` in the widget's editing configuration. Add the [JSON script](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script#embedding_data_in_html) as a direct child of the widget.

```html
<ww-ghost-disco lighting="moonlight" shared>
  <p>Join the midnight dance party.</p>
  <script type="application/json" slot="data">{"move":""}</script>
</ww-ghost-disco>
```

Add the `shared` attribute to let participants share a move. For separate selections, use the widget without the `shared` attribute. The lighting and invitation stay in the document.

Wait for the initial data before you enable the controls. Use the widget data events to update the display. Read the current data block when a reader selects a move. Change the `move` field. Write the updated data to the same block. During rendering, only read the data.

<!-- library:lit optional -->
`LitElementWw` supplies the `dataReady` and `data` properties. It also supplies methods for changes to the data.
<!-- /library -->

Select a move in either preview panel. Make sure that both ghosts show the same pose. An HTML export keeps the initial data from the document.

Replace the previous source with the complete script for this step. If your package uses a build step, build it again. Then refresh the local package.

<!-- library:vue optional -->
Replace both the component and its registration module. Keep the component import set to `./ww-ghost-disco.vue`.
<!-- /library -->

[Open the preview](../examples/preview.html?example=ghost-disco&step=6)

<iframe title="Ghost Disco · Support collaboration" src="../examples/preview.html?example=ghost-disco&amp;step=6" width="100%" height="360" loading="lazy"></iframe>

Continue with [7. Test and publish](07-testing-publishing.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/06-disco-collaboration.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/06-disco-collaboration.js -->
<!-- /library -->

</details>
