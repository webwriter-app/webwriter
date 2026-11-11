# 2. Render the interface

Build the dance floor inside the widget’s shadow root. Include the invitation, the ghost, and two native buttons named **Float** and **Twirl**. An `output` with `aria-live="polite"` will announce the current move when we wire up the buttons.

Start with Moonlight colors and let the controls wrap when the widget is narrow. The ghost emoji is decorative because the buttons and output describe the interaction in text.

Replace the previous source with this step’s complete script. For Vue, replace the component and registration module and keep the component import set to `./ww-ghost-disco.vue`. Rebuild compiled versions before refreshing the local package.

[Open the preview](../examples/preview.html?example=ghost-disco&step=2)

<iframe title="Ghost Disco · Render the interface" src="../examples/preview.html?example=ghost-disco&amp;step=2" width="100%" height="360" loading="lazy"></iframe>

Next: [3. Add editable content](03-content.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/02-disco-rendering.js -->

<!-- library:vue -->
**Vue registration module**

<!-- script:../examples/vue/02-disco-rendering.js -->
<!-- /library -->

</details>
