---
title: Localizing
order: 201
---

# Localizing

Packages can support different languages. WebWriter can then display widgets, snippets and package metadata in a localized form.

## Localizing Lit packages automatically (recommended)
WebWriter's build tool `@webwriter/build` and the preconfigured base class `LitElementWw` from `@webwriter/lit` comes with support for [`@lit/localize`](https://lit.dev/docs/localization/overview/). This is especially useful if you are dealing with sub-components in your widgets, or need to translate expressions that include variables.

### Step 0 (Optional): Create a free DeepL account with an API key
**Using the DeepL API, we can machine translate our whole widget!** While this is optional, it is highly recommended as a starting point. For this, you need a DeepL API Key:
1. Create a Free (or Pro) account at https://deepl.com
2. Head to *Your account* and create a new API key, then copy it. Steps can be found [here](https://support.deepl.com/hc/en-us/articles/360020695820-API-Key-for-DeepL-s-API).
3. Create a file `.env` in your project root and add the entry `DEEPL_API_KEY=...`. **Caution**: Make sure `.env` is in your `.gitignore` so your secret key isn't published accidentally.


### Step 1: Make package content localizable
For `@webwriter/build` to be able to localize the widgets, snippets, and metadata of the package, some extra steps are needed.

#### Make widgets localizable
`LitElementWw` can automatically trigger an update when the `lang` attribute of your widget changes, causing the widget to render with the new language. For this to work, you need to mark all translatable strings in your code with the `msg` function. This can be used anywhere a normal string would be used, including in templates for text or attributes.

We add some boilerplate code (see [@lit/localize documentation for details](https://lit.dev/docs/localization/runtime-mode/#configuring-runtime-mode)). This boilerplate is included in the template and can be uncommented. It allows your widget to notify `@lit/localize` that the widget `lang` has changed, causing it to load different translations and to re-render the widget accordingly.
```ts
import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"
import LOCALIZE from "../../localization/generated"
import {msg} from "@lit/localize"
@customElement("cool-widget")
export class CoolWidget extends LitElementWw {

  localize = LOCALIZE

  render() {
    return html`<span title=${msg("This is a greeting")}>${msg("Hello, world!")}</span>`
  }
}
```

Refer to the [`@lit/localize` documentation](https://lit.dev/docs/localization/overview/) for more infos.

#### Make snippets localizable
No further steps are needed for snippets to be translatable: All text nodes in the snippet's HTML structure are considered for translation and translations are embedded as a `<script>` tag into the snippet itself later.

#### Make package metadata localizable
The [editing config](docs/packages/configuring) may contain localizable metadata for the package itself and package members (`label`, `description`). If such metadata is provided in English (using the `_` or `en` key), it will be considered for localization. A special case is the standard `description` property, which is always considered for localization.

```json
{
  "description": "This package has several cool features..."
  // ...
  "editingConfig": {
    ".": {
      "label": {
        "_": "COOL Package"
      }
    }
  }
}
```

### Step 2: Localize package members
Open your terminal and run `npx @webwriter/build localize`. This should create a new subfolder `localization` containing an exchange file for each widget language (e.g. `de.xlf` for German). For snippets and package metadata, similar subfolders (`localization/snippets`, `localization/pkg`) are created. Also a folder `localization/generated` should have been generated - we expect to import that folder in step 1. 

If you configured a DeepL API key in step 0, you are asked whether you want to machine translate the package members. Note that this consumes tokens and may incur costs if you use a Pro account (Free accounts may run into the token limit instead).

Finally, translations from the exchange files are applied to the widgets (as `@lit/localize` JSON files), snippets (inlined script with JSON), and metadata (external editing config file).

Note:
- You can run `npx @webwriter/build localize` again to localize your package after adding more messages to translate.
- No messages are overwritten (neither by the build tool nor by DeepL). This means you can manually change the translation in the `.xlf`/`.xliff` files - for example to correct faulty machine translations. If you make a correction, you can rerun `npx @webwriter/build localize` to apply your changes.

### Step 3: Rebuild with localization (widgets only)
For the widgets to update with the new localization, they need to be rebuilt. Changes in the snippets and package metadata should be detected automatically.

## Localizing manually with `lang`
WebWriter passes the configured language to each widget using the [Web Standard `lang` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang). Widgets should change the displayed language based on that attribute.

Consider this example for a widget only providing a German translation:
```ts
import {html} from "lit"
import {LitElementWw} from "@webwriter/lit"
import {customElement, property} from "lit/decorators.js"

@customElement("cool-widget")
export default class CoolWidget extends LitElementWw {

  static LOCALIZED = {
    "What's your name?": {"de": "Wie heißt du?"}
  }

  // Helper function: Get localized form of `str` if available, otherwise fall back to `str`
  msg = (str: string) => CoolWidget.LOCALIZED[str]?.[this.lang] ?? str

  @property({attribute: true})
  accessor value: string

  render() {
    return html`
    <span>${this.msg("What's your name?")}</span>
    <textarea @change=${e => this.value = e.target.value}>
      ${this.value}
    </textarea>`
  }
}
```