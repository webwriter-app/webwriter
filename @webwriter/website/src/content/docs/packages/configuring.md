---
order: 201
title: Configuring
configFor: packages/packages
---

# Configuring Packages
All configuration of the package is located in the `package.json` file. This is a [node package file following NPM's conventions](https://docs.npmjs.com/cli/v10/configuring-npm/package-json).

## Example
Here is a minimal example:

**`package.json`**
```json
{
  "name": "@awesome/widgets",
  "version": "0.1.0",
  "keywords": ["webwriter-widget"],
  "exports": {
    "./widgets/awesome-widget": "./widgets/awesome-widget.ts"
  }
}
```

## Required fields

### `name`
Must be a scoped package name, e.g. `@org/pkg`. The scope of the package (e.g. `org`) will also be the prefix of your widgets (meaning in a package `@foo/bar`, widgets must be named `foo-mywidget`, `foo-anotherwidget`, and so on). You are responsible to avoid name collisions between widgets within the `org` (e.g. two widgets named `foo-mywidget`).

### `version`
Must be a [SemVer 2](https://semver.org) version identifier (`MAJOR.MINOR.PATCH`). Versions with major version `0` (e.g. `0.1.0`) are considered as pre-release and are hidden by default when users search for packages. 

#### Rules for updating
You should stick to some rules so WebWriter can automatically update explorable to new widget versions while staying backwards-compatible:
1. Increment `MAJOR` for breaking attribute, event or editing config changes. Increment `MINOR` when adding attributes, events, or making compatible editing config changes. Increment `PATCH` when nothing about the interface of the widget has changed.
2. Use versions starting with `0` as pre-release versions that should be hidden from most users.

### `keywords`
Each WebWriter widget must have the `webwriter-widget` keyword so it can be found and installed. It is recommended you add additional keywords to describe your widget further.

### `exports`
The `exports` field is an object mapping an exported name to a file path. There are three types of exports: Widgets, snippets and themes. 

## Optional fields

### Extra metadata: `description`, `author`/`contributors`, `license`
The `description` is a short text describing the widget in English. This is shown to the user when browsing packages and also used for package search. The `author` and/or `contributors` fields are used to specify people involved (see [here](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#people-fields-author-contributors)). The `license` is an SPDX license identifier.
```json
{
  // ...
  "description": "Offers awesome functionality such as ...",
  "author": "John Doe <doe@example.com>",
  "license": "MIT"
}
```

### `editingConfig`
The editing config allows you to configure how WebWriter treats your widget, snippet, or theme when editing. More details are found on the respective pages for [widgets](../widgets/configuring), [snippets](../snippets/configuring), and [themes](../themes/configuring).

### Others
All other fields according to [NPM's conventions](https://docs.npmjs.com/cli/v10/configuring-npm/package-json) are allowed, but are generally ignored. `dependencies` are installed when the package is installed, while `devDependencies` are ignored.