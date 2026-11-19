# Font menu previews

These WebP sprites render the family names in the [Bunny Fonts catalog](https://fonts.bunny.net/list), using each family's normal face (or italic if that is its only style) at the weight closest to 400. They contain rendered text, not font binaries. Font selection continues to use Bunny Fonts stylesheets.

The chunking approach follows [paper-design/google-fonts-scripts](https://github.com/paper-design/google-fonts-scripts), referenced in [issue #530](https://github.com/webwriter-app/webwriter/issues/530). These assets are generated directly from Bunny's catalog so preview names match the picker.

Run `node scripts/font-previews.mjs` from `@webwriter/domeditor` with Node 22, network access, and Google Chrome installed. Set `CHROME_BIN` if Chrome is elsewhere. No API key or additional dependencies are needed. The script uses a disposable browser profile and a loopback-only server, and replaces the assets only after the whole catalog succeeds.

Each chunk contains up to 50 rows at twice the displayed resolution. `metadata.json` records the sorted family names and dimensions. The menu uses native lazy image loading and crops the corresponding row; a plain text label remains available to assistive technology and when an image fails or a newly added family has no bundled preview. Regenerate the sprites when updating catalog coverage. Vite fingerprints the images for cache invalidation.
