# Widget catalog audit — 2026-09-08

Audited every package returned by the editor's public npm catalog: **23 packages, 61 custom elements, 33 directly insertable widgets, and 165 snippets**. Two additional fixtures exercised internal components that have no standalone insertion command. Every custom element was instantiated in at least one case, and each package's default was checked in preview. These are insertion, initial-rendering, and selected interaction checks, not exhaustive tests of every simulation or algorithm.

| Package | Version | Custom elements | Insertion cases | Result |
| --- | --- | ---: | ---: | --- |
| timeline | 2.1.1 | 4 | 3 | Insertion and initial rendering passed. |
| flowchart | 2.1.1 | 1 | 6 | Insertion and initial rendering passed. |
| slides | 2.3.1 | 2 | 2 | Insertion and initial rendering passed. |
| hash | 1.0.2 | 1 | 4 | Main widget renders; examples need Quiz and Slides installed. |
| website-builder | 1.0.1 | 1 | 9 | Insertion and initial rendering passed. |
| code | 3.0.5 | 6 | 7 | All six language widgets render; JavaScript execution and output clearing exercised. |
| geometry-cloze | 2.4.2 | 1 | 4 | Insertion and initial rendering passed. |
| network | 2.0.7 | 1 | 4 | Examples render; bare widget reports a missing subnet control. |
| neural-network | 1.1.6 | 1 | 3 | Insertion and initial rendering passed. |
| quiz | 1.1.5 | 16 | 11 | All 16 components and 10 snippets render; answer selection and grading exercised. |
| deep-learning-model | 1.0.2 | 5 | 6 | MNIST pipeline and Feature Engineering render; four bare stages require prior pipeline references. |
| phet-simulation | 1.0.7 | 0 | 108 | All 108 snippets insert and simulation URLs return HTTP 200; Neuron visually checked. |
| interactive-video | 3.0.3 | 2 | 2 | Renders; its class observer can run before video controls exist. |
| chemdraw | 2.1.1 | 1 | 1 | Insertion and initial rendering passed. |
| automaton | 3.0.2 | 1 | 7 | Insertion and initial rendering passed. |
| branching-scenario | 1.2.1 | 6 | 3 | Large example and all six components render after asset/size fixes. |
| logic-circuit | 1.2.0 | 1 | 3 | Insertion and initial rendering passed. |
| block-based-code | 1.7.3 | 1 | 2 | Insertion and initial rendering passed. |
| geogebra | 1.1.0 | 6 | 6 | Insertion and initial rendering passed. |
| map | 2.2.0 | 1 | 2 | Insertion and initial rendering passed. |
| chemlab | 1.0.7 | 1 | 3 | Insertion and initial rendering passed. |
| word-puzzle | 1.0.6 | 1 | 3 | Insertion and initial rendering passed. |
| graph | 1.0.1 | 1 | 1 | Insertion and initial rendering passed. |

## Editor fixes

- Preserve widget-owned DOM during schema repair, including legacy markup, slots, comments, namespaces, and customized built-ins. Avoid temporary attributes that trigger widget observers.
- Repair invalid sibling positions without passing missing nodes to schema validation. Failed insertion preparation preserves the typed command and removes its markers.
- Omit wildcard CSS assets that are absent from the published package; tolerate missing inferred CSS in previously cached metadata. Explicit stylesheets and scripts still report load failures.
- Wait for package assets before completing editor readiness, including failure and reload cleanup.
- Keep HTTPS simulation frames in an opaque-origin sandbox. Inline handlers, srcdoc, active URLs, and unsafe frames remain removed.
- Support embedded-media snippets up to 50 million characters; this includes the 28.5 MB Branching Scenario example.
- Allow installed widget libraries to decode data/blob resources, run compilers/workers, and create their styles. Authored scripts remain nonce-gated. Installing widget code therefore also enables string evaluation and inline styles in that editor frame.
- Include the scoped custom-element registry polyfill before widget modules in preview and exported HTML. Write script nonce attributes after connecting resources to the cloned preview document so browser nonce hiding does not erase them from serialized HTML.

## Remaining published-widget issues

- **Hash 1.0.2** examples contain Quiz and Slides elements without declaring those widget dependencies. All their elements register when both packages are installed (verified separately).
- **Deep Learning Model 1.0.2** Training, Designing, Evaluation, and Prediction assume existing referenced pipeline stages. Bare insertion throws from `AiWidgetsReferenceSelect.firstUpdated`; Evaluation/Prediction also build an invalid `#` selector. The complete MNIST example passes in a fresh frame. Some stages retain timers after removal.
- **Network 2.0.7** bare insertion unconditionally writes `#current-subnet-mode.value` even when that control is not rendered. Its examples pass. This package, and some other published authoring controls, use an explicit host `contenteditable` attribute as their edit-mode API; document `designMode` alone does not activate those controls.
- **Interactive Video 3.0.3** observes every host class change as a fullscreen change and calls `updateBaublePositions` before its child controls exist. Its UI and media example render, but the startup exception remains inside the published bundle.
- Interactive Video and Graph can emit a nonfatal ResizeObserver loop notification. PhET frames are cross-origin, so the automated pass checks insertion, sandbox, and dimensions; Neuron was additionally inspected visually.

The remaining findings require changes to the published widget packages or their metadata.

## Automated verification

The complete Vitest suite passes: **1,620 tests across 65 files**. Run it with `NODE_OPTIONS=--max-old-space-size=8192 npx vitest run --maxWorkers=2` on this workspace. TypeScript checking and the production build also pass.

The full run exposed a Happy DOM 20.8.3 bug: its mutation-observer delivery wrapper is held only by a weak reference and can disappear during garbage collection. `tests/setup-happy-dom.mjs` retains each registered callback for its listener's lifetime, only in the test runtime. A standalone forced-GC reproduction confirmed delivery before and after collection, and no delivery after disconnection; browser code and capture behavior are unchanged.

## Reproduce

Run `npm start`, then open `http://127.0.0.1:1234/tests/widget-smoke.html` and press **Run catalog smoke test**. The page uses the real editor bootstrap, CSP, package loader, and insertion action in disposable frames. It does not use saved documents or installed-package preferences.

- `?package=quiz&isolated`: fresh frame per Quiz member.
- `?package=quiz&fixture`: nested components without standalone exports.
- `?default&preview`: each package's default in preview.
- `?package=quiz&default&export`: exported HTML in a clean frame.
- `?package=hash&also=quiz,slides&isolated`: Hash examples with their dependencies.

The harness requires network access to npm, jsDelivr, and widget services. Keep the server loopback-only. Compact observations are in [widget-catalog-audit.json](widget-catalog-audit.json).
