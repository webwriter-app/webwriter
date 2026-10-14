# Distribution

Widgets are distributed as npm packages. Each widget export identifies a tag name and the script that defines it.

## Manifest

| `package.json` field | Purpose |
|---|---|
| `name`, `version` | Scoped identity, normally `@webwriter/…`, and SemVer version. |
| `keywords` | Include `webwriter-widget` for discovery in the WebWriter catalog. |
| `exports` | Widget and supporting file exports, below. |
| `editingConfig` | Inline [editing configuration](editing-configuration.md). |
| `dependencies`, `peerDependencies` | Bare imports resolved through the document's import map. |
| `prebuiltDependencies` | Dependencies bundled by `@webwriter/build`. |
| `sideEffects` | Standard module side-effect metadata; `false` permits loading only used modules. |
| `description`, `author`, `contributors`, `license`, `homepage`, `repository` | Package card metadata. |
| `customElements` | Path to a custom elements manifest. |

A `README.md`, `.markdown`, or `.txt` supplies package documentation for users and the assistant.

## Exports

| Key | Purpose |
|---|---|
| `./widgets/<tag>.*` | Matching `<path>.js` and optional `<path>.css`. |
| `./widgets/<tag>.js`, `./widgets/<tag>` | Widget script. |
| `./widgets/<tag>.css` | Widget stylesheet; overrides the wildcard stylesheet. |
| `./snippets/<name>.html` | Insertable HTML; active scripts, handlers, and styles are removed. Inert widget data blocks are retained. |
| `./icon` | Package and member icon. |
| `./editing-config.json` | External editing configuration. |
| `./migrate.js` | Sandboxed [content migration](../guides/migrations.md). |
| `./tests/<name>.*`, `./tests/<name>.js` | Test module with optional stylesheet. |
| `./themes/<name>.html` | Theme listed in development tools. |
| `./custom-elements.json` | Custom elements manifest listed in development tools. |

Targets can be strings or condition objects, resolved through `browser`, `import`, then `default`. A `source` condition identifies input for the development tools and build command:

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

Exports for the same tag form one widget. Include every referenced file in the package. Use separate exports for styles that dependencies need; import maps resolve JavaScript modules only.

## Discovery keywords

Use `widget-online`, `widget-online-edit`, or `widget-online-use` for connectivity requirements. Widget categories are `widget-presentational`, `widget-practical`, `widget-simulational`, `widget-conceptual`, `widget-informational`, and `widget-contextual`.

`widget-lang-<bcp47>` identifies content languages. `isced2011-<0–9>` identifies education levels and `iscedf2013-<code>` identifies educational fields.
