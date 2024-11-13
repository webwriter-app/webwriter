---
title: Localizing
order: 305
---

# Localizing

Widgets can support different languages. WebWriter automatically sets each widget's language to the Explorable's language.

## Localizing with Lit (recommended)
The preconfigured base class `LitElementWw` comes with support for [`@lit/localize`](https://lit.dev/docs/localization/overview/). This is especially useful if you are dealing with sub-components in your widgets, or need to translate expressions that include variables.

### Step 0 (Optional): Create a free DeepL account with an API key
**Using the DeepL API, we can machine translate our whole widget!** While this is optional, it is highly recommended as a starting point. For this, you need a DeepL API Key:
1. Create a Free (or Pro) account at https://deepl.com
2. Head to *Your account* and create a new API key, then copy it. Steps can be found [here](https://support.deepl.com/hc/en-us/articles/360020695820-API-Key-for-DeepL-s-API).
3. Create a file `.env` in your project root and add the entry `DEEPL_API_KEY=...`. **Caution**: Make sure `.env` is in your `.gitignore` so your secret key isn't published accidentally.


### Step 1: Add a localization object to your widget
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

### Step 2: Execute `npm run localize`
Open your terminal and run `npm run localize`. This should create a new subfolder `localization` containing an exchange file for each language (e.g. `de.xlf` for German). If you configured a DeepL API key in step 0, these exchange files already contain a machine translation for each entry. Also a folder `localization/generated` should have been generated - we expect to import that folder in step 1.

Note:
- You can run `npm run localize` again to localize your widget after adding more messages to translate.
- Only untranslated messages will be sent to DeepL for translation. This means you can manually change the translation in the `.xlf` files - for example to correct faulty machine translations.
- Refer to the [`@lit/localize` documentation](https://lit.dev/docs/localization/overview/) for more infos.


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
  msg = (str: string) => CoolWidget.LOCALIZED[str][this.lang] ?? str

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