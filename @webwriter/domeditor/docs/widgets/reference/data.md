# B4. Data and events

Scoped data requires `sharedData: true` in the widget's editing configuration. The widget has one [data block](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script#embedding_data_in_html) as a direct child.

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
| Widget `id` | A stable identifier. The authoring tool assigns an ID if the widget has none. Copies receive new IDs. |
| Widget `shared` | No attribute selects individual data. An empty value selects shared data for everyone. `group` selects a group that the server assigns. Other values, including `false`, are invalid. |
| [`textContent`](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent) | Contains the current snapshot. Assign a complete serialized value to update it. |

Wait for the initial `datachange` event before you write data. A scope change keeps data in the old scope. The destination loads its own data or the authored defaults.

The [Aggregated View interface](aggregated-view.md) uses available participant snapshots as independent samples. A sample for a shared group uses the `scopeId` that the connection supplies.

## Events

These events start at the data block and [bubble](https://developer.mozilla.org/en-US/docs/Web/API/Event/bubbles) through the widget. Process only events from the widget's current direct data block.

| Event | `detail` | Meaning |
|---|---|---|
| `datarequest` | — | Request the current state with a bubbling, cancelable event on the current direct data block. The authoring tool prevents the default action when it manages the block. |
| `datapending` | `{mode: "individual" \| "all" \| "group"}` | A scope is loading. The event occurs before its first `datachange`, including after a change to the sharing or group scope. |
| `datachange` | `{mode: "individual" \| "all" \| "group", scopeId?: string}` | The initial data or an accepted local or remote snapshot is ready. The event includes `scopeId` when the connection supplies it. Update the display without writing data. |
| `dataerror` | `{message: string}` | Reports invalid data, an invalid mode, or a connection failure. An invalid write leaves the last accepted data in storage. |
| `datapersistence` | `{state: "pending" \| "saved" \| "error", message?: string}` | Reports the offline save status. Use `saved` to confirm a save. A `datarequest` after initialization also returns this status. |

## Merge and persistence

JSON object fields merge recursively. Arrays, strings, numbers, booleans, and null are atomic values. When writes conflict, the participants get the same result. A numeric assignment sets a value. Use a different mechanism for a counter that adds concurrent changes. An empty JSON block starts as `{}`.

Use well-formed XML. Root attributes merge separately. A change to the child list replaces the complete list. The authoring tool keeps namespaces, comments, and processing instructions. Store only data that can go in an HTML script block.

The authoring tool stores participant data separately from the shared document body. Changes to participant data support undo and redo. Standard HTML exports and clipboard copies keep the authored defaults. An export with the current state includes participant data.

Offline data for an individual scope belongs to a specific document, widget, and participant. Group scopes require a server connection.

The authoring tool checks for stored data before it uses authored defaults. If a read fails, the scope stays pending. The authoring tool reports `datapersistence` with `state: "error"`. A save can fail for one scope while other scopes continue to save.

If offline storage is unavailable, participants can continue to edit data in memory. The authoring tool reports a storage error. Wait for `datapersistence` with `state: "saved"` to confirm that an offline write has finished.

The server assigns participants to groups. The [sharing guide](../guides/sharing.md) describes the available scopes.
