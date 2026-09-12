# Visual layout editing plan

Status: implemented. The Elements gallery, contextual controls, track commands, appendix affordances, and native-browser checks are in place.

## Intended experience

Keep the existing Elements ribbon controls. Add a **Layouts** button at their end, spanning both ribbon rows, with a layout icon above its label. Both this button and the Elements drawer's normal chevron open the same pullout. The pullout contains large named layout tiles with skeleton previews.

Use the Packages drawer's actual pullout behavior and chrome: attachment to the ribbon, expansion and closing animation, viewport limits, scrolling after expansion settles, outside-click and Escape dismissal, and open/close events. Preserve its behavior when the ribbon becomes compact or collapsed. In narrow mode, omit the Layouts button and use the existing chevron to reach the gallery. Opening one pullout closes the other. The Elements controls remain at the top; the preset gallery appears below them.

Choosing a tile inserts an ordinary authored section, closes the gallery, selects the new section, and opens the existing Edit toolbox with specialized Grid layout or Flex layout controls. A failed insertion leaves the gallery open with a useful reason. Reopening the gallery inserts another layout; changing an existing container's settings belongs in its toolbox.

Selecting a layout wrapper later, through its breadcrumb entry or its appendix outline control, restores its specialized controls. Selecting or editing content inside it preserves the normal paragraph, media, table, or widget context. Nested layouts target the explicitly selected wrapper. Merely receiving a remote insertion never opens a local toolbox.

## Initial presets

Use one small, typed preset catalog shared by the gallery and insertion command. Generate previews from the same layout declarations so preview proportions match the inserted structure. Names and skeleton decorations belong exclusively to the gallery UI.

| Name | Layout | Initial arrangement |
| --- | --- | --- |
| Two columns | Grid | Two equal columns |
| Three columns | Grid | Three equal columns |
| Sidebar left | Grid | 1:2 columns |
| Sidebar right | Grid | 2:1 columns |
| Four panels | Grid | Two columns, two rows |
| Vertical stack | Flex | Column direction |
| Horizontal row | Flex | Row direction with wrapping |
| Wrapping cards | Flex | Wrapping row with a useful item basis |

Start with these eight rather than a large template library. Use neutral skeleton blocks and short text lines; avoid raster thumbnails and new dependencies. Tiles are real buttons, have accessible names, and support keyboard activation. Each tile should be approximately 9–11rem wide, adapting to available pullout width.

Grid columns start with `minmax(0, 1fr)` or proportional equivalents, rows with `auto`, and a `1rem` gap. Flex presets use `gap`, `flex-direction`, and `flex-wrap`; preset items can have authored `flex` and `min-inline-size` values as needed. Fixed-column grids shrink with the container; they do not promise automatic stacking. Wrapping flex presets provide the initial responsive alternative. Breakpoint editing is a separate scope because inline declarations cannot contain media/container rules.

## Authored DOM and insertion

Layout presets always use `<section>` as their outer element, consistent with the existing Section command. The existing section-type control remains available for ordinary Section insertion. Layout behavior is recognized from the current native element and its computed `display`, never from a preset ID, class name, or editor-owned document model.

Each new preset inserts a `<section>` whose direct children are empty `<p>` elements. Grid placement (`grid-row` and `grid-column`) and the content sizing needed by the preset (`min-inline-size` or flex sizing) are authored directly on those paragraphs. The content elements remain ordinary exported HTML; no editor-owned region elements are inserted around them.

Example authored output for Two columns:

```html
<section style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: auto; gap: 1rem;">
  <p style="grid-row: 1 / 2; grid-column: 1 / 2; min-inline-size: 0;"></p>
  <p style="grid-row: 1 / 2; grid-column: 2 / 3; min-inline-size: 0;"></p>
</section>
```

Caret/gap insertion uses the existing structural insertion path, including paragraph splitting and empty-block replacement where appropriate. For a complete selection of sibling blocks, wrap the live selected nodes using the existing section-wrapping preconditions, retaining node identity and comments. When wrapping existing selected blocks, apply the supported numeric grid placement and content sizing directly to those blocks, preserving their content and node identity. Do not distribute their text into new artificial cells. Reject a partial or structurally incompatible range with a selection hint instead of deleting selected content or silently widening the selection.

