---
order: 509
title: "Configuring"
---

# Configuring Themes

Using the `editingConfig` option in your `package.json`, you can change how WebWriter treats your theme.

### `editingConfig["./themes/my-theme"]`
Extra editing preferences to be passed along to the editor.

#### `editingConfig[...].label`
The localized name of the theme shown in the editor. Should be an object where each key is a [unicode locale](https://en.wikipedia.org/wiki/IETF_language_tag#Extension_U_(Unicode_Locale)) and each value a string.
```json
{
  // ...
  "editingConfig": {
    // ...
    "./themes/awesome-theme": {
      // ...
      "label": {
        "de": "Fantastisches Theme"
      }
    }
  }
}
```