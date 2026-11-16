# C2. @webwriter/lit

> [!NPM]
>
> [View `@webwriter/lit` on npm](https://www.npmjs.com/package/@webwriter/lit)

`@webwriter/lit` supplies a Lit base class for widgets. It also supplies signal helpers and a standalone drawer for embedded widgets.

## `LitElementWw`

Import `LitElementWw` from `@webwriter/lit`. Call `super` when you override a [lifecycle callback](https://lit.dev/docs/components/lifecycle/).

| Member | Purpose |
|---|---|
| `standalone` | The reflected attribute value. Its value is `null` when the attribute is absent. Render a [standalone widget drawer](#standalone-widget-drawer) to show the controls. |
| `editable` | Getter for `isContentEditable`. Updates when the widget or an ancestor changes editing mode. |
| `lang` | The reactive language. Without an explicit value, it uses the language from the nearest ancestor that sets it. |
| `static scopedElements` | Maps tag names to component classes. All instances of the same widget class share its native registry. |
| `registry` | The widget class's native `CustomElementRegistry`. |
| `static properties` | Lit [reactive property](https://lit.dev/docs/components/properties/) declarations. Declare option metadata separately. |
| `static options` / `static actions` | Default widget drawer declarations. Use instance getters `get options()` and `get actions()` for declarations that depend on widget state. |
| `widgetRuntime` | The widget's public `WidgetRuntime` instance, shared with its language and data hooks. |
| `localize` | Optional `{getLocale, setLocale}` connection from [`@lit/localize`](https://lit.dev/docs/localization/overview/). |
| `static dataType` | Default MIME type for an inert data block. The initial value is undefined. |
| `dataType` | Type of the current data block. It uses the class default when necessary. |
| `data` | Raw text of the direct scoped data block. Without a scoped block, it uses the first direct inert script child that has no `src`. The value is `null` when no block exists. A write uses `dataType` or `text/plain`. |
| `setData(type, value, attrs?)` | Creates a block or updates the current block. An update keeps the block's identity and attributes. The method rejects executable types, `src`, and unsafe closing script tags. It escapes `<` characters in JSON. |
| `dataReady` | Indicates that the current data scope accepts writes. |
| `dataPending(context)` | Override to show that a participant scope is loading. |
| `dataChanged(text, context)` | Override to read initial, accepted local, remote, and undo or redo snapshots. Update the display without writing data. |
| `dataError(error, context)` | Override to display a connection or data validation error. |

Data hooks receive raw text and a `{block, mode}` context. Modes are `individual`, `all`, `group`, or `local`. Override these hooks to respond to changes in the data block. The base class requests the current state on connection. This also applies to late custom element upgrades. The hooks apply only to the widget's own data block.

A write through `data` or `setData()` throws `InvalidStateError` while a managed scope is pending. After a validation error on a ready scope, the widget can try a corrected write.

For scoped data, use a [data block](data.md) with JSON or XML and `slot="data"`. Set `sharedData: true` in the editing configuration. The authoring tool supplies the scoped data connection. Outside the managed runtime, authored data stays local. The hooks use `mode: "local"`.

Changes to the data block through the DOM also cause a call to `dataChanged`. A replacement block starts a new data connection. A write through a helper keeps the current block.

The base class uses [native scoped registry APIs](runtime.md#scoped-custom-element-registries) directly.

The widget keeps an explicit `lang=""` value. When it inherits a language, it reads the value from its ancestor. A change to the effective language updates the optional localization connection. If the update fails, the widget dispatches `localizationerror` with `{error}`.

## Options and actions in Lit

Declare Lit reactive properties in `static properties`. Set fields such as `reflect`, `state`, and `converter` there.

If an option has no `attribute`, the authoring tool uses the attribute name from the matching Lit property declaration. A property with `attribute: false` or `state: true` has no option attribute by default.

Replace legacy `option` and `action` decorators with `static options` and `static actions`. Use `static optionGroups` for group declarations. The authoring tool records the DOM changes from an action as one undo step. The drawer ignores `placeholder` in a Lit action declaration. [Options and actions](options-actions.md) describes the interface.

## Modules

A module supplies one common widget behavior. Import each module from its own path. A widget bundles only the modules that it imports.

Most modules are Lit [reactive controllers](https://lit.dev/docs/composition/controllers/). Create the controller in a private field. Mark elements in the shadow template with `data-ww-*` attributes. Listen for the module's `ww-*` events. The module handles pointer, touch, and keyboard input. It also handles announcements and cleanup. The examples in this section are TypeScript.

| Module | Import path | Exports | Use it to |
|---|---|---|---|
| [Permissions](#permissions) | `@webwriter/lit/permissions` | `Permissions`, `widgetPermissions`, `can`, `isEditing` | Show a control or allow an interaction only when the author grants it. |
| [Settings](#settings) | `@webwriter/lit/settings` | `Settings` | Store a setting as an attribute and edit it in the Widget drawer or in a control. |
| [Shortcuts](#shortcuts) | `@webwriter/lit/shortcuts` | `Shortcuts` | Run an action from a key. |
| [Drag](#drag) | `@webwriter/lit/drag` | `Drag` | Reorder, move, copy, or link items by pointer, keyboard, or click. |
| [Viewport](#viewport) | `@webwriter/lit/viewport` | `Viewport` | Zoom and pan a window onto larger content. |
| [Help](#help) | `@webwriter/lit/help` | `Help` | Label the controls of the widget in an overlay. |
| [Scene](#scene) | `@webwriter/lit/scene`, `@webwriter/widget/scene` | `SceneController`, `sceneElements` | Select, move, resize, and connect the elements of a drawing. |
| [Playback](#playback) | `@webwriter/lit/playback` | `Playback` | Run steps, a simulation, or media with play, pause, and seek controls. |
| [Data block](#data-block-jsondata) | `@webwriter/lit/data` | `jsonData` | Read and write a JSON [data block](data.md). |
| [Localization](#localization-localizer-widgetmsg) | `@webwriter/lit/localize` | `localizer`, `widgetMsg` | Show the widget's own text in the document language. |
| [Exercise](#exercise) | `@webwriter/lit/exercise` | `Exercise`, `exerciseProperties`, `exerciseOptions`, `scoreOf`, `firstOrder`, `exerciseAggregate`, `obfuscated` | Build a question with a response, a solution, feedback, and form submission. |
| [Helpers](#helpers-transaction-and-whilevisible) | `@webwriter/widget/transaction`, `@webwriter/widget/visible` | `transaction`, `whileVisible` | Group a change into one undo step. Run a frame loop only while the widget is on screen. |

These rules apply to every module.

- A module option named `can` is a function. The module calls it before and during an interaction. The module cancels the interaction when the function returns false.
- A module that changes the document wraps the change and the next render in one [undo transaction](runtime.md#undo-transactions). A module with the option `rendered` waits for the render that it supplies. The binding sets it to the host's `updateComplete`.
- A module writes to the widget's shadow DOM. It writes to the host or to authored children only where its section says so. It removes its listeners, observers, timers, and adopted styles when the widget disconnects.
- Modules show and speak their own text in the widget's language. Each language loads on first use. Pass `messages` to a module to replace a text.
- Do not store a controller in a public member named `permissions`, `options`, `actions`, `data`, or `localize`. The editor reads these members as declarations. Use a private field such as `#permissions`. The widget warns in development when it finds a controller there.

### Permissions

Permissions turns each entry of `static permissions` into one answer, `can(name)`. Use it to hide controls that readers may not use and to give other modules a `can` function.

Import `Permissions` and `widgetPermissions` from `@webwriter/lit/permissions`. The module also exports the functions `can(host, name)` and `isEditing(host)`, which answer for a widget or for any element in its shadow tree without holding the controller.

| Declaration | Meaning |
|---|---|
| [`static permissions`](options-actions.md#element-permissions) | The editor's declaration. A granted permission is an empty attribute on the widget. |
| `data-ww-can="name"` | Hides the shadow element while `can(name)` is false. |
| `data-ww-can="edit"` | Shows the shadow element in edit mode only. |
| `data-ww-can-mode="disable"` | Makes the element with `data-ww-can` inert instead of hidden. |
| `editing`, `attribute` | Options of the controller. `editing` is a function that tells edit mode. `attribute` is a function that maps a permission name to its attribute. |

The controller has `can(name)` and `editing`. The widget renders again when either answer changes.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Permissions} from "@webwriter/lit/permissions"
import {html, nothing} from "lit"

class WwHintCard extends LitElementWw {
  static properties = {
    allowHint: {type: Boolean, attribute: "allow-hint", reflect: true},
    open: {state: true},
  }

  static permissions = {
    allowHint: {label: {_: "Learners may reveal the hint in this widget"}},
  }

  declare allowHint: boolean
  declare open: boolean

  #permissions = new Permissions(this)

  constructor() {
    super()
    this.allowHint = false
    this.open = false
  }

  render() {
    return html`
      <slot></slot>
      <button data-ww-can="allowHint" @click=${() => (this.open = !this.open)}>Hint</button>
      <button data-ww-can="edit" @click=${() => this.querySelector("[slot=hint]")?.remove()}>Remove hint</button>
      ${this.open && this.#permissions.can("allowHint") ? html`<slot name="hint"></slot>` : nothing}
    `
  }
}

customElements.define("ww-hint-card", WwHintCard)
```

- `can(name)` is true in edit mode. In read mode it is true while the permission's attribute is on the widget. A name that the widget does not declare is refused in read mode, also when an attribute of that name is present.
- `edit` is reserved for controls that only authors see. No permission can have this name. `can("edit")` is true in edit mode only.
- The attribute comes from `attribute` in the declaration, then from the Lit property of the same name, then from the lowercase name.
- Edit mode is the `contenteditable` state that the authoring tool sets on the widget. The answers follow every change of that state and of the permission attributes, also from undo and from other participants.
- The module sets `hidden` or `inert` on shadow elements. Its style sheet makes `hidden` win over any `display` rule. It writes nothing to the authored DOM.
- A component inside the widget's shadow tree has no editing state of its own. Create `#permissions = widgetPermissions(this)` in it. The component then answers like the surrounding widget and renders again when the answers change. A component that also marks elements with `data-ww-can` creates `new Permissions(this)`, which follows the widget in the same way.
- A running interaction of Drag, Viewport, or Scene ends when its `can` function turns false, for example when an author withdraws the permission.
- Permissions describe what the widget offers. They do not limit who may edit the document.

### Settings

Settings turns a list of declarations into reflected attributes, entries of the Widget drawer, and bound form controls. Use it for widgets with several settings that the author or the reader changes.

Import `Settings` from `@webwriter/lit/settings`. It is a class mixin: `Settings(LitElementWw, declarations, options?)`. Each setting becomes a reflected reactive property and an entry of `options`. The property types follow the declarations. A `select` is a union of its choices. The mixin options are `entryTimeout`, `negativeBooleans`, and `messages`. The instance has `settingsCore`, whose `set(name, value)` writes a setting as one undo step and whose `labelOf(name, choice?)` gives a label in the widget's language.

| Declaration field | Meaning |
|---|---|
| `type` | `String` (default), `Number`, `Boolean`, `"select"`, `"color"`, `"date"`, `"time"`, `"datetime-local"`, `"email"`, `"url"`, `"tel"`, `"password"`, or `"reference"`. Objects and arrays are not settings. |
| `default` | The value while the attribute is absent. It is never written to the document. |
| `label`, `description`, `placeholder` | Text for the drawer. Each may be a [function of the widget](#texts-from-the-widgets-catalog). |
| `group` | An ID from `static optionGroups`. |
| `min`, `max`, `step`, `steps` | Limits of a number. A value outside is moved to the nearest limit, or onto the nearest of `steps`. |
| `options`, `multiple` | The choices of a `select`. Nest choices in `children`. With `multiple` the value is a list. |
| `control` | The drawer control. `"duration"` makes a number a time in seconds that shows as `m:ss`. |
| `unit`, `multiline`, `swatches` | Unit of a number, multi-line text, and suggested colors. |
| `pattern`, `minlength`, `maxlength` | Limits of a text. The module refuses a text that does not fit. |
| `attribute` | The attribute. The default is the name in kebab case, with `no-` in front for a boolean that defaults to true. |
| `disabled` | A function of the widget. It returns true, or the reason as text, to turn the setting off. |

The module also reads `data-ww-setting="name"` on a form control and `data-ww-setting-label="name"` on an element. It fills `data-ww-setting-label` with the label while the template leaves the element empty. Use `"name=value"` for the label of one choice.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Settings} from "@webwriter/lit/settings"
import {html} from "lit"

class WwSimulation extends Settings(LitElementWw, {
  population: {type: Number, default: 200, min: 10, max: 2000, step: 10, label: {_: "Population", de: "Bevölkerung"}},
  speed: {type: Number, default: 1, steps: [0.5, 1, 2], control: "range", label: {_: "Speed"}},
  showChart: {type: Boolean, default: true, label: {_: "Show chart"}},
  mode: {
    type: "select",
    default: "random",
    label: {_: "Movement"},
    options: [{value: "random", label: {_: "Random"}}, {value: "calm", label: {_: "Calm"}}],
    disabled: (widget: {population: number}) => widget.population < 20 && {_: "Needs at least 20 people"},
  },
}) {
  render() {
    return html`
      <p>${this.population} people, speed ${this.speed}, ${this.mode}</p>
      <label><span data-ww-setting-label="population"></span> <input type="number" data-ww-setting="population" /></label>
      <input type="range" data-ww-setting="speed" />
      <label><input type="checkbox" data-ww-setting="showChart" /> Chart</label>
      <select data-ww-setting="mode"></select>
    `
  }
}

customElements.define("ww-simulation", WwSimulation)
```

- A setting is an attribute of the widget. A boolean that defaults to true is stored by the attribute `no-show-chart` and is declared to the drawer with `inverted: true`. `negativeBooleans: "property"` declares it with `attribute: false` instead, for an editor that does not know `inverted`.
- A list is stored as JSON in its attribute. The module never corrects an attribute that it reads. A value that does not fit gives the default.
- Assigning a property reflects the attribute at the next render. `settingsCore.set()` writes it as one undo step and returns false for a value that the setting refuses.
- A bound control shows the value, the limits, and the enabled state. The module sets `min`, `max`, `step`, `pattern`, `minlength`, `maxlength`, `list`, `aria-label`, and `aria-description` where the template has not. It fills an empty `<select>` with the declared choices. A slider over `steps` moves through their positions.
- Entry in a bound control is one undo step. The step ends at the `change` event, when the control loses focus, or after `entryTimeout` milliseconds (default 5000).
- A turned off setting disables its control and its drawer entry. Code can still write it.
- A bound control that sits inside an element with `data-ww-can` refuses input that a reader may not make. Add [Permissions](#permissions) to hide the control as well.
- A class field named like a setting shadows its property. The module warns in development. It also warns about a `group` that `static optionGroups` does not declare.
- The instance's `options` combine the class's `static options` and one entry per setting.
- `static settings = {…}` on a class that extends `Settings(LitElementWw)` declares the same settings. TypeScript then needs a `declare` for every property.

#### Texts from the widget's catalog

`label`, `description`, and `placeholder` of a setting may be functions of the widget, also those of a choice. The module asks the function whenever it shows the text and gives the editor the answer. Type the parameter by what the function reads. Pass `drawer: true` to [`localizer`](#localization-localizer-widgetmsg) so that the editor reads the texts again when a catalog arrives.

```ts
import type {MsgFn} from "@lit/localize"
import {LitElementWw} from "@webwriter/lit"
import {localizer} from "@webwriter/lit/localize"
import {Settings} from "@webwriter/lit/settings"
import {html} from "lit"

class WwSpeedometer extends Settings(LitElementWw, {
  speed: {
    type: Number,
    default: 1,
    min: 0.5,
    max: 4,
    step: 0.5,
    label: (widget: {msg: MsgFn}) => widget.msg("Speed"),
    description: (widget: {msg: MsgFn}) => widget.msg("How fast the run advances."),
  },
  unit: {
    type: "select",
    default: "kmh",
    label: (widget: {msg: MsgFn}) => widget.msg("Unit"),
    options: [
      {value: "kmh", label: (widget: {msg: MsgFn}) => widget.msg("Kilometers per hour")},
      {value: "mph", label: (widget: {msg: MsgFn}) => widget.msg("Miles per hour")},
    ],
  },
}) {
  localize = localizer(this, {
    sourceLocale: "en",
    targetLocales: ["de"],
    load: locale => import(`./generated/${locale}.js`),
    drawer: true,
  })

  msg = this.localize.msg

  render() {
    return html`<output>${this.speed} ${this.unit}</output>`
  }
}

customElements.define("ww-speedometer", WwSpeedometer)
```

### Shortcuts

Shortcuts runs an action from a key. Use it for keys that belong to the widget, such as Delete in a diagram or the arrow keys of a slideshow.

Import `Shortcuts` from `@webwriter/lit/shortcuts`. The keys are declared on [`static actions`](options-actions.md#action-declaration). The controller has `keysOf(action)`, `labelsOf(action)`, and `running`. `labelsOf` returns the keys as a person reads them on this platform and in the widget's language, such as `⌘D` or `Ctrl+D`. The options are `rendered`, `apple`, and `messages`.

| Declaration | Meaning |
|---|---|
| `shortcut` | On an action. A key such as `"Delete"`, `"Space"`, or `"Mod+D"`, or a list of keys. `Mod` is ⌘ on Apple devices and Ctrl elsewhere. Names are those of `KeyboardEvent.key`. `Space` and `Plus` stand for the characters. |
| `can` | On an action. The permission that allows the key for a reader. `"edit"` keeps the key to authors. Without it the key works for readers too. |
| `data-ww-shortcut="action"` | On a button in the shadow template. The module sets its `aria-keyshortcuts`. |
| `data-ww-shortcuts="off"` | On an element. Every key inside is left alone, for a part with its own keymap. |
| `data-ww-shortcuts="on"` | On a component with a closed shadow root. It says that the component holds no text entry, so the keys work while it has focus. |

A key runs the method of the same name on the widget, as the drawer does. A method that returns `false` declines the key.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Shortcuts} from "@webwriter/lit/shortcuts"
import {html} from "lit"

class WwItemList extends LitElementWw {
  static properties = {
    allowRemoving: {type: Boolean, attribute: "allow-removing", reflect: true},
    selected: {state: true},
  }

  static permissions = {
    allowRemoving: {label: {_: "Learners may remove items in this widget"}},
  }

  static actions = {
    remove: {label: {_: "Remove item"}, shortcut: ["Delete", "Backspace"], can: "allowRemoving"},
    clear: {label: {_: "Clear selection"}, shortcut: "Escape", hidden: true},
  }

  declare allowRemoving: boolean
  declare selected: Element | undefined

  #shortcuts = new Shortcuts(this)

  remove() {
    if (!this.selected) return false
    this.selected.remove()
    this.selected = undefined
  }

  clear() {
    if (!this.selected) return false
    this.selected = undefined
  }

  render() {
    return html`
      <div tabindex="0" @click=${(event: Event) => (this.selected = (event.target as Element).closest("li") ?? undefined)}>
        <slot></slot>
      </div>
      <button data-ww-shortcut="remove" ?disabled=${!this.selected} @click=${this.remove}>Remove</button>
      <small>${this.#shortcuts.labelsOf("remove").join(" / ")}</small>
    `
  }
}

customElements.define("ww-item-list", WwItemList)
```

- The module handles a key only when it comes from inside the widget, or from anywhere while the widget is fullscreen. It attaches nothing to `window`.
- Give the widget something focusable, such as a stage with `tabindex="0"`. A click on a canvas leaves the focus on the page, and the keys never arrive. The widget warns in development when nothing can take the focus.
- A key that belongs to something else is left alone: text entry, an element with a text role, an editable region of the widget, a caret in the authored children, and a key that the focused control uses itself, such as Space on a button or an arrow on a slider. The module ignores keys during text composition.
- Letters ignore case and modifiers must match exactly. A shortcut on a letter or digit also matches the key at its position on a Latin keyboard, when the key produces a letter of another script or when the combination has Alt and the key produces no Latin letter or digit.
- The editor keeps `Mod+Z`, `Mod+Shift+Z`, `Mod+Y`, and `Mod+S`. The module ignores them and warns in development.
- An action with `disabled: true`, `confirm`, or `input` has no key. A `hidden` action keeps its key, so a navigation key needs no drawer button.
- A method that returns `false` had nothing to do, such as Escape with nothing to cancel. The key goes to the next action that declares it, and to the page when none takes it. Any other result, also `undefined` and a promise, takes the key.
- The method runs as one undo step. The step ends after the next render, or after the returned promise settles and the widget has rendered. A second press of the key does not start the action again while its promise is pending.
- An action whose permission is not granted does nothing.

### Drag

Drag lets a reader or an author pick up items and put them on targets. The items can be authored children or elements that the template renders. Use it to reorder, to move between lists, to copy from a palette, to place an item at a point, or to draw a link from an item to a target.

Import `Drag` from `@webwriter/lit/drag`. The module also exports the types `DragCommitDetail`, `DragPickDetail`, and `DragEffect`. The controller has `item`, the element being dragged or picked up, and `via`, which is `"pointer"`, `"keyboard"`, `"click"`, or null. The options are `can`, `rendered`, `messages`, `lift`, `duration`, and `easing`.

| Marker | Goes on | Meaning |
|---|---|---|
| `data-ww-drag="kind"` | An item, or a `<slot>` | An item of this kind. On a `<slot>` the assigned authored elements are the items. |
| `data-ww-key` | An item | Its identity. The events report it as `key`. |
| `data-ww-drag-handle` | A part of an item | Only this part starts the drag. On a `<slot data-ww-drag>` it says that the assigned elements carry their own handle. |
| `data-ww-drag-via="pointer keyboard click"` | An item or its `<slot>` | The ways the item is picked up. Without it all three work. |
| `data-ww-drag-effect="move\|copy\|link"` | An item or its `<slot>` | `copy` leaves the item where it is. `link` draws a connector from the item to the pointer. The default is `move`. |
| `data-ww-drag-axis="x\|y"` | An item | The item moves along this axis only. |
| `data-ww-drop="kind …"` | A target | The kinds the target accepts. |
| `data-ww-drop-position="index"` | A target | The target also resolves a place among its items. |
| `data-ww-drop-position="point"` | A target | The target resolves a point on its surface. `data-ww-drop-grid="step"` snaps it. |
| `data-ww-drop-max="n"` | A target | The capacity. `data-ww-drop-full="swap"` accepts an item when the target is full and reports the occupant as `displaced`. |
| `data-ww-drop-linked="key …"` | A target of links | The keys of the items linked to it, so that capacity and swap hold for links too. |
| `data-ww-label` | An item or a target | Its name in announcements. |

| Event | Dispatched on | Meaning |
|---|---|---|
| `ww-dragpick` | The item | The item was picked up. A handler can remove entries from `detail.candidates`. `preventDefault()` refuses the pick-up. |
| `ww-dragcommit` | The target | The item was dropped. `detail` has `item`, `key`, `kind`, `effect`, `source`, `target`, `displaced`, `index`, `before`, `x`, `y`, and `slot`. `preventDefault()` refuses the drop. |

Both events are cancelable and bubble. The first example orders authored children and picks them up by pointer and keyboard only, because a click selects them. The children are focusable in the authored markup, such as `<li tabindex="0">`. Drag moves the children itself.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Drag} from "@webwriter/lit/drag"
import {Permissions} from "@webwriter/lit/permissions"
import {html, nothing} from "lit"

class WwSortList extends LitElementWw {
  static properties = {
    allowReordering: {type: Boolean, attribute: "allow-reordering", reflect: true},
  }

  static permissions = {
    allowReordering: {label: {_: "Learners may reorder the items"}},
  }

  declare allowReordering: boolean

  #permissions = new Permissions(this)
  #drag = new Drag(this, {can: () => this.#permissions.can("allowReordering")})

  constructor() {
    super()
    this.allowReordering = false
  }

  render() {
    const kind = this.#permissions.can("allowReordering") ? "item" : nothing
    return html`
      <div data-ww-drop="item" data-ww-drop-position="index">
        <slot data-ww-drag=${kind} data-ww-drag-via="pointer keyboard"></slot>
      </div>
    `
  }
}

customElements.define("ww-sort-list", WwSortList)
```

For items that the template renders, update the widget's state in the `ww-dragcommit` handler. Drag then animates every item from its old place to its new one.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Drag, type DragCommitDetail} from "@webwriter/lit/drag"
import {html} from "lit"
import {repeat} from "lit/directives/repeat.js"

class WwRankList extends LitElementWw {
  static properties = {
    order: {type: Array, reflect: true},
  }

  declare order: string[]

  #drag = new Drag(this)

  constructor() {
    super()
    this.order = ["Mercury", "Venus", "Earth"]
  }

  #commit(event: CustomEvent<DragCommitDetail>) {
    const {key, index} = event.detail
    if (key === undefined || index === null) return
    const order = this.order.filter(name => name !== key)
    order.splice(index, 0, key)
    this.order = order
  }

  render() {
    return html`
      <ol data-ww-drop="planet" data-ww-drop-position="index" @ww-dragcommit=${this.#commit}>
        ${repeat(this.order, name => name, name => html`<li data-ww-drag="planet" data-ww-key=${name}>${name}</li>`)}
      </ol>
    `
  }
}

customElements.define("ww-rank-list", WwRankList)
```

- An item is picked up by a pointer drag, by Space or Enter, or by a click. It is dropped by releasing it on a target, by a click on a target, or by the arrow keys and Enter. Escape, a canceled pointer, and a release outside a target commit nothing.
- An item that leaves out `keyboard` in `data-ww-drag-via` needs another way to be moved without a pointer. The arrow keys step through the places of an index target. In a point target they move the item by the grid step, or by 10 pixels without a grid and 1 pixel with Shift. Tab switches between targets.
- The module asks `can` before a drag starts, while it runs, and before it commits. The module has no edit mode of its own. Pass a function that reads [Permissions](#permissions).
- The commit event and the render after it form one undo step.
- For an authored child that moves, the module puts it before the item at `detail.before`, with `moveBefore()` where the browser has it so that a child widget keeps its state, and writes the target slot's name to the child's `slot` attribute. It writes nothing else to authored elements. A drop on the item's own place is no commit.
- The module adds `tabindex="0"` to a shadow-rendered item that the keyboard can pick up and that has no `tabindex`. It never adds one to an authored child. A child that the keyboard should pick up needs its own `tabindex` or a focusable handle.
- Animations of the move are skipped for a reader who prefers reduced motion.
- The module sets `touch-action: none` only on what starts a drag, and only while `can` holds. Other touches still scroll.
- The module announces pick-up, target, drop, and cancellation in a live region, in the widget's language. `data-ww-label` supplies the names.
- Style hooks on shadow elements are `data-ww-dragging` (rendered items), `data-ww-drop-candidate`, `data-ww-drop-over`, `[data-ww-drop-marker]` with `part="ww-drop-marker"`, and `[data-ww-drag-connector]` with `part="ww-drag-connector"`.

### Viewport

Viewport zooms and pans one window onto content that is larger than the widget. Use it for a diagram, a map, a floor plan, or a canvas.

Import `Viewport` from `@webwriter/lit/viewport`. The controller has `x`, `y`, `scale`, `min`, `max`, `width`, and `height`. The methods are `zoomBy(factor, about?)`, `zoomTo(scale, about?)`, `panBy(dx, dy)`, `fit()`, `toWorld(clientX, clientY)`, `toClient(worldX, worldY)`, and `contentChanged()`. A world point `w` is drawn at `w * scale + (x, y)` in CSS pixels from the top-left corner of the window.

| Declaration | Meaning |
|---|---|
| `data-ww-viewport` | The window. A widget has one. By default it is a scroll container: panning is its scroll position, and zoom is the CSS `zoom` of its first child. |
| `data-ww-viewport="canvas"` | The window is a surface that the widget draws. A `<canvas data-ww-viewport>` is the same. The module keeps `x`, `y`, and `scale`, and the widget applies them. |
| `data-ww-viewport="external"` | A library owns the view. Pass `adapter` so that the buttons and keys can drive it. |
| `data-ww-viewport-zoom="min max"` | The zoom limits. The default is `0.25 4`. |
| `data-ww-viewport-fit="content\|width\|none"` | What fit shows. The default is `content`. |
| `data-ww-viewport-pan="x\|y"` | Restricts input panning to one axis. |
| `data-ww-viewport-save="name"` | The widget attribute that keeps the view as `x y scale`, the world point in the center of the window and the scale. |
| `data-ww-viewport-controls` | An element that receives four buttons: zoom out, zoom in, the current percent (which resets to 100 %), and fit. |

The options are `can`, `canSave`, `bounds`, `margin`, `adapter`, `rendered`, and `messages`. `bounds` returns the extent of the content in world coordinates for the canvas form. Fit shows it, and panning stays within it.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Permissions} from "@webwriter/lit/permissions"
import {Viewport} from "@webwriter/lit/viewport"
import {html} from "lit"

class WwFloorPlan extends LitElementWw {
  static properties = {
    src: {type: String, reflect: true},
    allowPanning: {type: Boolean, attribute: "allow-panning", reflect: true},
  }

  static permissions = {
    allowPanning: {label: {_: "Learners may pan and zoom the plan"}},
  }

  declare src: string
  declare allowPanning: boolean

  #permissions = new Permissions(this)
  #viewport = new Viewport(this, {
    can: () => this.#permissions.can("allowPanning"),
    canSave: () => this.#permissions.editing,
  })

  constructor() {
    super()
    this.src = ""
    this.allowPanning = false
  }

  render() {
    return html`
      <div style="height: 300px" data-ww-viewport data-ww-viewport-zoom="0.5 4" data-ww-viewport-save="view" aria-label="Floor plan">
        <img src=${this.src} width="1200" height="800" alt="" />
      </div>
      <div data-ww-viewport-controls></div>
      <output>${Math.round(this.#viewport.scale * 100)} %</output>
    `
  }
}

customElements.define("ww-floor-plan", WwFloorPlan)
```

- Wheel, drag, pinch, keys, and buttons change the view. `Ctrl` or `⌘` with the wheel zooms. In the scroll form the wheel pans natively. The keys are the arrow keys, `+`, `-`, and `0`. While the window has focus, holding Space turns a drag into panning. The middle button does the same.
- `can` gates input and locks the view when it returns false. The methods of the controller are the widget's own code and always work.
- The view is saved to the `data-ww-viewport-save` attribute after it has been still for 200 ms, as one undo step. A fitted view removes the attribute. The module saves in every mode. Pass `canSave: () => permissions.editing` to save the authors' view only.
- A saved view that changes from outside, through undo or another participant, is shown.
- The module adds `tabindex="0"`, `role="group"`, and an `aria-label` to the window where the template has none. Buttons that can do nothing get `aria-disabled`.
- The scroll form writes its zoom into the module's own style sheet, not into the template.
- The controller renders the widget again when the scale changes, and in the canvas form also when the position or size changes.

### Help

Help shows an overlay with one label for each marked control. Use it for a toolbar or a tool with controls that a reader may not recognize.

Import `Help` from `@webwriter/lit/help`. The controller has `open`, `form`, `toggle(force?)`, and `close()`. `form` is `"labels"`, or `"list"` when the widget is too small for labels, and null while the overlay is closed. The options are `anchor` and `messages`. `anchor` selects CSS anchor positioning for the labels. The default is whether the browser supports it.

| Declaration | Meaning |
|---|---|
| `data-ww-help="text"` | On a control or region. The label text. Write it in the widget's language. |
| `data-ww-help-toggle` | On the button that opens and closes the overlay. |
| `data-ww-help-order="n"` | On a marked element. Elements with a number come first, in ascending order, then the others in template order. |
| `data-ww-help-side="top\|bottom\|left\|right"` | On a marked element. The side where the label is tried first. |

```ts
import {LitElementWw} from "@webwriter/lit"
import {Help} from "@webwriter/lit/help"
import {html} from "lit"

class WwToolbar extends LitElementWw {
  #help = new Help(this)

  render() {
    return html`
      <button data-ww-help="Add a node" data-ww-help-order="1">Add</button>
      <button data-ww-help="Remove the selected node" data-ww-help-order="2">Remove</button>
      <div tabindex="0" data-ww-help="The diagram. Use the arrow keys to move the selection."><slot></slot></div>
      <button data-ww-help-toggle aria-label="Help">?</button>
      ${this.#help.open ? html`<small>Press Escape to close the help.</small>` : null}
    `
  }
}

customElements.define("ww-toolbar", WwToolbar)
```

- The overlay shows a label for each marked element that is rendered, visible, and inside the widget. An element with empty text gets none.
- The module appends the overlay to the widget's shadow root, builds it from the live template, and keeps nothing of it between layouts. It exists only while the overlay is open. Its style sheet makes the host a positioning context with `position: relative`.
- While the overlay is open, `aria-describedby` on each element points to its label. For a custom element the same label also describes the control inside its open shadow tree. The module also sets `aria-pressed` on the toggle. These are the only writes to the template.
- While the overlay is open, the module compares the rectangles of the marked elements once per animation frame and lays the labels out again when one moved.
- Escape closes the overlay from anywhere on the page. A click on the overlay closes it. Focus returns to the toggle unless the reader has moved it elsewhere.

### Scene

Scene draws a description of nodes, shapes, paths, text, and images, and reports what the reader does with it. Use it for diagrams, graphs, and circuits where items can be selected, moved, resized, and wired.

Import `SceneController` from `@webwriter/lit/scene`, and `sceneElements` and the event types from `@webwriter/widget/scene`. Register the elements in the widget's scoped registry with `static scopedElements = {...sceneElements}`. For WebGL rendering, register `PixiScene` from `@webwriter/widget/scene/pixi` as `ww-scene`. Only this import bundles `pixi.js`. Use `webglAvailable()` from `@webwriter/widget/scene` to select the renderer.

The controller has `marquee`, `extent()`, `restyle()`, and `remeasure()`. The options are `can`, `viewport`, `rendered`, and `messages`. `can` is a function `(action, item)` or a map from an action to a permission name, such as `{move: "allowMoving"}`. The actions are `select`, `move`, `resize`, and `connect`. `viewport` takes the `core` of a [Viewport](#viewport) for a scene that is the window of a canvas viewport.

| Element | Attributes | Draws |
|---|---|---|
| `ww-scene` | `select="none\|single\|multiple"`, `grid` | The scene. `grid` snaps moves and resizes to its multiples. |
| `ww-node` | `x`, `y`, `width`, `height`, `resizable`, `keep-ratio` | The HTML content of the node at a scene position. |
| `ww-group` | `x`, `y`, `scale` | Its children, moved and scaled together. |
| `ww-shape` | `kind="rect\|circle\|polygon"`, `x`, `y`, `width`, `height`, `r`, `points` | A shape. |
| `ww-path` | `from`, `to`, `route="straight\|step\|curve"` | A line between two ports, written `node:port`. A path without `from` and `to` follows its `points` property, relative to its `x` and `y`. |
| `ww-text` | `x`, `y` | Its text content. |
| `ww-image` | `x`, `y`, `width`, `height`, `href` | A picture. The `source` property takes an image source such as a canvas. |
| `ww-sprites` | `texture` | A batch of sprites from its `items` property. Pixi renderer only. |

Every element also takes `data-ww-key`, `selected`, `selectable`, `movable`, and `aria-label`. A path refers to a node by its key, and the events report keys. Style drawn elements with CSS: they take `stroke`, `fill`, and the font properties from their computed style. A port is an element with `data-ww-port="name"` inside a node. `data-ww-link="kind"` on a port starts a wire. `data-ww-accept="kind …"` on a port accepts wires of these kinds. `data-ww-side` sets the side where a path leaves a port.

| Event | Meaning |
|---|---|
| `ww-select` | The reader asks for a selection. `detail.keys` and `detail.items`. |
| `ww-move` | The reader moved items. `detail.items` has the key and the new `x` and `y` of each item. `detail.dx` and `detail.dy` give the movement of the lead item. |
| `ww-resize` | The reader resized a node. `detail` has `key`, `item`, `x`, `y`, `width`, and `height`. |
| `ww-connect` | The reader connected two ports. `detail` has `from`, `to` (`node:port`), `kind`, `source`, and `target`. |
| `ww-sceneerror` | The scene cannot draw something. `detail.code` is `load`, `unsupported`, or `webgl`. |

```ts
import {css, html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {SceneController} from "@webwriter/lit/scene"
import {sceneElements, type MoveDetail, type SelectDetail} from "@webwriter/widget/scene"

type Box = {id: string; x: number; y: number}

class WwBoxes extends LitElementWw {
  static scopedElements = {...sceneElements}

  static properties = {
    boxes: {type: Array, reflect: true},
    allowMoving: {type: Boolean, attribute: "allow-moving", reflect: true},
    selection: {state: true},
  }

  static permissions = {
    allowMoving: {label: {_: "Learners may move the boxes"}},
  }

  static styles = css`
    ww-scene { height: 240px; border: 1px solid #c8c8c8; }
    ww-node { padding: 8px 14px; background: white; border: 1px solid #6b7280; }
    ww-path { stroke: #6b7280; stroke-width: 2px; }
  `

  declare boxes: Box[]
  declare allowMoving: boolean
  declare selection: string[]

  #scene = new SceneController(this, {can: {move: "allowMoving"}})

  constructor() {
    super()
    this.boxes = [{id: "a", x: 20, y: 20}, {id: "b", x: 200, y: 120}]
    this.allowMoving = false
    this.selection = []
  }

  #select(event: CustomEvent<SelectDetail>) {
    this.selection = event.detail.keys
  }

  #move(event: CustomEvent<MoveDetail>) {
    const moved = new Map(event.detail.items.map(item => [item.key, item]))
    this.boxes = this.boxes.map(box => {
      const to = moved.get(box.id)
      return to ? {...box, x: to.x, y: to.y} : box
    })
  }

  render() {
    return html`
      <ww-scene select="single" grid="10" @ww-select=${this.#select} @ww-move=${this.#move}>
        <ww-path from="a" to="b" route="curve"></ww-path>
        ${this.boxes.map(
          box => html`
            <ww-node data-ww-key=${box.id} x=${box.x} y=${box.y} selectable movable ?selected=${this.selection.includes(box.id)}>
              Box ${box.id}
            </ww-node>
          `,
        )}
      </ww-scene>
    `
  }
}

customElements.define("ww-boxes", WwBoxes)
```

- The scene changes no document. Each interaction previews and then ends in one cancelable event that bubbles. The widget applies the change to its model. The event and the render after it form one undo step. `preventDefault()` refuses the change.
- The selection is the widget's. The scene reads the `selected` attribute and asks for a change with `ww-select`.
- The module asks `can` before a selection, move, resize, or connection, during it, and before it commits. An interaction ends when the answer turns false.
- Pointer, touch, and keyboard all work. A node that is `selectable` or `movable` takes focus. Arrow keys move the selection and commit after a short rest. Moves and wires are announced in a live region.
- The scene writes no position or size to its elements. A preview is a Web Animation that ends with the interaction. A `selectable` or `movable` node without a `tabindex` gets `tabindex="0"`. A port that starts a wire gets `tabindex`, `role="button"`, and an `aria-label` where the template sets none, while the reader may connect, and loses them again. Drawn elements and `ww-scene` have custom states such as `:state(hover)` for CSS.
- A scene inside a scrolling `data-ww-viewport` is zoomed from outside. Pass `viewport` only for the canvas form.
- Call `restyle()` after a style change that no observer sees, and `remeasure()` when ports moved without a change of the document.

### Playback

Playback holds the run state of a widget that plays over time and gives it the interface of a media element. Use it for a slideshow, a simulation, or a video or audio element.

Import `Playback` from `@webwriter/lit/playback`. Choose one way to configure the run in the options.

| Option | Run |
|---|---|
| `step(dt)` | A continuous run. The function advances the simulation by `dt` seconds. |
| `steps()` and `show(index)` | A discrete run with that many steps. This enables `back` and `seek`. A template can read `currentStep` instead of `show`. |
| `play()` and `pause()` | A run that lives elsewhere, such as a worker. |
| `media()` | A `<video>` or `<audio>` element of the template. |

The other options are `interval` (seconds per step or fixed timestep, default 1), `rates` (default `[0.5, 1, 2, 4]`), `reset`, `draw`, `autoplay`, `can(command)`, and `messages`. The controller has `paused`, `ended`, `playbackRate`, `currentTime`, `duration`, `currentStep`, and `steps`, and the methods `play()`, `pause()`, `toggle()`, `step()`, `back()`, `seek(position)`, `reset()`, and `run(command, position?)`.

| Declaration | Meaning |
|---|---|
| `data-ww-playback="toggle\|play\|pause\|step\|back\|reset\|rate"` | On a button. The module sets its icon, its label, and `aria-disabled`. |
| `data-ww-playback="seek"` | On a range input. |
| `data-ww-playback="time"` | On an `<output>`. It shows the time in the widget's language. |

The module dispatches `ww-playbackchange` on the host when the state changes. `detail` is the snapshot: `paused`, `ended`, `playbackRate`, `step`, `steps`, `currentTime`, and `duration`.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Playback} from "@webwriter/lit/playback"
import {html} from "lit"

const STEPS = ["Boil the water", "Add the pasta", "Drain and serve"]

class WwRecipe extends LitElementWw {
  #playback = new Playback(this, {steps: () => STEPS.length, interval: 3})

  render() {
    const playback = this.#playback
    return html`
      <p>${playback.currentStep + 1}. ${STEPS[playback.currentStep]}</p>
      <button data-ww-playback="back"></button>
      <button data-ww-playback="toggle"></button>
      <button data-ww-playback="step"></button>
      <input type="range" data-ww-playback="seek" />
      <output data-ww-playback="time"></output>
    `
  }
}

customElements.define("ww-recipe", WwRecipe)
```

A continuous run advances in `step` and paints in `draw`. The widget does not render again for the time that passes.

```ts
import {LitElementWw} from "@webwriter/lit"
import {Playback} from "@webwriter/lit/playback"
import {html} from "lit"

class WwDrift extends LitElementWw {
  #x = 0
  #playback = new Playback(this, {
    step: dt => (this.#x = (this.#x + 30 * dt) % 200),
    interval: 1 / 60,
    reset: () => (this.#x = 0),
    draw: () => {
      const dot = this.renderRoot.querySelector<HTMLElement>(".dot")
      if (dot) dot.style.left = `${this.#x}px`
    },
    autoplay: true,
  })

  render() {
    return html`
      <div style="position: relative; height: 20px"><span class="dot" style="position: absolute">●</span></div>
      <button data-ww-playback="toggle"></button>
      <button data-ww-playback="rate"></button>
      <button data-ww-playback="reset"></button>
    `
  }
}

customElements.define("ww-drift", WwDrift)
```

- The run state is runtime state. The module writes nothing to the document.
- The loop runs only while the widget is on screen in a visible tab. See [`whileVisible`](#helpers-transaction-and-whilevisible).
- `autoplay: true` starts the run when the widget is first shown. It does not start in edit mode, and not for a reader who prefers reduced motion. `autoplay: "always"` starts for that reader too.
- `can(command)` gates the marked controls and `run()`. The methods `play()`, `step()`, and the others are the widget's own code and are not gated.
- A button that can do nothing gets `aria-disabled` and keeps keyboard focus. The range input gets `aria-valuetext`.
- The module binds no keys. Bind Space to a method that calls `run("toggle")` with [Shortcuts](#shortcuts).
- The host renders again when the run state changes. The time output and the scrubber update without a render while the run plays.

### Data block (`jsonData`)

`jsonData` gives typed access to the widget's JSON [data block](data.md). Use it for what a reader enters or what a session shares.

Import `jsonData` from `@webwriter/lit/data`. `jsonData(this, options)` returns a controller with `get()`, `set(partial, {force}?)`, `flush()`, `unsaved`, and `invalid`. The module also exports `toDataURL`, `fromDataURL`, and `DATA_URL_LIMIT` for small files that the JSON holds as text.

| Option | Meaning |
|---|---|
| `defaults` | Required. The value for keys that the block does not have. It is never written to the block. |
| `validate` | Checks a snapshot from the block, merged over the defaults. |
| `save.debounce` | A burst of `set()` calls becomes one write after this many milliseconds. |
| `changed` | Called when a snapshot from outside changes the value, not for the echo of the widget's own write. |
| `block` | `"participant"` (default) or `"document"`. The kind of block that the first write creates. |
| `editing` | A function that tells edit mode. The default is the answer of the widget. |

The module dispatches `ww-dataerror` on the host with `detail: {error, text}`.

```ts
import {LitElementWw} from "@webwriter/lit"
import {jsonData} from "@webwriter/lit/data"
import {html} from "lit"

class WwTally extends LitElementWw {
  #data = jsonData<{count: number}>(this, {
    defaults: {count: 0},
    validate: ({count}) => Number.isInteger(count) && count >= 0,
  })

  #add() {
    this.#data.set({count: this.#data.get().count + 1})
  }

  render() {
    return html`<button @click=${this.#add}>Clicked ${this.#data.get().count} times</button>`
  }
}

customElements.define("ww-tally", WwTally)
```

A widget that stores participant data has a block like this in its authored HTML. The first write creates it when it is missing.

```html
<ww-tally>
  <script type="application/json" slot="data">{"count": 3}</script>
</ww-tally>
```

- `get()` returns the defaults, overlaid with the last valid snapshot of the block and with changes that are not written yet. It is the same object until the value changes. The widget renders again when the value changes, from inside or outside.
- `set(partial)` changes the value at once and writes once per task. A key set to `undefined` is removed. Inside an open undo transaction the write is immediate and belongs to that step. Otherwise the write is its own undo step.
- Pending changes are written when the widget leaves edit mode, when the page becomes hidden, and when the widget disconnects.
- A snapshot that is not a JSON object or that fails `validate` is ignored as a whole and reported with `ww-dataerror`. The value stays as it was. Writes are held back so that the widget does not replace data it did not understand. `set(partial, {force: true})` replaces the block.
- Keys that the widget does not know are kept and written back.
- A snapshot that arrives while a change waits to be written keeps the widget's value for the keys that it changed. Every other key takes the snapshot's value.
- A write waits while a managed scope is pending. Without the managed runtime the block stays local.
- A block that is already there is used as it is. A participant block has `slot="data"`, so the host keeps it per participant, per group, or for everyone with `sharedData: true` in the [editing configuration](editing-configuration.md). A document block has no slot and is saved with the document. The module warns in development when the block and `block` disagree.
- Keep files below `DATA_URL_LIMIT` (100 KB). The whole block is written again with every save.

### Localization (`localizer`, `widgetMsg`)

`localizer` loads the catalog of the widget's language and answers `msg()` for the widget's own text. `widgetMsg` does the same for a component inside the widget's shadow tree. Use them with [`@lit/localize`](https://lit.dev/docs/localization/overview/).

Import `localizer` and `widgetMsg` from `@webwriter/lit/localize`. `localizer(this, options)` returns the object that `LitElementWw` expects in `this.localize`: `getLocale()`, `setLocale(tag)`, `msg`, and `loaded`, a promise that settles when the catalog that was asked for last is in or failed. The widget's effective language selects the locale.

| Option | Meaning |
|---|---|
| `sourceLocale` | The language of the source text in the `msg()` calls. |
| `targetLocales` | The languages that have a catalog. |
| `load(locale)` | Imports the catalog of a target locale, such as ``(locale) => import(`./generated/${locale}.js`)``. |
| `prefer` | The widget's own choices among its locales, tried before the likely script and region: `{pt: "pt-PT"}`. |
| `drawer` | Sends `optionschange` after a language change, so that the editor reads declarations again. Set it when texts of declarations are computed with `msg`. |

The module dispatches `localizationerror` on the host with `detail: {locale, error}` when a catalog cannot be loaded.

```ts
import type {MsgFn} from "@lit/localize"
import {LitElementWw} from "@webwriter/lit"
import {localizer, widgetMsg} from "@webwriter/lit/localize"
import {LitElement, html} from "lit"

class WwBadge extends LitElement {
  msg = widgetMsg(this)

  render() {
    return this.msg("Ready")
  }
}

class WwGreeting extends LitElementWw {
  static scopedElements = {"ww-badge": WwBadge}

  static options = {
    loud: {type: Boolean, label: (widget: {msg: MsgFn}) => widget.msg("Greet loudly")},
  }

  static actions = {
    reset: {label: (widget: {msg: MsgFn}) => widget.msg("Reset"), confirm: (widget: {msg: MsgFn}) => widget.msg("Reset the greeting?")},
  }

  static permissions = {
    allowReset: {label: (widget: {msg: MsgFn}) => widget.msg("Learners may reset the greeting")},
  }

  localize = localizer(this, {
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    load: locale => import(`./generated/${locale}.js`),
    drawer: true,
  })

  msg = this.localize.msg

  reset() {
    this.removeAttribute("loud")
  }

  render() {
    return html`<p>${this.msg("Good morning!")} <ww-badge></ww-badge></p>`
  }
}

customElements.define("ww-greeting", WwGreeting)
```

The text of `static options`, `static actions`, `static optionGroups`, and `static permissions` may be a function of the widget, such as `label: (widget) => widget.msg("Reset")`. This also holds for `description`, `placeholder`, `confirm`, `disabledReason`, and the `label` and `description` of a choice. The editor reads plain maps, so the base class answers these declarations on the instance with the functions asked. A member that the subclass defines itself, such as `get options()`, is left alone. Type the parameter by what the function reads, as in `(widget: {msg: MsgFn})`.

- Keep `msg` typed as `MsgFn`. The extraction of `@lit/localize-tools` finds a message by the type of the function that is called. [Localize a widget](../guides/localization.md) describes the catalog files.
- Accept any language tag in `setLocale()`. It matches the tag to one of `sourceLocale` and `targetLocales`. It never rejects.
- The first paint is in the source language. The widget renders again when its catalog is in. A widget that must not show the source language first awaits `this.localize.loaded` in `scheduleUpdate()` before its first update.
- A catalog is loaded once per widget class. A catalog that arrives after another language was asked for is dropped.
- A failed load is not cached. The module asks again with the next `setLocale()`, when the browser is online again, and when another instance has loaded the catalog.
- `widgetMsg(this)` asks the surrounding widget for its language, renders the component again when the language changes, and returns the source text outside a widget.
- The module's own text, such as the labels of the Playback buttons, has its own catalogs and follows the widget's language without `localizer`.

### Exercise

Exercise holds the part of a question that is the same in every exercise: the submission through a form, the `submitted` lock, the Check, Reset, and Show solution actions, the feedback mode, and the spoken summary. The widget keeps reading the response, grading, and rendering.

Import `Exercise`, `exerciseProperties`, `exerciseOptions`, `scoreOf`, `firstOrder`, `exerciseAggregate`, and `obfuscated` from `@webwriter/lit/exercise`. The class needs `static formAssociated = true`. Spread `exerciseProperties` into `static properties` and `exerciseOptions` into `static options`. They add the attributes `feedback`, `required`, and `submitted` and the drawer entries for the first two. [Aggregated view](aggregated-view.md) describes `static aggregate`, which `exerciseAggregate` builds.

| Option | Meaning |
|---|---|
| `response()` | The reader's response, or undefined until the reader has answered. |
| `respond(response)` | Stores the response, or clears it with undefined. It runs inside an undo step, so it writes at once, as `jsonData` does. |
| `solution()` | The authored solution, or undefined if there is none yet. |
| `record(solution)` | Stores the solution that an author enters. Without it `answer()` does nothing in edit mode. |
| `score(response, solution)` | Grades the response. It returns at least `{correct, total}`. `scoreOf(marks)` builds one. |
| `showSolution` | The name of the permission that lets a reader see the solution. It adds the `showSolution` action. |
| `anchor()` | The element that the browser points at when it reports a missing response. |
| `serialize(response)` | The form value. The default is a string as it is and anything else as JSON. |
| `announce`, `messages`, `rendered` | Speak the summary (default true), replace texts, and wait for the render. |

The controller has `editing`, `locked`, `mode`, `result`, `summary`, `revealed`, `text`, `seed`, `internals`, `available(name)`, `check()`, `reset()`, `showSolution(show?)`, `respond(response)`, and `answer(value)`. The widget declares the helper's actions with `get actions() { return this.#exercise.actions }` and has a method for each action. It forwards the platform's form callbacks.

```ts
import {LitElementWw} from "@webwriter/lit"
import {jsonData} from "@webwriter/lit/data"
import {Exercise, exerciseOptions, exerciseProperties, obfuscated, scoreOf} from "@webwriter/lit/exercise"
import {html, nothing} from "lit"

class WwQuestion extends LitElementWw {
  static formAssociated = true

  static properties = {
    ...exerciseProperties,
    solution: {converter: obfuscated, reflect: true},
  }

  static options = {...exerciseOptions}

  declare solution: string | undefined

  #data = jsonData<{choice?: string}>(this, {defaults: {}})
  #exercise = new Exercise<string>(this, {
    response: () => this.#data.get().choice,
    respond: choice => this.#data.set({choice}),
    solution: () => this.solution,
    record: id => (this.solution = id),
    score: (choice, solution) => scoreOf([choice === solution]),
    anchor: () => this.renderRoot.querySelector("input"),
  })

  get actions() {
    return this.#exercise.actions
  }

  check() {
    this.#exercise.check()
  }

  reset() {
    this.#exercise.reset()
  }

  formResetCallback() {
    this.#exercise.formReset()
  }

  formDisabledCallback(disabled: boolean) {
    this.#exercise.formDisabled(disabled)
  }

  formStateRestoreCallback(state: unknown, mode: string) {
    this.#exercise.formStateRestore(state, mode)
  }

  render() {
    const {editing, locked, summary} = this.#exercise
    const ticked = editing ? this.solution : this.#data.get().choice
    return html`
      ${[...this.querySelectorAll<HTMLDataElement>(":scope > data")].map(
        choice => html`
          <label>
            <input type="radio" name="choice" .checked=${ticked === choice.value} ?disabled=${locked} @change=${() => this.#exercise.answer(choice.value)} />
            ${choice.textContent}
          </label>
        `,
      )}
      ${editing ? nothing : html`<button ?disabled=${!this.#exercise.available("check")} @click=${this.check}>${this.#exercise.text.check}</button>`}
      <output>${summary}</output>
    `
  }
}

customElements.define("ww-question", WwQuestion)
```

The author writes the choices as `<data>` children and ticks the correct one in edit mode.

```html
<ww-question>
  <data value="a">Mercury</data>
  <data value="b">Venus</data>
</ww-question>
```

- In edit mode `answer(value)` records the solution with `record`. In read mode it stores the response with `respond`. Nothing else in the module writes the solution. `check()` and `reset()` never touch it. No feedback is shown in edit mode.
- A response that the widget stores with `respond()` or `answer()` removes the `submitted` attribute in the same undo step. A response that arrives from outside leaves it.
- While `submitted` is present in read mode, `locked` is true and the actions are unavailable. Pass `() => !exercise.locked` as `can` to the modules that change the response, such as Drag.
- The form value is the response, and null until the reader has answered. With the `required` attribute a missing response is a `valueMissing` error. Forward `formResetCallback`, `formDisabledCallback`, and `formStateRestoreCallback`, as in the example. A disabled fieldset locks the widget.
- `result` is the score while feedback is shown, otherwise null. Feedback appears after Check, or, with `feedback="submit"`, once the response is submitted. A new response ends the feedback of Check.
- The summary is spoken when feedback appears. Pass `announce: false` when the widget shows it in an `<output>`, which is a live region.
- The solution is stored with `obfuscated`. It is hidden from a glance at the source, not encrypted. Anyone who reads the document source can recover it.
- `firstOrder(items, {seed, solution})` shuffles the first order of items with the seed of the widget instance. The order is the same in every render and differs for each reader. It never returns the solution.
- The helper puts the action labels in the catalogs of its own. Their texts follow the language of the document. Pass `messages` to replace them.

### Helpers (`transaction` and `whileVisible`)

Two small functions of `@webwriter/widget` serve widgets that use no module for the task.

`transaction(host, change)` from `@webwriter/widget/transaction` runs `change` as one [undo step](runtime.md#undo-transactions). It dispatches `ww-transactionstart` on the host before `change` and `ww-transactionend` after it, also when `change` throws. If `change` returns a promise, the step ends when the promise settles.

`whileVisible(host, step, options?)` from `@webwriter/widget/visible` calls `step(dt)` once per animation frame, with the seconds since the last frame. It returns `{running, stop()}`. `options.maxDelta` cuts the longest frame, in seconds. The default is 0.1.

```ts
import {LitElementWw} from "@webwriter/lit"
import {transaction} from "@webwriter/widget/transaction"
import {whileVisible, type VisibleLoop} from "@webwriter/widget/visible"
import {html} from "lit"

const COLORS = ["#2563eb", "#16a34a", "#dc2626"]

class WwPulse extends LitElementWw {
  static properties = {
    color: {type: String, reflect: true},
  }

  declare color: string

  #loop: VisibleLoop | undefined
  #phase = 0

  constructor() {
    super()
    this.color = COLORS[0]
  }

  connectedCallback() {
    super.connectedCallback()
    this.#loop = whileVisible(this, dt => {
      this.#phase += dt
      const dot = this.renderRoot.querySelector<HTMLElement>(".dot")
      if (dot) dot.style.opacity = String(0.5 + 0.5 * Math.sin(this.#phase * 4))
    })
  }

  disconnectedCallback() {
    this.#loop?.stop()
    super.disconnectedCallback()
  }

  #recolor() {
    const next = COLORS[(COLORS.indexOf(this.color) + 1) % COLORS.length]
    // The reflected attribute is written at the render, so the undo step lasts until then.
    transaction(this, async () => {
      this.color = next
      await this.updateComplete
    })
  }

  render() {
    return html`
      <span class="dot" style="color: ${this.color}">●</span>
      <button @click=${this.#recolor}>Change color</button>
    `
  }
}

customElements.define("ww-pulse", WwPulse)
```

- Use `transaction` for a change that no module makes. Lit writes a reflected attribute at the render, so wait for `this.updateComplete` inside the transaction as in the example.
- Nested calls for the same host send only the outermost pair. A host that leaves the document ends its transaction at once. A host that is moved within the same task stays open.
- `whileVisible` waits while the host is off screen, removed from the document, or in a hidden tab, and goes on by itself when that ends. The first frame after a pause reports no time, so nothing jumps.
- Start the loop when the run starts and stop it when the run pauses or the widget disconnects. A stopped loop cannot be restarted. Call `whileVisible` again.
- A host with `display: contents` has no box to observe and counts as on screen. A host with `content-visibility: auto` also pauses while the browser skips its content.

## Signals

The `@webwriter/lit` package re-exports [Lit Signals](https://lit.dev/docs/data/signals/). Its exports include `SignalWatcher`, `signal`, `computed`, `watch`, and a version of `html` that reads signals.

When you build widgets separately, use compatible dependency versions. Use `@webwriter/build --shared-dependencies` so the widgets use one polyfill instance. With a different bundler, keep `@webwriter/lit`, Lit Signals, and the polyfill external.

The [runtime signal interface](runtime.md#signals) describes effect declarations and connection syntax. The example clears its source when the connection aborts.

`LitElementWw` tracks the signals that `render()` reads with `.get()`. A change to one of these signals starts an update. The display uses these updates to format the converter's Fahrenheit output. To update one binding, pass the signal to the `html` template.

```html
<ww-temperature-sensor id="sensor"></ww-temperature-sensor>
<ww-fahrenheit-converter id="converter" effect="#sensor[celsius]"></ww-fahrenheit-converter>
<ww-temperature-display effect="#converter[fahrenheit]"></ww-temperature-display>
```

```js
import {LitElementWw, computed, html, signal} from "@webwriter/lit"

class WwTemperatureSensor extends HTMLElement {
  #temperature = signal(20)
  signals = {celsius: computed(() => this.#temperature.get())}

  set celsius(value) {
    this.#temperature.set(value)
  }
}

class WwFahrenheitConverter extends HTMLElement {
  #input = signal(null)
  signals = {
    fahrenheit: computed(() => {
      const celsius = this.#input.get()?.get()
      return celsius == null ? null : celsius * 1.8 + 32
    })
  }

  static effects = {
    effect: {
      label: {en: "Temperature sensor"},
      connect(source, lifetime) {
        this.#input.set(source)
        lifetime.addEventListener("abort", () => this.#input.set(null), {once: true})
      }
    }
  }
}

class WwTemperatureDisplay extends LitElementWw {
  #input = signal(null)

  render() {
    const value = this.#input.get()?.get()
    return html`<output>${value == null ? "—" : `${value} °F`}</output>`
  }

  static effects = {
    effect: {
      label: {en: "Temperature reading"},
      connect(source, lifetime) {
        this.#input.set(source)
        lifetime.addEventListener("abort", () => this.#input.set(null), {once: true})
      }
    }
  }
}

customElements.define("ww-temperature-sensor", WwTemperatureSensor)
customElements.define("ww-fahrenheit-converter", WwFahrenheitConverter)
customElements.define("ww-temperature-display", WwTemperatureDisplay)
```

Use computed signals for values that depend on other signals. A watcher that writes to a source can cause a feedback loop outside the declared connections.

## Standalone widget drawer

Render `WidgetDrawer` in an embedded widget to show settings, file operations, and result storage. Set `standalone` on the widget host. Register the drawer in the widget's scoped registry. Pass the widget instance to the drawer.

```js
import {LitElementWw, WidgetDrawer} from "@webwriter/lit"
import {html} from "lit"

class WwQuiz extends LitElementWw {
  static scopedElements = {"ww-widget-drawer": WidgetDrawer}

  render() {
    return html`
      <slot></slot>
      <!-- Render the quiz here. -->
      <ww-widget-drawer .widget=${this}></ww-widget-drawer>
    `
  }
}
```

The drawer appears when the widget has `standalone` and has controls to show. The `LitElementWw.standalone` property reflects the attribute as a string. If the attribute is absent, the property is `null`. WebWriter supplies the drawer for widgets in its documents.

### Settings, actions, and file conversions

Use the same [option and action declarations](options-actions.md) for the standalone drawer. The drawer uses the standard validation, groups, and action confirmation. When dynamic declarations change, dispatch `optionschange` from the widget. Reference options list matching, defined custom elements with unique IDs. These elements come from the widget's document or shadow root.

The **Import and export** group lists the file formats with handlers in `convertFrom` and `convertTo`. The authoring tool handles native tag conversions. An import handler receives one `File` and returns a function that applies the result. An export handler returns a `File` for download. The authoring tool and standalone drawer use the same [conversion interface](runtime.md#conversions).

### Saving results

Supply an inert data block as a direct child. Wait until `dataReady` is true. Write through `data` or `setData()`. The drawer restores the result for the current destination before it saves updates. [Standalone storage](standalone.md) describes browser storage, endpoints, and save notifications.

### Custom storage

For a different authentication method, pass a `storageFor(destination, key)` function to `WidgetDrawer`. For an HTTP destination, return an `HttpWidgetResultStorage` that uses your authenticated fetch function. Keep credentials in the host's authentication flow. The [HTTP endpoint interface](standalone.md#http-endpoint) describes the requests and responses.
