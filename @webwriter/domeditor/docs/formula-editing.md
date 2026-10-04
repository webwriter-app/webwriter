# Formula editing

The Formula ribbon button inserts an empty formula. Its dropdown lists all structures as standard menu items; choosing one inserts a new formula containing that structure and places the caret in its first argument (the index for indexed roots).

Insert **Formula** from the insertion menu, or click an existing `<math>` formula. A virtual keyboard overlays the bottom of the document column, beside the right toolbox. Its height stays fixed across layouts; all keys are visible without scrolling. A 90% opacity background and a drop shadow separate it from the document. It replaces the Formula toolbox and provides numbers, operators, functions, structures, Latin letters, and Greek letters in four layouts. Shift shows alternatives and uppercase letters; it resets after inserting a symbol, and stays active while extending the selection with arrow keys. Inline/block controls remain in the keyboard header. Close it with × and reopen it using the keyboard button in the document corner.

Typing a name offers completions at the formula caret, including functions, Greek letters, sets, fences, radicals, annotations, and matrix templates. Up/Down cycle through suggestions, Enter or Tab accepts, and Escape dismisses the popup. Clicking a suggestion preserves the formula caret. A single letter defaults to a variable; arbitrary variable and function names are also available. Space commits a word, and `(` creates a call for a function name. Backslash commands use the same suggestions.

Keyboard and autocomplete code is imported statically alongside the editor. No additional dependency or rendering library is required.

The formula is the live [MathML Core](https://www.w3.org/TR/mathml-core/) DOM, rendered by the browser. Commands move or edit existing nodes; there is no intermediate expression tree, rendering engine, or additional dependency. Empty arguments are empty MathML rows. Their visual guides live in the shadow appendix. Temporary `◆` classes are excluded from shared and serialized content.

Inline formulas behave like text: they have no capture or hover outline and do not appear in the breadcrumb. While editing, the whole formula has a light grey background and a normal text caret. Empty outer rows have no dashed guide; guides remain available for nested arguments. Block formulas retain capture selection.

Leaving an empty inline formula removes it. Formulas containing an inserted structure, authored comments, or unfamiliar content remain in the document, as do empty block formulas.

Empty and filled formulas have 2px of padding inside their background. Text carets can sit before an inline formula, at its start, at its end, or after it, including when it is the first, last, or only content in a text block. Inside carets sit at the inner edge of the padding; outside carets have at least a 1px gap from the formula box. The shared appendix text caret distinguishes these boundaries where the browser would otherwise draw the same caret. Clicking the left/right padding addresses surrounding text; Home/End address the internal start/end. Text drags can extend into surrounding prose. A block formula's top/bottom edge selects the surrounding gap. Formula arguments never use gap selections.

## Keyboard

| Key | Action |
| --- | --- |
| Letters, numbers, symbols | Insert MathML tokens |
| `^`, `_` | Add a superscript or subscript to the preceding operand |
| `/` | Use the preceding operand as a fraction numerator |
| Left / Right | Move through tokens and horizontally adjacent arguments; leave stacked parts without visiting another level |
| Up / Down | Cycle completions when the popup is open; otherwise move between stacked arguments, paired scripts, and matrix rows |
| Shift + arrow, Shift + click, drag | Extend the selection |
| Tab / Shift + Tab | Accept a completion / move between arguments |
| Home / End | Move to the start or end of the formula |
| Backspace / Delete | Delete text; select an adjacent structure before deleting it |
| Ctrl/Cmd + A | Select formula contents |
| Enter / Escape | Accept / dismiss a completion, or finish editing when the popup is closed |
| `\sqrt`, `\frac`, `\sin`, `\alpha`, etc., then Space | Insert a named structure, function, or symbol |
| `*`, `<=`, `>=`, `!=`, `:=`, `=>`, `<=>`, `\|\|` | Insert multiplication, comparisons, assignment, implication, equivalence, and norm symbols |

Use a structure tool with a selection to wrap whole sibling expressions. Standard clipboard shortcuts copy selected expressions as MathML and plain text; paste accepts MathML formulas or plain text. Edits use the editor's normal collaboration and undo/redo mechanisms.

## Scope

Editing supports token text, row-like containers, fractions, radicals, scripts, limits, and matrix cells. It works with unwrapped arguments and existing rows. Commands preserve comments, authored attributes, and unrelated nesting. Unsupported subtrees are opaque, and widget internals belong to their widget. Selections that partially cross argument boundaries, or malformed fixed-arity structures, are left unchanged by editing commands.

Backslash shortcuts insert individual constructs; they are not a general LaTeX parser. The matrix tool inserts a 2×2 matrix and edits existing cells. It does not yet offer row/column resizing controls.

Handwriting/OCR and direct IME composition are not included. Unicode symbols can be inserted through the virtual keyboard or pasted as text.