Editor block splits and replacements preserve the item's layout declarations. In a supported explicit numeric grid, a paragraph continuation keeps its column and moves onto an added `auto` row; neighboring columns span the added row and lower panels shift together so items do not overlap. Flex continuations inherit the item's sizing and follow native flex flow. These adaptations are synchronous parts of the local command. They add no metadata or schema and do not normalize authored content through an observer. External authored `div` elements remain untouched.

Create one undo item for insertion/wrapping and initial inline styles. Select the connected wrapper using the existing explicit section-selection machinery and emit the local `inserted` selection signal. The host's existing `openEditToolbox()` path then opens the specialized controls.

No placeholder labels, insertion buttons, measurement nodes, permanent editor metadata, or UI styles enter authored content. Empty-cell hints and all editing handles live in `DOMEditor.appendix`. Only temporary `◆` marker classes may touch authored elements, with teardown and serialization exclusions.

## Detailed toolbox

Use the existing Edit toolbox and shared `EditingControls` renderer. This keeps ribbon and side-toolbox controls consistent. Give the new contexts distinct internal identities: the existing table context already calls its drawer “Layout”. Display **Grid layout** or **Flex layout** for the new contexts.

Common controls:

- Container type: Grid or Flex; retain inactive mode-specific declarations when switching so conversion is reversible without discarding authored settings.
- Row and column gap, padding, alignment and content distribution.
- Section element type and access to existing size/width controls, respecting the document's prose/page width defaults.
- Reset an individual declaration to the cascade; show authored and effective values distinctly when a stylesheet overrides an edit.
- Advanced CSS disclosure using the existing element-style definitions and controls.

Grid controls:

- Explicit row and column lists, each with its authored size, add-before/add-after, remove, and reset-size controls.
- Track sizing choices for fractions, lengths, percentages, `auto`, and supported `minmax()` values; valid complex values remain editable as CSS text.
- Separate effective/automatic track information so the explicit list is not mistaken for every visible row.
- Automatic flow, automatic row/column sizes, and item/content alignment.
- When a direct child is explicitly selected, item placement and spans through existing `grid-row`, `grid-column`, and self-alignment controls.

Flex controls:

- Direction, wrapping, main-axis distribution, cross-axis alignment, and multi-line distribution.
- For an explicitly selected direct item: grow, shrink, basis, and self-alignment. Existing advanced controls retain access to order and reverse directions without changing DOM reading order.
- No fictitious flex row/column track controls: wrapped lines are produced by the browser.

Use the existing property catalog in `src/element-styles.ts`, `ElementStyleState`, and `element-style-editor`. Add a narrow property-filter/presentation hook if needed, rather than duplicating the field widgets or declaration validation. Common settings should be visually direct; the track list is the genuinely new control.

## Grid affordances and command semantics

When the wrapper is explicitly selected, draw its grid lines in the shadow appendix. Show column labels along the inline axis, row labels along the block axis, add controls at boundaries, and draggable separators. Track selection highlights the associated strip and exposes add-before/add-after/remove. Duplicate these operations in the toolbox for keyboard and touch use. Do not intercept normal text selection inside regions.

**Add track** inserts a CSS track definition at the requested boundary. Existing auto-placed children reflow naturally. It does not invent a table row or require one child per grid cell. New rows use `auto`; new columns use `minmax(0, 1fr)`; if they collapse, an appendix boundary label and toolbox entry keep them selectable. An empty-cell insertion affordance creates a direct authored `<p>` at the requested cell and places the caret in it. Its supported numeric placement and `min-inline-size` are written on the paragraph itself; no wrapper region is created.

**Remove track** defaults to preserving all content. Remove the explicit definition; auto-placed children reflow. For supported explicit numeric placements, remap line references after the removed boundary, shorten crossing spans, and return items located wholly in the removed track to auto placement on the affected axis. Preserve the other axis and DOM order. Do not rewrite unrelated child styles or reconstruct content.

The browser can create implicit rows to hold surviving content. Therefore the UI must distinguish explicit tracks from automatic tracks and must not claim that removing a row definition deletes a visible content row. An automatically created track has no independent definition to remove; expose its automatic sizing and the relevant content instead. Keeping and reflowing content is the confirmed product choice.

