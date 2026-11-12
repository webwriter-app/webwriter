# Share participant data

A widget can keep separate data for each participant or share data with a group or everyone. In a managed session, participants in the same scope can see one another's updates. Authors can select a scope for individual or group work.

![Two participants linked to one shared tally](../../images/widgets/sharing.svg)

Set `sharedData: true` in the [editing configuration](../reference/editing-configuration.md). Add one direct [data block](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script#embedding_data_in_html) to the authored HTML. A snippet can supply this block.

```html
<ww-counter shared>
  <script type="application/json" slot="data">{"count":0}</script>
</ww-counter>
```

<!-- library:vanilla -->
Listen for `datapending` and `datachange` on the widget. When the widget connects or replaces the direct data block, dispatch a [bubbling, cancelable](https://developer.mozilla.org/en-US/docs/Web/API/Event/Event) `datarequest` on the current block. The runtime reports the current pending, ready, or error state.

`datapending` also occurs when the scope starts to change. `datachange` shows that the accepted data is ready. Make sure that each event is for the current direct data block. Wait for `datachange` before you write. An early write can be lost.

```js
const block = this.querySelector(':scope > script[slot="data"]')
if(block) {
  const state = JSON.parse(block.textContent)
  const count = typeof state.count === "number" ? state.count : 0
  block.textContent = JSON.stringify({...state, count: count + 1})
}
```

Write from an interaction after the data is ready. Use `datachange` to show accepted local and remote changes. Keep the stored data unchanged when you render it. Use `dataerror` to show an error message.

<!-- /library -->
<!-- library:lit -->
Use the `dataPending`, `dataChanged`, and `dataError` methods from `LitElementWw` to handle data updates. Wait for `this.dataReady` before an interaction writes through `this.data`. The base class handles data requests and scope changes. The complete example shows the three methods.
<!-- /library -->

| Attribute | Scope |
|---|---|
| No `shared` | The current participant. |
| `shared` or `shared=""` | Everyone. |
| `shared="group"` | The participant's server-assigned group. |

When the scope changes, the widget gets the saved data for that scope or the authored defaults. The **Share** control shows group options when the server supplies a participant list. Keep any direct `ww-grouping` processing instruction when you change child nodes.

The [data reference](../reference/data.md) describes the data interface. The [tutorial](../tutorial/06-collaboration.md) gives a complete example.

<!-- library:lit optional -->
## Handler methods with LitElementWw

`LitElementWw` requests the current state and reports when the data is ready. Implement the data handlers. Use `data` to write changes from an interaction.

```js
import {LitElementWw} from "@webwriter/lit"
import {html} from "lit"

class WwCounter extends LitElementWw {
  static properties = {count: {state: true}, error: {state: true}}

  constructor() {
    super()
    this.count = 0
    this.error = ""
  }

  dataPending(context) { this.error = "" }

  dataChanged(rawText, context) {
    const value = JSON.parse(rawText || "{}")
    this.count = typeof value.count === "number" ? value.count : 0
    this.error = ""
  }

  dataError(error, context) { this.error = error.message }

  increment() {
    if(!this.dataReady || this.editable) return
    const value = JSON.parse(this.data || "{}")
    const count = typeof value.count === "number" ? value.count : 0
    this.data = JSON.stringify({...value, count: count + 1})
  }

  render() {
    return html`
      <button ?disabled=${!this.dataReady || this.editable} @click=${this.increment}>
        ${this.count}
      </button>
      <output>${this.error}</output>`
  }
}

customElements.define("ww-counter", WwCounter)
```

Export `./widgets/ww-counter`. Set `sharedData: true` in its editing configuration. Specify the initial values in the authored HTML.

```html
<ww-counter shared>
  <script type="application/json" slot="data">{"count":0}</script>
</ww-counter>
```

Concurrent writes to `count` give one assigned value. In a standalone document with no managed data runtime, the widget uses local authored data. The second argument to a data handler is `{block, mode}`.
<!-- /library -->

## Selection of a sharing scope

## Data readiness and error handling
