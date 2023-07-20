---
order: 0
title: "Quick start"
---
# Guide: Quick start

This guide takes you through a few, quick steps of setup. When done, you will have a development environment to implement your own widget for WebWriter.

### Prerequisites
To get started, you need...
- [ ] ...a text editor of your choice, for example [VSCode](https://code.visualstudio.com/)
- [ ] ...[WebWriter](https://webwriter.app/get_started)
- [ ] ...[NodeJS](https://nodejs.org/), which already includes the package manager `npm`

## A) Quick Start (Automatic)
Get started with a minimal template for your widget. 

### Step 1: Initialize your widget's project
Create an empty project directory. In that directory, run `npm create @webwriter/widget`. This initializer allows you to configure the project and start from a template for your widget. We recommend you use the `ts-lit-vite` template.

### Step 2: Try out your setup
Open WebWriter. Go to settings, then to the "local" tab under packages, then press "add unlisted package". Choose your project directory. After loading, the package should be shown in the list. We recommend you press the lightning button to enable live reloading, so each time you change your code, the package is imported again. Now, you can have WebWriter and your text editor open side by side while making changes.

Note: Alternatively, you can also run your widget outside of WebWriter: In your project directory, run `npm run dev`. A test site for your widget should open automatically in your default browser. Now, try changing something in your widget's source code. The site should reload automatically!

### What does this setup include?
It uses the `LitElementWw` base class from the `@webwriter/lit` package, supporting these features in your widget:
1. Core properties as attributes: The core properties such as `editable` are already set up as boolean attributes.
2. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components.
3. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.

Additionally, you can use `npm run dev` to start a development server. 

### What next?
Now that your setup is ready, you can follow the [guide to create your widget](./creatingwidgets.md).

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
    "webwriter"
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