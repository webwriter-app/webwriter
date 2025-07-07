---
order: 309
title: "Configuring"
configFor: widgets/widgets
---

# Configuring Widgets

Using the `editingConfig` option in your `package.json`, you can change how WebWriter treats your widget.

### `editingConfig["./widgets/my-widget"]`
Extra editing preferences (matching [`NodeSpec`](https://prosemirror.net/docs/ref/#model.NodeSpec)) to be passed along to the editor. Does not support the functional properties (`toDOM`, `parseDOM`, `toDebugString` or `leafText`). Supports the additional `parts`, `cssVariables`, and `slots` properties.

#### `editingConfig[...].group`
The group or space-separated groups to which this widget belongs. Can be one of the [content categories](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories)  of `"heading"`, `"sectioning"`, `"interactive"`, `"embedded"`, `"phrasing"`, `"palpable"`, `"formassociated"`, `"listed"`, `"labelable"`, `"submittable"`, `"resettable"`, or `"scriptsupporting"`, or any custom group name. Always implicitly includes the group `widget`. If not set, defaults to `flow widget`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "group": "flow simulation" // we add a custom group name which other widgets may also use in their group or content
    }
  }
}
```

#### `editingConfig[...].inline`
Should be set to `true` for inline widgets. Defaults to `false`. Warning: Currently poorly supported, may cause issues.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "inline": true
    }
  }
}
```

#### `editingConfig[...].selectable`
Controls whether the widget can be selected as a node selection. Defaults to `true`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "selectable": false
    }
  }
}
```
#### `editingConfig[...].draggable`
Determines whether the widget can be dragged without being selected. Defaults to `false`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "draggable": true
    }
  }
}
```

#### `editingConfig[...].code`
Can be used to indicate that the widget contains code, which causes some commands to behave differently. Defaults to `false`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "code": true
    }
  }
}
```

#### `editingConfig[...].whitespace`
Controls the way whitespace in the widget is parsed. `"normal"` causes the DOM parser to collapse whitespace in normal mode, and normalize it (replacing newlines and such with spaces) otherwise. "pre" causes the parser to preserve spaces inside the widget. When this option isn't given, but code is `true`, whitespace will default to `"pre"`. Note that this option doesn't influence the way the widget is rendered—that should be handled by styling. Defaults to `"normal"`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "whitespace": "pre"
    }
  }
}
```

#### `editingConfig[...].definingAsContext`
Determines whether the widget is considered an important parent node during replace operations (such as paste). Non-defining widgets get dropped when their entire content is replaced, whereas defining nodes persist and wrap the inserted content. Defaults to `false`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "definingAsContext": true
    }
  }
}
```

#### `editingConfig[...].definingForContent`
In inserted content the defining parents of the content are preserved when possible. Typically, non-default-paragraph textblock types, and possibly list items, are marked as defining. Defaults to `false`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "definingForContent": true
    }
  }
}
```

#### `editingConfig[...].defining`
When enabled, enables both `definingAsContext` and `definingForContent`. Defaults to `false`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "defining": true
    }
  }
}
```

#### `editingConfig[...].isolating`
When enabled, the sides of the widget count as boundaries that regular editing operations, like backspacing or lifting, won't cross. Defaults to `false`.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "isolating": true
    }
  }
}
```

#### `editingConfig[...].content`
The allowed content of the widget. Should be a content expression (see below).  To allow zero or more flow elements, use the value `"flow*"` ([Flow content](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories) is a broad category for most elements allowed in the `<body>`). To define the default (unnamed) slot, use the empty string `""` as the key. Defaults to `undefined`, allowing no content.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "content": "(h1 p)* | flow*"
    }
  }
}
```

#### `editingConfig[...].warningIgnorePattern` &  `editingConfig[...].errorIgnorePattern`
When warnings and errors originate from a widget, the default behavior in WebWriter is to show an toast notification and log to the console. With these properties, you can filter out certain warnings or errors. This is useful in case you import external modules that emit warnings or errors you cannot control, but wish to ignore. For both settings, the value should be a regular expression - if a match to the regular expression is found in the warning/error, it is ignored (no toast notification and no logging). Note that the regular expression is specified as a string, and you need to take care to properly escape sequences.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "warningIgnorePattern": "unimportant", // warning contains "unimportant"
      "errorIgnorePattern": "^\\[tensorflow\\]" // error starts with "[tensorflow]"
    }
  }
}
```

