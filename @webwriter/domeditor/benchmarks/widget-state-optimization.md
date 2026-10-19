# Data-block synchronization optimization — 2026-10-17

Ordinary data edits now commit only the bindings identified by DOM mutation records. At 500 widgets × 64 KiB, a single-widget edit fell from 37.4 ms to 0.4 ms median, and a ten-widget batch fell from 41.8 ms to 3.6 ms. All paced data-block workloads sustained the tested 10/30/60 Hz batch rates after the change.

## Implementation

- SharedDOMDoc collects pending native mutation records before synchronizing widget data and passes them to WidgetDataBindings.sync(). Both observer-driven writes and explicit synchronization of pending edits use this path.
- Text/character-data changes identify affected existing bindings through the existing binding map. A Set deduplicates repeated records for the same block. Unrelated document text/attribute edits skip widget-state reads.
- The entire batch is classified before committing anything, so a simultaneous sharing/identity/grouping change triggers discovery before a value can be sent into the old scope.
- Element insertion/removal/moves, processing instructions, and attributes on widgets or data blocks retain conservative full discovery. Widget attributes remain conservative because the configured support predicate can depend on any widget attribute.
- Unbound eligible data blocks trigger discovery, allowing an initially malformed block to recover when its source is repaired.
- The redundant second full scan after remote document rendering was removed. Restoring a preview or rendering with observation paused still explicitly discovers the restored bindings.
- Explicit synchronization without pending records retains full discovery for configuration changes, late upgrades, and invalid-source retries; generated identities are mirrored synchronously.
- JSON diffing, scoped Yjs state, persistence format, DOM authority, and export/default semantics are unchanged. No dependencies or authored DOM artifacts were added.

## Reproduce

```sh
node scripts/native-browser.mjs --widget-state-benchmark > benchmarks/widget-state-results.optimized.json
node scripts/native-browser.mjs --widget-state-diagnostics > benchmarks/widget-state-diagnostics.optimized.json
npx vitest run src/widget-data.test.ts src/domdoc.test.ts src/lit-widget.test.ts src/widget-grouping-dom.test.ts
npx vitest run src/widget-data.network.test.js
npx tsc --noEmit -p tsconfig.native-browser.json
```

Baseline production code was at commit 2749d270bea514576e4acefc6e7208af9970719b, before the working-tree changes to src/domdoc.ts and src/widget-data.ts. Baseline and optimized runs use the same benchmark harness, workload matrix, browser configuration, and machine. Baseline measurements are preserved in widget-state-results.json and widget-state-diagnostics.json. The optimized files are separate; see [the baseline methodology](widget-state.md) for complete workload details.

Both runs use native headless Chrome 155 with eight reported logical processors. Timings include DOM writes, observer delivery, Yjs synchronization and queued state rendering, through a MessageChannel task boundary. They exclude component rendering/layout/paint, actual network latency, cold setup and memory measurements. JSON updates read and rewrite the whole affected block. The local matrix uses three runs of 25 batches after five warmups; tables compare medians of run medians. Each case verifies the resulting state.

## Local data-block updates

Milliseconds per batch, in-memory resolver, one peer. Ratios near timer resolution should not be overinterpreted.

| Total widgets | KiB/widget | Edited/batch | Before ms | After ms | Speedup |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 1 | 0.1 | 0.1 | timer limited |
| 10 | 1 | 10 | 0.7 | 0.6 | 1.2× |
| 10 | 16 | 1 | 0.3 | 0.2 | 1.5× |
| 10 | 16 | 10 | 1.2 | 1.2 | 1.0× |
| 10 | 64 | 1 | 1.0 | 0.4 | 2.5× |
| 10 | 64 | 10 | 3.1 | 3.2 | 1.0× |
| 100 | 1 | 1 | 0.3 | 0.1 | timer limited |
| 100 | 1 | 10 | 0.9 | 0.7 | 1.3× |
| 100 | 16 | 1 | 2.1 | 0.2 | 10.5× |
| 100 | 16 | 10 | 3.1 | 1.4 | 2.2× |
| 100 | 64 | 1 | 7.9 | 0.4 | 19.8× |
| 100 | 64 | 10 | 9.9 | 3.3 | 3.0× |
| 500 | 1 | 1 | 1.4 | 0.1 | timer limited |
| 500 | 1 | 10 | 2.1 | 0.9 | 2.3× |
| 500 | 16 | 1 | 10.4 | 0.2 | 52.0× |
| 500 | 16 | 10 | 11.4 | 1.6 | 7.1× |
| 500 | 64 | 1 | 37.4 | 0.4 | 93.5× |
| 500 | 64 | 10 | 41.8 | 3.6 | 11.6× |

The cost now follows changed payload much more closely than total document payload: a 64 KiB edit takes roughly 0.3–0.4 ms at 10, 100, and 500 widgets, rather than rising to 37.4 ms at 500 widgets. Ten 64 KiB edits take roughly 3–4 ms. The conservative structural/scope discovery path is still proportional to the full set of bindings.

For comparison, the finalized run at 500 widgets, 64 KiB/widget and ten edits per batch measured:

| Representation | Median ms |
| --- | ---: |
| attributes | 0.3 |
| json-attribute | 1.3 |
| data-block | 3.6 |

## Paced data-block workloads

