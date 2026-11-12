# Make data reactive

Connect widgets with signals when one widget needs to react to a value produced by another. The author saves the connection in HTML and the receiving widget updates as the source changes.

![A selected color flows from a color picker into a separate swatch](../../images/widgets/reactivity.svg)

## Publish a value

A color picker can keep its current color in a private signal and expose a stable, read-only computed signal called `color`. Initialize both once per widget instance.

```js
import {computed, signal} from "@webwriter/lit"

class WwColorSource extends HTMLElement {
  #color = signal("#4263a8")
  signals = {color: computed(() => this.#color.get())}

  set color(value) { this.#color.set(value) }
}
```

Call the setter from the color input's `input` handler. When source and receiver are built separately, use compatible dependencies and [shared dependency builds](libraries.md) so both use the same Signals implementation.

## Connect a receiver

Declare a `static effects` entry for the receiving attribute. Store the incoming signal and clear the reference when WebWriter aborts the connection. Reading both signals during `LitElementWw.render()` tracks changes to the connection and the color.

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

Register both custom elements and connect them in the authored document. In `#palette[color]`, `palette` is the source widget's unique ID and `color` is its public signal name.

```html
<ww-color-source id="palette"></ww-color-source>
<ww-linked-swatch color-from="#palette[color]"></ww-linked-swatch>
```

In WebWriter, select the swatch and choose the color picker from the **Swatch color** option in the Widget drawer. Choose **Disconnected** to remove the link.

Change the picker and watch the swatch update. Disconnect it, change the color again, then reconnect to read the latest value.

<iframe title="Reactive color picker and swatch" src="../examples/preview.html?guide=reactivity" width="100%" height="170" loading="lazy"></iframe>

[Open the reactive color example](../examples/preview.html?guide=reactivity) · [Read the complete example source](../examples/guide-reactivity.js)

Check that a missing source shows a useful fallback. WebWriter reconnects valid links when their endpoints become available and leaves circular links disconnected. See the [Signals reference](../reference/runtime.md#signals) for the connection and build contracts.
