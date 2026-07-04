---
title: State
order: 308
---

# State
WebWriter offers several ways to organize your widget's state.

![Widget State](../../../assets/webwriter_widget_state.svg)

## Properties
Object properties can be used to store any kind of data. WebWriter does not persist properties, so they are lost each time an explorable is saved or reloaded.

**A property `showSuggestions`**
```ts
class MyWidget extends LitElementWw {
  showSuggestions = false
}
```


## Attributes
Attributes can be used to store data that can be represented as a string. Attributes are persisted when explorables are saved.

**An attribute `showsuggestions` synchronized with a property `showSuggestions`**
```ts
class MyWidget extends LitElementWw {

  @property({type: Boolean, attribute: true, reflect: true})
  accessor showSuggestions = false
}
```


### Options
You can mark attributes as options. Options are used by WebWriter to auto-generate input fields to modify the corresponding attributes. As the name suggests, this is mostly suited to simple attributes (boolean, string, etc.).

#### Adding static options
Most options can be implemented as static, not depending on the state of the widget. The recommended way is to use the decorator `@option` from the `@webwriter/lit` package.

**Using the `@option` decorator on a widget property**
```ts
class MyWidget extends LitElementWw {

  @property({type: Boolean, attribute: true, reflect: true})
  @option({type: Boolean, label: {en: "Show suggestions"}})
  accessor showSuggestions = false
}
```

Instead of the decorator syntax, a static `options` property may also be used.

**Using the `options` property on the widget class/constructor**
```ts
class MyWidget extends LitElementWw {

  static options = {
    showSuggestions: {type: "boolean", label: {en: "Show suggestions"}}
  }

  @property({type: Boolean, attribute: true, reflect: true})
  accessor showSuggestions = false
}
```

#### Adding dynamic options 
Some options may need to be dynamic, for example because they depend on the state of the widget. In this case, implement a `dynamicOptions` getter instead of using the decorator. Note that this getter is **not static**.

**Adding a `dynamicOptions` getter on the widget instance**
```ts
class MyWidget extends LitElementWw {

  @property({type: Boolean, attribute: true, reflect: true})
  accessor hasSuggestions = false

  @property({type: Boolean, attribute: true, reflect: true})
  accessor showSuggestions = false

  get dynamicOptions() {
    return !this.hasSuggestions? {}: {
      showSuggestions: {type: "boolean", label: {en: "Show suggestions"}}
    }
  }
}
```

## Content
Content isn't directly part of the widget, but it can interacted with using the Slot API.