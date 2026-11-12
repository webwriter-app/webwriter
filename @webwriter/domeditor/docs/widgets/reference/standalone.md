# Standalone widget drawer

A page embedding a widget can opt into its settings with the `standalone` attribute. An empty value defaults to browser storage. A URL sets the initial remote storage destination.

```html
<ww-quiz id="practice-quiz" standalone></ww-quiz>
<ww-quiz id="assignment-quiz" standalone="https://example.org/api/results/assignment-quiz"></ww-quiz>
```

The widget developer chooses where to render the drawer. For a Lit widget, register `WidgetDrawer` in the widget's scoped registry and pass the widget instance:

```js
import {LitElementWw, WidgetDrawer} from "@webwriter/lit"
import {html} from "lit"

class WwQuiz extends LitElementWw {
  static scopedElements = {"ww-widget-drawer": WidgetDrawer}

  render() {
    return html`
      <slot></slot>
      <!-- Render the quiz here. -->
      <ww-widget-drawer .widget=${this}></ww-widget-drawer>
    `
  }
}
```

The drawer renders when the target widget has `standalone` and has controls to show. The `LitElementWw.standalone` property reflects the attribute as a string, or `null` when absent. WebWriter displays its own drawer for widgets it inserts.

Run `npm start` from the DOMEditor package and open the [standalone quiz demo](http://127.0.0.1:1234/dev-server/standalone-quiz/) to try both storage modes side by side. The demo HTTP endpoint keeps one result in memory for the life of the local development server.

## Settings, actions, and file conversions

Declare [options and actions](options-actions.md) as usual. The standalone drawer uses the same declarations, option validation, groups, and action confirmations. Dispatch `optionschange` on the widget when dynamic declarations change. Reference options list matching, defined custom elements with unique IDs in the widget's document or shadow root.

The **Import and export** group lists the file formats in `convertFrom` and `convertTo` that have callable handlers. Native tag conversions belong to the document editor. An importer receives one `File` and returns a function that applies the result. An exporter returns a `File` for download. The editor and standalone drawer use the same [conversion contract](runtime.md#conversions).

## Result storage

For storage, supply a direct inert [data block](data.md) with `slot="data"` and type `application/json` or `application/xml`. Write results using `data` or `setData()`, and check `dataReady` before writing. The drawer restores the current destination's result before saving updates. The widget can listen for `datapersistence` on the data block to track saves.

Browser storage uses the page's local storage. Give each embed a stable, unique `id` to preserve its storage identity when moving it on the page. Idless widgets are keyed by their position. **Autosave to** switches immediately to **This browser**. For a **Remote endpoint**, enter its URL and select **Apply**. The drawer remembers the destination when local storage is available. Each destination loads its own result or the widget's initial data. Choosing another destination does not copy results between stores.

### HTTP endpoint

The endpoint URL identifies a result resource. For multiple learners, the server should resolve the learner from the authenticated request and authorize access to the corresponding result. Use the same URL for both methods.

| Request | Response |
| --- | --- |
| `GET` | Return `200` with the raw JSON or XML data, the matching `Content-Type`, and a strong `ETag`. Return `404` when the result has never been saved. |
| `PUT` | Accept the raw data with its `Content-Type`. Honor `If-None-Match: *` on creation and `If-Match: "<revision>"` on updates. Return `201` for creation, `200` or `204` for an update, and `412` when the precondition fails. |

Return the new strong `ETag` after a successful write when the representation was stored as sent. If omitted, the drawer reads the result again and adopts its revision only if the returned data matches the write. Return `Cache-Control: no-store` for learner results. If a newer result exists, the drawer retains the pending edit and emits a `datapersistence` error.

The drawer accepts HTTP and HTTPS URLs, including relative URLs resolved against the page base URL. Use HTTPS outside local development. For cross-origin endpoints, allow the embed's origin, methods `GET` and `PUT`, and request headers `Content-Type`, `If-Match`, and `If-None-Match`. Expose the `ETag` response header. The built-in adapter sends session cookies for same-origin requests. For a different authentication setup, pass a `storageFor(destination, key)` function to the drawer and return an `HttpWidgetResultStorage` with your authenticated fetch for the remote destination. Keep credentials in the host's authentication flow.

This endpoint stores the latest result. The widget can use a separate action to submit a finalized attempt.
