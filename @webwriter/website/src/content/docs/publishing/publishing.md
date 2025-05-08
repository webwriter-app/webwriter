---
order: 800
title: "Publishing"
---
# Publishing

WebWriter uses [npm packages](https://docs.npmjs.com/packages-and-modules) to provide an easy way of extending the authoring tool with new widgets. WebWriter will discover any package published on npm ([read more about npm here](https://docs.npmjs.com/about-npm)) if it is tagged with the keyword `webwriter-widget`.

## Prerequisites
You have...
- [ ] ...completed the [quick start guide](./quickstart.md)
- [ ] ...a user account on npmjs.com (sign up for free [here](https://docs.npmjs.com/creating-a-new-npm-user-account))

## Creating your package (summary)
If you're familiar with creating npm packages already, all you need to know is that you need to `npm publish` a package satisfying these conditions for WebWriter to detect it so that authors can install it:
- `name` must be scoped (e.g. `@org/pkg`)
- `exports` should point to one or more exports of widgets/snippets/themes
- `keywords` must contain `webwriter-widget`


## Creating your package (step-by-step)

### Step 1: Creating your package directory
Create a new directory with the name you want for your package. The package name must be scoped (`@org/pkg`). The scope name (e.g.`org`) is also the prefix of your widgets' custom elements. The name must be available on `npm` (check this by [searching npm](https://www.npmjs.com/)). You are responsible for avoiding name conflicts between widgets within your scope (e.g. `@org/pkg1` and `@org/pkg2` may not both export a widget named `org-foo`).
```sh
mkdir -p @org/pkg
```

### Step 2: Creating your main file
Create your main file in your package directory (e.g. `ww-coolwidget/index.js` if using JS or `ww-coolwidget/index.ts` if using TypeScript).

After this step, your directory should look similar to this:
```
ww-coolwidget
  index.ts
```

### Step 3: Initializing your package
Use npm to initialize the package. In the interactive prompt, the package name should be left as the directory name from step 1 (default), the entry point should be your main file from step 2, and one of the keywords *must* be `webwriter-widget`.

```sh
cd ww-coolwidget
npm init
```

After this step, your directory should look similar to this:
```
ww-coolwidget
  index.ts
  package.json
```

### Step 4: Implementing your widget
Implement your widget in your main file from step 2 ([guide here](./creatingwidgets.md)). *If you just want to test the package for now and implement later, skip this step.*

### Step 5: Publishing your package
Publish your library with npm. Make sure you do not include sensitive data (not an issue if you only followed this guide).

```sh
npm publish
```

## Testing your package
First off, your package should be available on [`npm`, try searching for it](https://www.npmjs.com/). If it is, start WebWriter, then view the available packages and install yours.

## Notes & Troubleshooting
- When publishing a new version, you need to increment the version in your `package.json`, as well.
- If your package shows up on [npmjs.com](npmjs.com) but not in the Package Manager, make sure you added the `webwriter-widget` keyword to your `package.json`.
- Of course, the `package.json` file can also be created manually without `npm init` if you prefer.