# Four-layout editing profile — 31 October 2026

## Setup

Chrome 156 (headless), Apple M2, production Vite build. Each layout ran in a
1200 × 800 iframe with its real editor, DOM/Yjs reconciliation, frame bridge,
and an isolated real host snapshot handler. Proofreading and collaboration
traffic were disabled. The synthetic authored documents contained 240 or 600
text blocks: paragraphs in Document, positioned text boxes in Canvas, ten text
boxes per slide in Slides, and cards distributed among 8 or 12 Board columns.
Every operation had three warmups and 20 timed samples. The unprofiled results
below are latency measurements. Separate 600-block CPU and rendering traces
identify where the time went. The next-frame checkpoint uses `requestAnimationFrame`
followed by a timer; it includes deferred editor work, but is not INP or a
physical keyboard/pointer measurement. Resize and freeform move call the
existing mouse gesture handlers because synthetic pointer events cannot capture
a real pointer in headless Chrome. Scrolling uses `scrollBy` for Document,
Board and Slides, and the Canvas viewer's wheel method for Canvas.

Reproduce from the repository root:

```sh
node scripts/performance-profile.mjs --production --only=layouts --output=.cache/performance/layouts-production
node scripts/performance-profile.mjs --production --profile --only=layouts --output=.cache/performance/layouts-profiles
```

## Measurements at 600 text blocks

Times are milliseconds. `Insert`, `Resize`, and `Move` are median synchronous operation
times. All `frame` columns are p95 next-frame checkpoints.

| Layout | Insert | Typing frame | Resize | Resize frame | Move | Move frame | Selection frame | Scroll frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Document | 1.1 | 16.9 | 74.7 | 200.1 | — | — | 17.7 | 17.2 |
| Canvas | 1.2 | 17.2 | 41.7 | 93.1 | 46.4 | 91.1 | 36.4 | 17.3 |
| Slides | 1.8 | 93.2 | 126.7 | 281.8 | 152.9 | 280.9 | 119.0 | 251.4 |
| Board | 2.2 | 69.4 | 146.3 | 374.7 | — | — | 95.5 | 17.3 |

The smaller fixture shows the same ordering. At 240 blocks, median resize was
45.3 ms in Document, 24.0 ms in Canvas, 66.2 ms in Slides, and 79.9 ms in
Board. Slides scrolling rose from a 139.0 ms p95 frame checkpoint at 240 blocks
to 251.4 ms at 600. Board selection rose from 49.8 ms to 95.5 ms; Slides
selection rose from 63.8 ms to 119.0 ms. Native insertion itself remained
below 3 ms median in every layout; deferred UI work caused the long typing
frames in Slides and Board.

## Issues

1. **Slides scrolling re-enters selection and focus processing at every snap.**
   At 600 blocks, the scroll frame checkpoint reached 251.4 ms p95. The trace
   records 20 `scrollend` dispatches taking 2.5 seconds in total, alongside 40
   `focusin` dispatches and 20 `selectionchange` dispatches. `SlidesFeature`
   calls `selectStart` from its `scrollend` listener; that focuses a slide and
   reprocesses the selection. `current()` scans every slide's bounding box to
   find the nearest slide. See `src/features/slides.ts` around `selectStart`,
   `current`, and the `scrollend` listener. Keep a current slide without a full
   geometry scan per update, and avoid resetting focus/selection when the
   already selected slide is still valid.

2. **Slides selection updates and typing scale with deck size.** At 600 blocks
   (60 slides), selection reached a 119.0 ms p95 frame checkpoint and typing
   93.2 ms, compared with 63.8 and 53.3 ms at 240 blocks. The selection trace
   spends 1.7 seconds in style recalculation over 20 changes; `processSelection`,
   `TransformationFeature.updateInfo`, and repeated slide bounding-box reads
   dominate CPU samples. `SlidesFeature.refresh()` also walks the slide and
   navigation lists for each selection-triggered refresh. See
   `src/features/slides.ts` around `refresh` and `current`, plus
   `src/features/transformation.ts` around `updateInfo`. Refresh only the
   affected slide and controls for a caret move.

