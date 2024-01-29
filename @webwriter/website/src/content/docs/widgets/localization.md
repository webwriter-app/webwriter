---
title: Localizing
order: 305
---

# Localizing

Widgets can support different languages. WebWriter automatically sets each widget's language to the Explorable's language.

## Supporting languages with `lang`
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

  // `this.lang` exists by default, but we still need to make it reactive so our component updates when it is changed
  @property({attribute: true})
  lang: string

  @property({attribute: true})
  value: string

  render() {
    return html`
    <span>${this.msg("What's your name?")}</span>
    <textarea @change=${e => this.value = e.target.value}>
      ${this.value}
    </textarea>`
  }
}
```

### Localizing with lit
For the most simple cases, keeping an object with strings for each language would be sufficient. For more advanced cases, lit provides [`@lit/localize`](https://lit.dev/docs/localization/overview/). This is especially useful if you are dealing with sub-components in your widgets, or need to translate expressions that include variables.