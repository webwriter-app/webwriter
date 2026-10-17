# Widget state benchmark baseline — 2026-10-17

Before mutation-driven synchronization, the managed data-block implementation became sensitive to the total payload across all widgets, even when only one widget changes. At 500 widgets × 64 KiB, single-widget edits take 37.4 ms median; ten-widget batches take 41.8 ms. Separate attributes and a JSON attribute remain much faster locally, but a JSON attribute sends its entire value through Yjs on every change.

See [the optimization comparison](widget-state-optimization.md) for current results. This document records the original baseline; the saved baseline JSON files are preserved.

## Reproduce the workload on the checked-out implementation

```sh
node scripts/native-browser.mjs --widget-state-benchmark > benchmarks/widget-state-results.current.json
node scripts/native-browser.mjs --widget-state-diagnostics > benchmarks/widget-state-diagnostics.current.json
npx tsc --noEmit -p tsconfig.native-browser.json
npx vitest run src/widget-data.test.ts
```

Uses the existing native-browser runner, a temporary Chrome profile, and a Vite server bound only to 127.0.0.1. Requires local Chrome (or CHROME_BIN). The original baseline run added no dependencies or production changes. Rerunning these commands now measures the current implementation, rather than recreating the historical baseline.

## Method

- Native headless Chrome 155 on this arm64 Mac; browser reports eight logical processors. No CPU throttling. User agent and timestamps are recorded in the raw results.
- Actual SharedDOMDoc and WidgetDataBindings, native MutationObserver delivery, Yjs reconciliation, and undo tracking. No explicit manual synchronization bypasses the observer path.
- Three representations: 32 separate scalar attributes; one JSON-valued state attribute; one managed script[type="application/json"][slot="data"].
- Identical flat state objects, approximately 1, 16, or 64 KiB per widget (actual JSON sizes: 972, 16,348, and 65,483 bytes). Mostly unchanged string fields; one fixed-width answer field changes per edited widget.
- 10, 100, or 500 total widgets; 1 or 10 edited per batch, rotating through the document. JSON cases read current DOM text, parse, modify, and stringify. Attribute case changes only the answer attribute.
- Main matrix: three independent fixtures per case, five warmups, 25 measured batches each. Tables use the median of the three run medians. P95s in raw data are per run, not pooled.
- Timings span writes through a MessageChannel task boundary, allowing native observers and queued renders to settle. They are elapsed service times, not sampled CPU times. Browser timer resolution is about 0.1 ms; raw zero medians mean below useful resolution.
- Main matrix uses an in-memory resolver, excluding localStorage. Two-peer cases synchronously apply encoded Yjs updates to a second real DOM mirror in the same browser process; those timings combine both peers and exclude network latency.
- Paced runs offer ten-widget batches at 10, 30, and 60 Hz for two nominal seconds (100, 300, and 600 widget edits per second total). Absolute deadlines preserve accumulated backlog. These are batch rates, not per-widget rates.
- Hidden roots omit layout, paint, widget component rendering, framework callbacks, HTTP resolution, WebSocket framing/latency, and long-session thermal effects. Initialization and memory use are not timed. These are synthetic workload envelopes, not production traces.
- Every case verifies the final edited values; two-peer cases verify both DOMs. Offline diagnostics count failed storage writes explicitly.

## Local update cost

Median elapsed milliseconds per batch, no persistence or remote peer.

