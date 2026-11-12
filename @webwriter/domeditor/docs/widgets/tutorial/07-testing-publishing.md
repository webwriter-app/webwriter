# 7. Test and publish

Keep the finished source from step 6. Save the [final manifest](../examples/ghost-disco-package.json) as `package.json`, then add the [invitation snippet](../examples/ghost-disco.html) and the [test module](../examples/ghost-disco-tests.js) beside it. If your version uses a build script, rebuild the widget first.

The snippet includes the editable invitation and a data block. Insert **Ghost Disco with invitation** to try it. Run the package test in **Developer console → Tests**. It checks that the widget restores lighting from HTML and reacts when that attribute changes.

Also check saving and reopening, undo and redo, and a narrow document layout. Use the preview to verify that both participants see the same move.

Choose your own npm package name and add license and author information before publishing. Run `npm pack --dry-run` to check that the package contains the files referenced by the manifest. When it is ready, publish with `npm publish --access public`.

[Open the preview](../examples/preview.html?example=ghost-disco&step=6)

<iframe title="Finished Ghost Disco" src="../examples/preview.html?example=ghost-disco&amp;step=6" width="100%" height="360" loading="lazy"></iframe>

Next: [Guides](../guides/index.md) or [Interface reference](../reference/index.md).

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/06-disco-collaboration.js -->

<!-- library:vue -->
**Vue registration module**

<!-- script:../examples/vue/06-disco-collaboration.js -->
<!-- /library -->

</details>
