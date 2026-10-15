# Data and events

Scoped data requires `sharedData: true` in the widget's editing configuration and one direct child block:

```html
<ww-quiz id="quiz-a" shared>
  <script type="application/json" slot="data">{"choice":""}</script>
</ww-quiz>
```

| Setting | Values / behavior |
|---|---|
| `type` | Exactly `application/json` or `application/xml`. |
| `slot` | `data`. |
| `src` | Must be absent. |
| Widget `id` | Stable identity; WebWriter assigns one when missing. Copies receive fresh identities. |
| Widget `shared` | Absent: individual; empty: everyone; `group`: server-assigned group. Other values, including `false`, are invalid. |
| `textContent` | Read the current snapshot; assign a complete serialized value to update it. |

Wait for the initial `datachange` before writing. Scope changes retain the old scope and load the destination's existing state or authored defaults, without copying answers.

## Events

These events originate on the data block and bubble through the widget. Filter by the current direct block so nested widget events are not mistaken for your own.

| Event | `detail` | Meaning |
|---|---|---|
| `datarequest` | — | Dispatch as a bubbling, cancelable event on the current direct data block to receive its current state. The runtime prevents the default when it owns the block. |
| `datapending` | `{mode: "individual" \| "all" \| "group"}` | A new binding is resolving. Fires before its initial `datachange`, including after a sharing or grouping scope change. |
| `datachange` | `{mode: "individual" \| "all" \| "group"}` | Initial state or an accepted local/remote snapshot has been installed. Render without writing back. |
| `dataerror` | `{message: string}` | Invalid data, mode, or a connection failure. Invalid writes do not replace the accepted persisted state. |

## Merge and persistence

JSON object fields merge recursively. Arrays, strings, numbers, booleans, and null are atomic values. Conflicting writes converge; numeric assignments do not implement an additive counter. An empty JSON block starts as `{}`.

XML must be well formed. Root attributes merge separately; child lists are atomic replacements. Namespaces, comments, and processing instructions are preserved. Data must be representable inside an HTML script block.

Participant data is stored separately from the shared document body and participates in undo and redo. Normal HTML exports and clipboard copies keep authored defaults. Explicit current-state snapshots are available through `editor.toHTML(false, true, "current")` or `editor.serializeHTML(false, "current")`.

Grouping rules live in a direct `ww-grouping` processing instruction containing encoded JSON. Treat it as opaque metadata; the server assigns participants from its trusted roster. See [sharing](../guides/sharing.md) and [runtime setup](../../../README.md#scoped-widget-data).