3. **Board selection refreshes revisit the entire card tree.** At 600 cards,
   selection reached 95.5 ms p95 and typing 69.4 ms, compared with 49.8 and
   47.0 ms at 240 cards. The Board selection trace attributes about 1.1 seconds
   over 20 changes to style recalculation and about 0.68 seconds inclusive to
   `BoardFeature.refresh()`. That method rebuilds and compares the `allCards`
   list on selection updates. The bridge's `postSelectionPath()` also calls
   `getDocumentLayoutState()`, which calls `exitConversionReason()` and flattens
   and queries the whole Board tree; CPU samples put roughly 0.21 seconds
   there during the typing stage. See `src/features/board.ts` around
   `documentContent`, `exitConversionReason`, and `refresh`, and
   `src/domeditor-core.ts` around `postSelectionPath` and
   `getDocumentLayoutState`. Cache structural results until an authored
   mutation invalidates them, while keeping selection state live.

4. **Resize gestures force repeated synchronous style and geometry work in all
   four layouts.** Median gesture times at 600 blocks were 74.7 ms in Document,
   41.7 ms in Canvas, 126.7 ms in Slides, and 146.3 ms in Board. Their p95
   frame checkpoints were 200.1, 93.1, 281.8, and 374.7 ms. The resize traces
   show frequent style recalculation and layout while writes and reads alternate.
   Large CPU shares fall in `handleScaleDrag`, `updateInfo`, and selection processing at
   gesture end. See `src/features/transformation.ts` around `updateInfo`,
   `handleScaleDrag`, and `#finish`. Batch geometry reads before writes and
   avoid duplicate overlay and selection refreshes during one drag step.

5. **Freeform movement scales with the visible scene and deck.** At 600 items,
   one move took 46.4 ms median in Canvas and 152.9 ms in Slides; at 240 items
   it took 24.1 and 78.3 ms. `TransformationFeature.#snapMovement` measures
   every Canvas peer on each drag step, builds alignment candidates, then
   redraws movement guides. Slides has only ten peers on the current slide in
   this fixture, but the trace still records 0.74 seconds in bounding-box reads
   and 3.5 seconds in style recalculation over 20 moves. See
   `src/features/transformation.ts` around `#snapMovement` and
   `#showMovementOverlay`. Limit geometry work to relevant visible peers and
   avoid refreshing unaffected controls during a move.

6. **Canvas wheel panning does expensive overlay work on every camera step.**
   At 600 text boxes, the wheel call took 11.9 ms median, even though the next
   frame stayed at 17.3 ms p95. The trace attributes 0.27 seconds over 20 wheel
   steps to `cameraChanged`, including 0.20 seconds in
   `TransformationFeature.updateInfo` and 0.13 seconds in bounding-box reads.
   Canvas selection also reached 36.4 ms p95. `CanvasViewer.applyCamera()`
   calls the camera callback on every wheel step; see `src/canvas-viewer.js`
   and `src/features/canvas.ts` around `cameraChanged`. Coalesce camera-driven
   overlay geometry into one animation frame and skip unchanged controls.

Document and Board scrolling stayed near the 17 ms frame checkpoint baseline
in these fixtures. The isolated host processed snapshots but did not render the
full application shell, and the fixtures excluded external widgets, media,
proofreading and network delay. Those workloads need separate measurements
before treating these numbers as full application input latency.

## Improvements and verification

The editor now keeps the visible Slides slide until scrolling, zoom, resize, or
an authored mutation invalidates it. Slides navigation links are indexed once
per refresh, and changing the current slide no longer rebuilds every appendix
button. Board reuses its structural and conversion checks until the authored
DOM changes. Both layouts avoid rebuilding CSS anchor rules for selection-only
marker changes. The mutation observers retain old attribute values so editor
markers can be distinguished from authored class changes.

Transformation stops its geometry frame loop when no gesture or target
animation is running. A freeform drag measures peer boxes and builds alignment
candidates once per gesture, then invalidates them on external authored changes
or viewport movement. Canvas batches pan-driven overlay work into one frame;
zoom changes still refresh immediately. These are view caches only; the live DOM
remains authoritative.

The final production rerun used the same 600-block fixture and command with
`--output=.cache/performance/layouts-final-anchors`. Times below are
milliseconds. The last two columns are p95 next-frame checkpoints, except
Canvas wheel, which shows median synchronous wheel time.

