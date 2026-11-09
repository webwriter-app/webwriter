# Optimize the code bundle

Use `import()` to load large optional features on demand. Offline HTML normally embeds the targets of those imports so they can run without a network connection. If a widget’s saved settings limit which features a reader can use, implement `static offlineImports(element)` to embed just those features and their dependencies.

## Put optional features behind lazy imports

Give the optional features their own loader module. Each `import()` uses a literal module specifier. In this example, the widget entry is `widgets/ww-simulation.js` and the loaders are in `simulations/loaders.js`.

```js
// simulations/loaders.js
export const loaders = {
  orbits: () => import("./orbits.js"),
  circuits: () => import("./circuits.js"),
}
```

## Select imports from the saved widget

Use the same selection rule for loading the feature and exporting the widget. WebWriter calls the hook synchronously with a detached copy of the saved element. Read its attributes or light-DOM children without modifying them.

```js
// widgets/ww-simulation.js
import {loaders} from "../simulations/loaders.js"

const simulationType = element => element.getAttribute("type") ?? "orbits"

class WwSimulation extends HTMLElement {
  static offlineImports(element) {
    const type = simulationType(element)
    return [{
      importer: "../simulations/loaders.js",
      keep: Object.hasOwn(loaders, type) ? [`./${type}.js`] : [],
    }]
  }

  async loadSimulation() {
    const type = simulationType(this)
    if (Object.hasOwn(loaders, type)) return loaders[type]()
  }
}

customElements.define("ww-simulation", WwSimulation)
```

`importer` names the file containing the `import()` calls, relative to the published widget entry. Each `keep` value matches the specifier in one of those calls, so `./orbits.js` is relative to `loaders.js`. Check that your published output preserves the loader module and its dynamic imports. Code already inlined by your build is part of the module that contains it.

WebWriter combines selections across widget instances and insertable templates. If the saved document has one Orbits widget and one Circuits widget, it embeds both simulations. If readers can switch modes in a single widget, include all modes they can reach offline. Return `keep: "*"` when they need the entire catalog. See the [runtime interface](../reference/runtime.md#offline-imports) for the full contract.

## Verify the offline export

1. Load the built widget in WebWriter. Configure one variant and set a value or checkpoint you can check after reopening.
2. Save as **Offline HTML**. Open the file directly in a browser with networking disabled. Confirm that the selected variant starts and restores the saved state and settings.
3. Compare the export size with a document that includes every variant. If the widget can request a variant excluded from the file, handle the rejected import (`OfflineImportError`) with a message that explains its offline availability.