**Resize track** changes only the involved authored track definitions. For adjacent flexible columns, adjust their ratio while preserving the pair's total fraction weight and the minimum-sizing wrapper. Avoid weights summing below one. For `auto` rows, a deliberate drag authors an explicit minimum such as `minmax(120px, auto)` so growing content still fits. For other supported units, preserve the unit where a reliable conversion exists; otherwise require the author to choose a sizing mode in the toolbox. The displayed size must reflect the browser's actual result when content minimums limit movement.

One drag is one undo item, using `SharedDOMDoc.beginUndoGroup()`. Escape, pointer cancellation, lost capture, disable, or destruction restores only declarations still owned by that gesture; it must not overwrite a newer remote write. Cancel if the target disconnects, its parent/track topology changes, or the authored property being edited changes externally. Ordinary DOM observation stays active throughout.

The current collaboration layer synchronizes `style` as an attribute string. Keep its existing conflict semantics; this feature does not promise independent merging of simultaneous CSS-property edits. Gesture guards protect against overwriting changes already observed locally. Test simultaneous style edits explicitly, and do not introduce a second style CRDT as part of this feature.

Coordinate grid separators with the existing outer transformation handles: internal separators resize tracks, while outer handles retain element-sizing behavior. Respect pointer ownership, editing locks, and widget capture. Handles live outside content where practical and have labeled numeric alternatives and keyboard adjustments.

## CSS support boundaries