##### Content expressions
The value of the `content` field should be a [ProseMirror content expression](https://prosemirror.net/docs/guide/#schema.content_expressions). These use a similar syntax to regular expressions:
- **`[ELEMENT NAME]`** means a single element, e.g. `p` is a content expression meaning the widget must have exactly one child element which is `<p>`.
- **`[EXPR]?`**, **`[EXPR]*`**, **`[EXPR]+`**, **`[EXPR]{min, max}`** are quantifier operators. `?` means zero or one, `*` means zero or more, `+` means one or more, and `{min, max}` means between `min` and (including) `max`. If only one number is provided (`[EXPR]{n}`), it means exactly `n`. For example: `p*` means zero or more `<p>` elements, and `p{0, 3}` means between 0 and (including) 3 `<p>` elements.
- **`[EXPR1] [EXPR2] ...`** and **`[EXPR1] | [EXPR2] | ...`** are connecting operators. The space (` `) means that the second expression follows the first and so on (e.g. `p div` means first a `<p>`, then a `<div>`). The pipe (`|`) means "either the first or the second, third, ... expression". The order of expressions is significant: When WebWriter auto-fills required content (e.g. `(p | div)+`), it would use the first expression (in the example: `p` -> `<p>`). 
- **`([EXPR])`** Expressions can be grouped with parantheses `()` to change precedence. This can be used to apply quantifiers to connected expressions, for example `(h1 p)*` would mean zero or more pairs of `<h1>` and `<p>` elements.
- The tag names of all built-in elements are supported (`p`, `div`, etc.), excluding some of the [phrasing elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories#phrasing_content) (`a`, `abbr`, `b`, `bdi`, `bdo`, `cite`, `code`, `data`, `del`, `dfn`, `em`, `i`, `ins`, `kbd`, `q`, `ruby`, `s`, `samp`, `small`, `span`, `strong`, `sub`, `sup`, `time`, `u`, `var`).
- Additionally, all [content groups](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories) except `phrasing` and `metadata` are supported (`flow`, `interactive`, `embedded`, `heading`, `sectioning`, `formassociated`, `listed`, `labelable`, `submittable`, `resettable`, `scriptsupporting`). A special content category `widget` which includes all widgets is also supported. Using groups in content expressions is often useful to allow whole categories of content. For example, the expression `flow*` is useful to allow essentially any content (since all elements that can go directly into the `<body>` are flow elements).

#### `editingConfig[...].marks`
The marks that are allowed inside of the widget. Should be a space-separated list referring to mark names or groups, "\_" to explicitly allow all marks, or "" to disallow marks. Possible mark names are: `"abbr"`, `"b"`, `"bdi"`, `"bdo"`, `"cite"`, `"code"`, `"data"`, `"dfn"`, `"em"`, `"i"`, `"kbd"`, `"mark"`, `"q"`, `"ruby"`, `"s"`, `"samp"`, `"small"`, `"span"`, `"sub"`, `"sup"`, `"u"`, `"var"`. If an object, each key should be the name of slot, and each value a space-separated list of mark names. Defaults to "\_", allowing all marks.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "marks": "i b u s"
    }
  }
}
```

#### `editingConfig[...].parts`
The CSS parts defined in the widget. Should be an object where each key is the name of the part, and the value is a config object (currently empty, available for future compatibility).
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "parts": {
        "sidepanel": {},
        "main": {}
      }
    }
  }
}
```

#### `editingConfig[...].customProperties`
The CSS custom properties defined in the widget. Should be an object where each key is the name of the CSS custom property (including the "--" prefix), and the value is a [CSS value definition syntax expression](https://developer.mozilla.org/en-US/docs/Web/CSS/Value_definition_syntax).
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "customProperties": {
        "--canvas-background-color": "<color>"
      }
    }
  }
}
```

#### `editingConfig[...].label`
The localized name of the widget shown in the editor. Should be an object where each key is a [unicode locale](https://en.wikipedia.org/wiki/IETF_language_tag#Extension_U_(Unicode_Locale)) and each value a string.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "label": {
        "de": "Fantastisches Widget"
      }
    }
  }
}
```

#### `editingConfig[...].noDefaultSnippet`
By default, if no matching snippet is found, a default snippet of the form `<my-widget></my-widget>` is generated. In case you want to define widgets that are not directly insertable, use this option to opt out.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./widgets/awesome-widget": {
      // ...
      "noDefaultSnippet": true
    }
  }
}
```