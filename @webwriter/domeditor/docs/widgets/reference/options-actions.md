# Options and actions

Declare option groups, options, and actions on the class or instance. Instance declarations take precedence over the matching class declaration, including an explicitly supplied empty map. Getters can provide dynamic declarations; if something outside a getter changes their result, dispatch a bubbling `optionschange` event from the widget host so the editor rereads them.

```js
static optionGroups = {
  appearance: {
    label: {_: "Appearance"},
    description: {_: "Control how the widget looks."},
    collapsible: true,
    collapsed: false,
    advanced: false,
  },
}

get options() {
  return {
    spacing: {
      type: Number,
      group: "appearance",
      label: {_: "Spacing"},
      min: 0,
      max: 24,
      unit: "px",
      disabled: this.compact,
      disabledReason: {_: "Spacing is unavailable in compact mode."},
    },
  }
}

static actions = {
  reset: {
    label: {_: "Reset"},
    group: "appearance",
    intent: "danger",
    confirm: {_: "Reset this widget's appearance?"},
  },
}

reset() { /* update the widget DOM */ }

refreshOptions() {
  this.dispatchEvent(new Event("optionschange", {bubbles: true}))
}
```

## Option declaration

| Field | Type | Default / meaning |
|---|---|---|
| `type` | Constructor or type string | `String` / `"string"`. See supported types below. |
| `attribute` | `string` or `false` | Lowercased option name. `false` writes a property only. |
| `label` | `LocalizedText` | Title-cased option name. |
| `description`, `placeholder` | `LocalizedText` | No description or placeholder. |
| `group` | `string` | No group. Matches an ID in `optionGroups`; options and actions can share groups. |
| `hidden`, `disabled`, `readOnly` | `boolean` | `false`; controls visibility or editing availability. |
| `disabledReason` | `LocalizedText` | No explanation shown for a disabled option. |
| `control` | `"checkbox"`, `"switch"`, `"select"`, `"radio"`, `"segmented"`, `"input"`, `"range"`, `"duration"`, or `"tree"` | Chosen from the option type by default. Controls presentation independently of value type. `radio` and `segmented` are for a single choice. `duration` and `tree` are specialized controls described below. |
| `unit` | `string` | No unit label. Display only; does not convert the stored value. |
| `steps` | `number[]` | No discrete values; for a number range with nonuniform choices. |
| `multiline` | `boolean` | `false`; multiline string input. |
| `min`, `max`, `step` | `number` | Unset; input constraints. |
| `pattern` | `string` | Unset; input pattern. |
| `minlength`, `maxlength` | `number` | Unset; text length constraints. |
| `swatches` | `string[]` | Unset; suggested colors. |
| `multiple` | `boolean` | `false`; multiple select values. |
| `options` | Leaf or branch entries | Choices for `select`: leaves have `value: string`, optional `label` and `description` as `LocalizedText`. A tree also accepts branches with optional `label` and recursive `children`. A missing leaf label uses the value. |
| `selector`, `excludeSelf` | `string`, `boolean` | For `reference`: `selector` defaults to `"*"`; `excludeSelf` defaults to `true`. |

Supported constructors are `Boolean`, `String`, `Number`, `Object`, and `Array`. Supported type strings are `boolean`, `string`, `number`, `date`, `datetime-local`, `email`, `password`, `tel`, `time`, `url`, `color`, `select`, `reference`, `object`, and `array`.

The inspector reuses the edit/style toolbox's value and choice pickers, color palette, action buttons, and segmented and switch styling. `control: "input"` keeps a native number field. Duration, text, date/time, range, radio, and tree inputs use native controls styled to match. These presentation choices do not change stored values or action arguments.

### Specialized options

Options describe editor controls; the widget still supplies the matching property. With Lit, declare a duration property as `Number`, a tree selection as `Array`, and a reference as `String` in `static properties`, using the same reflected attribute names as the options.

`duration` is a control hint for a number stored in seconds; it is not an option type. Declare it with `type: Number` or `type: "number"` and `control: "duration"`. The editor accepts seconds, `M:SS` (optionally fractional), and `H:MM:SS` (optionally fractional), and displays a duration without wrapping at 24 hours. `min`, `max`, and `step` are also in seconds. Malformed and negative values are rejected; `null` or a blank value resets the option.

`tree` is a control hint for a multiple `select`; it is not an option type. Declare `type: "select"`, `multiple: true`, and `control: "tree"`. Entries are recursive, with leaves using `value` and optional `label` or `description`, and branches using optional `label` and `children`. Only leaf values are stored as a JSON string array. Branches have no stored value; their checked or indeterminate state is derived from descendant leaves. If a leaf value appears more than once, only its first occurrence is used. Unknown IDs already stored in the value are retained when known leaves are toggled. The editor uses native `details` and checkboxes. Trees are limited to depth 8 and 1,000 entries.

