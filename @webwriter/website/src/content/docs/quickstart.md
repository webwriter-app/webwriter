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
- [ ] ...[WebWriter](https://webwriter.app/get_started)

## Quick Start in WebWriter
Get started by developing your widget inside WebWriter.

### Step 1: Create a local package
Open WebWriter. Toggle the package managing mode (three boxes icon on the left).  Then click the "Create/import" button. Choose a directory where your package will be located. The dialog will help you pick a valid package/widget name. Once you are done, confirm to create the package. *You may need to restart WebWriter after this step!*

### Step 2: Edit your widget
In your chosen package directory, you can find your widget's files. If you chose the default "Lit" template, there will be a file `my-widget.ts` (named after your package) containing a basic scaffold for your widget. Try changing the code. Once you save your changes, WebWriter should automatically reload your widget so you see your changes immediately. Otherwise, toggling package managing mode (as described above) or manually restarting WebWriter should also achieve this.

### What does the default "Lit" template include?
It uses the `LitElementWw` base class from the `@webwriter/lit` package, supporting these features in your widget:
1. Core properties as attributes: `contentEditable` is already set up as a reactive property.
2. Scoped Custom Element Registry: [ScopedElementsMixin](https://open-wc.org/docs/development/scoped-elements/) is used to avoid name collisions between two widgets using the same third-party web components.
3. Rehydration: Custom elements based on LitElementWw will be set to the state of their attributes when loaded.

### What next?
Now that your setup is ready, you read more about [widgets](./widgets/widgets) and follow the documentation (see navigation) to implement features.