| Total widgets | KiB/widget | Edited/batch | Separate attributes | JSON attribute | Managed data block |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 1 | 0.1 | <0.1 | 0.1 |
| 10 | 1 | 10 | 0.3 | 0.1 | 0.7 |
| 10 | 16 | 1 | <0.1 | 0.1 | 0.3 |
| 10 | 16 | 10 | 0.3 | 0.4 | 1.2 |
| 10 | 64 | 1 | <0.1 | 0.2 | 1.0 |
| 10 | 64 | 10 | 0.3 | 1.3 | 3.1 |
| 100 | 1 | 1 | <0.1 | <0.1 | 0.3 |
| 100 | 1 | 10 | 0.3 | 0.2 | 0.9 |
| 100 | 16 | 1 | <0.1 | 0.1 | 2.1 |
| 100 | 16 | 10 | 0.3 | 0.4 | 3.1 |
| 100 | 64 | 1 | <0.1 | 0.2 | 7.9 |
| 100 | 64 | 10 | 0.3 | 1.3 | 9.9 |
| 500 | 1 | 1 | <0.1 | <0.1 | 1.4 |
| 500 | 1 | 10 | 0.3 | 0.1 | 2.1 |
| 500 | 16 | 1 | <0.1 | 0.1 | 10.4 |
| 500 | 16 | 10 | 0.3 | 0.4 | 11.4 |
| 500 | 64 | 1 | 0.1 | 0.2 | 37.4 |
| 500 | 64 | 10 | 0.3 | 1.3 | 41.8 |

## Offered update rate and backlog

500 total widgets, ten edited per batch, managed data blocks. A 60 Hz interval is 16.7 ms; a 30 Hz interval is 33.3 ms.

| KiB/widget | Batches/s | Median ms | P95 ms | P95 start lateness ms | Batches exceeding interval |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 10 | 4.1 | 4.4 | 1.1 | 0/20 |
| 1 | 30 | 4.1 | 4.8 | 1.1 | 0/60 |
| 1 | 60 | 3.2 | 3.6 | 1.0 | 0/120 |
| 16 | 10 | 13.8 | 15.2 | 1.1 | 0/20 |
| 16 | 30 | 13.7 | 15.5 | 1.1 | 0/60 |
| 16 | 60 | 13.2 | 15.1 | 0.5 | 0/120 |
| 64 | 10 | 45.7 | 52.6 | 1.1 | 0/20 |
| 64 | 30 | 45.5 | 48.1 | 696.5 | 60/60 |
| 64 | 60 | 50.5 | 53.2 | 3788.9 | 120/120 |

At 500 × 1 KiB, data blocks sustain all tested rates. At 500 × 16 KiB, 60 Hz stays on schedule but processing uses roughly 819 ms per nominal second, leaving little time for widget rendering and other work. At 500 × 64 KiB, 30 Hz and 60 Hz cannot keep up: all batches exceed their interval. The 120 batches offered over two seconds at 60 Hz take about six seconds to drain. At 10 Hz this case keeps up with the offered rate, but individual batches still take roughly 46 ms.

Both attribute approaches stay on schedule in every paced case. At 500 × 64 KiB and 60 Hz their medians are 0.8 ms for separate attributes and 1.8 ms for a JSON attribute.

Raw serviceMsPerSecond is the sum of measured batch service times divided by the nominal two-second offered window. It can exceed 1,000 when work backs up; it is processing demand per offered second, not measured CPU utilization.

## What accounts for the cost

The diagnostic directly times WidgetDataBindings.sync() with no state changes.

| Total widgets | KiB/widget | Unchanged scan median ms |
| ---: | ---: | ---: |
| 100 | 1 | 0.3 |
| 100 | 16 | 2.0 |
| 100 | 64 | 7.3 |
| 500 | 1 | 1.4 |
| 500 | 16 | 9.9 |
| 500 | 64 | 35.7 |

The unchanged scan accounts for most of the large-document update cost. In code, sync() discovers every data block, rebuilds binding lookup maps, checks bindings, and reads each ready block’s textContent through #commit(), even for a change in one widget. Unchanged text bypasses JSON parsing, but that does not make the scan cheap. The isolated scan measurement establishes the cost of this path; it does not identify the exact browser allocation or string-comparison primitive responsible.

Instrumenting one changed widget records two JSON parses and three serializations regardless of widget count: widget read/modify/write plus runtime parsing, validation, and rendering. The observed total-payload scaling is therefore not caused by parsing every unchanged block.

