# 5. Expose options and actions

Declare a select option for `lighting` so authors can switch between Moonlight and Neon in the Widget drawer. Put it in a **Disco settings** group, next to a **Reset lighting** action.

WebWriter writes the `lighting` attribute and reads the matching property to display the current option. Implement `resetLighting()` to restore `moonlight`. Try the option and action on an inserted widget in WebWriter, then undo the changes. The standalone preview shows the reader interaction.

Replace the previous source with this step’s complete script. For Vue, replace the component and registration module and keep the component import set to `./ww-ghost-disco.vue`. Rebuild compiled versions before refreshing the local package.

[Open the preview](../examples/preview.html?example=ghost-disco&step=5)

<iframe title="Ghost Disco · Expose options and actions" src="../examples/preview.html?example=ghost-disco&amp;step=5" width="100%" height="360" loading="lazy"></iframe>

Next: [6. Support collaboration](06-collaboration.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/05-disco-options.js -->

<!-- library:vue -->
**Vue registration module**

<!-- script:../examples/vue/05-disco-options.js -->
<!-- /library -->

</details>
