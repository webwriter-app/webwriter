---
order: 9999
hidden: true
title: "Migrating from Alpha"
---

# Migrating from Alpha
During the alpha, WebWriter used a more simple interface for packages and widgets. These are not compatible with current versions and need to be migrated.

## Migrating packages
In the alpha, each package held exactly one widget. In the current versions, a package may contain any number of widgets, snippets, and themes.

### `exports` map instead of `main` path
Previously, as there was only one widget per package, you specified a single entrypoint with the `main` field. Now, multiple entrypoints or exports need to be specified with the `exports` field.

### Scoped `name` is required
Unscoped packages such as `my-pkg` are no longer allowed. All packages must be scoped, e.g. `@org/pkg`. The scope of the package (e.g. `org`) will also be the prefix of your widgets (meaning in a package `@foo/bar`, widgets must be named `foo-mywidget`, `foo-anotherwidget`, and so on). You are responsible to avoid name collisions between widgets within the `org` (e.g. two widgets named `foo-mywidget`).


An example for both `name` and `exports`:

**Old**
```json
{
  "name": "my-widget",
  // rest of your widget's package json
  "main": "./my-widget.ts"
}
```

**New**
```json
{
  "name": "@awesome/widgets", // Scoped package name
  // rest of your widget's package json
  "exports": {
    "./widgets/awesome-widget": "./my-widget.ts" // Exported name must match the package scope
  }
}
```

## Migrating widget code

### Update dependencies
If you are using `LitElementWw` from `@webwriter/lit`, you should update it since there are breaking changes.
**Run this in your widget folder (yarn, pnpm, etc. also work):**
```sh
npm install @webwriter/lit@latest
```

### Widget name should share package scope
As noted above, your widget name must be prefixed by your package scope. This means you probably need to rename all your custom element registrations (`@customElement("my-element")` in Lit or `customElements.register()`) accordingly. 

### `contenteditable` instead of `editable`
Current versions use the built-in enumerated `contenteditable` attribute instead of the old boolean `editable` attribute
Be careful on several points:
- The property corresponding to the attribute is named `contentEditable`.
- The attribute is *not* boolean, it is enumerated (`""`, `"true"`, `"false"`, or `"plaintext-only"`). Additionally, the property returns `"inherit"` if the attribute is not set. This means that expressions like `this.editable? a: b` or `if(this.editable) {...}` no longer work, since the value of `contentEditable` is always considered true. Instead, use the standard read-only `isContentEditable` boolean property, e.g. `if(this.isContentEditable) {}`.
- The previous point also applies to CSS. A selector applied only if the element is editable would look like this: `:host(:is([contenteditable=true], [contenteditable=""])) ...`. 

### `.ww-beforeprint` instead of `printable`
That the widget is being printed is now indicated through the class `.ww-beforeprint` instead of a boolean attribute. Widgets should turn `class` into a reactive property and update when the class is changed. You can check for the presence of the class in your `render` method using the `classList` API, e.g. `this.classList.contains("ww-beforeprint")`. For CSS, simply use the class selector `.ww-beforeprint` instead of the attribute selector `[printable]`.

### `part=options` instead of `part=action`
The part-based layout feature has been renamed: You need to replace `part=action` with `part=options`.

### Standard Decorators instead of TypeScript Experimental Decorators
In the past, WebWriter was configured to support TypeScript's experimental decorators. Since this language feature will likely be deprecated in the long term, WebWriter is moving to standard decorators. You can read more about the change in [Lit's documentation](https://lit.dev/docs/components/decorators/#standard-decorators). To migrate your code, follow these steps:

1. Install the latest version of `@webwriter/lit`: `npm install @webwriter/lit@latest`

2. **Either** delete your `tsconfig.json` **or** set these options:
```json
{ // tsconfig.json
  "compilerOptions": {
    "experimentalDecorators": false, // default for TypeScript 5.0 and up
    "useDefineForClassFields": true, // default when "target" is "ES2022" or higher
  }
}
```

3. Add the `accessor` keyword to all decorated fields (e.g. `@property() myprop`):

```ts
@customElement('my-element') // this stays the same
export class MyElement extends LitElement {
  @property() accessor greeting = 'Welcome' // with 'accessor'
}
```

4. If you have a decorated getter, move the decorator to the setter instead:

```ts
@customElement('my-element') // this stays the same
export class MyElement extends LitElement {

  #greeting = "welcome"

  // no more decorator here
  get greeting() {
    return this.#greeting
  }

  @property() // !
  set greeting(value) {
    this.#greeting = value
  }
}
```


## Extra recommendations

### Import assets such as icons as data URLs
Previously, there was no way built-in solution for assets. If you found your own solution, it is advised that you migrate to the [built-in assets](./widgets/assets).