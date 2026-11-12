Angular Elements makes an Angular component a custom element. This TypeScript example uses a native `<slot>`. The widget's child elements stay in the light DOM. `ViewEncapsulation.ShadowDom` keeps the view and styles in the shadow root. The browser build uses the Angular runtime compiler.

```ts
import "@angular/compiler"
import {Component, ViewEncapsulation} from "@angular/core"
import {createApplication} from "@angular/platform-browser"
import {createCustomElement} from "@angular/elements"

@Component({
  selector: "ww-hello-view",
  standalone: true,
  template: "<p>Hello, <slot>world</slot>!</p>",
  encapsulation: ViewEncapsulation.ShadowDom,
})
class WwHello {}

const app = await createApplication()
const Element = createCustomElement(WwHello, {injector: app.injector})
customElements.define("ww-hello", Element)
```

See [Angular Elements](https://angular.dev/guide/elements) and [component view encapsulation](https://angular.dev/api/core/Component#encapsulation).
