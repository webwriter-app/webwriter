import {ReactiveController} from "lit"
import Hotkeys from "hotkeys-js"

import { EditorStateWithHead, RootStore, getActiveAttributes, getActiveBlockAttributes, getActiveMarks, getStyleValues, hasActiveNode, setAttributeOnSelectedBlocks, setDocAttributes, themes, toggleOrUpdateMark, wrapSelection} from "../model"
import { App } from "../view"
import { msg } from "@lit/localize"
import hotkeys from "hotkeys-js"
import {toggleMark} from "prosemirror-commands"
import {Command} from "prosemirror-state"
import {redo, redoDepth, undo, undoDepth} from "prosemirror-history"
import {Node, Mark} from "prosemirror-model"

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

  get resources() {
    return this.host.store.resources
  }

  get editorState() {
		return this.host.store.resources.active?.editorState
	}

  get schema() {
    return this.host.activeEditor?.editorState.schema
  }

  active = {
    marks: [] as Mark[],
    nodes: [] as Node[],
    elements: [] as Element[],

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
    app: msg("App"),
		document: msg("Document"),
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

  queryCommands = (query: keyof typeof this._commandMap | {id?: string, category?: string, tags?: string[]}) => {
    if(typeof query === "string") {
      return [this.commandMap[query]]
    }
    else {
       return Object.values(this.commandMap).filter(v => true 
        && (!query.id || (v.id === query.id)) 
        && (!query.category || (v.category === query.category))
        && (!query.tags || query.tags?.some(t => v.tags?.includes(t)))
      )
    }
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


  MarkCommandSpec({
    id,
    tags=["mark"],
    category="editor",
    callback=((options: any) => this.exec(toggleOrUpdateMark(id, options))),
    active=(() => !!this.editorState && this.resources.isMarkActive(id)),
    value=(() => this.editorState && getActiveMarks(this.editorState!).find(mark => mark.type.name === id)?.attrs[id]),
    ...rest
  }: Partial<CommandSpec> & {id: string}) {
    return {id, tags, category, callback, active, value, ...rest}
  }


  BlockCommandSpec({
    id,
    tags=["block"],
    category="editor",
    callback=((options: any) => {
      const value = options?.value
      this.exec(setAttributeOnSelectedBlocks(id, value)as any)
    }),
    active=(() => !!this.editorState && this.resources.getActiveAttributeValue(id) !== undefined),
    group=id,
    value=(() => !!this.editorState && this.resources.getActiveAttributeValue(id)),
    ...rest
  }: Partial<CommandSpec> & {id: string}) {
    return {id, tags, category, callback, active, value, ...rest}
  }
  
  InsertContainerCommandSpec({
    id,
    tags=["container"],
    category="editor",
    callback=((options: any) => this.exec(wrapSelection(this.editorState?.schema.nodes[nodeName ?? id]!, attrs))),
    active=(() => hasActiveNode(this.editorState!, nodeName ?? id, attrs)),
    disabled=(() => false),
    ...rest
  }: Partial<CommandSpec> & {id: string}, attrs?: {}, nodeName?: string) {
    return {id, tags, category, callback, active, ...rest}
  }


	get _commandMap() { 
    const commands = {
      save: {
        id: "save",
        label: msg("Save"),
        icon: "file-download",
        description: msg("Save the active document"),
        shortcut: "ctrl+s",
        callback: () => this.store.resources.save(),
        category: "document"
      },
      saveAs: {
        id: "saveAs",
        label: msg("Save As"),
        icon: "file-export",
        description: msg("Save the active document as a copy"),
        shortcut: "ctrl+shift+s",
        callback: () => this.store.resources.save(this.store.resources.active?.url, true),
        category: "document"
      },
      toggleSettings: {
        id: "toggleSettings",
        label: msg("Toggle Settings"),
        icon: "settings-filled",
        description: msg("Opens or closes the settings drawer"),
        shortcut: "ctrl+i",
        callback: () => this.host.settingsOpen = !this.host.settingsOpen,
        category: "app"
      },
      open: {
        id: "open",
        label: msg("Open"),
        icon: "file-upload",
        shortcut: "ctrl+o",
        description: msg("Open a document"),
        callback: () => this.store.resources.load(),
        category: "app"
      },
      create: {
        id: "create",
        label: msg("Create"),
        icon: "file-plus",
        description: msg("Create a new document"),
        shortcut: "ctrl+n",
        callback: () => this.store.resources.create(),
        category: "app"
      },
      /*discard: {
        id: "discard",
        label: msg("Discard"),
        tags: ["active"],
        icon: "file-x",
        description: msg("Close the active document"),
        shortcut: "ctrl+w",
        callback: () => this.store.resources.discard(),
        category: "document"
      },*/
      print: {
        id: "print",
        label: msg("Print"),
        icon: "printer",
        description: msg("Print the active document"),
        shortcut: "ctrl+p",
        callback: () => this.editor?.pmEditor?.window?.print(),
        category: "document"
      },
      bold: this.MarkCommandSpec({
        id: "bold",
        label: msg("Bold"),
        icon: "bold",
        description: msg("Mark the selection as bold"),
        shortcut: "ctrl+shift+b"
      }),
      italic: this.MarkCommandSpec({
        id: "italic",
        label: msg("Italic"),
        icon: "italic",
        description: msg("Mark the selection as italic"),
        shortcut: "ctrl+shift+i"
      }),
      underline: this.MarkCommandSpec({
        id: "underline",
        label: msg("Underline"),
        icon: "underline",
        description: msg("Mark the selection as underlined"),
        shortcut: "ctrl+shift+u",
      }),
      strikethrough: this.MarkCommandSpec({
        id: "strikethrough",
        label: msg("Strikethrough"),
        icon: "strikethrough",
        description: msg("Mark the selection as struck through"),
        shortcut: "ctrl+shift+s",
      }),
      superscript: this.MarkCommandSpec({
        id: "superscript",
        label: msg("Superscript"),
        icon: "superscript",
        description: msg("Mark the selection as a superscript"),
        shortcut: "ctrl+shift+ArrowUp",
        group: "supsub"
      }),
      subscript: this.MarkCommandSpec({
        id: "subscript",
        label: msg("Subscript"),
        icon: "subscript",
        description: msg("Mark the selection as a subscript"),
        shortcut: "ctrl+shift+ArrowDown",
      }),
      code: this.MarkCommandSpec({
        id: "code",
        label: msg("Code"),
        icon: "code",
        description: msg("Mark the selection as code"),
        shortcut: "ctrl+shift+c",
        tags: ["mark", "inline"]
      }),
      link: this.MarkCommandSpec({
        id: "link",
        label: msg("Link"),
        icon: "link",
        description: msg("Mark the selection as a link"),
        shortcut: "ctrl+shift+l",
        fields: {
          href: {
            type: "string",
            placeholder: "https://example.com"
          }
        },
        tags: ["mark", "inline"]
      }),
      fontSize:  this.MarkCommandSpec({
        id: "fontSize",
        tags: [],
        label: msg("Set font size"),
        icon: "letter-case",
        description: msg("Sets the selection's font size"), //@ts-ignore
        value: () => this.editor && getStyleValues(this.editorState!, this.editor.pmEditor as any, "font-size")
      }),
      fontFamily:  this.MarkCommandSpec({
        id: "fontFamily",
        tags: [],
        label: msg("Set font family"),
        icon: "typography",
        description: msg("Sets the selection's font family"), //@ts-ignore
        value: () => this.editor && getStyleValues(this.editorState!, this.editor.pmEditor as any, "font-family")
      }),
      setTextColor: {
        id: "setTextColor",
        tags: ["mark", "color"],
        label: msg("Set text color"),
        icon: "letter-a",
        description: msg("Sets the color of the selected text"),
        callback: (options: any) => this.exec(toggleOrUpdateMark("textBackground", options)),
        category: "editor",
        value: () => (this.editorState && getActiveMarks(this.editorState).find(mark => mark.type.name === "textColor")?.attrs.value) ?? "#000000"
      },
      setTextBackground: {
        id: "setTextBackground",
        tags: ["mark", "color"],
        label: msg("Set text background"),
        icon: "highlight",
        description: msg("Sets the background color of the selected text"),
        callback: (options: any) => this.exec(toggleOrUpdateMark("textBackground", options)),
        category: "editor",
        value: () => (this.editorState && getActiveMarks(this.editorState).find(mark => mark.type.name === "textBackground")?.attrs.value) ?? "#fff000"
      },
      incrementFontSize: {
        id: "incrementFontSize",
        tags: ["font", "color"],
        label: msg("Increment font size"),
        icon: "text-increase",
        description: msg("Increment the selection's font size"),
        callback: () => commands.fontSize.callback({ //@ts-ignore
          value: `${parseInt(commands.fontSize.value()) + 1}pt`
        }),
        category: "editor",
        group: "font"
      },
      decrementFontSize: {
        id: "decrementFontSize",
        tags: ["font"],
        label: msg("Decrement font size"),
        icon: "text-decrease",
        description: msg("Decrement the selection's font size"),
        callback: () => commands.fontSize.callback({ //@ts-ignore
          value: `${Math.max(0, parseInt(commands.fontSize.value()) - 1)}pt`
        }),
        category: "editor",
        group: "font"
      },
      lineHeight: this.BlockCommandSpec({
        id: "lineHeight",
        label: msg("Set line height"),
        icon: "line-height",
        description: msg("Set the line height of the selected block"),
        category: "editor",
      }),
      border: this.BlockCommandSpec({
        id: "border",
        label: msg("Set block border"),
        icon: "border-style-2",
        description: msg("Set the border of the selected block")
      }),
      margin: this.BlockCommandSpec({
        id: "margin",
        label: msg("Set block margin"),
        icon: "box-margin",
        description: msg("Set the margins of the selected block")
      }),
      padding: this.BlockCommandSpec({
        id: "padding",
        label: msg("Set block padding"),
        icon: "box-padding",
        description: msg("Set the padding of the selected block")
      }),
      background: this.BlockCommandSpec({
        id: "background",
        label: msg("Set block background"),
        icon: "texture",
        description: msg("Set the background of the selected block")
      }),
      textAlign: this.BlockCommandSpec({
        id: "textAlign",
        label: msg("Align block text"),
        icon: "align-center",
        description: msg("Set the text alignment of the selected block")
      }),
      paragraph: this.InsertContainerCommandSpec({
        id: "paragraph",
        label: msg("Paragraph"),
        icon: "align-justified",
        description: msg("Insert a paragraph"),
        group: "block"
      }),
      blockquote: this.InsertContainerCommandSpec({
        id: "blockquote",
        label: msg("Blockquote"),
        icon: "blockquote",
        description: msg("Insert a blockquote"),
        group: "block"
      }),
      h1: this.InsertContainerCommandSpec({
        id: "h1",
        label: msg("Heading"),
        icon: "h-1",
        description: msg("Insert a heading (level 1)"),
        group: "heading"
      }),
      h2: this.InsertContainerCommandSpec({
        id: "h2",
        label: msg("Heading 2"),
        icon: "h-2",
        description: msg("Insert a heading (level 2)"),
        group: "heading"
      }),
      h3: this.InsertContainerCommandSpec({
        id: "h3",
        label: msg("Heading 3"),
        icon: "h-3",
        description: msg("Insert a heading (level 3)"),
        group: "heading"
      }),
      h4: this.InsertContainerCommandSpec({
        id: "h4",
        label: msg("Heading 4"),
        icon: "h-4",
        description: msg("Insert a heading (level 4)"),
        group: "heading"
      }),
      h5: this.InsertContainerCommandSpec({
        id: "h5",
        label: msg("Heading 5"),
        icon: "h-5",
        description: msg("Insert a heading (level 5)"),
        group: "heading"
      }),
      h6: this.InsertContainerCommandSpec({
        id: "h6",
        label: msg("Heading 6"),
        icon: "h-6",
        description: msg("Insert a heading (level 6)"),
        group: "heading"
      }),
      ul: this.InsertContainerCommandSpec({
        id: "ul",
        label: msg("List"),
        icon: "list",
        description: msg("Insert a list (unordered)"),
        group: "list",
      }),
      ol: this.InsertContainerCommandSpec({
        id: "ol",
        label: msg("Ordered List"),
        icon: "list-numbers",
        description: msg("Insert a list (ordered)"),
        group: "list"
      }),
      /*taskList: this.InsertContainerCommandSpec({
        id: "taskList",
        label: msg("Task List"),
        icon: "list-check",
        description: msg("Insert a list (tasks)"),
        group: "list"
      }, {isTask: true}, "list"),*/
      table: this.InsertContainerCommandSpec({
        id: "table",
        label: msg("Table"),
        icon: "table",
        description: msg("Insert a table"),
        group: "table",
        disabled: () => true // TODO
      }),
      drawer: this.InsertContainerCommandSpec({
        id: "drawer",
        label: msg("Drawer"),
        icon: "square-chevron-down",
        description: msg("Insert a drawer"),
        group: "drawer",
        disabled: () => true // TODO
      }),
      undo: {
        id: "undo",
        tags: ["general"],
        label: msg("Undo"),
        icon: "arrow-back-up",
        description: msg("Undo the last change in the active document"),
        shortcut: "ctrl+z",
        callback: () => this.exec(undo),
        category: "editor",
        disabled: () => this.editorState && undoDepth(this.editorState) === 0
      },
      redo: {
        id: "redo",
        tags: ["general"],
        label: msg("Redo"),
        icon: "arrow-forward-up",
        description: msg("Redo the last undone change in the active document"),
        shortcut: "ctrl+y",
        callback: () => this.exec(redo),
        category: "editor",
        disabled: () => this.editorState && redoDepth(this.editorState) === 0
      },
      preview: {
        id: "preview",
        tags: ["general"],
        label: msg("Preview"),
        icon: "eye",
        description: msg("Toggles the preview for the active document"),
        shortcut: "ctrl+b",
        callback: () => this.store.resources.togglePreview(),
        category: "editor",
        value: () => this.editor?.previewing
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
      },
      setDocAttrs: {
        id: "setDocAttrs",
        callback: (options: any) => this.exec(setDocAttributes(options))
      },
    }
    return commands as unknown as CommandMap<keyof typeof commands>
  }
}