A code-based implication: SharedDOMDoc.syncFromDOM() invokes widgetData.sync() before ordinary reconciliation, so this scan can also affect content or attribute edits elsewhere in a document containing many data blocks. The comparison matrix uses homogeneous documents and does not separately time that mixed-document case.

The first optimization to investigate is routing mutation records to affected bindings while retaining discovery for structural or scope changes. This report does not change synchronization behavior.

## Encoded update size and receiving peer

At 100 widgets × 64 KiB, changing one answer emits approximately 38 bytes with separate attributes, 65,513 bytes with a JSON attribute, and 35 bytes with a data block. These are Yjs update bytes only, excluding initial sync and protocol framing.

For ten edited widgets, combining sender and receiver work in one process gives:

| KiB/widget | Separate attributes ms | JSON attribute ms | Managed data block ms |
| ---: | ---: | ---: | ---: |
| 1 | 1.0 | 0.3 | 1.7 |
| 16 | 1.0 | 0.6 | 6.7 |
| 64 | 1.0 | 1.6 | 21.3 |

These combined timings must not be interpreted as per-client frame costs. They show extra receiver processing while confirming that data blocks preserve small incremental updates. A JSON attribute is a local-speed versus bandwidth/concurrent-merge tradeoff, not a universal replacement.

## Offline persistence

The built-in offline fallback encodes the entire scoped Yjs document and serializes the byte array into synchronous localStorage on each update. Diagnostic medians below compare it with an in-memory resolver. Setup includes initial persistence; failure counts in the final column cover only the 25 measured batches.

| Widgets | KiB/widget | Edited/batch | Memory ms | Offline ms | Failed measured writes / attempts |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 1 | 1 | 0.2 | 0.3 | 0/25 |
| 10 | 1 | 10 | 0.8 | 1.7 | 0/250 |
| 10 | 16 | 1 | 0.4 | 1.1 | 0/25 |
| 10 | 16 | 10 | 1.9 | 9.2 | 0/250 |
| 10 | 64 | 1 | 1.0 | 3.9 | 0/25 |
| 10 | 64 | 10 | 2.9 | 35.5 | 0/250 |
| 100 | 1 | 1 | 0.3 | 0.4 | 0/25 |
| 100 | 1 | 10 | 0.9 | 1.8 | 0/250 |
| 100 | 16 | 1 | 2.1 | 2.8 | 0/25 |
| 100 | 16 | 10 | 3.1 | 11.6 | 63/250 |
| 100 | 64 | 1 | 7.8 | 10.7 | 11/25 |
| 100 | 64 | 10 | 10.2 | 40.8 | 212/250 |

The larger offline cases reach Chrome’s storage quota; raw setupStorageFailures also records failures before measurement. Their latency is the cost of attempted persistence, not proof of durable storage. The smaller ten-widget cases fit quota and isolate successful persistence cost. The runtime catches quota errors, so verifying visible DOM state alone would miss this distinction.

## Interpretation and limits

- Small state (around 1 KiB) is comfortable across these widget counts, including 60 Hz ten-widget batches on this machine.
- Around 500 × 16 KiB, data processing approaches the 60 Hz frame budget even before component rendering.
- Around 500 × 64 KiB, even a single edit exceeds a 16.7 ms frame budget, and sustained ten-widget batches fall behind at 30 Hz.
- These are measured points, not universal crossover thresholds. Slower devices, larger/nested arrays, more changed fields, actual rendering, network congestion, and long-running undo histories can move the boundary.
- Attributes and managed data blocks have different authored-document and participant-scope semantics. Performance results alone do not justify moving private/scoped answers into authored attributes.

Validation: all benchmark state checks passed; the native-browser TypeScript project compiled; src/widget-data.test.ts passed all 38 tests. No production editing behavior was changed.
