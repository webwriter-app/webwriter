import { LitElement, TemplateResult, css, html } from "lit"
import { customElement, property, query } from "lit/decorators.js"
import { styleMap } from "lit/directives/style-map.js"

import { camelCaseToSpacedCase, prettifyPackageName, unscopePackageName } from "../../utility"
import { Mark, ResolvedPos } from "prosemirror-model"
import { classMap } from "lit/directives/class-map.js"
import { localized, msg } from "@lit/localize"
import { Command } from "../../viewmodel"
import { spreadProps } from "@open-wc/lit-helpers"
import "../elements/stylepickers"

import { ifDefined } from "lit/directives/if-defined.js"
import { App } from ".."
import { EditorState, Selection } from "prosemirror-state"
import { getNodePath } from "../../model"

@localized()
@customElement("ww-debugoverlay")
export class DebugOverlay extends LitElement {

  @property({attribute: false})
  app: App
  
  @property({type: Object, attribute: false})
  editorState: EditorState

  @property({type: Object, attribute: false})
  activeElement: HTMLElement | null

  static styles = css`
    :host {
      position: fixed;
      bottom: 5px;
      right: 5px;
      padding: 1rem;
      z-index: 2147483647;
      color: red;
      font-family: monospace;
      font-weight: bold;
    }

    sub + sup,
    sup + sub {
      position: relative;
      left: -1ch;
    }
  `
  static pathString($pos: ResolvedPos) {
    if($pos.pos === 0) {
      return ""
    }
    const pathString = getNodePath($pos).map(n => n.type.name).join("/")
    const indexString = $pos.index($pos.depth - 1)
    const offsetString = $pos.parentOffset
    return html`<b>${pathString}</b><sub>${indexString}</sub><sup>${offsetString}</sup>`
  }

  static selectionTypeString(selection: Selection) {
    const type = selection.toJSON().type
    return html`${type !== "text"? "$" + type.toUpperCase(): ""}`
  }

  static selectionPosString(selection: Selection) {
    const {anchor, head, empty, from, to} = selection
    return html`${anchor <= head? "|": ""}${empty? from: `${from}:${to}`}${head < anchor? "|": ""}`
  }

  static posMarks($pos: ResolvedPos) {
    return $pos.marks().map(mark => "." + mark.type.name)
  }

  render() {
    return html`<code>
      ${DebugOverlay.selectionPosString(this.editorState.selection)}
      ${DebugOverlay.selectionTypeString(this.editorState.selection)}
      ${DebugOverlay.pathString(this.editorState.selection.$anchor)}
      ${DebugOverlay.posMarks(this.editorState.selection.$anchor)}
    </code>`
  }
}