| Operation | Before | After |
| --- | ---: | ---: |
| Slides typing | 93.2 | 68.1 |
| Slides selection | 119.0 | 112.0 |
| Slides scrolling | 251.4 | 223.7 |
| Board typing | 69.4 | 39.1 |
| Board selection | 95.5 | 74.5 |
| Canvas wheel call | 11.9 | 0.1 |
| Canvas move frame | 91.1 | 87.6 |

Canvas scrolling's next-frame p95 rose from 17.3 to 28.2 ms because overlay
work now runs after the wheel callback. Canvas selection's p95 also rose from
36.4 to 43.4 ms. Resize remained expensive: final p95 was 167.5 ms in
Document, 94.8 ms in Canvas, 263.9 ms in Slides, and 376.8 ms in Board.
The fixture performs one move per gesture, so it does not measure the peer
geometry reuse on subsequent drag steps; focused tests verify that reuse and
invalidation. Intermediate reruns varied substantially, so these comparisons
show this run's result rather than a statistically stable speedup. Layout and
style recalculation during resize and selection remain the next bottlenecks.

Focused tests passed for Board (79), Slides (150), and transformation resize
and movement paths (34). The Canvas feature suite passed 87 of 88 tests; its
saved-background CSS assertion fails in the Happy DOM environment after
Canvas is disabled. The new pan frame test passed. TypeScript checking passed.

## Resize, Slides, and Canvas pan follow-up

The next pass avoids a full selection refresh at the end of a stable, ordinary
text resize or freeform move. It cancels the gesture's pending geometry frame,
refreshes the selected element directly, and retains full selection processing
for captures, groups, drops, widgets, and changed selections. During a gesture,
transform control permissions and labels now refresh at completion instead of
on every pointer step. Geometry still follows the pointer. Reads needed for
transform placement are grouped before appendix writes. Documents without
figures no longer reset an empty figure-layout stylesheet on every selection
or resize refresh.

Slides updates the shown navigation buttons for the old and new current slide
without rechecking every link on selection-only refreshes. Canvas starting
view lookup uses a direct-child DOM query; pure pan no longer rewrites the
unchanged background gradient, grid size, or zoom label.

The following compares the previous production run
(`layouts-final-anchors`) with the final follow-up run
(`layouts-skip-control-sync`) at 600 text blocks. Gesture columns are median
synchronous time; frame columns are p95 next-frame checkpoints, in ms.

| Layout and operation | Gesture before → after | Frame before → after |
| --- | ---: | ---: |
| Document resize | 66.4 → 48.0 | 167.5 → 158.1 |
| Canvas resize | 45.9 → 39.3 | 94.8 → 84.7 |
| Slides resize | 127.6 → 106.3 | 263.9 → 247.1 |
| Board resize | 146.8 → 104.7 | 376.8 → 268.4 |
| Slides move | 154.9 → 119.4 | 258.8 → 236.5 |

Slides selection fell from 112.0 to 88.5 ms p95. Canvas pan's next-frame
p95 fell from 28.2 to 19.1 ms while its synchronous wheel call stayed at
0.1 ms median. The new benchmark timing split shows Slides still spends
66.8 ms median in the drag step itself; native geometry and style work remain
the largest cost. These are individual benchmark runs on a shared machine,
not a stable distribution of repeated runs.

Canvas pan now keeps the wheel callback short and updates editor overlays once
on the next animation frame. Its 19.1 ms p95 frame checkpoint is close to the
17 ms target but remains above the original 17.3 ms checkpoint. Moving all
overlay work back into the wheel callback would trade that frame time for
input-handler latency, so the current scheduling remains. The next useful
measurement is a browser trace of the frame's layout and paint work during a
continuous pan, especially with selected widgets and graphics.

The new targeted tests, full Slides suite (150 tests), figure-layout suite
(8 tests), TypeScript check, and `git diff --check` passed. A broader resize
test filter also picked up nine existing transformation tests that dispatch
hidden edge handles. The pre-existing `#begin` guard rejects those handles,
so those tests did not start a gesture; this is a test/behavior mismatch still
to resolve separately from the measured latency changes.
