# B6. Standalone storage

An embedded widget can save results in the browser or to an HTTP endpoint through the [standalone widget drawer](lit.md#standalone-widget-drawer).

Set `standalone` on the widget to enable the drawer. An empty attribute selects browser storage. A URL selects the initial HTTP destination.

```html
<ww-quiz id="practice-quiz" standalone></ww-quiz>
<ww-quiz id="assignment-quiz" standalone="https://example.org/api/results/assignment-quiz"></ww-quiz>
```

Supply an inert [data block](data.md) as a direct child. Set `slot="data"` and use type `application/json` or `application/xml`. The widget can listen for `datapersistence` on the block to check the save status.

## Browser storage

Browser storage uses the page's [local storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage). Give each widget a stable, unique `id` to keep its storage key when it moves on the page. For a widget without an ID, the storage key uses its position.

Under **Autosave to**, select **This browser** to change to browser storage immediately. For a **Remote endpoint**, enter its URL. Select **Apply**. The drawer remembers the destination when local storage is available.

Each destination loads its own result or the widget's initial data. When you change the destination, results stay in their original store.

Run [`npm start`](https://docs.npmjs.com/cli/v11/commands/npm-start/) from the authoring tool package. Open the [standalone quiz demo](http://127.0.0.1:1234/dev-server/standalone-quiz/) to try both storage modes. The demo HTTP endpoint keeps one result until the local development server stops.

## HTTP endpoint

The endpoint URL identifies a result resource. If there are multiple participants, use the authenticated request to identify the participant. Permit access only to the matching result. Use the same URL for both methods.

| Request | Response |
| --- | --- |
| `GET` | Return `200` with the raw JSON or XML data, the matching `Content-Type`, and a strong [`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag). If no saved result exists, return `404`. |
| `PUT` | Accept the raw data with its `Content-Type`. Apply `If-None-Match: *` when you create a result. Apply `If-Match: "<revision>"` when you update a result. Return `201` for a new result. Return `200` or `204` for an update. If a precondition fails, return `412`. |

If the server stores the data as sent, return the new strong `ETag` after a successful write. If the write response has no `ETag`, the drawer reads the result again. It uses the revision only if the data from the read matches the write.

Return `Cache-Control: no-store` for participant results. If a newer result exists, the drawer keeps the pending edit. It also sends a `datapersistence` error.

The drawer accepts HTTP and HTTPS URLs. It resolves relative URLs against the page base URL. Use HTTPS outside local development.

For a [cross-origin endpoint](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS), permit the origin of the page. Permit the methods `GET` and `PUT`. Permit the request headers `Content-Type`, `If-Match`, and `If-None-Match`. Expose the `ETag` response header. The supplied storage adapter sends session cookies for requests to the same origin. [Custom storage in the Lit reference](lit.md#custom-storage) describes how to use a different authentication method.

This endpoint stores the latest result. The widget can use a separate action to submit a final result.
