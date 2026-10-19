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
| `datapersistence` | `{state: "pending" \| "saved" \| "error", message?: string}` | Offline save status. `saved` follows a committed IndexedDB transaction; `datachange` alone does not mean the change has been saved. A late `datarequest` also replays this status. |

## Merge and persistence

JSON object fields merge recursively. Arrays, strings, numbers, booleans, and null are atomic values. Conflicting writes converge; numeric assignments do not implement an additive counter. An empty JSON block starts as `{}`.

XML must be well formed. Root attributes merge separately; child lists are atomic replacements. Namespaces, comments, and processing instructions are preserved. Data must be representable inside an HTML script block.

Participant data is stored separately from the shared document body and participates in undo and redo. Normal HTML exports and clipboard copies keep authored defaults. Explicit current-state snapshots are available through `editor.toHTML(false, true, "current")` or `editor.serializeHTML(false, "current")`.

Offline scopes use one IndexedDB connection per editor. Incremental binary Yjs updates are batched within an event-loop turn, with periodic atomic checkpoints to bound replay. Existing localStorage snapshots are merged and removed only after their migration commits. Individual scopes retain their document/widget/user identity; group scopes still require a server resolver.

Initial restoration finishes before authored defaults are installed. A restoration error reports `datapersistence: error` and leaves the scope pending rather than replacing unread stored answers. Failed writes remain queued and retry with a bounded backoff, or immediately through an explicit flush. A failed scope does not prevent other scopes from saving. If IndexedDB is unavailable entirely, editing can continue in memory and reports an error instead of claiming persistence.

Editor integrations can await `editor.doc.widgetData.whenReady()` for offline restoration. After `editor.doc.syncFromDOM()`, await `editor.doc.widgetData.flushPersistence()` to wait for offline transaction completion; it rejects on failures. These methods do not acknowledge server saves. Explicitly flush before an orderly document close; asynchronous browser shutdown cannot guarantee that queued writes finish. Transaction completion is the browser's commit acknowledgement, not a promise against every power-loss or storage-eviction scenario.

Grouping rules live in a direct `ww-grouping` processing instruction containing encoded JSON. Treat it as opaque metadata; the server assigns participants from its trusted roster. See [sharing](../guides/sharing.md) and [runtime setup](../../../README.md#scoped-widget-data).
