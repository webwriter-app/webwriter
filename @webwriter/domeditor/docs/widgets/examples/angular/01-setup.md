Use a class decorator to define the standalone Angular component, then pass its constructor and an application injector to `createCustomElement`. The component selector stays distinct from the public tag name to avoid Angular creating two component instances for one element.

```ts
@Component({
  selector: "ww-quiz-view",
  standalone: true,
  template: "<p>Quiz widget</p>",
  encapsulation: ViewEncapsulation.ShadowDom,
})
class WwQuiz {}

const app = await createApplication()
const Element = createCustomElement(WwQuiz, {injector: app.injector})
customElements.define("ww-quiz", Element)
```

The full runnable source is [01-setup.ts](./01-setup.ts).
