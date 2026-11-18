# A4. Content expressions

`editingConfig.content` describes which light DOM children authors can edit. Without a content expression, the authoring tool treats the widget as one unit.

| Expression | Meaning | Example |
|---|---|---|
| Node name | One element of that type. | `p`, `ww-option` |
| Group name | One member of the group. | [`flow`, `phrasing`, `heading`](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Content_categories), `widget`, `widgetinline` |
| `a b` | Sequence. | `p ww-option` |
| `a \| b` | Choice. | `p \| ul` |
| `(…)` | Grouping. | `(p \| ul)+` |
| `?` | Zero or one. | `h2?` |
| `*` | Zero or more. | `phrasing*` |
| `+` | One or more. | `p+` |
| `{n}` | Exactly n. | `ww-option{2}` |
| `{n,}` | At least n. | `ww-option{2,}` |
| `{n,m}` | Between n and m. | `ww-option{2,6}` |

A widget declares custom groups in its `group` setting. Separate the group names with spaces. Use only node names and groups that exist. The largest finite repetition limit is 1,000.

An explicit `group` replaces the default `flow` membership. Use `group: ""` for a structural child that should stay out of ordinary flow containers, and name its type in the receiving widget's content expression. The editor still adds `widget` or `widgetinline`, so a container declaring one of those groups can deliberately accept the child too. See [placement and movement](editing-configuration.md#restrict-placement-and-movement) for a complete example.

```json
{
  "./widgets/ww-quiz": {"content": "p+ ww-option{2,}"},
  "./widgets/ww-option": {"group": "quizoption", "content": "phrasing*", "uninsertable": true}
}
```

A widget can contain inert data blocks and children with [`contenteditable="false"`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/contenteditable) in addition to the content in the expression. Keep unrelated document content unchanged.
