# Widgets and the document

The live HTML DOM is the document. WebWriter observes changes to it, including changes made by widgets, collaborators, and undo or redo.

| Store | Use | Saved with the document? |
|---|---|---|
| Attributes | Settings such as the correct answer. | Yes. |
| Light-DOM children | Authored text and nested content. | Yes. |
| Scoped data block | Persistent interaction state, such as a learner's answer. | Stored separately; normal exports keep authored defaults. |
| Properties and shadow DOM | Temporary state and the widget's interface. | No. |

Render controls in the widget's shadow DOM. Use a `<slot>` to display authored children without moving or replacing them. Editor-owned menus and overlays belong in the editor's shadow appendix.

Changes can come from elsewhere at any time. Read the current attributes and children when an interaction occurs, and update the display when those values change. Clean up observers and external listeners when the widget disconnects.

WebWriter marks installed widgets with `contenteditable` while editing. Use `this.isContentEditable` to distinguish editing from use. Temporary `◆` classes and editor-owned `contenteditable` are excluded from collaboration, history, and saved HTML.

Next: [quick start](quick-start.md).
