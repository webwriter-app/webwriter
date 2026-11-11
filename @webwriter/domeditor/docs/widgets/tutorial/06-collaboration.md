# 6. Support collaboration

Move the reader’s selection into a direct [scoped data block](../guides/sharing.md). Set `sharedData: true` beside `content` in the widget’s editing configuration, then add an inert JSON script to the authored HTML.

```html
<ww-ghost-disco lighting="moonlight" shared>
  <p>Join the midnight dance party.</p>
  <script type="application/json" slot="data">{"move":""}</script>
</ww-ghost-disco>
```

With `shared` present, participants can share a dance move. Leave it out to give each participant their own selection. The lighting and invitation remain part of the authored document.

Wait until the runtime delivers the initial snapshot. Read accepted updates and render the corresponding move. On a click, read the current block, update its `move` field, and write it back. Rendering only reads the snapshot. In Lit, `LitElementWw` supplies `dataReady`, `data`, and the data lifecycle methods. The other versions listen for the widget data events.

Choose a move in either preview panel. Both ghosts should strike the same pose. These panels use the scoped-data runtime with an in-memory connection. Normal HTML exports retain the authored data default.

Replace the previous source with this step’s complete script. For Vue, replace the component and registration module and keep the component import set to `./ww-ghost-disco.vue`. Rebuild compiled versions before refreshing the local package.

[Open the preview](../examples/preview.html?example=ghost-disco&step=6)

<iframe title="Ghost Disco · Support collaboration" src="../examples/preview.html?example=ghost-disco&amp;step=6" width="100%" height="360" loading="lazy"></iframe>

Next: [7. Test and publish](07-testing-publishing.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/06-disco-collaboration.js -->

<!-- library:vue -->
**Vue registration module**

<!-- script:../examples/vue/06-disco-collaboration.js -->
<!-- /library -->

</details>
