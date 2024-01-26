import {LitElement} from "lit"
import { property } from "lit/decorators.js"
import { ScopedElementsMixin } from '@open-wc/scoped-elements/lit-element.js';

export interface EditingConfig {
  /** The group or space-separated groups to which this widget belongs. Can be one of the [content categories](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories)  of `"heading"`, `"sectioning"`, `"interactive"`, `"embedded"`, `"phrasing"`, `"palpable"`, `"formassociated"`, `"listed"`, `"labelable"`, `"submittable"`, `"resettable"`, or `"scriptsupporting"`, or any custom group name. Always implicitly includes the values "flow" and "widget". */
  group?: string,
  /** Should be set to true for inline widgets. Defaults to false. */
  inline?: boolean,
  /** Controls whether the widget can be selected as a node selection. Defaults to true. */
  selectable?: boolean,
  /** Determines whether the widget can be dragged without being selected. Defaults to false. */
  draggable?: boolean,
  /** Can be used to indicate that the widget contains code, which causes some commands to behave differently. Defaults to false. */
  code?: boolean,
  /** Controls the way whitespace in the widget is parsed. `"normal"` causes the DOM parser to collapse whitespace in normal mode, and normalize it (replacing newlines and such with spaces) otherwise. "pre" causes the parser to preserve spaces inside the widget. When this option isn't given, but code is true, whitespace will default to `"pre"`. Note that this option doesn't influence the way the widget is rendered—that should be handled by toDOM and/or styling. Defaults to `"normal"`. */
  whitespace?: "pre" | "normal",
  /** Determines whether the widget is considered an important parent node during replace operations (such as paste). Non-defining widgets get dropped when their entire content is replaced, whereas defining nodes persist and wrap the inserted content. Defaults to false. */
  definingAsContext?: boolean,
  /** In inserted content the defining parents of the content are preserved when possible. Typically, non-default-paragraph textblock types, and possibly list items, are marked as defining. Defaults to false. */
  definingForContent?: boolean,
  /** When enabled, enables both `definingAsContext` and `definingForContent`. Defaults to false. */
  defining?: boolean,
  /** When enabled, the sides of the widget count as boundaries that regular editing operations, like backspacing or lifting, won't cross. Defaults to false. */
  isolating?: boolean,
  /** The allowed content of the widget. Should be a [ProseMirror content expression](https://prosemirror.net/docs/guide/#schema.content_expressions).  To allow zero or more flow elements, use the value `"flow*"` ([Flow content](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories) is a broad category for most elements allowed in the `<body>`). To define the default (unnamed) slot, use the empty string `""` as the key. Set the property to `null` to disallow all content. Defaults to `"flow*"`. */
  content?: string,
  /** The marks that are allowed inside of the widget. Should be a space-separated list referring to mark names or groups, "_" to explicitly allow all marks, or "" to disallow marks. Possible mark names are: `"abbr"`, `"b"`, `"bdi"`, `"bdo"`, `"cite"`, `"code"`, `"data"`, `"dfn"`, `"em","i"`, `"kbd"`, `"mark"`, `"q"`, `"ruby"`, `"s"`, `"samp"`, `"small"`, `"span"`, `"sub"`, `"sup"`, `"u"`, `"var"`. If an object, each key should be the name of slot, and each value a space-separated list of mark names. Defaults to "_", allowing all marks. */
  marks?: string,
  /** The CSS parts defined in the widget. An string array of the part names. */
  parts?: string[],
  /** The CSS custom properties defined in the widget. Should be an object where each key is the name of the CSS custom property (including the "--" prefix), and the value is a [CSS value definition syntax expression](https://developer.mozilla.org/en-US/docs/Web/CSS/Value_definition_syntax). */
  cssCustomProperties?: Record<string, string>,
  /** The localized name of the widget shown in the editor. Should be an object where each key is a [unicode locale](https://en.wikipedia.org/wiki/IETF_language_tag#Extension_U_(Unicode_Locale)) and each value a string. */
  label?: Record<string, string>
}

/**Minimal base class for a WebWriter widget implemented in Lit. Implements the core properties required by WebWriter, initializes the component when loaded and provides a Scoped Custom Element Registry (@open-wc/scoped-elements) to help with namespace conflicts when using other components in this widget. */
export class LitElementWw extends ScopedElementsMixin(LitElement) {

  /** Extra editing preferences (matching [`NodeSpec`](https://prosemirror.net/docs/ref/#model.NodeSpec)) to be passed along to the editor. It must be a valid JSON literal directly defined on the property (quoted keys, no variables, expressions or `undefined`). Does not support the functional properties (`toDOM`, `parseDOM`, `toDebugString` or `leafText`). Supports the additional `parts`, `cssVariables`, and `slots` properties. */
  static readonly editingConfig?: Readonly<EditingConfig>

  /** [HTML global attribute] Editing state of the widget. If ="true" or ="", the widget should allow user interaction changing the widget itself. Else, prevent all such user interactions. */
  @property({type: String, attribute: true, reflect: true}) contentEditable: string

  /** [HTML global attribute] Language of the widget, allowing presentation changes for each language.*/
  @property({type: String, attribute: true, reflect: true}) lang: string

  connectedCallback(): void {
    super.connectedCallback()
    this.getAttributeNames().forEach(k => this.setAttribute(k, this.getAttribute(k)))
  }
}