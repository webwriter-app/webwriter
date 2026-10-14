# Support editing and viewing

Authors configure widgets; users interact with the finished document. Use `this.isContentEditable` to distinguish the two views. With `LitElementWw`, the same value is available as `this.editable`.

```css
/* In the widget's shadow styles */
:host([contenteditable]) .user-controls { display: none; }
:host(:not([contenteditable])) .author-hint { display: none; }
```

These selectors suit the editor's runtime empty `contenteditable` attribute. If your widget permits authored `contenteditable="false"`, use `isContentEditable` in script to handle that value too.

Observe `contenteditable` if changing mode requires a script update. Expose simple author settings through [options and actions](../reference/options-actions.md), which WebWriter displays in the Widget drawer.

Keep widget controls in shadow DOM. Leave editor-owned `contenteditable` and `◆` marker classes to the editor. Test both modes using **Preview**, and save and reopen the document to check the resulting state.
