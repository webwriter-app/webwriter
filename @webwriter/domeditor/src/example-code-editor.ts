import {defaultKeymap, history, historyKeymap} from "@codemirror/commands"
import {html} from "@codemirror/lang-html"
import {defaultHighlightStyle, indentOnInput, syntaxHighlighting} from "@codemirror/language"
import {EditorView, keymap, type EditorViewConfig, type ViewUpdate} from "@codemirror/view"

export function mountExampleCodeEditor(parent: HTMLElement, initial: string, label: string,
  onChange: (update: ViewUpdate) => void, ...extensions: NonNullable<EditorViewConfig["extensions"]>[]) {
  return new EditorView({
    doc: initial,
    parent,
    extensions: [
      ...extensions, history(), indentOnInput(), syntaxHighlighting(defaultHighlightStyle),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.contentAttributes.of({"aria-label": label, spellcheck: "false"}),
      EditorView.updateListener.of(update => {
        if(update.docChanged && !update.transactions.every(transaction => transaction.isUserEvent("input.preview"))) onChange(update)
      }),
    ],
  })
}

export function mountExampleHTMLEditor(parent: HTMLElement, initial: string, label: string, onChange: (update: ViewUpdate) => void) {
  return mountExampleCodeEditor(parent, initial, label, onChange, html(), EditorView.lineWrapping)
}
