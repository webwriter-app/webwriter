import {ReactiveController, ReactiveControllerHost} from "lit"
import Hotkeys from "hotkeys-js"

import { RootStore } from "../model"
import { ExplorableEditor } from "../view/editor"
import { App } from "../view"
import { msg } from "@lit/localize"
import hotkeys from "hotkeys-js"
import { chainCommands, toggleMark } from "prosemirror-commands"
import { Transform } from "prosemirror-transform"
import { Command, EditorState, TextSelection } from "prosemirror-state"
import { redo, redoDepth, undo, undoDepth } from "prosemirror-history"

function getActiveMarks(state: EditorState) {
	const marks = [...new Set([
		...state.selection.$from.marks(),
		...state.selection.$to.marks()
	])]
	const storedMarks = state?.storedMarks ?? null
	return storedMarks ?? marks
}

function toggleOrUpdateMark(mark: string, options: any = {}) {
  return (state: EditorState, dispatch: any) => {
    const {from, to} = state.selection
    const markType = state.schema.marks[mark]
    const newMark = markType.create(options)
    const correspondingMark = getActiveMarks(state).find(m => m.type.name === mark)
    if(!correspondingMark || !correspondingMark?.eq(newMark)) {
      return dispatch(state.tr
        .removeMark(from, to, markType)
        .addMark(from, to, newMark)
      )
    }
    else {
      return dispatch(state.tr.removeMark(from, to, markType))
    }
  }
}

function getAttributeOfEnclosingParagraph(state: EditorState, key: string) {
  return state.selection.$from.node(1)?.attrs[key]
}

function setAttributeOnEnclosingParagraph(key: string, value: any) {
  return (state: EditorState, dispatch: any) => {
    if(state.selection instanceof TextSelection) {
      const pos = state.selection.$from.before(1)
      const tr = state.tr.setNodeAttribute(pos, key, value)
      return dispatch(tr)
    }
    else {
      return false
    }
  }  
}

export const CommandEvent = (id: string, options?: any) => new CustomEvent(
  "ww-command",
  {detail: {id, options}, composed: true, bubbles: true}
)

type FieldEntry = {
  type: "string" | "number" | "boolean",
  placeholder?: string
}

type FieldRecord<K extends string = string> = Record<K, FieldEntry>

type FieldType<T extends FieldEntry> = T["type"] extends "string"? string: (T["type"] extends "number"? number: boolean)

type FieldOptions<T extends FieldRecord, K extends keyof T=keyof T> = Record<K, FieldType<T[K]>>

export type CommandEntry<ID extends string = string, T extends FieldRecord = FieldRecord> = {
  id: ID
  /** Keyboard shortcut for the command. */ 
	shortcut?: string
  /** Label of the command for the user. */
	label?: string
  tags?: string[]
  /** Description of the commmand for the user. */
	description?: string
  /** Icon to represent the command to the user. */
	icon?: string
  /** Rough categorization of the command. */
	category?: string
  /** Grouping for exclusive commands. */
  group?: string
  /** Allow the default keyboard event in addition to the callback. */
	allowDefault?: boolean
  /** Whether the shortcut has been changed from the default. */
	modified?: boolean
  /** Whether to disallow changing the shortcut. */
  fixedShortcut?: boolean
  /** Fields of the command that will be passed as arguments. */
	fields?: T,
  /** Whether the command should be disabled. */
	disabled?: boolean
  /** Whether the command should be disabled. */
  active?: boolean
  /** Associated value of the command. */
  value?: any
}

type CommandSpec<ID extends string = string, T extends FieldRecord = FieldRecord> = Omit<CommandEntry, "disabled" | "active"> & {
  /** Callback handling the event. Receives the keyboard event and combo if the callback was triggered by a keyboard shortcut. */
	callback: (options?: FieldOptions<T>) => any | Promise<any>
    /** Whether the command should be disabled. */
	disabled?: () => boolean
  /** Whether the command should be disabled. */
  active?: () => boolean
  /** Associated value of the command. */
  value?: () => any
}

type CommandMap<ID extends string, T extends CommandSpec<ID> = CommandSpec<ID>> = Record<ID, T>

export class CommandController implements ReactiveController {

  host: App
	store: RootStore

	get editor() {
		return this.host.activeEditor
	}

  get editorState() {
		return this.host.store.resources.active?.editorState
	}

  get schema() {
    return this.host.activeEditor?.editorState.schema
  }

