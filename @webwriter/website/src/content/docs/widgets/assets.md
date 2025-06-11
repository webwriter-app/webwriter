---
title: "Assets"
order: 307
---

# Assets
Widgets may use different external assets such as images (or even audio and video), WebAssembly files, custom resources, and so on. This section shows how to use some of the most common types of assets in a widget.

## How assets are handled in WebWriter
When a package is built using `@webwriter/build`, it is bundled using [`esbuild`](https://esbuild.github.io/). This means that a widget may include any [type of asset that `esbuild` allows](https://esbuild.github.io/content-types/). 

## JS
JS is the default asset type. It can be the entry point of your widget with `"exports": {... "./widgets/my-widget": "./widgets/my-widget.js"}` configured in `package.json`. Any files imported in your entry point are also bundled (this applies recursively) according to normal bundler behavior.

`my-widget.js`
```js
import MySubComponent from "./mysubcomponent"
```

More details can be found in the [esbuild documentation on JS](https://esbuild.github.io/content-types/#javascript).

## TypeScript
[TypeScript (TS)](https://www.typescriptlang.org/) is a strongly typed language building on JS. In WebWriter, TypeScript has first-class support: A TypeScript file can also be an entry point with `"exports": {... "./widgets/my-widget": "./widgets/my-widget.ts"}`, configured in `package.json`. The same rules as for JS generally apply. Additionally, if your package includes a [`tsconfig.json`](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html), it is used when bundling.

`my-widget.ts`
```ts
import MySubComponent from "./mysubcomponent"
```

More details can be found in the [esbuild documentation on TypeScript](https://esbuild.github.io/content-types/#typescript).

## JSX/TSX
JSX is a syntax for JS to create React elements with an XML-like syntax. Some component libraries, most prominently React, use this syntax.

More details can be found in the [esbuild documentation on JSX](https://esbuild.github.io/content-types/#jsx).

## JSON
JSON can be imported directly, as well. When a JSON file is imported, it is converted into a JS object at build time. This also applies to `.jsonld` files.

`my-widget.js`
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

Additionally, xou can prefix any import with the protocol `inline:` to import the text content of the referenced file as a string.

```js
import string from './myfile.txt' // or 'inline:./myscript.js'
console.log(string)
```

More details can be found in the [esbuild documentation on text](https://esbuild.github.io/content-types/#text).

## Media: Images, Icons, (Audio, Video)
Media assets can be imported in your JS/TS code. These assets are converted into a Base64-encoded data URI that can be used directly in any place a URI would be used.

The following file extensions are loaded as data URIs:
- Image: `.apng`, `.jpg`, `.jpeg`, `.jfif`, `.pjpeg`, `.pjp`, `.png`, `.svg`, `.webp`, `.bmp`, `.ico`, `.cur`, `.tif`, `.tiff`
- Audio: `.wav`, `.wave`, `.mp3`, `.aac`, `.aacp`, `.oga`, `.flac`, `.weba`
- Video: `.mp4`, `.webm`, `.avif`, `.gif`, `.mov`, `.avi`, `.ogv`, `.mkv`, `.opus`, `.mpeg`
- Font: `.woff`, `.woff2`, `.ttf`, `.otf`
- Document: `.pdf`

Note that binary file types are loaded in Base64 encoding, while text formats such as SVG as loaded directly as text in the Data URI.

```js
import myicon from "./myicon.svg"

@customElement("my-widget")
class MyWidget extends LitElement {
  render() {
    return html`<img src=${myicon}></img>` // if using Shoelace.js, <sl-icon src=${myicon}></sl-icon> also works
  }
}
```

As shown in the example, this approach is most useful for using multiple small assets such as a set of icons for the widget.

Larger media assets such as most video and audio files are not intended to be part of a widget's source. Since these assets would be bundled into every explorable that includes the widget, they would massively increase the widget's size, and slow down both authoring and usage of the explorable.

## Web Workers
Web workers are supported. To import a web worker, bundling its code and getting as a string, prefix the worker path with `worker:`. The worker code supports the same features and assets as the main file (TypeScript, assets, etc.). 

**foo.worker.ts** or **foo.worker.js**
```js
postMessage("hello from worker")
```

**mywidget.ts**
```js
import MyWorkerRaw from "worker:./foo.worker"
const worker = new Worker(URL.createObjectURL(new Blob([MyWorkerRaw])))
```

## WebAssembly
WebAssembly is not supported yet.

## Other assets
Other types of assets are not directly supported. However, some other types of assets can be supported by adding a build step to your widget's development. To achieve this, you need to convert/compile the unsupported asset type into one of the supported asset types.