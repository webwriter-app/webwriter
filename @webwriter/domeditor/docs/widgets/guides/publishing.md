# Publish a widget

Publication makes a widget available for installation in an authoring tool. The browser-ready custom element can also run on another site. An embedded widget can save reader results in the browser or at a configured endpoint.

![A widget package uploaded to a registry shelf](../../images/widgets/publishing.svg)

## Package and publish

Before publication, load the widget from a local folder. Do the [widget checks](testing.md).

1. Set a [scoped package name](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/), a SemVer version, and the `webwriter-widget` keyword.
2. Export `./widgets/<tag-name>.js` or `./widgets/<tag-name>.*`. The script must define the same tag.
3. If the source requires compilation, run `npx @webwriter/build`.
4. Run [`npm pack --dry-run`](https://docs.npmjs.com/cli/v11/commands/npm-pack/).
5. Make sure that the package includes all scripts, styles, files, and configuration that the widget uses.
6. Declare the runtime dependencies in the package manifest.
7. Sign in to npm.
8. Run [`npm publish --access public`](https://docs.npmjs.com/cli/v11/commands/npm-publish/).

An origami viewer, for example, can export `./widgets/ww-origami-viewer.*` and include its fold diagrams in the package. Add a short `README.md`, a description, author information, and a license. After publication, find the widget in the authoring tool. Insert the widget into a new document.

For each update, increase the package version. Add a [migration](migrations.md) if the saved content must change. See the [package manifest reference](../reference/distribution.md) for the export format and discovery keywords.

## Embed on another site

Load the widget's browser-ready module on the host page. Insert the custom element. In this example, a field journal stores a note in a JSON data block. The `WidgetDrawer` can save the note in the browser or send it to an HTTP endpoint. Give each embedded widget a stable, unique `id`. Browser storage uses this ID to find the result when the page loads again.

Bundle the widget's dependencies into browser-ready modules. If the module uses bare imports such as `@webwriter/lit`, define them in an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap). Load the import map before the widget. Use a fixed package version in the embed.

```html
<script type="module" src="./widgets/ww-field-journal.js"></script>
<ww-field-journal id="garden-notes" standalone>
  <script type="application/json" slot="data">{"note":"Watch the first crocus open."}</script>
</ww-field-journal>
```

The widget uses the data methods from `LitElementWw`. It registers the drawer in its scoped registry.

```js
import {LitElementWw, WidgetDrawer} from "@webwriter/lit"
import {html} from "lit"

class WwFieldJournal extends LitElementWw {
  static scopedElements = {"ww-widget-drawer": WidgetDrawer}
  static properties = {note: {state: true}}

  constructor() {
    super()
    this.note = ""
  }

  dataChanged(rawText) {
    try { this.note = JSON.parse(rawText || "{}").note || "" }
    catch { this.note = "" }
  }

  save(event) {
    if(!this.dataReady || this.editable) return
    const data = JSON.parse(this.data || "{}")
    this.data = JSON.stringify({...data, note: event.target.value})
  }

  render() {
    return html`
      <label for="note">Field note</label>
      <textarea id="note" .value=${this.note} @input=${this.save}></textarea>
      <ww-widget-drawer .widget=${this}></ww-widget-drawer>`
  }
}

customElements.define("ww-field-journal", WwFieldJournal)
```

Write a note. Reload the preview. Make sure that the browser restores the note.

[Open the standalone preview](../examples/preview.html?guide=publishing) · [View the example source](../examples/guide-publishing.js)

<iframe title="Standalone field journal" src="../examples/preview.html?guide=publishing" width="100%" height="360" loading="lazy"></iframe>

An empty `standalone` value selects browser storage. To use a remote destination, set `standalone` to the endpoint URL. When the reader changes destinations, the drawer restores the result for the new destination. The saved result stays in its original destination. See [standalone storage](../reference/standalone.md#http-endpoint) for the endpoint requirements.

Browser storage applies to the current browser profile. Use an authenticated server if the same reader needs access to results on different devices.

## Package checks before release

## Storage destinations for embedded widgets
