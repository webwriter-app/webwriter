# 7. Test and publish

Keep the source from step 6. Save the [final manifest](../examples/ghost-disco-package.json) as `package.json`. Add the [invitation snippet](../examples/ghost-disco.html) beside it. Add the [test module](../examples/ghost-disco-tests.js) in the same folder. If your package uses a build step, build the widget before you test it.

The snippet contains the editable invitation and a data block. Insert **Ghost Disco with invitation** to test the snippet. Run the package test in **Developer console → Tests**. The test checks that the widget reads the initial lighting from HTML. It also checks that the widget responds to a change in the attribute.

Save the document. Open it again. Test **Undo** and **Redo**. Test the layout in a narrow document. In the preview, make sure that both participants see the same move.

Select an [npm package name](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#name). Add the license and author information. Run [`npm pack --dry-run`](https://docs.npmjs.com/cli/v11/commands/npm-pack/). Make sure that the package contains each file that the manifest specifies. Publish the package with [`npm publish --access public`](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

[Open the preview](../examples/preview.html?example=ghost-disco&step=6)

<iframe title="Finished Ghost Disco" src="../examples/preview.html?example=ghost-disco&amp;step=6" width="100%" height="360" loading="lazy"></iframe>

Continue with [Guides](../guides/index.md) or [Interface reference](../reference/index.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/06-disco-collaboration.js -->

<!-- library:vue optional -->
**Vue registration module**

<!-- script:../examples/vue/06-disco-collaboration.js -->
<!-- /library -->

</details>
