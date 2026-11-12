# A1. Package manifest

An [npm package](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) can contain one or more widgets. Each widget export identifies a tag name and the script that defines it.

## Manifest

| `package.json` field | Purpose |
|---|---|
| `name`, `version` | The npm package name and SemVer version. The name can include a [scope](https://docs.npmjs.com/about-scopes/) such as `@webwriter/…`. |
| `keywords` | Feature badges and discovery information. Include `webwriter-widget` for catalog discovery. The [widget keyword reference](keywords.md) lists the badges. |
| [`exports`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#exports) | Exports for widgets and related files. |
| `editingConfig` | Inline [editing configuration](editing-configuration.md). |
| `dependencies`, `peerDependencies` | The document's [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap) resolves bare imports for these dependencies. |
| `prebuiltDependencies` | `@webwriter/build` bundles these dependencies. |
| `sideEffects` | Standard module side-effect metadata. `false` permits loading only the modules in use. |
| `description`, `author`, `contributors`, `license`, `homepage`, `repository` | Package card metadata. |
| `customElements` | Path to a custom elements manifest. |

A `README.md`, `.markdown`, or `.txt` file supplies package documentation.

## Exports

| Key | Purpose |
|---|---|
| `./widgets/<tag>.*` | Matching `<path>.js` and optional `<path>.css`. |
| `./widgets/<tag>.js`, `./widgets/<tag>` | Widget script. |
| `./widgets/<tag>.css` | Widget stylesheet. It has priority over the wildcard stylesheet. |
| `./snippets/<name>.html` | HTML that the author can insert. The authoring tool removes active scripts, handlers, and styles. It keeps inert widget data blocks. |
| `./icon` | Package and member icon. |
| `./editing-config.json` | External editing configuration. |
| `./migrate.js` | Script for [content migration](../guides/migrations.md) in a sandbox. |
| `./tests/<name>.*`, `./tests/<name>.js` | Test module with optional stylesheet. |
| `./themes/<name>.html` | Theme for the development tools. |
| `./custom-elements.json` | Custom elements manifest for the development tools. |

An export target can be a string or a condition object. The authoring tool checks `browser`, `import`, and `default` in that order. A `source` condition identifies the input for the development tools and the build command.

```json
{
  "exports": {
    "./widgets/ww-quiz.*": {
      "source": "./src/widgets/ww-quiz.ts",
      "default": "./dist/widgets/ww-quiz.*"
    }
  }
}
```

Exports with the same tag form one widget. Include each referenced file in the package. Use a separate export for a stylesheet that a dependency needs. Import maps resolve only JavaScript modules.

## Discovery keywords

Manifest `keywords` give a widget feature badges. These badges show features, requirements, and categories. The [widget keyword reference](keywords.md) lists all badges and their syntax.

Educational classification keywords use `isced2011-<0–9>` for education levels and `iscedf2013-<code>` for educational fields.
