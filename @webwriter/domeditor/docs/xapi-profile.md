# WebWriter session xAPI export (provisional)

When a host opens a replay, **Export xAPI** saves JSON Lines: one xAPI 1.0.3-compatible Statement object per line. This is a local dataset export; it does not contact an LRS. Where a streaming save picker is available, it writes chunks directly to the selected file. The download fallback collects the output in a Blob and may require substantial memory. JSON Lines is an interchange container, not an xAPI LRS endpoint response. To send it to an LRS, an integration must submit the individual statements using the LRS API, authenticate, handle retries and respect its privacy policies.

The profile and identifiers below are provisional identifiers, not a published, registered xAPI Profile. They should be reviewed and hosted under a domain controlled by the project before external integrations rely on them.

* The actor is an account pseudonym scoped to the session. The session and participant identifiers, and each statement ID, are deterministic so a repeated export of the same replay produces the same IDs. They can still be personal data, and should not be treated as anonymization.
* The Activity ID uses a SHA-256 fingerprint of the initial document. This identifies the recorded content, not a durable identity for all revisions of a learning resource. A content fingerprint may also permit correlation or guessing.
* `context.registration` identifies a participant's session; `contextActivities.grouping` identifies the session. `contextActivities.category` contains `https://webwriter.app/xapi/profiles/session/v1` and, for an explicitly emitted package event, its declared profile.
* Generic clicks, document changes and observed widget changes use `http://adlnet.gov/expapi/verbs/interacted`. The context extension `https://webwriter.app/xapi/extensions/event-kind` distinguishes `click`, `document-change` and `widget`. A widget observation can also arise from an ordinary input/change signal and is not proof of an answer or outcome. Pointer, cursor and scroll activity, initial checkpoints, learner names, feedback, raw HTML and widget snapshots are not exported by the generic mapping.
* Timestamps are those captured in the replay and may reflect a participant's inaccurate clock. Raw changes remain in the replay; the xAPI dataset cannot reconstruct it.

## Optional package events

Widgets may explicitly record an event by dispatching `webwriter-xapi` from their custom element or a descendant, with `bubbles: true` and `composed: true`. The element must be in the learner document. WebWriter determines the participant, timestamp, document, widget tag and path; package code does not choose those fields. The payload is limited to 16 KiB and malformed events are ignored. For example:

```js
this.dispatchEvent(new CustomEvent("webwriter-xapi", {
  bubbles: true,
  composed: true,
  detail: {
    profile: "https://example.org/xapi/profiles/my-widget/v1",
    verb: {id: "https://example.org/xapi/verbs/used", display: {"en-US": "used"}},
    contextExtensions: {"https://example.org/xapi/extensions/mode": "practice"},
    // Optional xAPI result extensions, defined by this package's profile:
    resultExtensions: {"https://example.org/xapi/extensions/example": 1},
  },
}))
```

The profile and verb identifiers and all extension keys must be absolute HTTP, HTTPS or URN IRIs. Extension values must be JSON. Packages own their profiles, verb semantics, extension definitions and compatibility; WebWriter does not infer a score, completion or answer. The package profile is added to the statement category, and the widget tag and DOM path are included in `https://webwriter.app/xapi/extensions/widget`. Those paths describe the recorded document at event time and need not remain stable after edits. Reserved WebWriter context keys take precedence over package keys.

These events and their extension values are sent to the host peer during the session, stored in the replay and host-device recovery, and included in the dataset. Packages must not emit sensitive content unless that collection is intended and properly disclosed; the export cannot reliably detect sensitive data inside custom values. Other learners do not receive these events through the session transport. An LRS is a separate recipient of the learner data and requires its own configuration and privacy review.

## Optional live LRS delivery

During a host session, **Connect analytics store** opens a per-session setup. Starting delivery sends subsequent mapped events directly from the host browser to the entered LRS; earlier events remain in the replay. The endpoint is the xAPI base URL (for example `https://school.example/xapi/`); WebWriter sends batches to its `statements` resource using HTTP Basic authentication and the `X-Experience-API-Version: 1.0.3` header. The LRS must permit the editor origin through CORS, including `GET`, `POST`, `PUT`, `Authorization`, `Content-Type`, and `X-Experience-API-Version`. HTTPS is required except on loopback. The URL cannot contain credentials, a query or a fragment; redirects are rejected and cookies are omitted. Keys and secrets are held only in memory for this delivery, not saved in settings or the replay.

The host must deliberately start delivery each session. The LRS receives pseudonymous activity and any custom widget extensions, which can contain learner data. It is a separate recipient; do not enable it without the appropriate arrangements. No WebWriter server proxies these requests. A browser or network failure may leave events unconfirmed: delivery retries transient failures, pauses for a rejected request, and shows an issue in the session controls. The in-memory queue holds at most 1,000 events; if it fills, delivery pauses and later activity is not queued. Stopping delivery, stopping the session, closing the app, or a crash clears the queue. Unconfirmed activity remains in the session replay and local recovery when available; The host can send the saved replay to the LRS to recover unconfirmed or earlier activity. A request aborted during shutdown might already have been stored by the LRS.


## Resend a replay

Open a concluded replay and choose **Connect analytics store**. To recover after a crash, restore the host's recovered session from the preview notification, then save a replay if you want a separate file. Delivery is an explicit action and credentials are entered again; nothing is automatically uploaded after a restart. The whole replay is read incrementally in a worker, with one statement per xAPI `PUT` request. Each request uses the same statement ID and content as live delivery and JSON Lines export, so it is safe to restart the replay delivery after a lost connection or browser interruption when the LRS follows the xAPI duplicate-ID rules. If the LRS reports a conflicting ID, WebWriter requests the existing statement and continues only if it can verify an equivalent statement. A mismatch or an unverifiable conflict stops delivery; verification requires read permission as well as write permission. Some LRS implementations may return success without checking equivalent content, so this is not a substitute for verifying LRS conformance.

The dialog reports confirmed statements and temporary failures, retries transient errors, and allows the host to stop. On interruption the progress counter is not persisted; start again from the same replay and destination. A request in flight when stopped may already have been stored. The replay is never changed or deleted by LRS delivery, and the usual host-device recovery retention rules still apply.
