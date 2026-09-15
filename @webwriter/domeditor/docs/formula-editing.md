# Formula editing

The Formula ribbon button inserts an empty formula. Its dropdown lists all structures as standard menu items; choosing one inserts a new formula containing that structure and places the caret in its first argument.

Insert **Formula** from the insertion menu, or click an existing `<math>` formula. The Formula edit toolbox offers fractions, scripts, roots, fences, binomial coefficients, a 2×2 matrix, functions, large operators with limits, numbers, sets, and Latin/Greek letters. It also provides inline/block display settings. Scroll the toolbox to browse all insertables; the ribbon stays unchanged during formula editing.

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
| Up / Down | Move between stacked arguments, paired scripts, and matrix rows |
| Shift + arrow, Shift + click, drag | Extend the selection |
| Tab / Shift + Tab | Move between arguments |
| Home / End | Move to the start or end of the formula |
| Backspace / Delete | Delete text; select an adjacent structure before deleting it |
| Ctrl/Cmd + A | Select formula contents |
| Enter / Escape | Finish editing and move after the formula |
| `\sqrt`, `\frac`, `\sin`, `\alpha`, etc., then Space | Insert a named structure, function, or symbol |

Use a structure tool with a selection to wrap whole sibling expressions. Standard clipboard shortcuts copy selected expressions as MathML and plain text; paste accepts MathML formulas or plain text. Edits use the editor's normal collaboration and undo/redo mechanisms.

## Scope

Editing supports token text, row-like containers, fractions, radicals, scripts, limits, and matrix cells. It works with unwrapped arguments and existing rows. Commands preserve comments, authored attributes, and unrelated nesting. Unsupported subtrees are opaque, and widget internals belong to their widget. Selections that partially cross argument boundaries, or malformed fixed-arity structures, are left unchanged by editing commands.

Backslash shortcuts insert individual constructs; they are not a general LaTeX parser. The matrix tool inserts a 2×2 matrix and edits existing cells. It does not yet offer row/column resizing controls.

Handwriting/OCR and direct IME composition are not included. Unicode symbols can be inserted through the toolbox or pasted as text.
