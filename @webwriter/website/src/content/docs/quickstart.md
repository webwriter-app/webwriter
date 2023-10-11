---
order: 0
title: "Quick start"
---
# Guide: Quick start

This guide takes you through a few, quick steps of setup. When done, you will have a development environment to implement your own widget for WebWriter.

### Prerequisites
To get started, you need...
- [ ] ...a text editor of your choice, for example [VSCode](https://code.visualstudio.com/)
  - [ ] *optional*: The [`lit-plugin`](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin) extension for VSCode if you plan to use Lit - it adds support for syntax highlighting, type checking and code completion for Lit.
- [ ] ...[WebWriter](https://webwriter.app/get_started)

## A) Quick Start in WebWriter
Get started by developing your widget inside WebWriter.

### Step 1: Create a local package
Open WebWriter. Open the settings (cog icon in the upper left corner). Under "Packages", select "Local". Then click the "create local package" button. Choose a directory where your package will be located. The dialog will help you pick a valid package/widget name. Once you are done, confirm to create the package. *You may need to restart WebWriter after this step!*

### Step 2: Edit your widget
In your chosen package directory, you can find your widget's files. If you chose the default "Lit" template, there will be an `index.ts` file containing a basic scaffold for your widget. Try changing the code. Once you save your changes, WebWriter should automatically reload your widget so you see your changes immediately. Otherwise, manually restarting WebWriter should also achieve this.

### What does the default "Lit" template include?
It uses the `LitElementWw` base class from the `@webwriter/lit` package, supporting these features in your widget:
1. Core properties as attributes: The core properties such as `editable` are already set up as boolean attributes.
2. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components.
3. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.

Additionally, you can use `npm run dev` to start a development server. 

### What next?
Now that your setup is ready, you read more about [widgets](./widgets/widgets.md) and follow the documentation (see navigation) to implement features.

---

## B) Quick Start (Manual)
We recommend using Lit and LitElementWw since it is a decent tradeoff between ease of development and being lightweight.

If you develop with TypeScript, we recommend you use the official package `@webwriter/model`, which provides types to make developing widgets easier. If you also use Lit to develop, we recommend `@webwriter/lit` instead for a useful boilerplate class `LitElementWw` to base your widget on.

## Setting up your development environment
When your widget is completed, you can publish it as a package. Publishing a package each time you want to try your widget during development would take very long, so we recommend a separate development environment.

### Minimal development environment
At minimum, we suggest using a **development server**. This allows you to serve a test site for your widget's current build locally, so you can try it in your browser. Commonly, you also need a **build tool**, for example when compiling *TypeScript* to *JS*. 

A standard setup would use `lit` and Typescript. It uses `vite` as both a build tool and development server. `Vite` is a good choice since it uses `esbuild` under the hood, so any widget code that works with `vite` should also work in WebWriter. It could look like this:

**Project structure**:
```
ww-coolwidget/
  index.ts
  index.html
  tsconfig.json
  package.json
```

**`index.ts`**:
```typescript
import {LitElementWw} from "@webwriter/lit"
import {customElement} from "lit/decorators"

@customElement("ww-coolwidget")
export class WwCoolWidget extends LitElementWw {
  render() {
    return html`Hello, world!`
  }
}

```

**`index.html`**:
```html
<!DOCTYPE html>
<html encoding="utf8">
  <head>
    <title>Testing ww-coolwidget</title>
    <script src="index.ts" type="module"></script>
  </head>
  <body>
    <ww-coolwidget></ww-coolwidget>
  </body>
</html>
```

**`package.json`**:
```json
{
  "name": "ww-coolwidget",
  "version": "0.1.0",
  "description": "A very cool widget",
  "main": "index.ts",
  "keywords": [
    "webwriter-widget"
  ],
  "author": "Your Name <your@mail.here>",
  "license": "MIT",
  "scripts": {
    "dev": "vite --open",
    "build": "vite build"
  },
  "dependencies": {
    "lit": "^2.4.0",
    "@webwriter/lit": "^0.2.1"
  },
  "devDependencies": {
    "typescript": "^4.8.4",
    "vite": "^3.1.6"
  },
}
```

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```