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
| `static options` / `static actions` | Widget drawer declarations. Use static fields for these declarations. |
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
