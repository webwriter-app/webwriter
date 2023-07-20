---
title: "Assets"
order: 107
---

# Assets
Widgets may use different external assets such as images (or even audio and video), WebAssembly files, custom resources, and so on. This section shows how to use some of the most common types of assets in a widget.

## How assets are handled in WebWriter
When a widget is loaded into WebWriter (by installing a package), WebWriter bundles the package using [`esbuild`](https://esbuild.github.io/) and imports the resulting bundle. This means that a widget may include any [type of asset that `esbuild` allows](https://esbuild.github.io/content-types/). Bundling is used again when the author saves the explorable, as all widgets are combined into a single, minimal bundle and the bundle source is embedded into the explorable. 

## JS
JS is the default asset type. It can be the entry point of your widget with `"main": "myfile.js"` configured in `package.json`. Any files imported in your entry point are also bundled (this applies recursively) according to normal bundler behavior.

`mywidget.js`
```js
import MySubComponent from "./mysubcomponent"
```

More details can be found in the [esbuild documentation on JS](https://esbuild.github.io/content-types/#javascript).

## TypeScript
[TypeScript (TS)](https://www.typescriptlang.org/) is a strongly typed language building on JS. In WebWriter, TypeScript has first-class support: A TypeScript file can also be an entry point with `"main": "myfile.ts"`, configured in `package.json`. The same rules as for JS generally apply. Additionally, if your package includes a [`tsconfig.json`](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html), it is used when bundling.

`mywidget.ts`
```ts
import MySubComponent from "./mysubcomponent"
```

More details can be found in the [esbuild documentation on TypeScript](https://esbuild.github.io/content-types/#typescript).

## JSX/TSX
JSX is a syntax for JS to create React elements with an XML-like syntax. Some component libraries, most prominently React, use this syntax.

More details can be found in the [esbuild documentation on JSX](https://esbuild.github.io/content-types/#jsx).

## JSON
JSON can be imported directly, as well. When a JSON file is imported, it is converted into a JS object at build time.

`mywidget.js`
```js
import config from "./config.json"
```

This means that you can also import the package's `package.json` if you want to reuse metadata you stored there for the widget.

More details can be found in the [esbuild documentation on JSON](https://esbuild.github.io/content-types/#json).

## CSS
The recommended way to include styles in a widget is to use a CSS-in-JS approach such as [lit's support for styles](https://lit.dev/docs/components/styles/). 

Alternatively, CSS files can be imported from JS/TS. This will generate a CSS bundle that WebWriter will import along with the widget. Note that the CSS will still not affect your component's shadow DOM, so this is typically not what you want.

```js
import "./mystyle.css"
```

More details can be found in the [esbuild documentation on CSS](https://esbuild.github.io/content-types/#json).

## Text
Any text file with the `.txt` extension can be imported as a string.

```js
import string from './myfile.txt'
console.log(string)
```

More details can be found in the [esbuild documentation on text](https://esbuild.github.io/content-types/#text).

## Media: Images, (Audio, Video)
Small media assets (< 1.45MB) can be imported in your JS/TS code. These assets are converted into a Base64-encoded data URI that can be used directly in any place a URI would be used. The limit of 1.45MB results from [the 2MB limit of data URIs in Chrome](https://stackoverflow.com/a/41755526) and the [~37% size increase of binary data in Base64 encoding](https://stackoverflow.com/a/11402374). Bigger files may work on browsers with higher limits but will break in Chrome.

```js
import myicon from "./myicon.svg"

class MyWidget extends LitElement {
  render() {
    // This will the icon at 
    return html`<img src=${myicon}></img>`
  }
}
```

As shown in the example, this approach is most useful for using multiple small assets such as a set of icons for the widget.

Larger media assets such as most video and audio files are not intended to be part of a widget's source. Since these assets would be bundled into every explorable that includes the widget, they would massively increase the widget's size.

## WebAssembly
WebAssembly is not supported yet.

## Other assets
Other types of assets are not directly supported. However, some other types of assets can be supported by adding a build step to your widget's development. To achieve this, you need to convert/compile the unsupported asset type into one of the supported asset types.