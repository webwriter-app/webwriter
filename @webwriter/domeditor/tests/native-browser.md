# Native browser regression checks

Run the loopback fixture with the installed Google Chrome binary:

```sh
npm run test:native-browser
```

The command serves `tests/native-browser.html` on `127.0.0.1` and runs it in headless Chrome. It covers native selection preservation, custom-element editing boundaries, `elementFromPoint` layout hit testing, and iframe load/removal lifecycle. Canvas checks exercise conversion with authored transforms, negative coordinates, zoom-aware movement, edge panning and release, text splitting, serialization, and return to normal flow. It exits nonzero if a check fails. Set `CHROME_BIN` to use another installed Chromium based browser.

Formula checks verify native inline MathML rendering, preserved operand identity, empty argument dimensions, pointer placement followed by typing, editing-only backgrounds, and shadow appendix cleanup. They also exercise distinct text insertion positions before, at the start, at the end, and after inline formulas in different text-block positions, plus gaps around block formulas.

## Formula visual audit

```sh
npm run test:math-visual
```

For the interactive gallery, run `npm run start:frontend -- --host 127.0.0.1`
and open `/tests/math-visual.html` on the local Vite server. Do not expose this
server to the network. Select a structure, optionally filter to failures, or
use **Edit this position** to place the real selection in the live formula at
the top of the page. **Download measurements** exports the geometry as JSON.

The audit covers 2,064 positions across all 14 toolbar structures and seven
additional native/nested structures (square root, combined sub/superscripts,
over, under, combined over/under, nested fraction/root, and nested scripts).
Each runs at 16px and 32px, LTR and RTL, inline and block:

- Every empty argument, including all four matrix cells.
- Every offset in populated identifier and number tokens.
- Row boundaries immediately before and after populated structures.
- Placeholder containment, pairwise overlap, and overlap with rendered tokens.
- Caret position and height against the native Range of an inserted `x`, with
  a 1 CSS px tolerance. Horizontal comparisons account for container movement;
  vertical comparisons use the unchanged trailing `z` as a baseline reference.
  All 352 empty argument cases instead require the caret to fit the current placeholder: typing
  changes their layout, so the future baseline is not the pre-insertion target.
  Their caret uses the inserted character's height, capped by the available slot
  height, and uses the measured insertion offset in either text direction. Operator
  spacing is excluded from the placeholder guide. Use “Empty placeholders only”
  in the gallery to inspect these cases separately from populated positions.

The left snapshot shows the current formula and the right shows the inserted
character. Red lines are measured caret rectangles; dashed boxes reproduce the
actual appendix placeholders. Snapshot UI and copied MathML stay in the shadow
appendix. The fixture is disposable; normal editor commands perform insertion.

This is a strict diagnostic test, **not a blessed screenshot baseline**. It
exits nonzero for geometry mismatches and when Chromium exposes no collapsed
Range rectangle and the editor paints no measurable caret. For those positions,
the gallery explicitly labels slot bounds as a diagnostic, not proof of the
native blinking caret's position. Use the live editing view to inspect them.
Native caret pixels, radical strokes, and fraction rules still need visual
inspection: element rectangles cannot prove pixel-level nonintersection with
those strokes. Results are browser/font-specific; `CHROME_BIN` selects another
installed Chromium browser. There is no claim of Firefox/WebKit coverage.

The initial audit exposes existing caret mismatches and unmeasurable native
positions. Keep these failures visible while improving the renderer; do not
increase tolerance or treat missing geometry as a pass. The regular native
browser suite remains a separate command.

`/tests/math-root-regression.html` reproduces an unfinished root between two
letters. Its controls move among the radicand, inner formula edge, nested row
edge, and surrounding prose. The native suite checks that focus does not move
the root, the radicand caret fits its current placeholder using the available
character height, and an appendix caret
suppresses native fallback carets in the surrounding paragraph. The fixture also includes an empty formula and a **Blink caret** toggle.
Blinking is enabled by default; disable it to inspect static alignment.

Empty-formula regressions verify containment in the current reserved space,
including nested empty rows. Animation checks exercise both blink phases in
the appendix and ensure presentation refreshes retain the same caret and
animation, so hovering cannot continuously restart the blink cycle.
