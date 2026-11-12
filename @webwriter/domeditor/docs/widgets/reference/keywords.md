# A2. Widget keywords

Keywords give a widget feature badges. These badges show what the widget does, what it needs, and its purpose.

Add the keywords for your widget to the [`keywords` array](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#keywords) in `package.json`. The authoring tool shows the badges in the package details tooltip.

| Keyword | Meaning |
|---|---|
| `widget-editable` | Authors can edit the widget's content or behavior in the authoring tool. |
| `widget-allows-pointer-input` | The widget accepts pointer input. |
| `widget-allows-keyboard-input` | The widget accepts keyboard input. |
| `widget-allows-touch-input` | The widget accepts touch input. |
| `widget-has-content` | The widget accepts authored text, HTML elements, or nested widgets as content. |
| `widget-convertible-to-[media/type \| <element-name>]` | The widget can convert its content to the specified media type or element. |
| `widget-convertible-from-[media/type \| <element-name>]` | The widget supports creation or content import from the specified media type or element. |
| `widget-responsive` | The widget adjusts its layout to the available space. |
| `widget-themeable` | The widget uses the document theme or supplies styling hooks for a document stylesheet. |
| `widget-lang-[bcp47]` | The widget's content uses the language in the [BCP 47 language tag](https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag). |
| `widget-printable` | The widget has a display suitable for printing. |
| `widget-stateful` | The widget keeps state such as saved settings, content, or interaction results. |
| `widget-configurable` | Authors can configure the widget through declared options or actions. |
| `widget-reactive` | The widget publishes or reads signals to respond to changes across widgets. |
| `widget-shareable` | The widget can share participant data with a group or with all participants. |
| `widget-distributable` | The widget supports distribution in a live session. |
| `widget-online`, `widget-online-edit`, `widget-online-use` | The widget needs a network connection for all operations, for editing, or for use, respectively. |
| `widget-supports-dynamic-loading` | The widget loads optional code or resources when necessary. |
| `widget-supports-shared-dependencies` | The widget supports dependencies shared with other widgets. |
| `widget-testable` | The package exports tests for the authoring tool's **Developer console**. |
| `widget-migrates-from-[semver]` | The widget can migrate saved content from the specified version. |
| `webwriter-widget` | The package contains a widget that the catalog can find. |
| `widget-standalone` | The widget can operate on a web page outside the authoring tool. |
| `widget-presentational` | The widget's main purpose is presentation. |
| `widget-practical` | The widget's main purpose is a practical activity or application. |
| `widget-simulational` | The widget's main purpose is simulation. |
| `widget-conceptual` | The widget's main purpose is to help readers examine concepts. |
| `widget-informational` | The widget's main purpose is to give information. |
| `widget-contextual` | The widget's main purpose is to give context. |

## Values in keyword forms

Replace the text in brackets with a value. For example, use `widget-lang-en-US` for a language tag. Use `widget-migrates-from-1.2.0` for a version.

For `widget-convertible-to-…` and `widget-convertible-from-…`, use a [MIME type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types) or an element name without angle brackets. Examples include `widget-convertible-to-image/png`, `widget-convertible-from-audio/mpeg`, `widget-convertible-to-video`, and `widget-convertible-from-ww-quiz`.

The online forms are `widget-online`, `widget-online-edit`, and `widget-online-use`. The keywords `isced2011-<0–9>` and `iscedf2013-<code>` identify education levels and fields. [Package manifest](distribution.md#discovery-keywords) describes these discovery keywords.