  exec(command: Command) {
    this.editor?.exec(command)
  }

  static sameShortcutEvent(e1: KeyboardEvent, e2: KeyboardEvent) {
    return e1.key === e2.key && e1.altKey === e2.altKey && e1.shiftKey === e2.shiftKey && e1.ctrlKey === e2.ctrlKey && e1.metaKey === e2.metaKey
  }

	enhanceCallback(id: string, spec: CommandSpec) {
		return (e: KeyboardEvent, combo: string) => {
			const disabled = spec.disabled ?? (() => false)
			const allowDefault = spec.allowDefault ?? false
			if(!disabled()) {
        allowDefault? null: window.addEventListener(e.type, (e2: any) => {
          if(CommandController.sameShortcutEvent(e, e2)) {
            e2.preventDefault()
          }
        })
				this.host.dispatchEvent(new CustomEvent("ww-command", {detail: {id}}))
			}
		}
	}

  constructor(host: App, store: RootStore) {
		this.store = store;
    (this.host = host).addController(this)
  }

  hostConnected() {
    this.host.addEventListener("ww-command", ((e: CustomEvent) => {
      if(e.detail.id in this._commandMap) {
        const callback = this._commandMap[e.detail.id as keyof typeof this._commandMap].callback
        callback(e.detail.options)
      }
      else {
        throw Error(`Invalid command '${e.detail.id}'`)
      }
    }) as any)
		Object.entries(this._commandMap).forEach(([key, spec]) => {
			const callback = this.enhanceCallback(key, spec)
			spec.shortcut && Hotkeys(spec.shortcut, (e) => callback(e, spec.shortcut!))
		})
  }

	get groupLabels() {return {
		documents: msg("Documents"),
		editor: msg("Editor"),
    miscellaneous: msg("Miscellaneous")
	}}

	getConfiguredShortcut(name: string) {
		return this.host.store.get("ui", "keymap")[name]?.shortcut
	}

  reassignShortcut = (name: string, oldShortcut: string) => {
    const spec = this._commandMap[name as keyof typeof this._commandMap]
    const newShortcut = this.getConfiguredShortcut(name) ?? spec.shortcut
    const callback = this.enhanceCallback(name, spec)
    hotkeys.unbind(oldShortcut)
    Hotkeys(newShortcut, (e) => callback(e, newShortcut))
  }

  dispatch<ID extends keyof typeof this._commandMap> (id: ID, options?: any) {
    this.host.dispatchEvent(new CustomEvent("ww-command", {detail: {id, options}}))
  }

	get commandMap() {
		const names = Object.keys(this._commandMap)
		const configuredEntries = names
			.map(name => {
        const spec = this._commandMap[name as keyof typeof this._commandMap]
        return [
          name,
          {
            ...spec,
            callback: undefined,
            disabled: spec.disabled? spec.disabled(): false,
            active: spec.active? spec.active(): false,
            value: spec.value? spec.value(): null,
            modified: Boolean(this.getConfiguredShortcut(name)),
            shortcut: this.getConfiguredShortcut(name) ?? spec.shortcut
          }
        ]
      })
		return Object.fromEntries(configuredEntries) as Record<string, CommandEntry>
	}


