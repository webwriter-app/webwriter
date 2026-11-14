# 5. Build and distribution

[Manage dependencies](../guides/libraries.md)

Package Ghost Disco so it can load in WebWriter and on a standalone page.

## Build the browser module

Bundle the widget and its dependencies into `dist/ww-ghost-disco.js`. Run the build script from the previous step after any change to the widget.

Check that `dist/ww-ghost-disco.js` exists, then refresh the local package in WebWriter and try the invitation and dance controls.

**Terminal**

```sh prompt
npm run build
```

## Check the package contents

Make sure the package archive includes the widget module. Add `dist/` to the manifest’s `files` list and check the result with `npm pack --dry-run`.

**`package.json`**

```json package
{
  "files": [
    "dist/"
  ]
}
```

**Terminal**

```sh prompt
npm pack --dry-run
```

## Load the build on a page

Check that readers can choose a move on a standalone page. Use the invitation and data block from step 4. Serve `index.html` beside the `dist` directory, open it through your local HTTP server, and try **Float** or **Twirl**.

**`index.html`**

```html
<script type="module" src="./dist/ww-ghost-disco.js"></script>
<ww-ghost-disco id="ghost-disco" shared>
  <p>Join the midnight dance party.</p>
  <script type="application/json" slot="data">{"move":""}</script>
</ww-ghost-disco>
```

## Results

<!-- live-example: Ghost Disco -->

<!-- live-package: 01-setup.md 02-rendering.md 04-state.md . -->

<!-- live-file: react build.mjs ../examples/react/build.mjs -->

<!-- live-file: vue build.mjs ../examples/vue/build.mjs -->

<!-- live-file: angular build.mjs ../examples/angular/build.mjs -->

<!-- live-file: svelte build.mjs ../examples/svelte/build.mjs -->

<!-- live-file: vanilla build.mjs ../examples/disco/build.mjs -->

<!-- live-file: lit build.mjs ../examples/disco/build.mjs -->

<!-- live-file: vue compile.mjs ../examples/vue/compile.mjs -->

<!-- live-source: vanilla ../examples/disco/04-disco-sharing.js -->

<!-- live-source: lit ../examples/disco/lit/04-disco-sharing.js -->

<!-- live-source: react ../examples/disco/react/04-disco-sharing.jsx -->

<!-- live-source: vue ../examples/disco/vue/04-disco-sharing.vue -->

<!-- live-source: vue-registration ../examples/disco/vue/04-disco-sharing.js -->

<!-- live-source: angular ../examples/disco/angular/04-disco-sharing.ts -->

<!-- live-source: svelte ../examples/disco/svelte/04-disco-sharing.svelte -->

<!-- live-source: shared-disco-reading ../examples/disco/reading.js -->

```html shared
<ww-ghost-disco id="ghost-disco" shared>
  <p>Join the midnight dance party.</p>
  <script type="application/json" slot="data">{"move":""}</script>
</ww-ghost-disco>
```

<!-- /live-example -->