Separate authored values from geometry. `getComputedStyle()` returns resolved grid track lists with pixel sizes and implicit tracks included; writing that list back can change document layout. Use it for measuring overlays, while editing the original declaration tokens. See the [CSS Grid specification on resolved track lists](https://www.w3.org/TR/css-grid-1/#resolved-track-list).

Use the installed `@csstools/css-tokenizer` for the small track-list parser; the platform handles CSS validation and layout. Do not split track strings on spaces, and do not implement the browser's grid placement algorithm.

Initial structural controls support explicit finite track lists, supported track sizing functions, integer `repeat()`, ordinary auto-placement, and unambiguous numeric child placements/spans. Expand an integer repetition only when an individual member must change. Commands validate the current DOM and the entire affected placement set before mutation.

Preserve all other valid CSS and DOM. Named areas/lines, variable-driven track topology, `auto-fit`/`auto-fill`, subgrid, `display: contents` participation, anonymous text items, unusual writing modes, and transformed geometry need individual capability checks. Show general layout controls and raw declarations wherever possible; disable only unsupported structural or drag operations with a specific reason. A supported track size may be text-editable even when dragging it is not reliable.

For stylesheet-defined grids, show effective layout and allow normal explicit property overrides, but do not synthesize an editable authored track list from resolved pixels. The author can enter an explicit track list to enable structural editing. Custom element hosts remain atomic; do not inspect or alter internal widget layouts without their public contract.

Geometry must account for the content box, borders, padding, gaps, alignment distribution, scroll, zoom, and writing direction. Reuse existing coordinate helpers. Use observed changes plus animation-frame scheduling while a gesture is active; tear down all observers and frames. If an accurate mapping cannot be established, keep numeric controls available and withhold misleading handles.

## Code integration

| Area | Planned change |
| --- | --- |
| `src/layouts.ts` (new) | Shared preset definitions, narrow CSS track parsing/edit helpers, support classification; all transient derivations of live DOM/CSS. |
| `src/features/layout.ts` (new) | Layout targeting/state, insertion orchestration, structural track commands and appendix affordances, registered through `actions`. |
| `src/features/manipulation.ts` | Reuse/expose the minimum insertion/wrapping and validated targeted-style operations. Pure layout style writes must not invoke unrelated DOM normalization or fall back to styling BODY. |
| `src/features/selection.ts` | Reuse explicit wrapper selection, expose layout affordance selection through that path, synchronize with existing transformation ownership. |
| `src/features/transformation.ts` | Small interaction coordination hook only, retaining existing outer-element transforms. |
| `src/domeditor.ts`, `src/editor-bridge.ts` | Register the feature; add validated optional layout selection state and capability flags; preserve the local-insertion signal. |
| `src/components/ribbon.ts`, `ribbon-menu-config.ts` | Render the preset gallery, add Layouts opener, account for its extra ribbon width, and add distinct layout context policy. |
| `src/components/ribbon-drawer.ts` | Share package pullout sizing/transition/scroll mechanics with Elements, with different content metrics for its two-row header and large gallery tiles. |
| `src/components/editing-controls.ts`, `editing-controls.styles.ts` | Render common grid/flex controls and the new track editor; reuse property widgets. |
| `src/components/element-style-editor.ts`, `src/element-styles.ts` | Minimal filtering/presentation extension if needed for reusable layout property groups. |
| `src/components/dom-editor.ts`, `toolbox.ts`, `editing-ui-bindings.ts` | Carry layout context, route actions, and auto-open Edit after successful local insertion. |
| `src/editor.css` and appendix-owned styles | Layout selection markers and affordance presentation, with artifact exclusion and complete cleanup. |

A focused layout feature is justified by its distinct track commands, DOM-derived state, and overlay lifecycle. It should reuse existing manipulation, styling, and geometry primitives rather than build a second selection, style, or document subsystem.

The drawer work needs more than matching CSS: Packages has hard-coded branches for row measurement, expanded height, scrolling, and animation settling. Factor just those shared pullout mechanics within `RibbonDrawer`, parameterizing content metrics. Keep package tile capacity/search behavior specific to Packages. Both openers must invoke the same existing `openDrawer(true)` / `open-drawer` action path, with the chevron using the normal toggle path.

Suggested actions are `insertLayout`, `setLayoutStyles`, `insertLayoutTrack`, `removeLayoutTrack`, and `setLayoutTrackSize`. Use current selection/connected target validation on each execution. Serialize only minimal context to the host, such as layout kind and capabilities; keep live node references in the iframe. Refresh state after direct DOM, widget, remote, undo/redo, and relevant style/viewport changes, without opening the toolbox again.

## Delivery sequence

1. **Insertion and drawer:** preset catalog, shared pullout behavior, both openers, safe DOM insertion/wrapping, wrapper selection, and Edit auto-open.
2. **Detailed controls:** layout state/bridge validation, property reuse, common/flex/grid fields, explicit track editing and capability messages.
3. **Direct manipulation:** appendix grid geometry, track add/remove controls, separator drags, gesture cancellation/undo, and coexistence with existing transformations.
4. **Integration verification:** direct and remote mutations, export/reload, nesting, responsiveness, keyboard use, and regression checks for Packages and table editing.

All four steps belong to the requested feature. Drag-and-drop preset insertion, a visual named-area painter, custom preset saving, breakpoint-rule editing, and automatic arbitrary-layout conversion are later extensions.

## Verification and acceptance

Add focused tests beside the changed behavior, including new `layouts.test.ts`, `features/layout.test.ts`, and `components/ribbon-layout.test.ts`. Extend existing drawer, menu-policy, toolbox, host, selection, collaboration, and serialization tests where their integration changes.

Acceptance coverage:

- Both Elements openers reach the same gallery; the Layouts button spans exactly two rows in the full ribbon; narrow mode uses the chevron without an extra Layouts button.
- Elements and Packages share dismissal, settling, viewport, and scrolling behavior; package search/capacity and table Layout controls are unchanged.
- Every preset exports plain HTML/CSS, survives reload, remains editable from DOM-derived context, and contains no skeleton/UI artifacts.
- Local successful insertion opens the right toolbox once; failed insertion, ordinary selection refreshes, and remote insertion do not.
- Grid row/column add/remove and sizing preserve supported arbitrary content and node identity, including comments, unfamiliar elements, nested layouts, and widgets.
- Explicit versus automatic tracks remain accurately represented after content-preserving removal.
- No stale selection or changed target causes a command to edit a replacement node or BODY; remote changes during drag are preserved.
- One drag and one insertion each undo/redo as a single user operation; all cancellation and lifecycle paths clean up markers and appendix elements.
- Fraction sizing remains fluid; automatic rows retain their authored sizing until deliberately resized; complex unsupported declarations are preserved verbatim at the property level.

Run focused Vitest files during implementation, then `npx vitest run` and `npm run typecheck` before handoff. Extend and run the existing loopback-only native browser harness for actual grid geometry, scrolling/zoom, pointer interactions, collapsed rows, and flex wrapping: the current Happy DOM test environment cannot establish those layout properties. Manually verify narrow ribbon states and keyboard access in the real UI.
