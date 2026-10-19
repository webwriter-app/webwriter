# 7. Test and publish

<!-- library:vanilla -->
Copy the [complete final source](#complete-script) into `ww-quiz.js` in your widget folder. These browser-JavaScript examples need no build step.
<!-- /library -->

<!-- library:lit -->
Copy the [complete final source](#complete-script) into `ww-quiz.js` in your widget folder. These browser-JavaScript examples need no build step.
<!-- /library -->

<!-- library:react -->
Copy the [complete final source](#complete-script) into `ww-quiz.jsx` in your widget folder. Keep the build script from setup and run `npm run build` to regenerate `dist/ww-quiz.js` before testing or publishing. The test imports this built export.
<!-- /library -->

<!-- library:vue -->
Save the [complete final component](#complete-script) as `ww-quiz.vue` and its registration module as `ww-quiz.js`. Change its component import to `./ww-quiz.vue`. Keep the build scripts from setup and run `npm run build` before testing or publishing. The test imports `dist/ww-quiz.js`.
<!-- /library -->

<!-- library:angular -->
Copy the [complete final source](#complete-script) into `ww-quiz.ts` in your widget folder. Keep the build script from setup and run `npm run build` to regenerate `dist/ww-quiz.js` before testing or publishing. The test imports this built export.
<!-- /library -->

<!-- library:svelte -->
Copy the [complete final source](#complete-script) into `ww-quiz.svelte` in your widget folder. Keep the build script from setup and run `npm run build` to regenerate `dist/ww-quiz.js` before testing or publishing. The test imports this built export.
<!-- /library -->

Save this as `quiz-tests.js` and export it under `./tests/quiz.js`:

<!-- script:../examples/quiz-tests.js -->

Run the module from **Developer console → Tests**. Also check the question and correct answer after saving and reopening, undo and redo, narrow layouts, and two participants using shared answers.

Use the [final manifest](../examples/package.json) for the export paths and editing configuration. Copy [the snippet](../examples/quiz.html) and [the test module](../examples/quiz-tests.js) alongside your widget. Insert **Quiz with question** to try the default question and data block.

Run `npm pack --dry-run` to check the files, then publish with `npm publish --access public` after choosing your own package name and adding license and author information. Include each manifest's exported files, and rebuild compiled widgets before packing.

[Open the finished widget](../examples/preview.html?step=6)

<iframe title="Finished quiz widget" src="../examples/preview.html?step=6" width="100%" height="410" loading="lazy"></iframe>

Next: [guides](../guides/index.md) for additional features, or [reference](../reference/index.md) for the full interface.

<details id="complete-script">
<summary>Complete script</summary>

<!-- script:../examples/06-collaboration.js -->

<!-- library:vue -->
**Registration module**

<!-- script:../examples/vue/06-collaboration.js -->
<!-- /library -->

</details>