	get _commandMap() { 
    const commands = {
      save: {
        id: "save",
        label: msg("Save"),
        icon: "file-earmark-check",
        description: msg("Save the active document"),
        shortcut: "ctrl+s",
        callback: () => this.store.resources.save(),
        category: "documents"
      },
      saveAs: {
        id: "saveAs",
        label: msg("Save As"),
        icon: "file-earmark-arrow-down",
        description: msg("Save the active document as a copy"),
        shortcut: "ctrl+shift+s",
        callback: () => this.store.resources.save(this.store.resources.active?.url, true),
        category: "documents"
      },
      open: {
        id: "open",
        label: msg("Open"),
        icon: "file-earmark-arrow-up-fill",
        shortcut: "ctrl+o",
        description: msg("Open a document"),
        callback: () => this.store.resources.load(),
        category: "documents"
      },
      create: {
        id: "create",
        label: msg("Create"),
        icon: "file-earmark-plus-fill",
        description: msg("Create a new document"),
        shortcut: "ctrl+n",
        callback: () => this.store.resources.create(),
        category: "documents"
      },
      discard: {
        id: "discard",
        label: msg("Discard"),
        icon: "file-earmark-x",
        description: msg("Close the active document"),
        shortcut: "ctrl+w",
        callback: () => this.store.resources.discard(),
        category: "documents"
      },
      print: {
        id: "print",
        label: msg("Print"),
        icon: "printer",
        description: msg("Print the active document"),
        shortcut: "ctrl+p",
        callback: () => {
          console.log(this.editor)
          this.editor?.pmEditor?.window?.print()
        },
        category: "documents"
      },
      nextTab: {
        id: "nextTab",
        label: msg("Next Tab"),
        icon: "arrow-right-square",
        description: msg("Select the next document tab"),
        shortcut: "ctrl+tab",
        callback: () => this.store.resources.activateNext(),
        category: "documents"
      },
      bold: {
        id: "bold",
        tags: ["mark"],
        label: msg("Bold"),
        icon: "type-bold",
        description: msg("Mark the selection as bold"),
        shortcut: "ctrl+shift+b",
        callback: () => this.exec(toggleOrUpdateMark("bold")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "bold")
      },
      italic: {
        id: "italic",
        tags: ["mark"],
        label: msg("Italic"),
        icon: "type-italic",
        description: msg("Mark the selection as italic"),
        shortcut: "ctrl+shift+i",
        callback: () => this.exec(toggleOrUpdateMark("italic")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "italic")
      },
      underline: {
        id: "underline",
        tags: ["mark"],
        label: msg("Underline"),
        icon: "type-underline",
        description: msg("Mark the selection as underlined"),
        shortcut: "ctrl+shift+u",
        callback: () => this.exec(toggleOrUpdateMark("underline")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "underline")
      },
      strikethrough: {
        id: "strikethrough",
        tags: ["mark"],
        label: msg("Strikethrough"),
        icon: "type-strikethrough",
        description: msg("Mark the selection as struck through"),
        shortcut: "ctrl+shift+s",
        callback: () => this.exec(toggleOrUpdateMark("strikethrough")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "strikethrough")
      },
      superscript: {
        id: "superscript",
        tags: ["mark"],
        label: msg("Superscript"),
        icon: "superscript",
        description: msg("Mark the selection as a superscript"),
        shortcut: "ctrl+shift+ArrowUp",
        callback: () => this.exec(toggleOrUpdateMark("superscript")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "superscript")
      },
      subscript: {
        id: "subscript",
        tags: ["mark"],
        label: msg("subscript"),
        icon: "subscript",
        description: msg("Mark the selection as a subscript"),
        shortcut: "ctrl+shift+ArrowDown",
        callback: () => this.exec(toggleOrUpdateMark("subscript")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "subscript")
      },
      code: {
        id: "code",
        tags: ["mark"],
        label: msg("Code"),
        icon: "code",
        description: msg("Mark the selection as code"),
        shortcut: "ctrl+shift+c",
        callback: () => this.exec(toggleOrUpdateMark("code")),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "code")
      },
      setFontSize: {
        id: "setFontSize",
        tags: ["font"],
        label: msg("Set font size"),
        icon: "plus-slash-minus",
        description: msg("Sets the selection's font size"),
        callback: (options: any) => this.exec(toggleOrUpdateMark("fontSize", options)),
        category: "editor",
        value: () => this.editorState && getActiveMarks(this.editorState).find(mark => mark.type.name === "fontSize")?.attrs.value || "14pt"
      },
      setFontFamily: {
        id: "setFontFamily",
        tags: ["font"],
        label: msg("Set font family"),
        icon: "fonts",
        description: msg("Sets the selection's font family"),
        callback: (options: any) => this.exec(toggleOrUpdateMark("fontFamily", options)),
        category: "editor",
        value: () => this.editorState && getActiveMarks(this.editorState).find(mark => mark.type.name === "fontFamily")?.attrs.value || "Arial"
      },
      incrementFontSize: {
        id: "incrementFontSize",
        tags: ["font"],
        label: msg("Increment font size"),
        icon: "plus-square",
        description: msg("Increment the selection's font size"),
        callback: () => commands.setFontSize.callback({
          value: `${parseInt(commands.setFontSize.value()) + 1}pt`
        }),
        category: "editor",
      },
      decrementFontSize: {
        id: "decrementFontSize",
        tags: ["font"],
        label: msg("Decrement font size"),
        icon: "dash-square",
        description: msg("Decrement the selection's font size"),
        callback: () => commands.setFontSize.callback({
          value: `${Math.max(0, parseInt(commands.setFontSize.value()) - 1)}pt`
        }),
        category: "editor",
      },
      link: {
        id: "link",
        tags: ["mark"],
        label: msg("Link"),
        icon: "link",
        description: msg("Mark the selection as a link"),
        shortcut: "ctrl+shift+l",
        callback: () => this.exec(toggleMark(this.schema?.marks.link!)),
        category: "editor",
        active: () => this.editorState && getActiveMarks(this.editorState).some(mark => mark.type.name === "link"),
        fields: {
          href: {
            type: "string",
            placeholder: "https://example.com"
          }
        }
      },
      alignParagraphLeft: {
        id: "alignParagraphLeft",
        tags: ["paragraph"],
        label: msg("Align paragraph left"),
        icon: "text-left",
        description: msg("Makes the paragraph text align left"),
        callback: () => this.exec(setAttributeOnEnclosingParagraph("textAlign", "left")),
        active: () => this.editorState && getAttributeOfEnclosingParagraph(this.editorState, "textAlign") === "left",
        category: "editor",
        group: "textAlign"
      },
      alignParagraphCenter: {
        id: "alignParagraphCenter",
        tags: ["paragraph"],
        label: msg("Align paragraph center"),
        icon: "text-center",
        description: msg("Makes the paragraph text align center"),
        callback: () => this.exec(setAttributeOnEnclosingParagraph("textAlign", "center")),
        active: () => this.editorState && getAttributeOfEnclosingParagraph(this.editorState, "textAlign") === "center",
        category: "editor",
        group: "textAlign"
      },
      alignParagraphRight: {
        id: "alignParagraphRight",
        tags: ["paragraph"],
        label: msg("Align paragraph right"),
        icon: "text-right",
        description: msg("Makes the paragraph text align right"),
        callback: () => this.exec(setAttributeOnEnclosingParagraph("textAlign", "right")),
        active: () => this.editorState && getAttributeOfEnclosingParagraph(this.editorState, "textAlign") === "right",
        category: "editor",
        group: "textAlign"
      },
      alignParagraphJustified: {
        id: "alignParagraphJustified",
        tags: ["paragraph"],
        label: msg("Align paragraph justified"),
        icon: "justify",
        description: msg("Makes the paragraph text align justified"),
        callback: () => this.exec(setAttributeOnEnclosingParagraph("textAlign", "justify")),
        active: () => this.editorState && getAttributeOfEnclosingParagraph(this.editorState, "textAlign") === "justify",
        category: "editor",
        group: "textAlign"
      },
      undo: {
        id: "undo",
        tags: ["general"],
        label: msg("Undo"),
        icon: "arrow-counterclockwise",
        description: msg("Undo the last change in the active document"),
        shortcut: "ctrl+z",
        callback: () => {console.log("undo"); this.exec(undo)},
        category: "editor",
        disabled: () => this.editorState && undoDepth(this.editorState) === 0
      },
      redo: {
        id: "redo",
        tags: ["general"],
        label: msg("Redo"),
        icon: "arrow-clockwise",
        description: msg("Redo the last undone change in the active document"),
        shortcut: "ctrl+y",
        callback: () => this.exec(redo),
        category: "editor",
        disabled: () => this.editorState && redoDepth(this.editorState) === 0
      },
      preview: {
        id: "preview",
        tags: ["preview"],
        label: msg("Preview"),
        icon: "eye",
        description: msg("Toggles the preview for the active document"),
        shortcut: "ctrl+b",
        callback: () => this.store.resources.togglePreview(),
        category: "editor",
        value: () => this.editor?.previewing
      },
      toggleSettings: {
        id: "toggleSettings",
        label: msg("Toggle Settings"),
        icon: "gear-fill",
        description: msg("Opens or closes the settings drawer"),
        shortcut: "ctrl+i",
        callback: () => this.host.settingsOpen = !this.host.settingsOpen,
        category: "miscellaneous"
      },
      toggleDevTools: {
        id: "toggleDevTools",
        label: msg("Toggle Dev Tools"),
        icon: "terminal",
        description: msg("Open the developer tools"),
        shortcut: "ctrl+shift+i",
        callback: () => {},
        category: "miscellaneous",
        fixedShortcut: true
      }
    }
    return commands as unknown as CommandMap<keyof typeof commands>
  }
}