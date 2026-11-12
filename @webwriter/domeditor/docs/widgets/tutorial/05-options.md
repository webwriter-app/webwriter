# 5. Expose options and actions

Declare a [select option](../reference/options-actions.md#option-declaration) for `lighting`. The option lets authors select Moonlight or Neon in the Widget drawer. Put the option and the **Reset lighting** action in the **Disco settings** group.

The option changes the `lighting` attribute. The matching property gives the current value. Implement `resetLighting()` to set the value to `moonlight`.

Insert the widget in WebWriter. Test the lighting option. Test the **Reset lighting** action. Undo the changes. The standalone preview shows the controls for readers.

Replace the previous source with the complete script for this step. If your package uses a build step, build it again. Then refresh the local package.

<!-- library:vue optional -->
Replace both the component and its registration module. Keep the component import set to `./ww-ghost-disco.vue`.
<!-- /library -->

[Open the preview](../examples/preview.html?example=ghost-disco&step=5)

<iframe title="Ghost Disco · Expose options and actions" src="../examples/preview.html?example=ghost-disco&amp;step=5" width="100%" height="360" loading="lazy"></iframe>

Continue with [6. Support collaboration](06-collaboration.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/05-disco-options.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/05-disco-options.js -->
<!-- /library -->

</details>
