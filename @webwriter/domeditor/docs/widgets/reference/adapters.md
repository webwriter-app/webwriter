<!-- library:vanilla -->
# C2. @webwriter/widget

A widget can use a native custom element. The optional `@webwriter/widget` package adds the shared runtime for observing the authored DOM and participating in live sessions.

## `withWidgetRuntime(Base)`

Apply the mixin to your element class before registration. It adds `widgetRuntime` and observes the host attributes listed in `static widgetAttributes`.

```js
import {withWidgetRuntime} from "@webwriter/widget"

class WwLabel extends withWidgetRuntime(HTMLElement) {
  static widgetAttributes = ["label"]

  #label = document.createElement("span")
  #unsubscribe

  constructor() {
    super()
    this.attachShadow({mode: "open"}).append(document.createElement("slot"), this.#label)
  }

  connectedCallback() {
    super.connectedCallback()
    const {getSnapshot, subscribe} = this.widgetRuntime
    const render = () => { this.#label.textContent = getSnapshot().attributes.label ?? "" }
    this.#unsubscribe = subscribe(render)
    render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    super.disconnectedCallback()
  }
}

customElements.define("ww-label", WwLabel)
```

## Modules

A [module](#module-declarations) is a class with the suffix `Core`. Import each module from its own path, such as `@webwriter/widget/drag`. Create the module for the host. Call `connect()` and `disconnect()` in the lifecycle callbacks. Call `refresh()` after the widget changes its shadow DOM. Read the state with `getSnapshot()` and follow it with `subscribe()`, which returns the function that stops following. Pass `rendered` to a core when the widget renders asynchronously. The function returns a promise that settles after the next render. Pass `root` when the shadow root is not `host.shadowRoot`.

| Module | Import path | Core |
|---|---|---|
| [Permissions](#permissions) | `@webwriter/widget/permissions` | `PermissionsCore` |
| [Settings](#settings) | `@webwriter/widget/settings` | `SettingsCore` |
| [Shortcuts](#shortcuts) | `@webwriter/widget/shortcuts` | `ShortcutsCore` |
| [Drag](#drag) | `@webwriter/widget/drag` | `DragCore` |
| [Viewport](#viewport) | `@webwriter/widget/viewport` | `ViewportCore` |
| [Help](#help) | `@webwriter/widget/help` | `HelpCore` |
| [Scene](#scene) | `@webwriter/widget/scene` | `SceneCore`, `sceneElements` |
| [Playback](#playback) | `@webwriter/widget/playback` | `PlaybackCore` |
| [Data block](#data-block-jsondata) | `@webwriter/widget/data` | `JsonDataCore` |
| [Localization](#localization-localizer-widgetmsg) | `@webwriter/widget/localize` | `LocalizeCore` |
| [Exercise](#exercise) | `@webwriter/widget/exercise` | `ExerciseCore` |
| [Helpers](#helpers-transaction-and-whilevisible) | `@webwriter/widget/transaction`, `@webwriter/widget/visible` | `transaction`, `whileVisible` |

The examples show the three most used modules. Permissions hides a control and gates an interaction.

```js
import {PermissionsCore} from "@webwriter/widget/permissions"

class WwHintCard extends HTMLElement {
  static permissions = {
    allowHint: {label: {_: "Learners may reveal the hint in this widget"}, attribute: "allow-hint"},
  }

  #permissions = new PermissionsCore(this)

  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = `
      <slot></slot>
      <div data-ww-can="allowHint">
        <button>Hint</button>
        <div id="hint" hidden><slot name="hint"></slot></div>
      </div>
    `
    const hint = root.getElementById("hint")
    root.querySelector("button").addEventListener("click", () => (hint.hidden = !hint.hidden))
  }

  connectedCallback() {
    this.#permissions.connect()
  }

  disconnectedCallback() {
    this.#permissions.disconnect()
  }
}

customElements.define("ww-hint-card", WwHintCard)
```

Settings stores each setting as an attribute and binds the controls marked `data-ww-setting`. `defineProperties()` gives the host one property per setting.

```js
import {SettingsCore} from "@webwriter/widget/settings"

class WwSimulation extends HTMLElement {
  static settings = {
    population: {type: Number, default: 200, min: 10, max: 2000, step: 10, label: {_: "Population"}},
    showChart: {type: Boolean, default: true, label: {_: "Show chart"}},
  }

  #settings = new SettingsCore(this)
  #unsubscribe

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <p></p>
      <label><span data-ww-setting-label="population"></span> <input type="number" data-ww-setting="population"></label>
      <label><input type="checkbox" data-ww-setting="showChart"> Chart</label>
    `
    this.#settings.defineProperties()
  }

  get options() {
    return this.#settings.editorOptions()
  }

  connectedCallback() {
    this.#settings.connect()
    this.#unsubscribe = this.#settings.subscribe(() => this.#render())
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#settings.disconnect()
  }

  #render() {
    const chart = this.#settings.get("showChart") ? ", with chart" : ""
    this.shadowRoot.querySelector("p").textContent = `${this.#settings.get("population")} people${chart}`
  }
}

customElements.define("ww-simulation", WwSimulation)
```

Drag moves authored children. A move changes the authored DOM, so `can` decides who may do it.

```js
import {DragCore} from "@webwriter/widget/drag"
import {PermissionsCore} from "@webwriter/widget/permissions"

class WwSortList extends HTMLElement {
  static permissions = {
    allowReordering: {label: {_: "Learners may reorder the items"}, attribute: "allow-reordering"},
  }

  #permissions = new PermissionsCore(this)
  #drag = new DragCore(this, {can: () => this.#permissions.can("allowReordering")})

  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = `
      <div data-ww-drop="item" data-ww-drop-position="index">
        <slot data-ww-drag="item" data-ww-drag-via="pointer keyboard"></slot>
      </div>
      <output></output>
    `
    let moves = 0
    root.addEventListener("ww-dragcommit", () => (root.querySelector("output").textContent = `${++moves} moves`))
  }

  connectedCallback() {
    this.#permissions.connect()
    this.#drag.connect()
  }

  disconnectedCallback() {
    this.#drag.disconnect()
    this.#permissions.disconnect()
  }
}

customElements.define("ww-sort-list", WwSortList)
```

[Module declarations](#module-declarations) has an example of each other module.

<!-- /library -->

<!-- library:react -->
# C2. @webwriter/react

`@webwriter/react` mounts a React component in a widget's shadow root and exposes a hook for reading its authored DOM and live-session data. It supports React 19.

## `createReactWidget(Component, shadowOptions?)`

The factory returns a custom element class. It passes the widget element to the React component as the `host` prop. Optional shadow root options such as `delegatesFocus` apply when the host is created.

The adapter keeps the React tree during a synchronous DOM move. It unmounts the tree if the host stays detached.

## `useWidget(host)`

Read the shared runtime snapshot in a React component. The hook subscribes to changes so the view updates when the editor, another participant, or the widget changes the DOM.

```jsx
import {createReactWidget, useWidget} from "@webwriter/react"

function Label({host}) {
  const {attributes} = useWidget(host)
  return <>
    <slot />
    <span>{attributes.label ?? ""}</span>
  </>
}

class WwLabel extends createReactWidget(Label) {
  static widgetAttributes = ["label"]
}

customElements.define("ww-label", WwLabel)
```

See the [React Ghost Disco source](../examples/disco/react/08-disco-dependencies.jsx) for an interactive widget.

## Modules

Each [module](#module-declarations) has a hook on its own path, such as `@webwriter/react/drag`. Pass the `host` prop as the first argument. The hook creates the module on first render, connects it after the commit, refreshes it after every commit, and disconnects it on unmount.

| Module | Import path | Hook |
|---|---|---|
| [Permissions](#permissions) | `@webwriter/react/permissions` | `usePermissions(host, options?)` |
| [Settings](#settings) | `@webwriter/react/settings` | `useSettings(host, declarations?, options?)` |
| [Shortcuts](#shortcuts) | `@webwriter/react/shortcuts` | `useShortcuts(host, handlers?, options?)` |
| [Drag](#drag) | `@webwriter/react/drag` | `useDrag(host, options?)` |
| [Viewport](#viewport) | `@webwriter/react/viewport` | `useViewport(host, options?)` |
| [Help](#help) | `@webwriter/react/help` | `useHelp(host, options?)` |
| [Scene](#scene) | `@webwriter/react/scene` | `useScene(host, options?)`, `sceneElements` |
| [Playback](#playback) | `@webwriter/react/playback` | `usePlayback(host, options?)` |
| [Data block](#data-block-jsondata) | `@webwriter/react/data` | `useJsonData(host, options)` |
| [Localization](#localization-localizer-widgetmsg) | `@webwriter/react/localize` | `useLocalize(host, options)` |
| [Exercise](#exercise) | `@webwriter/react/exercise` | `useExercise(host, options)` |
| [Helpers](#helpers-transaction-and-whilevisible) | `@webwriter/widget/transaction`, `@webwriter/widget/visible` | `transaction`, `whileVisible` |

The examples show the three most used modules. [Module declarations](#module-declarations) has an example of each other module as a plain custom element. Permissions hides a control and gates an interaction.

```jsx
import {useState} from "react"
import {createReactWidget} from "@webwriter/react"
import {usePermissions} from "@webwriter/react/permissions"

function HintCard({host}) {
  const {can} = usePermissions(host)
  const [open, setOpen] = useState(false)
  return <>
    <slot />
    <button data-ww-can="allowHint" onClick={() => setOpen(!open)}>Hint</button>
    {open && can("allowHint") && <slot name="hint" />}
  </>
}

class WwHintCard extends createReactWidget(HintCard) {
  static permissions = {
    allowHint: {label: {_: "Learners may reveal the hint in this widget"}, attribute: "allow-hint"},
  }
}

customElements.define("ww-hint-card", WwHintCard)
```

Settings stores each setting as an attribute and binds the controls marked `data-ww-setting`.

```jsx
import {createReactWidget} from "@webwriter/react"
import {useSettings} from "@webwriter/react/settings"

const settings = {
  population: {type: Number, default: 200, min: 10, max: 2000, step: 10, label: {_: "Population"}},
  showChart: {type: Boolean, default: true, label: {_: "Show chart"}},
}

function Simulation({host}) {
  const {values} = useSettings(host, settings)
  return <>
    <p>{values.population} people{values.showChart ? ", with chart" : ""}</p>
    <label><span data-ww-setting-label="population" /> <input type="number" data-ww-setting="population" /></label>
    <label><input type="checkbox" data-ww-setting="showChart" /> Chart</label>
  </>
}

class WwSimulation extends createReactWidget(Simulation) {}

customElements.define("ww-simulation", WwSimulation)
```

Drag moves authored children and reports each move.

```jsx
import {useState} from "react"
import {createReactWidget} from "@webwriter/react"
import {useEvent} from "@webwriter/react/base"
import {useDrag} from "@webwriter/react/drag"
import {usePermissions} from "@webwriter/react/permissions"

function SortList({host}) {
  const {can} = usePermissions(host)
  const [moves, setMoves] = useState(0)
  const allowed = can("allowReordering")
  useDrag(host, {can: () => allowed})
  useEvent(host, "ww-dragcommit", () => setMoves(count => count + 1))
  return <>
    <div data-ww-drop="item" data-ww-drop-position="index">
      <slot data-ww-drag={allowed ? "item" : undefined} data-ww-drag-via="pointer keyboard" />
    </div>
    <output>{moves} moves</output>
  </>
}

class WwSortList extends createReactWidget(SortList) {
  static permissions = {
    allowReordering: {label: {_: "Learners may reorder the items"}, attribute: "allow-reordering"},
  }
}

customElements.define("ww-sort-list", WwSortList)
```

Listen for `ww-*` events with `useEvent(target, type, handler)`. Write a boolean marker with an empty value, such as `data-ww-drag-handle=""`. Leave a control that a module fills uncontrolled. Supply the methods for `static actions` with `useActions(host, handlers)`.

<!-- /library -->

<!-- library:vue -->
# C2. @webwriter/vue

`@webwriter/vue` wraps Vue's custom element API and provides a composable for following the authored DOM and live-session data. It supports Vue 3.5 and later within Vue 3.

## `createVueWidget(component, options?)`

The factory returns a custom element class with an open shadow root. Pass a Vue component and any custom element options such as `styles` or `shadowRootOptions`. For single-file components, use your build tool's custom element mode to include the styles in the shadow root.

**`ww-label.js`**

```js
import {createVueWidget} from "@webwriter/vue"
import Label from "./Label.ce.vue"

class WwLabel extends createVueWidget(Label) {
  static widgetAttributes = ["label"]
}

customElements.define("ww-label", WwLabel)
```

## `useWidget(host?)`

Call the composable in component setup. It returns a readonly ref and uses Vue's current custom element host when you omit the argument. Vue disposes of the subscription with the component.

**`Label.ce.vue`**

```vue
<script setup>
import {useWidget} from "@webwriter/vue"

const widget = useWidget()
</script>

<template>
  <slot></slot>
  <span>{{ widget.attributes.label ?? "" }}</span>
</template>
```

See the [Vue Ghost Disco source](../examples/disco/vue/08-disco-dependencies.vue) for an interactive widget.

## Modules

Each [module](#module-declarations) has a composable on its own path, such as `@webwriter/vue/drag`. Call it in the setup of the widget's component. In a child component, pass the widget as `host`.

| Module | Import path | Composable |
|---|---|---|
| [Permissions](#permissions) | `@webwriter/vue/permissions` | `usePermissions(options?)` |
| [Settings](#settings) | `@webwriter/vue/settings` | `useSettings({declarations?, …})` |
| [Shortcuts](#shortcuts) | `@webwriter/vue/shortcuts` | `useShortcuts(options?)` |
| [Drag](#drag) | `@webwriter/vue/drag` | `useDrag(options?)` |
| [Viewport](#viewport) | `@webwriter/vue/viewport` | `useViewport(options?)` |
| [Help](#help) | `@webwriter/vue/help` | `useHelp(options?)` |
| [Scene](#scene) | `@webwriter/vue/scene` | `useScene(options?)`, `defineSceneElements()` |
| [Playback](#playback) | `@webwriter/vue/playback` | `usePlayback(options?)` |
| [Data block](#data-block-jsondata) | `@webwriter/vue/data` | `useJsonData(options)` |
| [Localization](#localization-localizer-widgetmsg) | `@webwriter/vue/localize` | `useLocalize(options)` |
| [Exercise](#exercise) | `@webwriter/vue/exercise` | `useExercise(options)`, `exerciseForm(Base)` |
| [Helpers](#helpers-transaction-and-whilevisible) | `@webwriter/widget/transaction`, `@webwriter/widget/visible` | `transaction`, `whileVisible` |

The examples show the three most used modules. [Module declarations](#module-declarations) has an example of each other module as a plain custom element. Permissions hides a control and gates an interaction.

**`ww-hint-card.js`**

```js
import {createVueWidget} from "@webwriter/vue"
import HintCard from "./HintCard.ce.vue"

class WwHintCard extends createVueWidget(HintCard) {
  static permissions = {
    allowHint: {label: {_: "Learners may reveal the hint in this widget"}, attribute: "allow-hint"},
  }
}

customElements.define("ww-hint-card", WwHintCard)
```

**`HintCard.ce.vue`**

```vue
{{fw/HintCard.ce.vue}}
```

Settings stores each setting as an attribute and binds the controls marked `data-ww-setting`.

**`ww-simulation.js`**

```js
import {createVueWidget} from "@webwriter/vue"
import Simulation from "./Simulation.ce.vue"

customElements.define("ww-simulation", createVueWidget(Simulation))
```

**`Simulation.ce.vue`**

```vue
{{fw/Simulation.ce.vue}}
```

Drag moves authored children and reports each move.

**`ww-sort-list.js`**

```js
import {createVueWidget} from "@webwriter/vue"
import SortList from "./SortList.ce.vue"

class WwSortList extends createVueWidget(SortList) {
  static permissions = {
    allowReordering: {label: {_: "Learners may reorder the items"}, attribute: "allow-reordering"},
  }
}

customElements.define("ww-sort-list", WwSortList)
```

**`SortList.ce.vue`**

```vue
{{fw/SortList.ce.vue}}
```

Declare `static permissions` and `static actions` on the class from `createVueWidget()`. Declare settings with the `declarations` option of `useSettings`, or as `static settings` on the class. Expose action methods with `defineExpose()`. Call `defineSceneElements()` before a template uses the Scene elements. Wrap the class with `exerciseForm(Base)` for `useExercise`. Leave `value`, `disabled`, and `aria-*` unbound on a control that a module fills.

<!-- /library -->

<!-- library:angular -->
# C2. @webwriter/angular

`@webwriter/angular` renders a standalone Angular component inside a widget's shadow root. It supports Angular 22.2 and later within Angular 22.

## `createAngularWidget(Component, options?)`

Await the factory to get a custom element class. The adapter shares an Angular application across widgets by default. Pass an existing `ApplicationRef` as `options.application` to use its providers. Pass the widget's shadow CSS as `options.styles`.

The Angular component renders inside the widget's existing shadow root. Use a native `<slot>` in its template to display the authored children. The adapter keeps the Angular view during a synchronous DOM move and releases it when the host stays detached.

## `injectWidget()` and `injectWidgetHost()`

Call these functions from an Angular injection context such as a component field initializer. `injectWidget()` returns a readonly signal for the shared snapshot. `injectWidgetHost()` returns the widget element, which exposes `widgetRuntime` for writes.

```ts
import "@angular/compiler"
import {Component} from "@angular/core"
import {createAngularWidget, injectWidget} from "@webwriter/angular"

@Component({
  selector: "ww-label-view",
  standalone: true,
  template: `
    <slot></slot>
    <span>{{ widget().attributes.label ?? "" }}</span>
  `,
})
class Label {
  readonly widget = injectWidget()
}

const LabelElement = await createAngularWidget(Label)

class WwLabel extends LabelElement {
  static widgetAttributes = ["label"]
}

customElements.define("ww-label", WwLabel)
```

The [Angular Ghost Disco source](../examples/disco/angular/08-disco-dependencies.ts) uses `@angular/compiler` with its build to compile its template in the browser.

## Modules

Each [module](#module-declarations) has an inject function on its own path, such as `@webwriter/angular/drag`. Call it from an injection context.

| Module | Import path | Function |
|---|---|---|
| [Permissions](#permissions) | `@webwriter/angular/permissions` | `injectPermissions(options?)`, `injectWidgetPermissions()` |
| [Settings](#settings) | `@webwriter/angular/settings` | `injectSettings(options?)` |
| [Shortcuts](#shortcuts) | `@webwriter/angular/shortcuts` | `injectShortcuts(options?)` |
| [Drag](#drag) | `@webwriter/angular/drag` | `injectDrag(options?)` |
| [Viewport](#viewport) | `@webwriter/angular/viewport` | `injectViewport(options?)` |
| [Help](#help) | `@webwriter/angular/help` | `injectHelp(options?)` |
| [Scene](#scene) | `@webwriter/angular/scene` | `injectScene(options?)` |
| [Playback](#playback) | `@webwriter/angular/playback` | `injectPlayback(options?)` |
| [Data block](#data-block-jsondata) | `@webwriter/angular/data` | `injectJsonData(options)` |
| [Localization](#localization-localizer-widgetmsg) | `@webwriter/angular/localize` | `injectLocalize(options)` |
| [Exercise](#exercise) | `@webwriter/angular/exercise` | `injectExercise(options)` |
| [Helpers](#helpers-transaction-and-whilevisible) | `@webwriter/widget/transaction`, `@webwriter/widget/visible` | `transaction`, `whileVisible` |

The examples show the three most used modules. [Module declarations](#module-declarations) has an example of each other module as a plain custom element. Permissions hides a control and gates an interaction.

```ts
import "@angular/compiler"
import {Component, signal} from "@angular/core"
import {createAngularWidget} from "@webwriter/angular"
import {injectPermissions} from "@webwriter/angular/permissions"

@Component({
  selector: "ww-hint-card-view",
  standalone: true,
  template: `
    <slot></slot>
    <button data-ww-can="allowHint" (click)="open.set(!open())">Hint</button>
    @if (open() && permissions.can("allowHint")) {
      <slot name="hint"></slot>
    }
  `,
})
class HintCard {
  readonly permissions = injectPermissions()
  readonly open = signal(false)
}

const HintCardElement = await createAngularWidget(HintCard)

class WwHintCard extends HintCardElement {
  static permissions = {
    allowHint: {label: {_: "Learners may reveal the hint in this widget"}, attribute: "allow-hint"},
  }
}

customElements.define("ww-hint-card", WwHintCard)
```

Settings stores each setting as an attribute and binds the controls marked `data-ww-setting`. The settings are declared as `static settings` on the element class.

```ts
import "@angular/compiler"
import {Component} from "@angular/core"
import {createAngularWidget} from "@webwriter/angular"
import {injectSettings} from "@webwriter/angular/settings"

@Component({
  selector: "ww-simulation-view",
  standalone: true,
  template: `
    <p>{{ settings.value("population") }} people{{ settings.value("showChart") ? ", with chart" : "" }}</p>
    <label><span data-ww-setting-label="population"></span> <input type="number" data-ww-setting="population"></label>
    <label><input type="checkbox" data-ww-setting="showChart"> Chart</label>
  `,
})
class Simulation {
  readonly settings = injectSettings()
}

const SimulationElement = await createAngularWidget(Simulation)

class WwSimulation extends SimulationElement {
  static settings = {
    population: {type: Number, default: 200, min: 10, max: 2000, step: 10, label: {_: "Population"}},
    showChart: {type: Boolean, default: true, label: {_: "Show chart"}},
  }
}

customElements.define("ww-simulation", WwSimulation)
```

Drag moves authored children and reports each move.

```ts
import "@angular/compiler"
import {Component, signal} from "@angular/core"
import {createAngularWidget} from "@webwriter/angular"
import {injectDrag} from "@webwriter/angular/drag"
import {injectPermissions} from "@webwriter/angular/permissions"

@Component({
  selector: "ww-sort-list-view",
  standalone: true,
  template: `
    <div data-ww-drop="item" data-ww-drop-position="index" (ww-dragcommit)="moves.update(count => count + 1)">
      <slot [attr.data-ww-drag]="permissions.can('allowReordering') ? 'item' : null" data-ww-drag-via="pointer keyboard"></slot>
    </div>
    <output>{{ moves() }} moves</output>
  `,
})
class SortList {
  readonly permissions = injectPermissions()
  readonly drag = injectDrag({can: () => this.permissions.can("allowReordering")})
  readonly moves = signal(0)
}

const SortListElement = await createAngularWidget(SortList)

class WwSortList extends SortListElement {
  static permissions = {
    allowReordering: {label: {_: "Learners may reorder the items"}, attribute: "allow-reordering"},
  }
}

customElements.define("ww-sort-list", WwSortList)
```

Declare `static permissions`, `static actions`, and `static settings` on the class from `createAngularWidget()`. Supply the action methods with `injectActions(handlers)` from `@webwriter/angular/base`. Keep the component's default view encapsulation.

<!-- /library -->

<!-- library:svelte -->
# C2. @webwriter/svelte

`@webwriter/svelte` adds the shared widget runtime to a compiled Svelte 5 custom element.

## `withWidgetRuntime(Base)`

Use the mixin in the Svelte compiler's `customElement.extend` option. It adds `widgetRuntime` to the generated element and observes the attributes listed in `static widgetAttributes`.

## `widgetStore(host)`

Pass `$host()` to the store helper. Read the current snapshot with Svelte's `$store` syntax. Svelte releases the subscription when the component unmounts.

```svelte
<script module>
import {withWidgetRuntime, widgetStore} from "@webwriter/svelte"
</script>

<svelte:options customElement={{
  tag: "ww-label",
  extend: Base => class extends withWidgetRuntime(Base) {
    static widgetAttributes = ["label"]
  },
}} />

<script>
  const widget = widgetStore($host())
</script>

<slot></slot>
<span>{$widget.attributes.label ?? ""}</span>
```

See the [Svelte Ghost Disco source](../examples/disco/svelte/08-disco-dependencies.svelte) for an interactive widget.

## Modules

Each [module](#module-declarations) has a store on its own path, such as `@webwriter/svelte/drag`. Pass `$host()` as the first argument.

| Module | Import path | Store |
|---|---|---|
| [Permissions](#permissions) | `@webwriter/svelte/permissions` | `permissionsStore(host, options?)`, `widgetPermissions(host)` |
| [Settings](#settings) | `@webwriter/svelte/settings` | `settingsStore(host)`, `withSettings(Base, declarations, options?)` |
| [Shortcuts](#shortcuts) | `@webwriter/svelte/shortcuts` | `shortcutsStore(host, options?)` |
| [Drag](#drag) | `@webwriter/svelte/drag` | `dragStore(host, options?)` |
| [Viewport](#viewport) | `@webwriter/svelte/viewport` | `viewportStore(host, options?)` |
| [Help](#help) | `@webwriter/svelte/help` | `helpStore(host, options?)` |
| [Scene](#scene) | `@webwriter/svelte/scene` | `sceneStore(host, options?)` |
| [Playback](#playback) | `@webwriter/svelte/playback` | `playbackStore(host, options?)` |
| [Data block](#data-block-jsondata) | `@webwriter/svelte/data` | `jsonDataStore(host, options)` |
| [Localization](#localization-localizer-widgetmsg) | `@webwriter/svelte/localize` | `localizeStore(host, options)` |
| [Exercise](#exercise) | `@webwriter/svelte/exercise` | `exerciseStore(host, options)`, `withExercise(Base)` |
| [Helpers](#helpers-transaction-and-whilevisible) | `@webwriter/widget/transaction`, `@webwriter/widget/visible` | `transaction`, `whileVisible` |

The examples show the three most used modules. [Module declarations](#module-declarations) has an example of each other module as a plain custom element. Permissions hides a control and gates an interaction.

```svelte
<script module>
  import {withWidgetRuntime} from "@webwriter/svelte"
</script>

<svelte:options customElement={{
  tag: "ww-hint-card",
  extend: Base => class extends withWidgetRuntime(Base) {
    static permissions = {
      allowHint: {label: {_: "Learners may reveal the hint in this widget"}, attribute: "allow-hint"},
    }
  },
}} />

<script>
  import {permissionsStore} from "@webwriter/svelte/permissions"

  const permissions = permissionsStore($host())
  let open = $state(false)
</script>

<slot></slot>
<button data-ww-can="allowHint" onclick={() => (open = !open)}>Hint</button>
{#if open && $permissions.can("allowHint")}
  <slot name="hint"></slot>
{/if}
```

Settings stores each setting as an attribute and binds the controls marked `data-ww-setting`. `withSettings(Base, declarations)` declares the settings in `customElement.extend`.

```svelte
<script module>
  import {withWidgetRuntime} from "@webwriter/svelte"
  import {withSettings} from "@webwriter/svelte/settings"
</script>

<svelte:options customElement={{
  tag: "ww-simulation",
  extend: Base => class extends withSettings(withWidgetRuntime(Base), {
    population: {type: Number, default: 200, min: 10, max: 2000, step: 10, label: {_: "Population"}},
    showChart: {type: Boolean, default: true, label: {_: "Show chart"}},
  }) {},
}} />

<script>
  import {settingsStore} from "@webwriter/svelte/settings"

  const settings = settingsStore($host())
</script>

<p>{$settings.values.population} people{$settings.values.showChart ? ", with chart" : ""}</p>
<label><span data-ww-setting-label="population"></span> <input type="number" data-ww-setting="population"></label>
<label><input type="checkbox" data-ww-setting="showChart"> Chart</label>
```

Drag moves authored children and reports each move.

```svelte
<script module>
  import {withWidgetRuntime} from "@webwriter/svelte"
</script>

<svelte:options customElement={{
  tag: "ww-sort-list",
  extend: Base => class extends withWidgetRuntime(Base) {
    static permissions = {
      allowReordering: {label: {_: "Learners may reorder the items"}, attribute: "allow-reordering"},
    }
  },
}} />

<script>
  import {dragStore} from "@webwriter/svelte/drag"
  import {permissionsStore} from "@webwriter/svelte/permissions"

  const permissions = permissionsStore($host())
  dragStore($host(), {can: () => permissions.can("allowReordering")})
  let moves = $state(0)
</script>

<div data-ww-drop="item" data-ww-drop-position="index" onww-dragcommit={() => moves++}>
  <svelte:element this={"slot"} data-ww-drag={$permissions.can("allowReordering") ? "item" : undefined} data-ww-drag-via="pointer keyboard" />
</div>
<output>{moves} moves</output>
```

Svelte removes attributes from `<slot>`. Use `<svelte:element this={"slot"}>` for a marked slot. Declare `static permissions` and `static actions` in the `customElement.extend` class. Apply `withSettings(Base, declarations)` and `withExercise(Base)` there for `settingsStore` and `exerciseStore`.

<!-- /library -->

## Shared widget state

The snapshot describes the current DOM. Use attribute names in `static widgetAttributes` and read their values from `attributes`. Values are strings or `null` when an attribute is absent. Set an authored attribute on the host to persist a setting in the document.

| Snapshot fields | Purpose |
| --- | --- |
| `editable`, `lang`, `standalone` | The host's editing mode, effective language, and standalone attribute. |
| `attributes` | The values for the attributes listed in `static widgetAttributes`. |
| `data`, `dataType`, `dataBlock`, `dataSlot` | The current inert data block and its text, type, and slot. |
| `dataMode` | The current scope. One of `individual`, `all`, `group`, or `local`. |
| `dataReady`, `dataError` | Whether the data scope accepts writes, and the latest error if present. |

Use `host.widgetRuntime.setData(type, text, attrs?)` to write to the data block from an interaction. It updates an existing block in place and rejects writes while a managed scope is pending. For live-session data, use a direct JSON or XML script with `slot="data"` and set `sharedData: true` in the editing configuration. Standalone documents can use the same block as local data. [Data and events](data.md)

Put `static options`, `static optionGroups`, `static actions`, and their handler methods on the custom element. WebWriter uses these declarations in the Widget drawer. The runtime and adapters export the corresponding TypeScript declaration types. [Options and actions](options-actions.md)

## Module declarations

A module supplies one common widget behavior. A widget bundles only the modules that it imports. Mark elements in the shadow root with `data-ww-*` attributes and listen for the module's `ww-*` events. The module handles pointer, touch, and keyboard input. It also handles announcements and cleanup. The sections below name each module's core and declarations. [`@webwriter/lit`](lit.md#modules) describes every module in full, with its options, events, and rules. The rules hold for every library.

A binding of a library has the same name as the module on its own path, such as `@webwriter/react/drag`. The core is the class of `@webwriter/widget`, which a widget can also use directly. The examples in this section are plain custom elements on the cores. Each library's **Modules** section lists its bindings and shows Permissions, Settings, and Drag in that library.

A module option named `can` is a function. The module calls it before and during an interaction. The module cancels the interaction when the function returns false. A module that changes the document wraps the change and the next render in one [undo transaction](runtime.md#undo-transactions). Modules show and speak their own text in the widget's language. Each language loads on first use. Pass `messages` to a module to replace a text.

### Permissions

Permissions answers `can(name)` for each entry of [`static permissions`](options-actions.md#element-permissions), true in edit mode and, in read mode, while the author has granted the permission. `PermissionsCore` is in `@webwriter/widget/permissions`; the bindings are `usePermissions`, `usePermissions`, `permissionsStore`, and `injectPermissions` for React, Vue, Svelte, and Angular.

`data-ww-can="name"` hides a shadow element while `can(name)` is false, `data-ww-can="edit"` shows it in edit mode only, and `data-ww-can-mode="disable"` makes it inert instead. The example is in the **Modules** section of the library. See [Permissions](lit.md#permissions).

### Settings

Settings turns declarations into reflected attributes, entries of the Widget drawer, and controls bound with `data-ww-setting="name"`. `SettingsCore` is in `@webwriter/widget/settings`; the bindings are `useSettings`, `useSettings`, `settingsStore` with `withSettings`, and `injectSettings`.

Each setting becomes a reflected attribute and an entry of the Widget drawer. A boolean that defaults to true uses a negative attribute such as `no-show-chart`. The text of a setting may be a function of the widget. The example is in the **Modules** section of the library. See [Settings](lit.md#settings).

### Shortcuts

Shortcuts runs an action of `static actions` from a key. `ShortcutsCore` is in `@webwriter/widget/shortcuts`; the bindings are `useShortcuts`, `useShortcuts`, `shortcutsStore`, and `injectShortcuts`.

Declare `shortcut` and `can` on an action. Mark a button with `data-ww-shortcut="action"`. A key runs the method of the same name on the widget. A method that returns `false` declines the key. See [Shortcuts](lit.md#shortcuts).

```js
import {ShortcutsCore} from "@webwriter/widget/shortcuts"

class WwCounter extends HTMLElement {
  static actions = {
    increase: {label: {_: "Increase"}, shortcut: "ArrowUp"},
    reset: {label: {_: "Reset"}, shortcut: "Escape"},
  }

  #shortcuts = new ShortcutsCore(this)
  #count = 0

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <div tabindex="0"><output>0</output></div>
      <button data-ww-shortcut="increase">+</button>
    `
    this.shadowRoot.querySelector("button").addEventListener("click", () => this.increase())
  }

  connectedCallback() {
    this.#shortcuts.connect()
    this.#shortcuts.refresh()
  }

  disconnectedCallback() {
    this.#shortcuts.disconnect()
  }

  increase() {
    this.#show(this.#count + 1)
  }

  reset() {
    // Nothing to reset: decline the key, so that the page can use Escape.
    if (this.#count === 0) return false
    this.#show(0)
  }

  #show(count) {
    this.#count = count
    this.shadowRoot.querySelector("output").textContent = String(count)
  }
}

customElements.define("ww-counter", WwCounter)
```

### Drag

Drag picks up items and drops them on targets by pointer, keyboard, or click. `DragCore` is in `@webwriter/widget/drag`; the bindings are `useDrag`, `useDrag`, `dragStore`, and `injectDrag`.

Mark items with `data-ww-drag="kind"` and targets with `data-ww-drop="kind"`. `data-ww-drag-via="pointer keyboard click"` lists how an item is picked up. The events are `ww-dragpick` and `ww-dragcommit`. The example is in the **Modules** section of the library. For items that the widget renders, update the widget's state in the `ww-dragcommit` handler. See [Drag](lit.md#drag).

### Viewport

Viewport zooms and pans one window onto larger content. `ViewportCore` is in `@webwriter/widget/viewport`; the bindings are `useViewport`, `useViewport`, `viewportStore`, and `injectViewport`.

Mark the window with `data-ww-viewport`, `data-ww-viewport="canvas"`, or `data-ww-viewport="external"`. Add `data-ww-viewport-controls` for the zoom buttons and `data-ww-viewport-save="name"` to keep the view in an attribute. See [Viewport](lit.md#viewport).

```js
import {ViewportCore} from "@webwriter/widget/viewport"

class WwFloorPlan extends HTMLElement {
  static observedAttributes = ["src"]

  #viewport = new ViewportCore(this)

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <div style="height: 300px" data-ww-viewport data-ww-viewport-zoom="0.5 4" data-ww-viewport-save="view" aria-label="Floor plan">
        <img width="1200" height="800" alt="">
      </div>
      <div data-ww-viewport-controls></div>
    `
  }

  attributeChangedCallback(name, before, value) {
    this.shadowRoot.querySelector("img").src = value ?? ""
  }

  connectedCallback() {
    this.#viewport.connect()
    this.#viewport.refresh()
  }

  disconnectedCallback() {
    this.#viewport.disconnect()
  }
}

customElements.define("ww-floor-plan", WwFloorPlan)
```

### Help

Help shows an overlay with one label for each marked control. `HelpCore` is in `@webwriter/widget/help`; the bindings are `useHelp`, `useHelp`, `helpStore`, and `injectHelp`.

Mark a control with `data-ww-help="text"` and the button that opens the overlay with `data-ww-help-toggle`. See [Help](lit.md#help).

```js
import {HelpCore} from "@webwriter/widget/help"

class WwToolbar extends HTMLElement {
  #help = new HelpCore(this)

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <button data-ww-help="Add a node" data-ww-help-order="1">Add</button>
      <button data-ww-help="Remove the selected node" data-ww-help-order="2">Remove</button>
      <div tabindex="0" data-ww-help="The diagram"><slot></slot></div>
      <button data-ww-help-toggle aria-label="Help">?</button>
    `
  }

  connectedCallback() {
    this.#help.connect()
    this.#help.refresh()
  }

  disconnectedCallback() {
    this.#help.disconnect()
  }
}

customElements.define("ww-toolbar", WwToolbar)
```

### Scene

Scene draws nodes, shapes, paths, text, and images, and reports what the reader does with them. `SceneCore` and `sceneElements` are in `@webwriter/widget/scene`; the bindings are `useScene`, `useScene`, `sceneStore`, and `injectScene`.

Write `<ww-scene>` with `<ww-node>`, `<ww-shape>`, `<ww-path>`, `<ww-text>`, `<ww-image>`, `<ww-group>`, and `<ww-sprites>` in the shadow root. The events are `ww-select`, `ww-move`, `ww-resize`, `ww-connect`, and `ww-sceneerror`. Register the elements from `sceneElements`. For WebGL rendering, register `PixiScene` from `@webwriter/widget/scene/pixi` as `ww-scene`. Only this import bundles `pixi.js`. See [Scene](lit.md#scene).

```js
import {SceneCore, sceneElements} from "@webwriter/widget/scene"

for (const [tag, constructor] of Object.entries(sceneElements)) {
  if (!customElements.get(tag)) customElements.define(tag, constructor)
}

class WwBoxes extends HTMLElement {
  static observedAttributes = ["boxes"]

  static permissions = {
    allowMoving: {label: {_: "Learners may move the boxes"}, attribute: "allow-moving"},
  }

  #scene = new SceneCore(this, {can: {move: "allowMoving"}})

  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = `
      <style>ww-scene { height: 240px; border: 1px solid #c8c8c8 }</style>
      <ww-scene select="single" grid="10"></ww-scene>
    `
    root.querySelector("ww-scene").addEventListener("ww-move", event => this.#move(event))
  }

  get boxes() {
    return JSON.parse(this.getAttribute("boxes") ?? "[]")
  }

  attributeChangedCallback() {
    this.#render()
  }

  connectedCallback() {
    this.#scene.connect()
    this.#render()
  }

  disconnectedCallback() {
    this.#scene.disconnect()
  }

  // The scene runs the event in one undo step: the attribute is written inside it.
  #move(event) {
    const moved = new Map(event.detail.items.map(item => [item.key, item]))
    const boxes = this.boxes.map(box => (moved.has(box.id) ? {...box, x: moved.get(box.id).x, y: moved.get(box.id).y} : box))
    this.setAttribute("boxes", JSON.stringify(boxes))
  }

  #render() {
    const scene = this.shadowRoot.querySelector("ww-scene")
    for (const box of this.boxes) {
      const node = scene.querySelector(`[data-ww-key="${box.id}"]`) ?? this.#create(scene, box.id)
      node.setAttribute("x", String(box.x))
      node.setAttribute("y", String(box.y))
    }
    this.#scene.refresh()
  }

  #create(scene, id) {
    const node = document.createElement("ww-node")
    node.dataset.wwKey = id
    node.toggleAttribute("movable", true)
    node.textContent = `Box ${id}`
    scene.append(node)
    return node
  }
}

customElements.define("ww-boxes", WwBoxes)
```

### Playback

Playback holds the run state of a widget that plays over time, with the interface of a media element. `PlaybackCore` is in `@webwriter/widget/playback`; the bindings are `usePlayback`, `usePlayback`, `playbackStore`, and `injectPlayback`.

Configure the run with `step`, with `steps` and `show`, with `play` and `pause`, or with `media`. Mark buttons with `data-ww-playback="toggle"`, `play`, `pause`, `step`, `back`, `reset`, or `rate`, a range input with `seek`, and an `<output>` with `time`. The event is `ww-playbackchange`. See [Playback](lit.md#playback).

```js
import {PlaybackCore} from "@webwriter/widget/playback"

const STEPS = ["Boil the water", "Add the pasta", "Drain and serve"]

class WwRecipe extends HTMLElement {
  #playback = new PlaybackCore(this, {
    steps: () => STEPS.length,
    show: index => (this.shadowRoot.querySelector("p").textContent = STEPS[index]),
    interval: 3,
  })

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `
      <p>${STEPS[0]}</p>
      <button data-ww-playback="back"></button>
      <button data-ww-playback="toggle"></button>
      <button data-ww-playback="step"></button>
      <input type="range" data-ww-playback="seek">
      <output data-ww-playback="time"></output>
    `
  }

  connectedCallback() {
    this.#playback.connect()
    this.#playback.refresh()
  }

  disconnectedCallback() {
    this.#playback.disconnect()
  }
}

customElements.define("ww-recipe", WwRecipe)
```

### Data block (`jsonData`)

The data block helper gives typed access to the widget's JSON [data block](data.md). `JsonDataCore` is in `@webwriter/widget/data` and needs a host with `widgetRuntime`, which `withWidgetRuntime` adds. The bindings are `useJsonData`, `useJsonData`, `jsonDataStore`, and `injectJsonData`.

`defaults` gives the value for keys that the block lacks. `get()` reads the value, `set(partial)` changes it, and the event `ww-dataerror` reports a snapshot that the helper could not use. See [Data block](lit.md#data-block-jsondata).

```js
import {withWidgetRuntime} from "@webwriter/widget"
import {JsonDataCore} from "@webwriter/widget/data"

class WwTally extends withWidgetRuntime(HTMLElement) {
  #data = new JsonDataCore(this, {
    defaults: {count: 0},
    validate: ({count}) => Number.isInteger(count) && count >= 0,
  })
  #unsubscribe

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `<button></button>`
    this.shadowRoot.querySelector("button").addEventListener("click", () => this.#data.set({count: this.#data.get().count + 1}))
  }

  connectedCallback() {
    super.connectedCallback()
    this.#data.connect()
    this.#unsubscribe = this.#data.subscribe(() => this.#render())
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#data.disconnect()
    super.disconnectedCallback()
  }

  #render() {
    this.shadowRoot.querySelector("button").textContent = `Clicked ${this.#data.get().count} times`
  }
}

customElements.define("ww-tally", WwTally)
```

### Localization (`localizer`, `widgetMsg`)

Localization loads the catalog of the widget's language. `LocalizeCore` is in `@webwriter/widget/localize`; the bindings are `useLocalize`, `useLocalize`, `localizeStore`, and `injectLocalize`. The Lit helpers `localizer` and `widgetMsg` build on `@lit/localize`. The other bindings expose the catalog, and the React, Vue, and Angular bindings add a `msg` function.

Pass `sourceLocale`, `targetLocales`, and `load(locale)`. `setLocale(tag)` selects the language. A failed load dispatches `localizationerror`. See [Localization](lit.md#localization-localizer-widgetmsg).

```js
import {widgetLanguage} from "@webwriter/widget"
import {LocalizeCore} from "@webwriter/widget/localize"

// A catalog is a module that exports {templates}. `./de.js`: export const templates = {greeting: "Guten Morgen!"}
class WwGreeting extends HTMLElement {
  static observedAttributes = ["lang"]

  #localize = new LocalizeCore(this, {
    sourceLocale: "en",
    targetLocales: ["de"],
    load: locale => import(`./${locale}.js`),
  })
  #unsubscribe

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `<p></p>`
  }

  attributeChangedCallback() {
    void this.#localize.setLocale(widgetLanguage(this))
  }

  connectedCallback() {
    this.#localize.connect()
    this.#unsubscribe = this.#localize.subscribe(() => this.#render())
    void this.#localize.setLocale(widgetLanguage(this))
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#localize.disconnect()
  }

  #render() {
    const {templates} = this.#localize.getSnapshot()
    this.shadowRoot.querySelector("p").textContent = String(templates?.greeting ?? "Good morning!")
  }
}

customElements.define("ww-greeting", WwGreeting)
```

### Exercise

Exercise holds what every question shares: the submission through a form, the Check, Reset, and Show solution actions, the feedback mode, and the summary. `ExerciseCore` is in `@webwriter/widget/exercise`; the bindings are `useExercise`, `useExercise` with `exerciseForm`, `exerciseStore` with `withExercise`, and `injectExercise`.

Pass `response`, `respond`, `solution`, `record`, and `score` on a class with `static formAssociated = true`. See [Exercise](lit.md#exercise).

```js
import {withWidgetRuntime} from "@webwriter/widget"
import {JsonDataCore} from "@webwriter/widget/data"
import {ExerciseCore, scoreOf} from "@webwriter/widget/exercise"
import {obfuscate, reveal} from "@webwriter/widget/obfuscate"

class WwQuestion extends withWidgetRuntime(HTMLElement) {
  static formAssociated = true

  #data = new JsonDataCore(this, {defaults: {choice: undefined}})
  #exercise = new ExerciseCore(this, {
    response: () => this.#data.get().choice,
    respond: choice => this.#data.set({choice}),
    solution: () => reveal(this.getAttribute("solution")),
    record: id => this.setAttribute("solution", obfuscate(id)),
    score: (choice, solution) => scoreOf([choice === solution]),
  })
  #stops = []

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `<slot></slot><button>Check</button><output></output>`
    this.shadowRoot.querySelector("button").addEventListener("click", () => this.check())
    // The author writes the choices as radio buttons: <label><input type="radio" name="q" value="a"> Mercury</label>
    this.addEventListener("change", event => {
      if (event.target instanceof HTMLInputElement) this.#exercise.answer(event.target.value)
    })
  }

  connectedCallback() {
    super.connectedCallback()
    this.#data.connect()
    this.#exercise.connect()
    this.#stops = [this.#data.subscribe(() => this.#render()), this.#exercise.subscribe(() => this.#render())]
    this.#render()
  }

  disconnectedCallback() {
    this.#stops.forEach(stop => stop())
    this.#exercise.disconnect()
    this.#data.disconnect()
    super.disconnectedCallback()
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

  formDisabledCallback(disabled) {
    this.#exercise.formDisabled(disabled)
  }

  formStateRestoreCallback(state, mode) {
    this.#exercise.formStateRestore(state, mode)
  }

  #render() {
    this.shadowRoot.querySelector("output").textContent = this.#exercise.summary
    this.shadowRoot.querySelector("button").disabled = !this.#exercise.available("check")
  }
}

customElements.define("ww-question", WwQuestion)
```

### Helpers (`transaction` and `whileVisible`)

`transaction(host, change)` from `@webwriter/widget/transaction` runs a change as one undo step. `whileVisible(host, step)` from `@webwriter/widget/visible` calls `step(dt)` once per animation frame while the widget is on screen. Every library uses these functions from `@webwriter/widget`. See [Helpers](lit.md#helpers-transaction-and-whilevisible).

```js
import {transaction} from "@webwriter/widget/transaction"
import {whileVisible} from "@webwriter/widget/visible"

const COLORS = ["#2563eb", "#16a34a", "#dc2626"]

class WwPulse extends HTMLElement {
  #loop
  #phase = 0

  constructor() {
    super()
    this.attachShadow({mode: "open"}).innerHTML = `<span>●</span><button>Change color</button>`
    this.shadowRoot.querySelector("button").addEventListener("click", () => this.#recolor())
  }

  connectedCallback() {
    this.#loop = whileVisible(this, dt => {
      this.#phase += dt
      this.shadowRoot.querySelector("span").style.opacity = String(0.5 + 0.5 * Math.sin(this.#phase * 4))
    })
  }

  disconnectedCallback() {
    this.#loop?.stop()
  }

  #recolor() {
    const next = COLORS[(COLORS.indexOf(this.getAttribute("color")) + 1) % COLORS.length]
    transaction(this, () => this.setAttribute("color", next))
  }
}

customElements.define("ww-pulse", WwPulse)
```
