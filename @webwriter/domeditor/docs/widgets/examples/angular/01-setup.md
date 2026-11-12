Use a class decorator to define the standalone Angular component. Pass its constructor and an application injector to `createCustomElement`. Use different names for the component selector and the public tag. This prevents Angular from creating two component instances for one element.

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

The complete source is [01-setup.ts](./01-setup.ts).
