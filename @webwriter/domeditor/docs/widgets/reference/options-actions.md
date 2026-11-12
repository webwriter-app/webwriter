# B2. Options and actions

The authoring tool uses option and action declarations to show controls for a widget. An embedded Lit widget can use the same declarations in a [standalone drawer](lit.md#standalone-widget-drawer).

Declare option groups, options, actions, and permissions on the class or instance. An instance declaration has priority over the matching class declaration. This also applies to an empty map.

A getter can return declarations that change. When a change affects the result, dispatch a [bubbling](https://developer.mozilla.org/en-US/docs/Web/API/Event/bubbles) `optionschange` event from the widget host. This tells the authoring tool to read the declarations again.

`dynamicOptions` is a legacy alias for `options`. When both declare the same name, `options` has priority.

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
| `attribute` | `string` or `false` | An explicit declaration has priority. The default is the matching Lit property's [attribute mapping](https://lit.dev/docs/components/properties/#setting-the-attribute-name), or the lowercase option name if there is no mapping. `false` writes only the property. |
| `label` | `LocalizedText` | Option name in title case. |
| `description`, `placeholder` | `LocalizedText` | No description or placeholder. |
| `group` | `string` | No group. Matches an ID in `optionGroups`. Options and actions can use the same group. |
| `hidden`, `disabled`, `readOnly` | `boolean` | `false`. These fields control visibility and access to the control. |
| `disabledReason` | `LocalizedText` | No explanation shown for a disabled option. |
| `control` | `"checkbox"`, `"switch"`, `"select"`, `"radio"`, `"segmented"`, `"input"`, `"range"`, `"duration"`, or `"tree"` | The default depends on the option type. This field selects the control and keeps the value type the same. `radio` and `segmented` show one choice. See [Specialized options](#specialized-options) for `duration` and `tree`. |
| `unit` | `string` | No unit label. The label applies to the display only. |
| `steps` | `number[]` | No list of values. Use this field for a number range with unequal intervals. |
| `multiline` | `boolean` | `false`. Permits string input on multiple lines. |
| `min`, `max`, `step` | `number` | No numeric input limits. |
| `pattern` | `string` | No input pattern. |
| `minlength`, `maxlength` | `number` | No text length limits. |
| `swatches` | `string[]` | No suggested colors. |
| `multiple` | `boolean` | `false`. Permits more than one value in a selection. |
| `options` | Leaf or branch entries | Lists choices for `select`. A leaf has `value: string` and can have a `label` and `description` as `LocalizedText`. A tree also accepts branches with an optional `label` and recursive `children`. A leaf without a label shows its value. |
| `selector`, `excludeSelf` | `string`, `boolean` | Apply to `reference`. The default [selector](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Selectors/Selectors_and_combinators) is `"*"`. The default for `excludeSelf` is `true`. |

Supported constructors are `Boolean`, `String`, `Number`, `Object`, and `Array`. Supported type strings are `boolean`, `string`, `number`, `date`, `datetime-local`, `email`, `password`, `tel`, `time`, `url`, `color`, `select`, `reference`, `object`, and `array`.

For a number option, `control: "input"` shows a standard number field. The choice of control keeps the stored value format and action arguments the same.

### Specialized options

The widget supplies a property for each option. With Lit, declare duration properties as `Number` in `static properties`. Declare tree selections as `Array`. Declare references as `String`. Use the same reflected attribute names as the options.

The `duration` control stores a number in seconds. Use `control: "duration"` with `type: Number` or `type: "number"`. The control accepts seconds, `M:SS`, or `H:MM:SS`, with or without fractional seconds. It can display durations of 24 hours or more.

`min`, `max`, and `step` also use seconds. The control rejects invalid and negative values. `null` or a blank value resets the option.

The `tree` control uses `type: "select"` and `multiple: true`. A leaf has a `value` and can have a `label` or `description`. A branch has `children` and can have a `label`. A tree can have up to eight levels and 1,000 entries.

The control stores only leaf values, as a JSON array of strings. A branch shows the selection state of its leaves. If a leaf value occurs more than once, the control uses the first occurrence. The control keeps unknown stored IDs when the user changes a known selection.

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

`reference` selects an installed widget by its `id`. The control lists installed widgets in the current document body that match `selector`. The default selector is `"*"`. With `excludeSelf: true`, the list excludes the widget that has the option. This is the default. Each candidate must have a unique ID in the document.

The control uses `aria-label`, `title`, or the tag name, in that order. It adds `#ID` to each label. The control shows a missing or invalid current ID and keeps it until the user clears or replaces it. The authoring tool checks a candidate again when the user selects it.

```js
static options = {
  relatedSection: {
    type: "reference", selector: "webwriter-model-training", excludeSelf: true,
    label: {_: "Related section"},
  },
}
```

File input actions declare `input: {type: "file", accept?: string, multiple?: boolean}`. The method receives a `File[]` even when `multiple` is false. [`accept`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept) controls which files the chooser shows. Check the contents in the widget.

If the user selects **Cancel**, the chooser closes without calling the method or adding an undo step. The files are temporary input. Before the method runs, the authoring tool checks that the widget is still connected. The authoring tool also checks the action declaration, its availability, and confirmation. Changes to the DOM use the action's standard undo behavior. An action without `input` receives no arguments.

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

Before a write, the authoring tool checks `hidden`, `disabled`, and `readOnly`. It checks the value against the current type, limits, number steps, and choices. `null` and an empty string are valid reset values. If a declaration getter throws an error, the authoring tool rejects the write.

The authoring tool reads `optionschange` from the widget host. Dispatch the event there when the authoring tool must read the declarations again.

The authoring tool writes an empty attribute for a true boolean. A false boolean removes the attribute. Objects, arrays, and multiple selections use JSON. The authoring tool converts other values to strings. `null` and an empty string remove the attribute. An option with `attribute: false` has temporary instance state.

The authoring tool reads the current property value to display an option. Make the property reflect the attribute or supply a getter. The authoring tool rejects `style`, `class`, `is`, authoring-only attributes, event handlers, and unsafe URLs as option attributes.

[Options and actions in Lit](lit.md#options-and-actions-in-lit) describes reactive properties and attribute mapping. Drawer controls ignore the input hints `autocapitalize`, `spellcheck`, `autocomplete`, and `inputmode`.

## Option groups

`optionGroups` is a record that uses group IDs as keys. A group can have a `label` and `description` as `LocalizedText`. It can also have `collapsible`, `collapsed`, and `advanced` booleans.

The drawer shows ungrouped items first. It then shows groups in `optionGroups` declaration order. Options and actions keep their declaration order within each group. If a group has no matching declaration, the drawer shows its ID as the label. The drawer hides empty groups.

`advanced: true` makes a group collapsible and closes it initially. For other collapsible groups, `collapsed` sets the initial state.

Visibility and availability control the widget interface only. Use participant permissions for document editing rights.

## Element permissions

Declare `permissions` on the class or instance. Use the boolean property names as keys. The authoring tool shows the checkboxes under **Distribute → selected element permissions → Edit**. Each checkbox works independently of **Edit**. If the element is hidden from participants, the authoring tool disables these checkboxes. The checkboxes appear only in the element permissions controls.

```js
class QuizWidget extends LitElementWw {
  static properties = {
    allowHints: {type: Boolean, attribute: "allow-hints", reflect: true},
  }

  static permissions = {
    allowHints: {
      label: {_: "Allow hints"},
      description: {_: "Let learners reveal a hint."},
    },
  }

  constructor() {
    super()
    this.allowHints = false
  }
}
```

A selected permission adds an empty attribute to the widget. Clearing the permission removes the attribute. The default attribute name comes from the matching Lit property. If there is no Lit declaration, the authoring tool uses the lowercase property name. If the declaration specifies `attribute`, use the same attribute in the widget. Each permission requires an attribute.

A permission can have a `label` and `description` as `LocalizedText`. It can also have `hidden`, `disabled`, `disabledReason`, and `readOnly`. The widget reads the boolean to select which interactions to show. Manage document editing rights and network access separately.

## Action declaration

Actions support `label` and `description` as `LocalizedText`. The default label is the method name in title case. The `group` field assigns the action to an option group. The `hidden` and `disabled` fields control availability. The `disabledReason` field supplies the tooltip for a disabled action. Set `icon` to a supported ribbon icon name.

`intent` is `"default"` or `"danger"`. `confirm` supplies a `LocalizedText` prompt before the action runs. The optional `input` declaration opens a file chooser.

Give adjacent actions the same `buttonGroup` string to join their buttons. Each option group shows its buttons separately. The drawer omits hidden actions. A group with one visible action shows one button.

```js
static actions = {
  completeDfaWithSink: {group: "editing"},
  switchToNfa: {group: "editing", buttonGroup: "automaton-type", label: {_: "Switch to NFA"}},
  switchToPda: {group: "editing", buttonGroup: "automaton-type", label: {_: "Switch to PDA"}},
}
```

Supply a method with the same name. The authoring tool checks the current availability of the action before it runs. If the action requires confirmation, the authoring tool asks the user first. Changes to the DOM form one undo step.

A returned promise keeps the undo group open until it settles or ten seconds pass. The method can continue after that limit. The authoring tool rejects a second action on the same widget while the first action runs.

See [localized text](editing-configuration.md) for locale matching.
