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
| `optionalDependencies` | Optional package dependencies, declared as a map from package name to SemVer range. Snippet editing configuration may name these dependencies for loading on insertion. |
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
| `./widgets/<tag>.icon.svg` | SVG icon for the widget with that exact tag name. |
| `./snippets/<name>.html` | HTML that the author can insert. The authoring tool removes active scripts, handlers, and styles. It keeps inert widget data blocks. |
| `./icon` | Package icon and default icon for its widgets and snippets. |
| `./preview`, `./preview/<locale>` | Default and localized [package previews](#package-previews). |
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
    },
    "./icon": "./assets/package.svg",
    "./widgets/ww-quiz.icon.svg": "./src/widgets/ww-quiz.icon.svg"
  }
}
```

Exports with the same tag form one widget. Include each referenced file in the package. Use a separate export for a stylesheet that a dependency needs. Import maps resolve only JavaScript modules.

The authoring tool uses a widget's icon in the package dropdown and when identifying the widget in the document. The export key uses the full widget tag, such as `./widgets/ww-quiz.icon.svg`. The top-level package button uses `./icon`, which also serves as the fallback when a member has no icon. A snippet can use the same icon as a widget by setting `iconWidget` to the full widget tag in its editing config.

### Package previews

The widget gallery wall and the editor’s **Packages** drawer can show an optional still image or video on hover or keyboard focus. Add these entries to the package's existing `exports` and include the referenced files when publishing.

```json
{
  "exports": {
    "./preview": "./assets/preview.webp",
    "./preview/de": "./assets/preview-de.mp4",
    "./preview/de-CH": "./assets/preview-de-CH.webp"
  }
}
```

WebWriter tries the exact locale, then the base language, then the default export. For Swiss German, it tries `./preview/de-CH`, `./preview/de`, and `./preview` in order. Locale tags are matched case-insensitively. WebWriter skips missing, invalid, and unsupported files.

Each file must be exactly **800 × 800 pixels** and at most **1,000,000 bytes (1 MB)**. Use still WebP (`.webp`) or H.264 video in an MP4 container (`.mp4`) with no audio track. Encode H.264 with 8-bit 4:2:0 for broad browser support. When reduced motion is enabled, the gallery looks for a still preview.

## Widget and snippet relationships

Widget exports and snippet exports can declare `compatibleHosts` as an array of full widget export names. A reference uses the package name followed by `/widgets/` and the widget tag, such as `@webwriter/tasks/widgets/webwriter-task`. A widget export can declare `equivalentTo` as an array of the same references when it can host the same content as those widgets. References may point to exports in the same package or to external packages.

For external references, declare the referenced package in `optionalDependencies` with the SemVer range of compatible versions.

A package can supply both an alternate task wrapper and an activity compatible with the original wrapper.

```json
{
  "optionalDependencies": {
    "@webwriter/tasks": "^1.0.0",
    "@example/number-line": "^2.0.0"
  },
  "editingConfig": {
    "./widgets/ww-quiz-task": {
      "equivalentTo": ["@webwriter/tasks/widgets/webwriter-task"],
      "compatibleSnippets": {"category": "Interact"}
    },
    "./snippets/number-line-exercise": {
      "compatibleHosts": ["@webwriter/tasks/widgets/webwriter-task"],
      "dependencies": ["@example/number-line"]
    }
  }
}
```

Compatibility lookup follows one `compatibleHosts` relationship, then zero or more `equivalentTo` relationships. It deduplicates matches and checks `optionalDependencies` ranges for external references. Choosing the number-line exercise loads the number-line package and puts the exercise inside the selected task wrapper.

## Discovery keywords

Manifest `keywords` give a widget feature badges. These badges show features, requirements, and categories. The [widget keyword reference](keywords.md) lists all badges and their syntax.

Educational classification keywords use `isced2011-<level>` for education levels and `iscedf2013-<code>` for educational fields. The codes come from the UNESCO classifications ISCED 2011 and ISCED-F 2013. The authoring tool shows the level and the broad field as badges. The [keyword reference](keywords.md#isced-code-lists) lists the codes. `npx -y @webwriter/guidance badges ./package.json` reports a code that is not in the lists. See [Check the keywords](keywords.md#check-the-keywords).
