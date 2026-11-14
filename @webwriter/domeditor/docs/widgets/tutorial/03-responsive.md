# 3. Presentation

[Make layouts responsive](../guides/responsiveness.md)

Fit the dance controls to the width of the widget so they work in a narrow column on a wide page.

## Stack the buttons in a narrow widget

Stack the buttons in a grid to fit narrow layouts. Append these rules to the shadow styles from step 2 to make the host a size container. Keep the hidden rule for Editing mode.

<!-- library:vanilla optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:lit optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:react optional -->
**`ww-ghost-disco.jsx`**
<!-- /library -->

<!-- library:vue optional -->
**`ww-ghost-disco.vue`**
<!-- /library -->

<!-- library:angular optional -->
**`ww-ghost-disco.ts`**
<!-- /library -->

<!-- library:svelte optional -->
**`ww-ghost-disco.svelte`**
<!-- /library -->

```css
:host { container-type: inline-size; }
.controls { display: grid; }
.controls[hidden] { display: none; }
```

## Use a row when there is room

Arrange the buttons in a row once the widget is at least `24rem` wide. Add this container query after the grid rule.

<!-- library:vanilla optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:lit optional -->
**`ww-ghost-disco.js`**
<!-- /library -->

<!-- library:react optional -->
**`ww-ghost-disco.jsx`**
<!-- /library -->

<!-- library:vue optional -->
**`ww-ghost-disco.vue`**
<!-- /library -->

<!-- library:angular optional -->
**`ww-ghost-disco.ts`**
<!-- /library -->

<!-- library:svelte optional -->
**`ww-ghost-disco.svelte`**
<!-- /library -->

```css
@container (min-width: 24rem) {
  .controls { display: flex; justify-content: center; }
}
```

## Check both widths

Check that the buttons switch from a column to a row as the widget widens. Put the widget in this wrapper, switch to **Reading** in the result, and change `18rem` to `32rem` in **HTML**.

**`index.html`**

```html
<div style="max-inline-size: 18rem">
  <ww-ghost-disco>
    <p>Join the midnight dance party.</p>
  </ww-ghost-disco>
</div>
```

## Results

<!-- live-example: Ghost Disco · Presentation -->

<!-- live-package: 01-setup.md 02-rendering.md -->

<!-- live-file: react build.mjs ../examples/react/build.mjs -->

<!-- live-file: vue build.mjs ../examples/vue/build.mjs -->

<!-- live-file: angular build.mjs ../examples/angular/build.mjs -->

<!-- live-file: svelte build.mjs ../examples/svelte/build.mjs -->

<!-- live-file: vue compile.mjs ../examples/vue/compile.mjs -->

<!-- live-source: vanilla ../examples/disco/04-disco-responsive.js -->

<!-- live-source: lit ../examples/disco/lit/04-disco-responsive.js -->

<!-- live-source: react ../examples/disco/react/04-disco-responsive.jsx -->

<!-- live-source: vue ../examples/disco/vue/04-disco-responsive.vue -->

<!-- live-source: vue-registration ../examples/disco/vue/04-disco-responsive.js -->

<!-- live-source: angular ../examples/disco/angular/04-disco-responsive.ts -->

<!-- live-source: svelte ../examples/disco/svelte/04-disco-responsive.svelte -->

```html
<div style="max-inline-size: 18rem">
  <ww-ghost-disco>
    <p>Join the midnight dance party.</p>
  </ww-ghost-disco>
</div>
```

<!-- /live-example -->
