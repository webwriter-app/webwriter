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
