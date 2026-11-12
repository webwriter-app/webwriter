Declare `answer` as a component input. Angular Elements maps the HTML attribute to the component property. Keep the reader's choice in component state. Read `isContentEditable` on the host element before you accept a click. An observer updates the view when `contenteditable` changes on the host element.

```ts
@Input() answer: string = "false"
get editing(): boolean { return this.host.isContentEditable }

choose(value: string): void {
  if(this.editing) return
  this.choice = value
}
```

The complete source is [04-state.ts](./04-state.ts).
