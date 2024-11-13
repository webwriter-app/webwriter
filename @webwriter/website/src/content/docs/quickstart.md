---
order: 0
title: "Quick Start"
---
# Quick Start

This guide takes you through a few, quick steps of setup. When done, you will have a development environment to implement your own widget for WebWriter.

### Prerequisites
To get started, you need...
- [ ] ...a text editor of your choice, for example [VSCode](https://code.visualstudio.com/)
  - [ ] *optional*: The [`lit-plugin`](https://marketplace.visualstudio.com/items?itemName=runem.lit-plugin) extension for VSCode if you plan to use Lit - it adds support for syntax highlighting, type checking and code completion for Lit.
- [ ] ...[WebWriter running in **Chrome** or **Edge**](https://run.webwriter.app/)

## Quick Start in WebWriter
Get started by developing your widget inside WebWriter.

### Step 1: Create a local package
Open WebWriter. Toggle the package managing mode (three boxes icon on the left). Then click the "Create/import" button. Choose a directory where your package will be located. The dialog will help you pick a valid package/widget name. Once you are done, confirm to create the package. In some cases, you need to reload the packages afterwards by clicking the three boxes icon again.

### Step 2: Set up automatic rebuilding
WebWriter automatically detects changes in the build of your package, triggering a reload. If you use the "Lit" template, you can run `npm run dev` (or `npx @webwriter/build dev`) in your project root, meaning the package will be rebuilt automatically if your source code changes.

### Step 3: Edit your widget
In your chosen package directory, you can find your widget's files. If you chose the default "Lit" template, there will be a file `widgets/my-widget.ts` (named after your package) containing a basic scaffold for your widget. Try changing the code. Once you save your changes, WebWriter should automatically reload your widget so you see your changes immediately. Otherwise, toggling package managing mode (as described above) should also achieve this.

### What does the default "Lit" template include?
It uses the `LitElementWw` base class from the `@webwriter/lit` package, supporting these features in your widget:
1. Core properties as attributes: `contentEditable` and `lang` are already set up as reactive properties.
2. Localization support: The widget can support localization for any number of languages. Follow the [localization guide](./widgets/localization) to implement that.
3. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components.
4. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.

### What next?
Now that your setup is ready, you read more about [widgets](./widgets/widgets) and follow the documentation (see navigation) to implement features.