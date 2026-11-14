# Make data reactive

A widget can publish read-only signals for other widgets in the same document. Authors can select a source and save the connection in the document. The receiving widget can change its display or operation when the value changes.

![A selected color flows from a color picker into a separate swatch](../../images/widgets/reactivity.svg)

Change the source color. Select **Disconnected** to stop updates, then select **Palette color** to reconnect to the current value.

<!-- live-example: Reactive color swatch -->

```js vanilla
import {computed, LitElementWw, signal} from "@webwriter/lit"
import {html} from "lit"

class ColorSource extends HTMLElement {
  #color = signal("#4263a8")
  signals = {color: computed(() => this.#color.get())}

  constructor() {
    super()
    const root = this.attachShadow({mode: "open"})
    root.innerHTML = '<label>Source color <input type="color" value="#4263a8"></label>'
    root.querySelector("input").addEventListener("input", event => {
      this.#color.set(event.currentTarget.value)
    })
  }
}

class LinkedSwatch extends LitElementWw {
  #source = signal(null)

  static effects = {
    "color-from": {
      label: "Swatch color",
      connect(source, lifetime) {
        this.#source.set(source)
        lifetime.addEventListener("abort", () => this.#source.set(null), {once: true})
      },
    },
  }

  render() {
    const color = this.#source.get()?.get()
    const connected = this.hasAttribute("color-from")
    return html`
      <label>Swatch source
        <select @change=${event => {
          const value = event.currentTarget.value
          if(value) this.setAttribute("color-from", value)
          else this.removeAttribute("color-from")
        }}>
          <option value="#palette[color]" ?selected=${connected}>Palette color</option>
          <option value="" ?selected=${!connected}>Disconnected</option>
        </select>
      </label>
      <output style=${color ? `color:${color}` : ""}>${color ?? "Swatch disconnected"}</output>`
  }
}

customElements.define("ww-color-source", ColorSource)
customElements.define("ww-linked-swatch", LinkedSwatch)

// The preview connects the published signal using the saved source ID.
const connections = new Map()
let editing = document.getElementById("preview")?.isContentEditable === true
function updateConnections() {
  if(editing) return
  const receivers = new Set(document.querySelectorAll("ww-linked-swatch"))
  for(const [widget, {source, lifetime}] of connections) {
    const id = /^#(.+)\[color\]$/.exec(widget.getAttribute("color-from"))?.[1]
    if(receivers.has(widget) && document.getElementById(id) === source) continue
    lifetime.abort()
    connections.delete(widget)
  }
  for(const widget of receivers) {
    widget.requestUpdate()
    if(connections.has(widget)) continue
    const id = /^#(.+)\[color\]$/.exec(widget.getAttribute("color-from"))?.[1]
    const source = id && document.getElementById(id)
    if(!source?.signals?.color) continue
    const lifetime = new AbortController()
    LinkedSwatch.effects["color-from"].connect.call(widget, source.signals.color, lifetime.signal)
    connections.set(widget, {source, lifetime})
  }
}

new MutationObserver(updateConnections).observe(document.body, {
  childList: true, subtree: true, attributes: true, attributeFilter: ["color-from", "id"],
})
document.addEventListener("live-example-editing", event => {
  editing = event.detail
  for(const {lifetime} of connections.values()) lifetime.abort()
  connections.clear()
  updateConnections()
})
updateConnections()
```

```html
<ww-color-source id="palette"></ww-color-source>
<ww-linked-swatch color-from="#palette[color]"></ww-linked-swatch>
```

<!-- /live-example -->

## Publish a value

A color picker can store its current color in a private signal. It can publish a stable, read-only [computed signal](https://lit.dev/docs/data/signals/) named `color`. Initialize both signals once for each widget instance.

```js
import {computed, signal} from "@webwriter/lit"

class WwColorSource extends HTMLElement {
  #color = signal("#4263a8")
  signals = {color: computed(() => this.#color.get())}

  set color(value) { this.#color.set(value) }
}
```

Call the setter from the [color input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/color)'s `input` handler. For separate builds, use compatible dependencies and [shared dependency builds](libraries.md). Both widgets must use the same Signals implementation.

## Connect a receiver

Declare a `static effects` entry for the receiving attribute. Store the incoming signal. Clear the reference when the authoring tool ends the connection. Read both signals in `LitElementWw.render()` to detect changes to the connection and color.

```js
import {LitElementWw, signal} from "@webwriter/lit"
import {html} from "lit"

class WwLinkedSwatch extends LitElementWw {
  #source = signal(null)

  static effects = {
    "color-from": {
      label: "Swatch color",
      connect(source, lifetime) {
        this.#source.set(source)
        lifetime.addEventListener("abort", () => this.#source.set(null), {once: true})
      },
    },
  }

  render() {
    const color = this.#source.get()?.get()
    return html`<output>${color ?? "Swatch disconnected"}</output>`
  }
}
```

[Register both custom elements](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define). Connect them in the authored HTML. In `#palette[color]`, `palette` is the source widget's unique ID. The public signal name is `color`.

```html
<ww-color-source id="palette"></ww-color-source>
<ww-linked-swatch color-from="#palette[color]"></ww-linked-swatch>
```

Select the swatch in the authoring tool. Select the color picker in **Swatch color** in the Widget drawer. To remove the link, select **Disconnected**.

Change the color in the picker. Make sure that the swatch changes. Disconnect the swatch. Change the color again. Reconnect the swatch. Make sure that it shows the current color.

Make sure that the widget shows a fallback value when the source is missing. The authoring tool restores valid connections when their sources become available. Circular connections stay disconnected. See the [Signals reference](../reference/runtime.md#signals).

## Signal names and dependencies

## Missing sources and circular connections
