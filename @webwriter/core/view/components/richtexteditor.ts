import {EditorState} from "prosemirror-state"
import {EditorView} from "prosemirror-view"
import {Schema, DOMParser} from "prosemirror-model"
import {schema} from "prosemirror-schema-basic"
import {addListNodes} from "prosemirror-schema-list"
import {exampleSetup, buildMenuItems} from "prosemirror-example-setup"
import { css, html, LitElement, unsafeCSS } from "lit"
import { customElement, property, query } from "lit/decorators.js"

import iconBold from "bootstrap-icons/icons/type-bold.svg?raw"
import iconItalic from "bootstrap-icons/icons/type-italic.svg?raw"
import iconCode from "bootstrap-icons/icons/code.svg?raw"
import iconListUl from "bootstrap-icons/icons/list-ul.svg?raw"
import iconListOl from "bootstrap-icons/icons/list-ol.svg?raw"
import iconTextParagraph from "bootstrap-icons/icons/text-paragraph.svg?raw"
import iconDashLg from "bootstrap-icons/icons/dash-lg.svg?raw"
import iconLink45Deg from "bootstrap-icons/icons/link-45deg.svg?raw"
import iconBlockquoteLeft from "bootstrap-icons/icons/blockquote-left.svg?raw"
import iconH1 from "bootstrap-icons/icons/type-h1.svg?raw"
import iconH2 from "bootstrap-icons/icons/type-h2.svg?raw"

function svgStringToElement(text: string) {
  const span = document.createElement("span")
  span.className = "ww-icon"
  span.innerHTML = text
  return span
}


import prosemirrorCSS from "prosemirror-view/style/prosemirror.css?raw"
import basicSetupCSS from "prosemirror-example-setup/style/style.css?raw"
import menuCSS from "prosemirror-menu/style/menu.css?raw"
import { msg } from "@lit/localize"

const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks
})

@customElement("ww-rich-text-editor")
export class RichTextEditor extends LitElement {

  view: EditorView

  @query("main")
  main: HTMLElement

  @property({type: String, attribute: true, reflect: true})
  label: string

  @property({type: String, attribute: true, reflect: true})
  helpText: string

  @property({type: String, attribute: true, reflect: true})
  defaultValue: string

  @property({type: String})
  get value() {
    return this.main.innerHTML
  }

  set value(value: string) {
    const node = document.createElement("main"); node.innerHTML = value
    const doc = DOMParser.fromSchema(mySchema).parse(node)
    this.view?.updateState(EditorState.create({...this.view.state, doc}))
  }

  static get styles() {
    return css`
      main {
        border: solid 2px var(--sl-input-border-color);
        border-radius: var(--sl-input-border-radius-medium);
      }
      main:focus-within {
        border-color: gray;
      }
      p {
        margin: 0;
        outline: none;
        border: none;
      }
      .ProseMirror {
        padding: 0.5rem;
        font-size: 0.9rem;
      }
      .ProseMirror:focus {
        outline: none;
      }
      .ProseMirror-menuseparator {
        height: 100%;
      }
      ${unsafeCSS(prosemirrorCSS)}
      ${unsafeCSS(basicSetupCSS)}
      ${unsafeCSS(menuCSS)}

      .ProseMirror-menubar {
        height: 40px;
        padding: 0.25rem;
        display: flex;
        flex-direction: row;
        align-items: center;
      }
    `
  }

  static menuItemIcons = {
    toggleStrong: iconBold,
    toggleEm: iconItalic,
    toggleCode: iconCode,
    wrapBulletList: iconListUl,
    wrapOrderedList: iconListOl,
    makeParagraph: iconTextParagraph,
    wrapBlockQuote: iconBlockquoteLeft,
    insertHorizontalRule: iconDashLg,
    toggleLink: iconLink45Deg,
    makeHead1: iconH1,
    makeHead2: iconH2
  }

  static createMenuItems() {
    const items = buildMenuItems(mySchema)
    for(const [key, value] of Object.entries(RichTextEditor.menuItemIcons)) {
      (items as any)[key].spec.icon = {dom: svgStringToElement(value)}
    }
    // missing from H5P:
      // Command only: Clear formatting (marks)
      // Marks: Strikethrough, text color, text size, text background color
      // Node decorations: Text alignment

    return items
  }

  protected firstUpdated() {
    const items = RichTextEditor.createMenuItems()
    this.view = new EditorView(this.main, {
      state: EditorState.create({
        doc: DOMParser.fromSchema(mySchema).parse(this.main),
        plugins: exampleSetup({
          schema: mySchema,
          menuContent: [
            [items.toggleStrong, items.toggleEm, items.toggleCode, items.toggleLink],
            [items.wrapBulletList, items.wrapOrderedList, items.wrapBlockQuote],
            [items.makeParagraph, items.makeHead1, items.makeHead2],
            [items.insertHorizontalRule]
          ] as any
        }),
      })
    })
    const updateState = this.view.updateState.bind(this.view)
    this.view.updateState = (state: EditorState) => {
      if(!this.view.state.doc.eq(state.doc)) {
        this.dispatchEvent(new Event("change", {composed: true, bubbles: true}))
      }
      updateState(state)
    }
  }

  render() {
    return html`
      <slot name="label">
        <label>${this.label}</label> <span>${this.helpText}</span>
      </slot>
      <main></main>
    `
  }
}