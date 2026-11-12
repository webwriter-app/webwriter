# 2. Render the interface

Put the dance floor in the widget's [shadow root](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot). Add the invitation, the ghost, and the **Float** and **Twirl** buttons. Add an [`output` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/output) with [`aria-live="polite"`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-live). This element announces the current move after you add the button actions in step 4.

Set the initial lighting to Moonlight. Let the controls wrap when the widget is narrow. The ghost emoji is decorative. The buttons and output show the same information in text.

Replace the previous source with the complete script for this step. If your package uses a build step, build it again. Then refresh the local package.

<!-- library:vue optional -->
Replace both the component and its registration module. Keep the component import set to `./ww-ghost-disco.vue`.
<!-- /library -->

[Open the preview](../examples/preview.html?example=ghost-disco&step=2)

<iframe title="Ghost Disco · Render the interface" src="../examples/preview.html?example=ghost-disco&amp;step=2" width="100%" height="360" loading="lazy"></iframe>

Continue with [3. Add editable content](03-content.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/02-disco-rendering.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/02-disco-rendering.js -->
<!-- /library -->

</details>
