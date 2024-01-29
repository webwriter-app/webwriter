---
order: 401
title: "Configuring"
---

# Configuring Snippets

Using the `editingConfig` option in your `package.json`, you can change how WebWriter treats your snippet.

### `editingConfig["./snippets/my-snippet"]`
Extra editing preferences to be passed along to the editor.

Note: If you define a snippet with the same name as a widget (e.g. `./widgets/my-widget` and `./snippets/my-widget`), you can overwrite how a widget is inserted by default.

#### `editingConfig[...].label`
The localized name of the theme shown in the editor. Should be an object where each key is a [unicode locale](https://en.wikipedia.org/wiki/IETF_language_tag#Extension_U_(Unicode_Locale)) and each value a string.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./snippets/my-snippet": {
      // ...
      "label": {
        "de": "Fantastisches Snippet"
      }
    }
  }
}
```