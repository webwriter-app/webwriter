---
order: 700
title: "Debugging"
---

# Debugging

WebWriter includes several features to support testing and debugging.

## Local packages
While it is possible to develop widgets in any setup, the recommended way is to use the "local packages" feature. Using the "create/import" button in package management mode (three boxes button), you can create or import a package in a local folder. This way, you can test and debug your packages directly in WebWriter without needing to publish new package releases constantly.

## Auto-reloading
WebWriter can observe changes to your local package's code bundles and reload the package while preserving the document's state (auto or hot reloading). This functionality is similar to a development server, a common tool in web development.

To use this functionality, you need to recompile your code each time it changes. WebWriter's build tool `@webwriter/build` supports this with a watch command. Simply leave this running while your package is loaded in WebWriter:

**Enable package hot reloading**
```
npx @webwriter/build dev
```

## Developer tools
For debugging, the most helpful approach is to make use of the built-in developer tools. They are available in your browser. You can find [more information here](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Tools_and_setup/What_are_browser_developer_tools).

## `DEV` statements
Using a lesser known feature of JS/TS ([labeled statements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/label)), WebWriter allows you to mark certain statements in your widget code as development statements. These statements are only executed in WebWriter when the package is loaded locally. They are *not* executed when an author installs the published package or when the explorable is saved.

**Widget code when loaded locally**
```ts
import {LitElementWw} from "@webwriter/lit"
import {html, css} from "lit"


export default class CoolWidget extends LitElementWw {
  render() {
    DEV: console.log("rendering")
    return html`<textarea></textarea>`
  }
}
```

**Widget code when installed or saved**
```ts
import {LitElementWw} from "@webwriter/lit"
import {html, css} from "lit"


export default class CoolWidget extends LitElementWw {
  render() { // no more DEV statement!
    return html`<textarea></textarea>`
  }
}
```