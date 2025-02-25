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
  "name": "@awesome/package",
  "version": "0.1.0",
  "keywords": ["webwriter-widget"],
  "script": {
    "prepublishOnly": "npx @webwriter/build"
  },
  "exports": {
    "./widgets/awesome-widget.*": {
      "source": "./src/widgets/awesome-widget.ts",
      "default": "./dist/widgets/awesome-widget.*"
    },
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
Each WebWriter package must have the `webwriter-widget` keyword so it can be found and installed. It is recommended to add additional keywords to describe your widget further. There are some standardized keywords available that WebWriter uses for categorization of packages.

```json
{
  // ...
  "keywords": ["webwriter-widget", "widget-online", "widget-lang-en", "widget-lang-de", "contextual", "isced2011-1", "iscedf2013-05", "map", "historical"]
}
```

#### Technical info
- `widget-online` / `widget-online-edit` / `widget-online-use`: Specify that widgets of this package need to be online to function (e.g. a world map fetching map data from OpenStreetMap), or that the widgets only need to online when editing / when using.
- `widget-lang-[IETF language tag]`: Specify the languages the widgets are available in as an [IETF language tag](https://en.wikipedia.org/wiki/IETF_language_tag) (e.g. `widget-lang-en`, `widget-lang-de` for a widget in English and German).

#### Widget type
Following [Daniel Churchill's "Towards a useful classification of learning objects"](https://link.springer.com/content/pdf/10.1007/s11423-006-9000-y.pdf), WebWriter recognizes 6 widget types. Multiple types may apply:
- `presentational`: Arrangement of content for a topic (e.g. a slide show)
- `practional`: Exercises with feedback, serious games, etc. that allow practice and learning (e.g. a quiz)
- `simulational`: Representation of some real-life system or process (e.g. a physics sandbox for mechanics)
- `conceptual`: Representation of an abstract concept or multiple related concepts (e.g. GeoGebra for analysis and geometry)
- `informational`: Organized display of information (e.g. a periodic table)
- `contextual`: Live or example data from authentic scenarios (e.g. a historical atlas)

#### Education programmes (ISCED 2011)
Some packages are aimed at specific education programmes (e.g. a learning technology like Scratch is mainly aimed at lower secondary education). You can use the ISCED 2011 taxonomy to add education programmes to your package.

You can use any level of code. You should add all that apply. If you add a more specific code, the other fields are implied (e.g. if you have `"isced2011-65"`, you do not need to add `-6`). The general codes available are:
- `"isced2011-0"`: Early childhood education
- `"isced2011-1"`: Primary education
- `"isced2011-2"`: Lower secondary education
- `"isced2011-3"`: Upper secondary education
- `"isced2011-4"`: Post-secondary non-tertiary education
- `"isced2011-5"`: Short-cycle tertiary education
- `"isced2011-6"`: Bachelor's or equivalent level
- `"isced2011-7"`: Master's or equivalent level
- `"isced2011-8"`: Doctoral or equivalent level
- `"isced2011-9"`: Not elsewhere classified

```json
{
  // ...
  // isced2011-2 = Lower secondary education, isced2011-3 = Upper secondary education
  "keywords": ["webwriter-widget", "isced2011-2", "isced2011-3"]
}
```

#### Educational field (ISCED-F 2013)
While some packages are useful for all topics (e.g. a quiz widget with multiple choice questions may be used for any topic), others only apply to specific topics (such as a Neural Network widget for Computer Science). To help educators find your widget specific to their subject, you can use the [ISCED-F 2013 taxonomy](https://uis.unesco.org/sites/default/files/documents/international-standard-classification-of-education-fields-of-education-and-training-2013-detailed-field-descriptions-2015-en.pdf). 

You can use as many codes as you want. You can use broad, narrow or detailed field codes. If you add a more specific code, the other fields are implied (e.g. if you have `"iscedf2013-0612"`, you do not need to add `-061` and `-06`, too). Note that the leading 0 is neccessary. The broad fields available are:
- `"iscedf2013-00"`: Generic programmes and qualifications
- `"iscedf2013-01"`: Education
- `"iscedf2013-02"`: Arts and humanities
- `"iscedf2013-03"`: Social sciences, journalism and information
- `"iscedf2013-04"`: Business, administration and law
- `"iscedf2013-05"`: Natural sciences, mathematics and statistics
- `"iscedf2013-06"`: Information and communication technologies
- `"iscedf2013-07"`: Engineering, manufacturing and construction
- `"iscedf2013-08"`: Agriculture, forestry, fisheries and veterinary
- `"iscedf2013-09"`: Health and welfare
- `"iscedf2013-10"`: Services

```json
{
  // ...
  // iscedf2013-06 = "Information and communication technologies"
  "keywords": ["webwriter-widget", "iscedf2013-06"]
}
```

### `exports`
The `exports` field is an object mapping an exported name to a file path. There are four types of exports: Widgets, snippets, themes, and the package icon. Widgets and snippets are shown as insertable elements in WebWriter in order of the `exports`. Themes appear as options in the metadata editor. The icon is shown instead of the default icon. Each should be exported according to the following example:

**Full format for `@webwriter/build`**
```json
{
  "name": "@awesome/package",
  "version": "0.1.0",
  "keywords": ["webwriter-widget"],
  "exports": {
    "./widgets/awesome-widget.*": {
      "source": "./src/widgets/awesome-widget.ts",
      "default": "./dist/widgets/awesome-widget.*"
    },
    "./snippets/awesome-snippet.html": "./src/snippets/awesome-snippet.html",
    "./themes/awesome-theme.html": "./src/themes/awesome-theme.css",
    "./icon": "./src/awesome-icon.svg"
  }
}
```

#### Package icon
The package icon can be set as in the example above with the `exports` key `./icon`. The icon will be displayed as 24x24px in grayscale (no colors). We recommend using a `.svg`, but any image web browsers can display is possible (`.png`, `.jpg`, `.webp`, etc.).

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

#### Global config options
Using the key `.`, you can make a few global settings. With `label`, you can provide an alternative package name in different languages. If this label is provided, WebWriter shows this label in the place where the first insertable member of the package usually goes. This is good for packages which are just collections of snippets, for example - where there is no primary widget that should be preferred.

```json
{
  // ...
  "editingConfig": {
    ".": {
      "label": {
        "_": "COOL Package",
        "de": "SUPER-Paket"
      }
    }
  }
} 
```

### Others
All other fields according to [NPM's conventions](https://docs.npmjs.com/cli/v10/configuring-npm/package-json) are allowed, but are generally ignored.