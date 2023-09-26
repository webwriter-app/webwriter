import {ReactiveController} from "lit"
import Hotkeys from "hotkeys-js"

import { EditorStateWithHead, RootStore, getActiveAttributes, getActiveBlockAttributes, getActiveMarks, getStyleValues, hasActiveNode, setAttributeOnSelectedBlocks, setDocAttributes, themes, toggleOrUpdateMark, wrapSelection} from "../model"
import { App } from "../view"
import { msg } from "@lit/localize"
import hotkeys from "hotkeys-js"
import {toggleMark} from "prosemirror-commands"
import {Command as PmCommand} from "prosemirror-state"
import {redo, redoDepth, undo, undoDepth} from "prosemirror-history"
import {Node, Mark} from "prosemirror-model"
import { makeAutoObservable } from "mobx"

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

// type CommandSpec<ID extends string=string, T=any> = {
//   id: ID
//   /** Keyboard shortcut for the command. */ 
// 	shortcut?: string
//   /** Tags for the command. */
//   tags?: string[]
//   /** Icon to represent the command to the user. */
// 	icon?: string
//   /** Rough categorization of the command. */
// 	category?: string
//   /** Grouping for exclusive commands. */
//   group?: string
//   /** Allow the default keyboard event in addition to the callback. */
// 	allowDefault?: boolean
//   /** Whether the shortcut has been changed from the default. */
// 	modified?: boolean
//   /** Whether to disallow changing the shortcut. */
//   fixedShortcut?: boolean
//   /** Fields of the command that will be passed as arguments. */
// 	fields?: any
//   /** Label of the command for the user. */
// 	get label(): string
//   /** Description of the commmand for the user. */
//   get description(): string
//   /** Whether the command should be disabled. */
// 	get disabled(): boolean
//   /** Whether the command is active. */
//   get active(): boolean
//   /** Associated value of the command. */
//   get value(): T
// }


// class Command<ID extends string = string> {
//   readonly id: ID
//   /** Keyboard shortcut for the command. */ 
// 	shortcut?: string
//   /** Label of the command for the user. */
// 	label?: string
//   tags?: string[]
//   /** Description of the commmand for the user. */
// 	description?: string
//   /** Icon to represent the command to the user. */
// 	icon?: string
//   /** Rough categorization of the command. */
// 	category?: string
//   /** Grouping for exclusive commands. */
//   group?: string
//   /** Allow the default keyboard event in addition to the callback. */
// 	allowDefault?: boolean
//   /** Whether the shortcut has been changed from the default. */
// 	modified?: boolean
//   /** Whether to disallow changing the shortcut. */
//   fixedShortcut?: boolean
//   /** Fields of the command that will be passed as arguments. */
// 	fields?: any
//   constructor(spec: CommandSpec<ID>) {
//     this.id = spec.id
//     this.shortcut = spec.shortcut
//     this.label = spec.label
//     this.tags = spec.tags
//   }
// }

// class MarkCommand extends Command {
//   constructor(spec: CommandSpec) {
//     super(spec)
//   }
// }

// class NodeCommand extends Command {

// }

// class LayoutCommand extends Command {
  
// }

/*
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


LayoutCommandSpec({
  id,
  tags=["layout"],
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

NodeCommandSpec({
  id,
  tags=["node"],
  category="editor",
  callback=((options: any) => this.exec(wrapSelection(this.editorState?.schema.nodes[nodeName ?? id]!, attrs))),
  active=(() => hasActiveNode(this.editorState!, nodeName ?? id, attrs)),
  disabled=(() => false),
  ...rest
}: Partial<CommandSpec> & {id: string}, attrs?: {}, nodeName?: string) {
  return {id, tags, category, callback, active, ...rest}
}
*/

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

class Command<ID extends string> implements ReactiveController {

  host: App
	store: RootStore



  constructor(host: App, store: RootStore, spec: CommandSpec) {
		this.store = store;
    (this.host = host).addController(this)
  }

  hostConnected(): void {
    
  }

  readonly id: ID
  
  private _shortcut: string
  get shortcut() {

  }
  set shortcut() {

  }

  get label() {
  }
}

class NodeCommand<ID extends string> extends Command<ID> {

}

class MarkCommand<ID extends string> extends Command<ID> {
  
}

