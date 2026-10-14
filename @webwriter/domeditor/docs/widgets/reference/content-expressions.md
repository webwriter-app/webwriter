# Content expressions

`editingConfig.content` describes editable light-DOM children. Omitting it makes the widget atomic to the editor.

| Expression | Meaning | Example |
|---|---|---|
| Node name | One element of that type. | `p`, `ww-option` |
| Group name | One member of the group. | `flow`, `phrasing`, `heading`, `widget`, `widgetinline` |
| `a b` | Sequence. | `p ww-option` |
| `a \| b` | Choice. | `p \| ul` |
| `(…)` | Grouping. | `(p \| ul)+` |
| `?` | Zero or one. | `h2?` |
| `*` | Zero or more. | `phrasing*` |
| `+` | One or more. | `p+` |
| `{n}` | Exactly n. | `ww-option{2}` |
| `{n,}` | At least n. | `ww-option{2,}` |
| `{n,m}` | Between n and m. | `ww-option{2,6}` |

Custom groups come from a widget's space-separated `group` setting. Referenced node names and groups must exist. Finite repetition bounds are limited to 1000.

```json
{
  "./widgets/ww-quiz": {"content": "p+ ww-option{2,}"},
  "./widgets/ww-option": {"group": "quizoption", "content": "phrasing*", "uninsertable": true}
}
```

Inert widget data blocks and children explicitly marked `contenteditable="false"` are allowed independently of the expression. Existing valid DOM remains the document state; do not rebuild unrelated content to force it into an expected shape.
