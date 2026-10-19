# Incremental offline widget persistence — 2026-10-17

Offline widget state now persists incremental binary Yjs updates in IndexedDB instead of synchronously encoding and JSON-serializing a complete Yjs document into localStorage on every edit. In the quota-safe ten-widget, 64 KiB, ten-edit case, median edit latency improved from 32.75 ms to 3.55 ms, with committed persistence reached in 4.85 ms. That is about 9.2× faster for editing and 6.8× faster through the browser transaction commit.

## Implementation

- src/widget-data-storage.ts owns a single IndexedDB connection per editor and scoped binary update queues. Existing document/widget/format/sharing/user identity is retained.
- Native read/write transactions restore and seed each scope atomically, electing the same initial Yjs root for concurrent writers. Existing participant state loads before authored defaults can be initialized.
- The Yjs update event supplies incremental Uint8Array data. Same-turn changes are merged with the installed Yjs API and appended in a shared transaction across scopes. The hot path does not re-encode the full document or create JSON byte arrays.
- Update logs compact after 128 observed records or approximately 1 MiB of observed log data. Compaction reconstructs only the persisted prefix inside a transaction, writes a checkpoint, and deletes exactly the covered records. Concurrent writers serialize through IndexedDB transactions; aborted checkpoints preserve the previous state.
- Legacy localStorage snapshots merge with existing IndexedDB state, including a legacy snapshot saved after a prior migration. The exact legacy value is removed only after the merged state commits, and only if that localStorage value has not changed in the meantime.
- Failed reads leave readiness pending rather than overwriting unread state with defaults. Failed writes retain their binary updates. Automatic retries back off from one to thirty seconds; explicit flush retries immediately, and new edits need not wait for an old retry timer. Other readable scopes can still commit when one restoration fails.
- If IndexedDB is unavailable entirely, editing remains in memory and reports a persistence error. Legacy reads remain available in that fallback; new localStorage snapshot writes are not used.
- datapersistence events report pending/saved/error. A late datarequest replays the current status. whenReady() waits for offline restoration; flushPersistence() waits for committed offline transactions after the caller synchronizes DOM edits. Neither method acknowledges server saves.
- Teardown removes live listeners and timers, destroys owned Y.Doc objects, and lets captured binary writes finish before closing the database. Integrations should explicitly await flushPersistence() before an orderly close. Browser shutdown, power loss and storage eviction remain platform limitations.
- No dependencies were added. Widget data adapters, JSON/XML merge behavior, authored defaults, scopes, undo/redo and the DOM-authoritative editing model remain in place.

## Reproduce

```sh
node scripts/native-browser.mjs --widget-data-storage > benchmarks/widget-data-storage.json
node scripts/native-browser.mjs --widget-state-diagnostics > benchmarks/widget-state-diagnostics.indexeddb.json
npx vitest run src/widget-data-storage.test.ts src/widget-data.test.ts src/domdoc.test.ts src/lit-widget.test.ts src/widget-grouping-dom.test.ts
npx vitest run src/widget-data.network.test.js
npx tsc --noEmit -p tsconfig.native-browser.json
```

The runner creates a temporary Chrome profile and binds Vite to 127.0.0.1 only. It uses installed Chrome or CHROME_BIN. Raw benchmark output includes the browser user agent, timestamp and processor count. Previous localStorage and binding-routing results are preserved in their original files; [the earlier synchronization report](widget-state-optimization.md) describes that preceding change.

## Benchmark method

- Native headless Chrome 155 on the same arm64 Mac, reporting eight logical processors. No CPU throttling.
- Actual SharedDOMDoc/WidgetDataBindings DOM and Yjs paths. Three backends run in the same process: in-memory resolver, a benchmark-only resolver reproducing the old localStorage snapshot handler, and the production IndexedDB backend.
- Same 32-field flat JSON workloads as the earlier benchmark: 10 or 100 widgets; approximately 1, 16 or 64 KiB each; one or ten rotating widgets changed per batch. Actual JSON lengths are 972, 16,348 and 65,483 bytes. One scalar answer changes per edited widget.
- Two independent fixtures per case, reversed backend order on the second repeat; five warmups and 25 measured batches. Table values are medians of the two per-run medians. This is a short-run workload envelope, not a production traffic trace.
- Edit latency spans DOM read/modify/write, native observer delivery, Yjs reconciliation and queued state rendering through a MessageChannel task boundary. It can include incidental storage work already scheduled during that interval.
- Completion latency starts at the same edit and additionally waits for flushPersistence() to resolve after IndexedDB transaction completion. It is not merely enqueue time or request success, and it is not a guarantee of physical disk flush against every power-loss scenario.
- Every IndexedDB case is reloaded through a fresh editor into a fresh DOM and checked for the final participant state. Loading, initialization, component rendering, layout/paint, real network activity and browser startup are outside the timing window.
- The legacy backend counts actual quota failures, including fixture initialization and warmup. Failed legacy writes are not treated as durable saves. The main timing matrix normally appends fewer than the compaction thresholds; separate correctness checks exercise both compaction limits.