class LayoutCommand<ID extends string> extends Command<ID> {
  
}



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

  exec(command: PmCommand) {
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
    makeAutoObservable(this)
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
    active=(() => !!this.resources.activeMarkMap[id]),
    value=(() => this.resources.activeMarkMap[id]),
    ...rest
  }: Partial<CommandSpec> & {id: string}) {
    return {id, tags, category, callback, active, value, ...rest}
  }


  LayoutCommandSpec({
    id,
    tags=["layout"],
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
  
  NodeCommandSpec({
    id,
    tags=["node"],
    category="editor",
    callback=((options: any) => this.exec(wrapSelection(this.editorState?.schema.nodes[nodeName ?? id]!, attrs))),
    active=(() => !!this.resources.activeNodeMap[id]),
    value=(() => this.resources.activeNodeMap[id]),
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
      print: {
        id: "print",
        label: msg("Print"),
        icon: "printer",
        description: msg("Print the active document"),
        shortcut: "ctrl+p",
        callback: () => this.editor?.pmEditor?.window?.print(),
        category: "document"
      },
      preview: {
        id: "preview",
        label: msg("Preview"),
        icon: "eye",
        description: msg("Toggles the preview for the active document"),
        shortcut: "ctrl+b",
        callback: () => this.store.resources.preview(),
        category: "document",
        value: () => this.editor?.previewing
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
      canvas: this.NodeCommandSpec({
        id: "br",
        label: msg("Canvas"),
        icon: "chalkboard",
        description: msg("Insert a canvas"),
        tags: ["node", "container"]
      }),
      button: this.NodeCommandSpec({
        id: "button",
        label: msg("Button"),
        icon: "square-f1",
        description: msg("Insert a button")
      }),
      input: this.NodeCommandSpec({
        id: "input",
        label: msg("Input"),
        icon: "forms",
        description: msg("Insert an input")
      }),
      select: this.NodeCommandSpec({
        id: "select",
        label: msg("Select"),
        icon: "select",
        description: msg("Insert a select")
      }),
      meter: this.NodeCommandSpec({
        id: "meter",
        label: msg("Meter"),
        icon: "progress",
        description: msg("Insert a meter")
      }),
      datalist: this.NodeCommandSpec({
        id: "datalist",
        label: msg("Data List"),
        icon: "stack-2",
        description: msg("Insert a data list")
      }),
      fieldset: this.NodeCommandSpec({
        id: "fieldset",
        label: msg("Field Set"),
        icon: "forms",
        description: msg("Insert a field set")
      }),
      form: this.NodeCommandSpec({
        id: "form",
        label: msg("Form"),
        icon: "forms",
        description: msg("Insert a form"),
        tags: ["node", "container"]
      }),
      label: this.NodeCommandSpec({
        id: "label",
        label: msg("Label"),
        icon: "capsule-horizontal",
        description: msg("Insert a label")
      }),
      legend: this.NodeCommandSpec({
        id: "legend",
        label: msg("Legend"),
        icon: "tags",
        description: msg("Insert a legend")
      }),
      optgroup: this.NodeCommandSpec({
        id: "optgroup",
        label: msg("Option Group"),
        icon: "circles",
        description: msg("Insert an option group")
      }),
      option: this.NodeCommandSpec({
        id: "option",
        label: msg("Option"),
        icon: "circle",
        description: msg("Insert an option")
      }),
      output: this.NodeCommandSpec({
        id: "output",
        label: msg("Output"),
        icon: "clipboard-text",
        description: msg("Insert an output")
      }),
      progress: this.NodeCommandSpec({
        id: "progress",
        label: msg("Progress Indicator"),
        icon: "progress",
        description: msg("Insert a progress indicator")
      }),
      br: this.NodeCommandSpec({
        id: "br",
        label: msg("Line Break"),
        icon: "arrow-forward",
        description: msg("Insert a line break")
      }),
      wbr: this.NodeCommandSpec({
        id: "wbr",
        label: msg("Line Break Opportunity"),
        icon: "arrow-forward",
        description: msg("Insert a line break opportunity")
      }),
      b: this.MarkCommandSpec({
        id: "b",
        label: msg("Bold"),
        icon: "bold",
        description: msg("Mark the selection as bold"),
        shortcut: "alt+shift+b"
      }),
      i: this.MarkCommandSpec({
        id: "i",
        label: msg("Italic"),
        icon: "italic",
        description: msg("Mark the selection as italic"),
        shortcut: "alt+shift+i"
      }),
      u: this.MarkCommandSpec({
        id: "u",
        label: msg("Underline"),
        icon: "underline",
        description: msg("Mark the selection as underlined"),
        shortcut: "alt+shift+u",
      }),
      s: this.MarkCommandSpec({
        id: "s",
        label: msg("Strikethrough"),
        icon: "strikethrough",
        description: msg("Mark the selection as struck through"),
        shortcut: "alt+shift+s",
      }),
      sup: this.MarkCommandSpec({
        id: "sup",
        label: msg("Superscript"),
        icon: "superscript",
        description: msg("Mark the selection as a superscript"),
        shortcut: "alt+shift+o",
        group: "supsub"
      }),
      sub: this.MarkCommandSpec({
        id: "sub",
        label: msg("Subscript"),
        icon: "subscript",
        description: msg("Mark the selection as a subscript"),
        shortcut: "alt+shift+l",
      }),
      code: this.MarkCommandSpec({
        id: "code",
        label: msg("Code"),
        icon: "code",
        description: msg("Mark the selection as code"),
        shortcut: "alt+shift+c"
      }),
      a: this.MarkCommandSpec({
        id: "a",
        label: msg("Link"),
        icon: "link",
        description: msg("Mark the selection as a link"),
        shortcut: "alt+shift+k",
        fields: {
          href: {
            type: "string",
            placeholder: "https://example.com"
          }
        }
      }),
      q: this.MarkCommandSpec({
        id: "q",
        label: msg("Quotation"),
        description: msg("Mark the selection as a quotation"),
        shortcut: "alt+shift+q",
        icon: "quote",
        fields: {
          title: {
            type: "string",
            placeholder: msg("Citation Source")
          }
        }
      }),
      kbd: this.MarkCommandSpec({
        id: "kbd",
        label: msg("Keyboard Shortcut"),
        description: msg("Mark the selection as a keyboard shortcut"),
        shortcut: "alt+shift+p",
        icon: "command"
      }),
      abbr: this.MarkCommandSpec({
        id: "abbr",
        label: msg("Abbreviation"),
        description: msg("Mark the selection as an abbreviation"),
        icon: "emphasis",
        shortcut: "alt+shift+a",
        fields: {
          title: {
            type: "string",
            placeholder: msg("Full Term")
          }
        }
      }),
      bdi: this.MarkCommandSpec({
        id: "bdi",
        label: msg("Bidirectional Isolate"),
        description: msg("Mark the selection as a 'bidirectional isolate'"),
        icon: "text-direction-ltr",
        shortcut: "alt+shift+g",
      }),
      bdo: this.MarkCommandSpec({
        id: "bdo",
        label: msg("Bidirectional Override"),
        description: msg("Mark the selection as a 'bidirectional override'"),
        icon: "text-direction-ltr",
        shortcut: "alt+shift+h",
      }),
      cite: this.MarkCommandSpec({
        id: "cite",
        label: msg("Citation Source"),
        description: msg("Mark the selection as a citation source"),
        icon: "letter-c",
        shortcut: "alt+shift+j",
      }),
      data: this.MarkCommandSpec({
        id: "data",
        label: msg("Data Annotation"),
        description: msg("Mark the selection with a data annotation"),
        icon: "circle-dot",
        shortcut: "alt+shift+f",
      }),
      del: this.MarkCommandSpec({
        id: "del",
        label: msg("Deletion"),
        description: msg("Mark the selection as a deletion"),
        icon: "pencil-minus",
        shortcut: "alt+shift+d"
      }),
      dfn: this.MarkCommandSpec({
        id: "dfn",
        label: msg("Defined Term"),
        description: msg("Mark the selection as a defined term"),
        icon: "vocabulary",
        shortcut: "alt+shift+t"
      }),
      em: this.MarkCommandSpec({
        id: "em",
        label: msg("Emphasis"),
        description: msg("Mark the selection as emphasized"),
        icon: "italic",
        shortcut: "alt+shift+z"
      }),
      ins: this.MarkCommandSpec({
        id: "ins",
        label: msg("Insertion"),
        description: msg("Mark the selection as an insertion"),
        icon: "pencil-plus",
        shortcut: "alt+shift+y"
      }),
      ruby: this.MarkCommandSpec({
        id: "ruby",
        label: msg("Ruby Annotation"),
        description: msg("Mark the selection with a ruby annotation"),
        icon: "letter-r",
        shortcut: "alt+shift+r"
      }),
      samp: this.MarkCommandSpec({
        id: "samp",
        label: msg("Sample Output"),
        description: msg("Mark the selection as sample output"),
        icon: "source-code",
        shortcut: "alt+shift+n"
      }),
      small: this.MarkCommandSpec({
        id: "small",
        label: msg("Side Comment"),
        description: msg("Mark the selection as a side comment"),
        icon: "letter-s",
        shortcut: "alt+shift+m"

      }),
      span: this.MarkCommandSpec({
        id: "span",
        label: msg("Span"),
        description: msg("Mark the selection as a span"),
        icon: "rectangle",
        shortcut: "alt+shift+x"
      }),
      strong: this.MarkCommandSpec({
        id: "strong",
        label: msg("Strong Importance"),
        description: msg("Mark the selection as strongly important"),
        icon: "bold",
        shortcut: "alt+shift+w"
      }),
      time: this.MarkCommandSpec({
        id: "time",
        label: msg("Date/Time Annotation"),
        description: msg("Mark the selection as a date/time annotation"),
        icon: "calendar-time",
        shortcut: "alt+shift+t"
      }),
      var: this.MarkCommandSpec({
        id: "var",
        label: msg("Variable"),
        description: msg("Mark the selection as a variable"),
        icon: "variable",
        shortcut: "alt+shift+v"
      }),
      p: this.NodeCommandSpec({
        id: "p",
        label: msg("Paragraph"),
        icon: "align-justified",
        description: msg("Insert a paragraph"),
        tags: ["node", "container"]
      }),
      h1: this.NodeCommandSpec({
        id: "h1",
        label: msg("Heading"),
        icon: "h-1",
        description: msg("Insert a heading (level 1)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h2: this.NodeCommandSpec({
        id: "h2",
        label: msg("Heading 2"),
        icon: "h-2",
        description: msg("Insert a heading (level 2)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h3: this.NodeCommandSpec({
        id: "h3",
        label: msg("Heading 3"),
        icon: "h-3",
        description: msg("Insert a heading (level 3)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h4: this.NodeCommandSpec({
        id: "h4",
        label: msg("Heading 4"),
        icon: "h-4",
        description: msg("Insert a heading (level 4)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h5: this.NodeCommandSpec({
        id: "h5",
        label: msg("Heading 5"),
        icon: "h-5",
        description: msg("Insert a heading (level 5)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h6: this.NodeCommandSpec({
        id: "h6",
        label: msg("Heading 6"),
        icon: "h-6",
        description: msg("Insert a heading (level 6)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      hgroup: this.NodeCommandSpec({
        id: "hgroup",
        label: msg("Heading Group"),
        icon: "heading",
        description: msg("Insert a heading group")
      }),
      ul: this.NodeCommandSpec({
        id: "ul",
        label: msg("List"),
        icon: "list",
        description: msg("Insert a list (unordered)"),
        group: "list",
        tags: ["node", "container"]
      }),
      ol: this.NodeCommandSpec({
        id: "ol",
        label: msg("Ordered List"),
        icon: "list-numbers",
        description: msg("Insert a list (ordered)"),
        group: "list",
        tags: ["node", "container"]
      }),
      li: this.NodeCommandSpec({
        id: "li",
        label: msg("List Item"),
        icon: "separator",
        description: msg("Insert a list item")
      }),
      math: this.NodeCommandSpec({
        id: "math",
        label: msg("Math Formula"),
        icon: "math",
        description: msg("Insert a math formula"),
        tags: ["node", "container"]
      }),      
      figure: this.NodeCommandSpec({
        id: "figure",
        label: msg("Figure"),
        icon: "layout-bottombar",
        description: msg("Insert a figure"),
        tags: ["node", "container"]
      }),
      figcaption: this.NodeCommandSpec({
        id: "figcaption",
        label: msg("Figure Caption"),
        icon: "text-caption",
        description: msg("Insert a figure caption")
      }),
      img: this.NodeCommandSpec({
        id: "img",
        label: msg("Image"),
        icon: "photo",
        description: msg("Insert an image")
      }),
      source: this.NodeCommandSpec({
        id: "source",
        label: msg("Source"),
        icon: "circles-relation",
        description: msg("Insert a source")
      }),
      track: this.NodeCommandSpec({
        id: "track",
        label: msg("Track"),
        icon: "track",
        description: msg("Insert a track")
      }),
      picture: this.NodeCommandSpec({
        id: "picture",
        label: msg("Picture"),
        icon: "photo",
        description: msg("Insert a picture")
      }),
      audio: this.NodeCommandSpec({
        id: "audio",
        label: msg("Audio"),
        icon: "music",
        description: msg("Insert audio")
      }),
      video: this.NodeCommandSpec({
        id: "video",
        label: msg("Video"),
        icon: "movie",
        description: msg("Insert video")
      }),
      object: this.NodeCommandSpec({
        id: "object",
        label: msg("Object"),
        icon: "frame",
        description: msg("Insert object")
      }),
      embed: this.NodeCommandSpec({
        id: "embed",
        label: msg("Embed"),
        icon: "frame",
        description: msg("Insert embed")
      }),
      iframe: this.NodeCommandSpec({
        id: "iframe",
        label: msg("Inline Frame"),
        icon: "frame",
        description: msg("Insert an inline frame")
      }),
      portal: this.NodeCommandSpec({
        id: "portal",
        label: msg("Portal"),
        icon: "window",
        description: msg("Insert a portal")
      }),
      script: this.NodeCommandSpec({
        id: "script",
        label: msg("Script"),
        icon: "script",
        description: msg("Insert a script"),
        tags: ["node", "container"]
      }),
      style: this.NodeCommandSpec({
        id: "style",
        label: msg("Style"),
        icon: "brush",
        description: msg("Insert a style"),
        tags: ["node", "container"]
      }),
      template: this.NodeCommandSpec({
        id: "template",
        label: msg("Template"),
        icon: "template",
        description: msg("Insert a template")
      }),
      slot: this.NodeCommandSpec({
        id: "slot",
        label: msg("Slot"),
        icon: "outlet",
        description: msg("Insert a slot")
      }),
      noscript: this.NodeCommandSpec({
        id: "noscript",
        label: msg("NoScript"),
        icon: "code-off",
        description: msg("Insert a NoScript")
      }),
      dialog: this.NodeCommandSpec({
        id: "dialog",
        label: msg("Dialog"),
        icon: "app-window",
        description: msg("Insert a dialog"),
        tags: ["node", "container"]
      }),
      details: this.NodeCommandSpec({
        id: "details",
        label: msg("Details"),
        icon: "circle-chevron-right",
        description: msg("Insert details"),
        tags: ["node", "container"]
      }),
      summary: this.NodeCommandSpec({
        id: "summary",
        label: msg("Summary"),
        icon: "circle-letter-s",
        description: msg("Insert summary")
      }),
      article: this.MarkCommandSpec({
        id: "article",
        label: msg("Article"),
        icon: "article",
        description: msg("Insert an article"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      aside: this.MarkCommandSpec({
        id: "aside",
        label: msg("Aside"),
        icon: "notes",
        description: msg("Insert an aside"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      nav: this.MarkCommandSpec({
        id: "nav",
        label: msg("Navigation"),
        icon: "directions",
        description: msg("Insert a navigation"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      section: this.MarkCommandSpec({
        id: "section",
        label: msg("Section"),
        icon: "section-sign",
        description: msg("Insert a section"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      header: this.MarkCommandSpec({
        id: "header",
        label: msg("Header"),
        icon: "layout-navbar",
        description: msg("Insert a header"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      footer: this.MarkCommandSpec({
        id: "footer",
        label: msg("Footer"),
        icon: "layout-bottombar",
        description: msg("Insert a footer"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      main: this.MarkCommandSpec({
        id: "main",
        label: msg("Main"),
        icon: "news",
        description: msg("Insert a main"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      search: this.MarkCommandSpec({
        id: "search",
        label: msg("Search"),
        icon: "list-search",
        description: msg("Insert a search"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),
      address: this.MarkCommandSpec({
        id: "address",
        label: msg("Address"),
        icon: "address-book",
        description: msg("Insert an address"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),  
      blockquote: this.MarkCommandSpec({
        id: "blockquote",
        label: msg("Blockquote"),
        icon: "blockquote",
        description: msg("Insert a blockquote"),
        group: "semanticsection",
        tags: ["node", "container"]
      }),  
      svg: this.MarkCommandSpec({
        id: "svg",
        label: msg("SVG Drawing"),
        icon: "svg",
        description: msg("Insert an SVG Drawing"),
        tags: ["node", "container"]
      }),
      table: this.MarkCommandSpec({
        id: "table",
        label: msg("Table"),
        icon: "table",
        description: msg("Insert a table"),
        tags: ["node", "container"]
      }),
      caption: this.MarkCommandSpec({
        id: "caption",
        label: msg("Table Caption"),
        icon: "table-alias",
        description: msg("Insert a table caption")
      }),
      col: this.MarkCommandSpec({
        id: "col",
        label: msg("Table Column"),
        icon: "table-column",
        description: msg("Insert a table column")
      }),
      colgroup: this.MarkCommandSpec({
        id: "colgroup",
        label: msg("Table Column Group"),
        icon: "columns-3",
        description: msg("Insert a table column group")
      }),
      tbody: this.MarkCommandSpec({
        id: "tbody",
        label: msg("Table Body"),
        icon: "table",
        description: msg("Insert a table body")
      }),
      td: this.MarkCommandSpec({
        id: "td",
        label: msg("Table cell"),
        icon: "square",
        description: msg("Insert a table cell")
      }),
      tfoot: this.MarkCommandSpec({
        id: "tfoot",
        label: msg("Table Footer"),
        icon: "table-row",
        description: msg("Insert a table footer")
      }),
      th: this.MarkCommandSpec({
        id: "th",
        label: msg("Table header"),
        icon: "table-row",
        description: msg("Insert a table header row")
      }),
      thead: this.MarkCommandSpec({
        id: "thead",
        label: msg("Table Head"),
        icon: "table-settings",
        description: msg("Insert a table head")
      }),
      tr: this.MarkCommandSpec({
        id: "tr",
        label: msg("Table Row"),
        icon: "table-row",
        description: msg("Insert a table row")
      }),
      fontSize:  this.MarkCommandSpec({
        id: "fontSize",
        tags: [],
        label: msg("Set font size"),
        icon: "letter-case",
        description: msg("Sets the selection's font size"), //@ts-ignore
        callback: ({value}) => this.exec(toggleOrUpdateMark("span", {style: `font-size: ${value}`})),
        value: () => ["14pt"] || this.editor && getStyleValues(this.editorState!, this.editor.pmEditor as any, "font-size")
      }),
      fontFamily:  this.MarkCommandSpec({
        id: "fontFamily",
        tags: [],
        label: msg("Set font family"),
        icon: "typography",
        description: msg("Sets the selection's font family"), //@ts-ignore
        callback: () => null,
        value: () => ["Arial"] || this.editor && getStyleValues(this.editorState!, this.editor.pmEditor as any, "font-family")
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
      lineHeight: this.LayoutCommandSpec({
        id: "lineHeight",
        label: msg("Set line height"),
        icon: "line-height",
        description: msg("Set the line height of the selected block"),
        category: "editor",
      }),
      border: this.LayoutCommandSpec({
        id: "border",
        label: msg("Set block border"),
        icon: "border-style-2",
        description: msg("Set the border of the selected block")
      }),
      margin: this.LayoutCommandSpec({
        id: "margin",
        label: msg("Set block margin"),
        icon: "box-margin",
        description: msg("Set the margins of the selected block")
      }),
      padding: this.LayoutCommandSpec({
        id: "padding",
        label: msg("Set block padding"),
        icon: "box-padding",
        description: msg("Set the padding of the selected block")
      }),
      background: this.LayoutCommandSpec({
        id: "background",
        label: msg("Set block background"),
        icon: "texture",
        description: msg("Set the background of the selected block")
      }),
      textAlign: this.LayoutCommandSpec({
        id: "textAlign",
        label: msg("Align block text"),
        icon: "align-center",
        description: msg("Set the text alignment of the selected block")
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