# Sandbox

Choose a library and an example. Edit the source or HTML to see your changes in the preview.

<!-- live-example: Hello world -->

```js vanilla
class HelloWidget extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({mode: "open"}).textContent = "Hello world"
  }
}

customElements.define("ww-hello", HelloWidget)
```

```js lit
import {LitElement, html} from "lit"

class HelloWidget extends LitElement {
  render() {
    return html`Hello world`
  }
}

customElements.define("ww-hello", HelloWidget)
```

```js react
import {createRoot} from "react-dom/client"

class HelloWidget extends HTMLElement {
  constructor() {
    super()
    createRoot(this.attachShadow({mode: "open"})).render("Hello world")
  }
}

customElements.define("ww-hello", HelloWidget)
```

```js vue
import {defineCustomElement, h} from "vue"

const HelloWidget = defineCustomElement({
  render: () => h("span", "Hello world"),
})

customElements.define("ww-hello", HelloWidget)
```

```js angular
import "@angular/compiler"
import {Component, ViewEncapsulation} from "@angular/core"
import {createCustomElement} from "@angular/elements"
import {createApplication} from "@angular/platform-browser"

class HelloWidget {}

Component({
  selector: "hello-view",
  template: "Hello world",
  encapsulation: ViewEncapsulation.ShadowDom,
})(HelloWidget)

const {injector} = await createApplication()
customElements.define("ww-hello", createCustomElement(HelloWidget, {injector}))
```

```svelte svelte
<svelte:options customElement={{tag: "ww-hello"}} />

Hello world
```

```html
<ww-hello></ww-hello>
```

<!-- /live-example -->
