# Guide: Creating a package

## Introduction
WebWriter uses [npm packages](https://docs.npmjs.com/packages-and-modules) to provide an easy way of extending the authoring tool with new widgets. WebWriter will discover any package published on npm ([read more about npm here](https://docs.npmjs.com/about-npm)) if it is tagged with the keyword `webwriter`.

## Prerequisites
You have a text editor / IDE of your choice installed. You have [nodejs including npm](https://nodejs.org/) installed, alternatively [yarn](https://yarnpkg.com/).

## Creating your package
1. Create a new directory with the name you want for your package (e.g. `mypackage`), then open it (`cd mypackage`).
2. Initialize the package (run `npm init`), creating `package.json`.
3. Create your main file and add its path to `package.json`: `"main": "index.js"`. Note that your main file can be either JS (`.js`) or TypeScript (`.ts`), and [all content types of esbuild are supported](https://esbuild.github.io/content-types/)
4. Add the `webwriter` keyword to 
5. Implement your widget ([guide here](./creatingwidgets.md)).
6. Publish your library (run `npm publish`) \[[requires an npm user account](https://docs.npmjs.com/creating-a-new-npm-user-account)\].

## Testing your package
Start WebWriter, then open the Package Manager. Under 'Available', your package can be installed.

## Notes & Troubleshooting
- When publishing a new version, you need to increment the version in your `package.json`, as well.
- If your package does not show up in the Package Manager, make sure you added the `webwriter` keyword to your `package.json`.