# Options and actions

Declare maps on the class or instance. A nonempty instance map takes precedence over the corresponding class map, allowing dynamic declarations.

```js
static options = {
  answer: {
    type: "select",
    label: {_: "Correct answer"},
    options: [{value: "true", label: {_: "True"}}, {value: "false", label: {_: "False"}}],
  },
}
static actions = {resetAnswer: {label: {_: "Reset correct answer"}}}

get answer() { return this.getAttribute("answer") ?? "false" }
resetAnswer() { this.setAttribute("answer", "false") }
```

## Option declaration

| Field | Type | Default / meaning |
|---|---|---|
| `type` | Constructor or type string. | `String` / `"string"`. See supported types below. |
| `attribute` | `string` or `false` | Lowercased option name. `false` writes a property only. |
| `label` | `LocalizedText` | Title-cased option name. |
| `description` | `LocalizedText` | No description. |
| `placeholder` | `LocalizedText` | No placeholder. |
| `multiline` | `boolean` | `false`; multiline string input. |
| `min`, `max`, `step` | `number` | Unset; input constraints. |
| `pattern` | `string` | Unset; input pattern. |
| `minlength`, `maxlength` | `number` | Unset; text length constraints. |
| `swatches` | `string[]` | Unset; suggested colors. |
| `multiple` | `boolean` | `false`; multiple select values. |
| `options` | `{value: string, label?: LocalizedText, description?: LocalizedText}[]` | Choices for `select`; a missing label uses the value. |

Supported constructors are `Boolean`, `String`, `Number`, `Object`, and `Array`. Supported type strings are `boolean`, `string`, `number`, `date`, `datetime-local`, `email`, `password`, `tel`, `time`, `url`, `color`, `select`, `object`, and `array`.

True booleans become empty attributes; false removes them. Objects, arrays, and multiple selections use JSON. Other values become strings. `null` and an empty string remove the attribute. An `attribute: false` option is temporary instance state and is not saved.

The editor reads the current property value to display an option. Make the property reflect the attribute, or supply a getter. Option attributes cannot be `style`, `class`, `is`, editor-only attributes, event handlers, or unsafe URLs.

`LitElementWw` declarations also accept Lit property metadata such as `reflect`, `state`, and `converter`; declare reactive properties separately or with `@property`. The declared input hints `autocapitalize`, `spellcheck`, `autocomplete`, and `inputmode` are currently not forwarded to drawer controls.

## Action declaration

Actions support `label` and `description` as `LocalizedText`. The default label is the title-cased method name. `LitElementWw` also declares `placeholder`, which the drawer does not currently use.

A method of the same name must exist. Its DOM changes form one undo step. A returned promise keeps the group open until it settles, for up to ten seconds; the timeout does not cancel the method. A second action on that widget is rejected while one is running.

See [localized text](editing-configuration.md) for locale matching.
