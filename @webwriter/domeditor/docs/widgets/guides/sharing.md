# Share participant data

Set `sharedData: true` in the widget's [editing configuration](../reference/editing-configuration.md). Add one direct data block to the widget's authored HTML, for example in a snippet:

```html
<ww-quiz shared>
  <p>The Moon is a star.</p>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

Listen for `datachange` on the widget. Check that the event belongs to its current direct data block before reading it. Wait for the initial event before writing; writes during initial connection can be discarded.

```js
const block = this.querySelector(':scope > script[slot="data"]')
if(block) {
  const state = JSON.parse(block.textContent)
  block.textContent = JSON.stringify({...state, choice: "false"})
}
```

Use this write in an interaction after initialization. Render accepted local changes and remote changes from `datachange`; do not write state back while rendering. Handle `dataerror` to show a useful message.

| Attribute | Scope |
|---|---|
| No `shared` | The current participant. |
| `shared` or `shared=""` | Everyone. |
| `shared="group"` | The participant's server-assigned group. |

Switching scope loads its existing state or the authored defaults. It does not copy answers. The **Share** control exposes grouping where a connected server provides a roster. Preserve any direct `ww-grouping` processing instruction when changing children.

See the [data reference](../reference/data.md) and [working tutorial](../tutorial/06-collaboration.md). The [runtime configuration](../../../README.md#scoped-widget-data) explains server and offline persistence setup.