```js
static options = {
  duration: {type: Number, control: "duration", min: 0, max: 7200, step: 1},
  permissions: {
    type: "select", multiple: true, control: "tree",
    options: [
      {label: {_: "Pages"}, children: [
        {value: "read", label: {_: "Read"}},
        {value: "write", label: {_: "Write"}},
      ]},
      {value: "settings", label: {_: "Settings"}},
    ],
  },
}
```

`reference` is an option type that selects an existing installed widget by its `id`. Its candidate query is `selector`, which defaults to `"*"`; `excludeSelf` defaults to `true`. Candidates are installed widgets in the current authored body. IDs must be unique across the current document, and the editor does not create IDs while listing candidates. It does not search another document or a shadow root. Labels use `aria-label`, then `title`, then the tag name, and always append `#ID`. A missing or invalid current ID is shown and remains stored until the user clears or replaces it. Candidate IDs are revalidated against the current DOM when selected.

```js
static options = {
  relatedSection: {
    type: "reference", selector: "webwriter-model-training", excludeSelf: true,
    label: {_: "Related section"},
  },
}
```

File-input actions declare `input: {type: "file", accept?: string, multiple?: boolean}`. The native chooser is hosted in the editor shadow appendix. The widget method always receives a `File[]`, including when `multiple` is false. `accept` guides the chooser but does not validate file contents; parsing and validation belong to the widget. Canceling the chooser does not call the method or create an undo step. Files are transient input and are not serialized into options, the bridge, shared DOM, or history. Before invoking the method, the runtime rechecks that the original widget is connected and that the action is still declared, available, and confirmed. DOM changes made by the method use the existing async undo grouping behavior. Actions without an `input` declaration keep their existing no-argument call.

```js
static actions = {
  importData: {
    label: {_: "Import data"},
    input: {type: "file", accept: ".json,application/json", multiple: false},
  },
}

async importData(files) {
  const [file] = files
  if (!file) return
  const data = JSON.parse(await file.text())
  // Apply parsed data to this widget's DOM.
}
```

Before committing an option, the editor checks its current `hidden`, `disabled`, and `readOnly` state, then validates the value against the current type, bounds, discrete number steps, and choices. `null` and an empty string remain valid reset values. If a declaration getter throws, the editor fails safely. Events originating inside widget shadow DOM are ignored; dispatch `optionschange` from the widget host when the editor should reread dynamic declarations.

True booleans become empty attributes; false removes them. Objects, arrays, and multiple selections use JSON. Other values become strings. `null` and an empty string remove the attribute. An `attribute: false` option is temporary instance state and is not saved. Option values keep the existing storage and serialization behavior.

The editor reads the current property value to display an option. Make the property reflect the attribute, or supply a getter. Option attributes cannot be `style`, `class`, `is`, editor-only attributes, event handlers, or unsafe URLs.

Declare Lit reactivity separately in `static properties`, including metadata such as `reflect`, `state`, and `converter`. WebWriter reads `static options`, `static actions`, and `static optionGroups`; `@webwriter/lit` no longer exports option or action decorators. The declared input hints `autocapitalize`, `spellcheck`, `autocomplete`, and `inputmode` are currently not forwarded to drawer controls.

## Option groups

`optionGroups` is a record keyed by group ID. Each group can declare `label` and `description` as `LocalizedText`, plus `collapsible`, `collapsed`, and `advanced` booleans. Options and actions retain their declaration order; ungrouped items appear first, followed by groups in `optionGroups` declaration order. A `group` ID without matching metadata is still shown, using the ID as its label. Empty groups are hidden. `advanced: true` makes a group collapsible and initially closed; otherwise `collapsed` sets its initial state when the group is collapsible.

Visibility and availability describe the widget UI; they do not enforce learner permissions or authorize changes to the document.

## Action declaration

Actions support `label` and `description` as `LocalizedText`. The default label is the title-cased method name. `group` assigns the action to an option group. `hidden` and `disabled` control its availability, and `disabledReason` can explain why a disabled action is unavailable. `icon` is an existing ribbon icon name. `intent` is `"default"` or `"danger"`. `confirm` supplies a `LocalizedText` prompt shown by the UI before execution. Optional `input` currently supports the file chooser described above.

A method of the same name must exist. Confirmation is handled by the UI, and the runtime requires a confirmed invocation and rechecks that the action is currently available before running it. Its DOM changes form one undo step. A returned promise keeps the group open until it settles, for up to ten seconds; the timeout does not cancel the method. A second action on that widget is rejected while one is running. The runtime exposes busy state and errors for the UI to render. `LitElementWw` also declares `placeholder`, which the drawer does not currently use.

See [localized text](editing-configuration.md) for locale matching.