## Results

Milliseconds per batch. IndexedDB failures were zero across all measured cases. Legacy error counts combine both repeat fixtures, including setup and warmup. Values below roughly 0.1 ms are limited by browser timing resolution.

| Total widgets | KiB/widget | Edited/batch | Memory edit | Legacy edit/complete | IndexedDB edit | IndexedDB complete | Legacy errors |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 1 | 0.10 | 0.20 | 0.10 | 0.35 | 0 |
| 10 | 1 | 10 | 0.60 | 1.65 | 0.70 | 1.70 | 0 |
| 10 | 16 | 1 | 0.10 | 0.90 | 0.20 | 0.45 | 0 |
| 10 | 16 | 10 | 1.15 | 9.35 | 1.45 | 2.65 | 0 |
| 10 | 64 | 1 | 0.30 | 3.30 | 0.45 | 0.75 | 0 |
| 10 | 64 | 10 | 2.95 | 32.75 | 3.55 | 4.85 | 0 |
| 100 | 1 | 1 | 0.10 | 0.20 | 0.10 | 0.40 | 0 |
| 100 | 1 | 10 | 0.65 | 1.60 | 0.75 | 1.80 | 0 |
| 100 | 16 | 1 | 0.10 | 0.90 | 0.20 | 0.45 | 42 |
| 100 | 16 | 10 | 1.25 | 9.40 | 1.55 | 2.85 | 168 |
| 100 | 64 | 1 | 0.30 | 3.10 | 0.40 | 0.70 | 184 |
| 100 | 64 | 10 | 2.95 | 31.00 | 3.70 | 5.10 | 648 |

The ten-widget 64 KiB result is the clearest durability comparison because all legacy writes fit quota: 32.75 ms becomes 3.55 ms for editing and 4.85 ms through transaction completion. At 100 × 64 KiB and ten edits, IndexedDB takes 3.70 ms for editing and 5.10 ms through completion, with no failed writes; the legacy handler takes about 31 ms but also fails many persistence attempts.

The smallest 1 KiB cases are dominated by transaction/event overhead. IndexedDB improves responsiveness, but waiting for a commit need not be faster than the synchronous legacy write at that size. Larger payloads show the benefit of avoiding full snapshot encoding, JSON expansion and synchronous storage.

## Paced persistence and queue drain

100 widgets × 64 KiB; ten rotating edits per batch at 60 Hz for 120 batches (600 widget edits per second total).

- Edit median/P95: 3.7/4.3 ms.
- Batches exceeding the 16.7 ms interval: 0/120.
- Maximum pending scopes at the start of the next offered batch: 0.
- Final commit drain: 1.7 ms.
- Total time including the final commit: 1990.5 ms.
- P95 batch-start lateness: 1.6 ms.
- Fresh-editor reload verified all final values after draining.

This separates responsive editing from committed persistence and checks that writes did not accumulate into a hidden backlog. It is a short in-process, state-only test; rendered frame rate and long-running device/storage pressure are not established by these numbers.

## Recovery and correctness checks

- binary incremental updates, reload and batched writes.
- legacy migration commits before removing the legacy key.
- a remaining legacy snapshot merges with already committed IndexedDB edits.
- aborted migration preserves legacy data and retries readiness.
- failed multi-scope writes abort atomically and retain updates for retry.
- an unreadable scope does not block committed writes in other scopes.
- an explicitly failed flush retries automatically.
- compaction preserves concurrent writers and replay is bounded.
- aborted compaction leaves the old checkpoint and log recoverable.
- large incremental values compact by byte size before the record limit.
- writes arriving during a transaction survive its acknowledgement.
- teardown drains captured updates without retaining live listeners.
- widget integration restores scopes and excludes participant data from exports.
- offline scopes isolate users, documents and sharing modes.
- paced IndexedDB persistence drains without an accumulating write backlog.

The three Happy DOM storage tests cover unavailable storage, preservation of legacy state without IndexedDB, and failed restoration readiness. Actual IndexedDB behavior is verified in Chrome rather than through a newly installed fake database dependency. The unit scope tests that formerly relied on synchronous localStorage reload now seed legacy snapshots explicitly; real persistence/reload coverage lives in the native checks above.

182 focused unit tests and two existing network sharing/grouping tests passed. Native browser TypeScript compilation passed, and git diff --check passed. The broader test-project typecheck retains the existing assignedElements-on-Element error in src/components/example-gallery.test.ts:24; that file was not changed.