500 total widgets, ten edited per batch. A 60 Hz batch rate offers 600 widget edits per second across the document, not 60 edits per second to every widget. Paced runs offer two nominal seconds of work using absolute deadlines.

| KiB/widget | Batches/s | Before median ms | After median ms | After P95 ms | Before over interval | After over interval |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 10 | 4.1 | 2.1 | 3.9 | 0/20 | 0/20 |
| 1 | 30 | 4.1 | 2.3 | 3.5 | 0/60 | 0/60 |
| 1 | 60 | 3.2 | 2.9 | 3.6 | 0/120 | 0/120 |
| 16 | 10 | 13.8 | 4.4 | 4.9 | 0/20 | 0/20 |
| 16 | 30 | 13.7 | 4.1 | 4.9 | 0/60 | 0/60 |
| 16 | 60 | 13.2 | 4.0 | 4.6 | 0/120 | 0/120 |
| 64 | 10 | 45.7 | 6.5 | 7.7 | 0/20 | 0/20 |
| 64 | 30 | 45.5 | 6.7 | 7.3 | 60/60 | 0/60 |
| 64 | 60 | 50.5 | 2.4 | 4.8 | 120/120 | 0/120 |

The previous worst case (500 × 64 KiB at 60 Hz) had 120/120 batches exceed the 16.7 ms interval and took 6,003.7 ms to drain 120 batches. The optimized run had 0/120 exceed the interval and finished in 1,989.1 ms. P95 service time was 4.8 ms; P95 start lateness was 1.4 ms. This is state-processing headroom, not an end-to-end rendered frame guarantee.

The two-second paced samples are short and show scheduling/JIT/GC variation. The independently recreated local matrix is the more stable comparison of operation cost. No sustained real-network or rendered-widget frame-rate claim is made.

## Receiving peer and encoded updates

100 widgets, ten edited per batch, synchronous in-memory transport to a second real DOM mirror in the same process. Times include sender plus receiver work and should not be treated as per-client frame costs.

| KiB/widget | Before median ms | After median ms | Before P95 ms | After P95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1.7 | 1.1 | 1.9 | 1.3 |
| 16 | 6.7 | 2.6 | 8.6 | 3.5 |
| 64 | 21.3 | 7.0 | 24.3 | 10.0 |

The granular update format is retained: a single changed scalar still produces approximately 35 encoded Yjs bytes for a data block, versus about 65,513 bytes for a 64 KiB JSON attribute. Small byte-count differences between runs come from encoded Yjs identifiers. This excludes initial synchronization and protocol framing.

## Offline persistence and remaining bottlenecks

The fallback still encodes the entire scoped Yjs document and writes the serialized byte array into synchronous localStorage on each update. That work was deliberately preserved.

| Widgets | KiB/widget | Edited/batch | Before offline ms | After offline ms | Failed measured writes after / attempts |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 1 | 0.3 | 0.1 | 0/25 |
| 10 | 1 | 10 | 1.7 | 1.3 | 0/250 |
| 10 | 16 | 1 | 1.1 | 0.7 | 0/25 |
| 10 | 16 | 10 | 9.2 | 7.5 | 0/250 |
| 10 | 64 | 1 | 3.9 | 2.6 | 0/25 |
| 10 | 64 | 10 | 35.5 | 26.0 | 0/250 |
| 100 | 1 | 1 | 0.4 | 0.1 | 0/25 |
| 100 | 1 | 10 | 1.8 | 1.1 | 0/250 |
| 100 | 16 | 1 | 2.8 | 0.7 | 0/25 |
| 100 | 16 | 10 | 11.6 | 6.7 | 63/250 |
| 100 | 64 | 1 | 10.7 | 2.4 | 11/25 |
| 100 | 64 | 10 | 40.8 | 22.5 | 212/250 |

The ten-widget, 64 KiB, ten-edit case fits storage quota and still takes 26.0 ms median with persistence, compared with approximately 3 ms in memory. That exceeds a 16.7 ms interval even after binding routing is fixed. Larger cases still hit quota: their timings measure attempted persistence, not durable storage. Raw setupStorageFailures records failures before the measured batches as well.

Explicit WidgetDataBindings.sync() calls without mutation records still scan every binding; the unchanged-scan diagnostic intentionally measures that fallback and remains expensive for large documents. Structural/scope changes take that path too. Normal text edits no longer invoke it. The remaining work to investigate is persistence and processing/serialization of the changed payload itself, rather than another document state model.

## Verification

- All native benchmark cases passed their final-state assertions, including the receiving-peer cases. The original benchmark harness was not changed during this optimization.
- 179 focused unit tests passed across widget-data, domdoc, Lit widget runtime and widget grouping; two networked widget-data tests also passed (181 total).
- New regression coverage checks affected-block reads for textContent, characterData, split-text and XML writes; pending explicit writes; ordinary local/remote document edits; remote widget data; cross-widget callbacks; replaced/copied widgets; scope changes in the same batch; grouping PI edits; support predicates; initially invalid blocks; explicit discovery identities; and existing undo/redo/privacy/preview behavior.
- npx tsc --noEmit -p tsconfig.native-browser.json passed; git diff --check passed.
- The broader test-project typecheck reports an existing, unchanged error at src/components/example-gallery.test.ts:24: assignedElements is not declared on Element. No unrelated file was changed to address it.
