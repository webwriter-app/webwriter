import {ReactiveController} from "lit"
import Hotkeys from "hotkeys-js"

import { EditorStateWithHead, INDIVIDUAL_FILTERS, RootStore, getActiveAttributes, getActiveBlockAttributes, getActiveMarks, getStyleValues, hasActiveNode, setAttributeOnSelectedBlocks, setDocAttributes, themes, toggleOrUpdateMark, wrapSelection} from "../model"
import { App } from "../view"
import { msg } from "@lit/localize"
import hotkeys from "hotkeys-js"
import {toggleMark} from "prosemirror-commands"
import {Command as PmCommand} from "prosemirror-state"
import {redo, redoDepth, undo, undoDepth} from "prosemirror-history"
import {Node, Mark} from "prosemirror-model"
import { makeAutoObservable, spy } from "mobx"
import { groupBy } from "../utility"
import { Memoize } from "typescript-memoize"
import { Attrs } from "prosemirror-utils/dist/types"


export const WINDOW_OPTIONS = {
  "fileDropEnabled": false,
  "fullscreen": false,
  "height": 600,
  "resizable": true,
  "title": "WebWriter",
  "width": 800,
  "minWidth": 600,
  "minHeight": 600
}

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
//   /** Allow the default keyboard event in addition to the run. */
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
//   /** Allow the default keyboard event in addition to the run. */
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
  run=((options: any) => this.exec(toggleOrUpdateMark(id, options))),
  active=(() => !!this.editorState && this.resources.isMarkActive(id)),
  value=(() => this.editorState && getActiveMarks(this.editorState!).find(mark => mark.type.name === id)?.attrs[id]),
  ...rest
}: Partial<CommandSpec> & {id: string}) {
  return {id, tags, category, run, active, value, ...rest}
}


LayoutCommandSpec({
  id,
  tags=["layout"],
  category="editor",
  run=((options: any) => {
    const value = options?.value
    this.exec(setAttributeOnSelectedBlocks(id, value)as any)
  }),
  active=(() => !!this.editorState && this.resources.getActiveAttributeValue(id) !== undefined),
  group=id,
  value=(() => !!this.editorState && this.resources.getActiveAttributeValue(id)),
  ...rest
}: Partial<CommandSpec> & {id: string}) {
  return {id, tags, category, run, active, value, ...rest}
}

NodeCommandSpec({
  id,
  tags=["node"],
  category="editor",
  run=((options: any) => this.exec(wrapSelection(this.editorState?.schema.nodes[nodeName ?? id]!, attrs))),
  active=(() => hasActiveNode(this.editorState!, nodeName ?? id, attrs)),
  disabled=(() => false),
  ...rest
}: Partial<CommandSpec> & {id: string}, attrs?: new Command(this.host, {}, nodeName?: string) {
  return {id, tags, category, run, active, ...rest}
}
*/

export type CommandSpec<ID extends string = string, T extends FieldRecord = FieldRecord> = {
  id: ID
  /** Keyboard shortcut for the command. */ 
	shortcut?: string
  /** Rough categorization of the command. */
	category?: string
  /** Grouping for exclusive commands. */
  group?: string
  /** Allow the default keyboard event in addition to the run. */
	allowDefault?: boolean
  /** Whether the shortcut has been changed from the default. */
  fixedShortcut?: boolean
  /** Fields of the command that will be passed as arguments. */
	fields?: T,
  /** Callback handling the event. Receives the keyboard event and combo if the run was triggered by a keyboard shortcut. */
  tags?: string[]
    /** Icon to represent the command to the user. */
	icon?: string | ((host: App) => string)
  /** Description of the commmand for the user. */
	description?: string | ((host: App) => string)
    /** Label of the command for the user. */
	label?: string | ((host: App) => string)
	run?: (host: App, options?: any, e?: Event) => any | Promise<any>
    /** Whether the command should be disabled. */
	disabled?: (host: App) => boolean
  /** Whether the command should be disabled. */
  active?: (host: App) => boolean
  /** Associated value of the command. */
  value?: (host: App) => any
  /** Callback to preview the command's result, for example on hovering a command button. */
  preview?: (host: App, options?: any, e?: Event) => any | Promise<any>
}

export type NodeCommandSpec<ID extends string = string, T extends FieldRecord = FieldRecord> = CommandSpec<ID, T> & {defaultAttrs?: Attrs}

export class Command<SPEC extends CommandSpec = CommandSpec> implements ReactiveController {

  host: App
  spec: SPEC

  constructor(host: App, spec: SPEC) {
    this.spec = spec;
    (this.host = host)?.addController(this)
  }

  hostConnected(): void {
    !this.fixedShortcut && this.assignShortcut(this.shortcut)
  }

  get id() {
    return this.spec.id
  }
  /** Keyboard shortcut for the command. */ 
  get shortcut() {
    return this.configuredShortcut ?? this.spec.shortcut
  }
  set shortcut(value: string) {
    if(this.fixedShortcut) {
      return
    }
    this.assignShortcut(value, this.shortcut)
  }
  get configuredShortcut() {
		return this.host.store.get("ui", "keymap")[this.id]?.shortcut
	}

  assignShortcut = (newShortcut: string, oldShortcut?: string) => {
    oldShortcut && hotkeys.unbind(oldShortcut)
    Hotkeys(newShortcut, e => this.run(undefined, e))
  }

  /** Label of the command for the user. */
  get tags() {
    return this.spec.tags
  }
  /** Description of the commmand for the user. */
  get label() {
    return typeof this.spec.label === "string" || !this.spec.label? this.spec.label: this.spec.label(this.host)
  }
  /** Description of the commmand for the user. */
  get description() {
    return typeof this.spec.description === "string" || !this.spec.description? this.spec.description: this.spec.description(this.host)
  }
  /** Icon to represent the command to the user. */
  get icon() {
    return typeof this.spec.icon === "string" || !this.spec.icon? this.spec.icon: this.spec.icon(this.host)
  }
  /** Rough categorization of the command. */
  get category() {
    return this.spec.category
  }
  /** Grouping for exclusive commands. */
  get group() {
    return this.spec.group
  }
  /** Whether the shortcut has been changed from the default. */
  get modified() {
    return !!this.configuredShortcut
  }
  /** Whether to disallow changing the shortcut. */
  get fixedShortcut() {
    return this.spec.fixedShortcut
  }
  /** Allow the default keyboard event in addition to the run. */
  get allowDefault() {
    return this.spec.allowDefault
  }
  /** Fields of the command that will be passed as arguments. */
  get fields() {
    return this.spec.fields
  }
  /** Whether the command should be disabled. */
  get disabled() {
    return !this.spec.disabled || !this.host.activeEditor? false: this.spec.disabled(this.host)
  }
  /** Whether the command should be disabled. */
  get active() {
    return !this.spec.active || !this.host.activeEditor? false: this.spec.active(this.host)
  }
  /** Associated value of the command. */
  get value() {
    return !this.spec.value || !this.host.activeEditor? undefined: this.spec.value(this.host)
  }

  /** Callback to preview the command's result, for example on hovering a command button. */
  preview(options?: any, e?: Event, preview=this.spec.preview ?? (() => {})) {
    if(!this.disabled && this.host.activeEditor) {
      return preview(this.host, options, e)
    }
  }

  run(options?: any, e?: Event, run=this.spec.run ?? (() => {})) {
    if(e && !this.allowDefault) {
      e.preventDefault()
    }
    if(!this.disabled && this.host.activeEditor) {
      return run(this.host, options, e)
    }
  }

  toObject() {
    const {id, tags, label, description, icon, category, group, shortcut,  modified, fixedShortcut, allowDefault, fields, disabled, active, value} = this
    return {id, tags, label, description, icon, category, group, modified, shortcut, fixedShortcut, allowDefault, fields, disabled, active, value}
  }
}

class NodeCommand<SPEC extends NodeCommandSpec = NodeCommandSpec> extends Command<SPEC> {
  get tags() {
    return this.spec.tags ?? ["node"]
  }
  get category() {
    return this.spec.category ?? "editor"
  }
  run(options?: any, e?: Event) {
    const {exec, editorState} = this.host.activeEditor ?? {exec: () => {}}
    return super.run(options, e, (host, attrs) => exec(wrapSelection(this.id, {...attrs, ...this.spec.defaultAttrs})))
  }
  get active() {
    return this.spec.active? this.spec.active(this.host): !!this.host.store.document.activeNodeMap[this.id]
  }
  get value() {
    return this.spec.value? this.spec.value(this.host): this.host.store.document.activeNodeMap[this.id]
  }
  preview(options?: any, e?: Event) {
    return super.preview(options, e, host => {
      host.activeEditor!.editingStatus = host.activeEditor?.editingStatus !== "inserting"? "inserting": undefined
    })
  }
}

class MarkCommand<SPEC extends CommandSpec = CommandSpec> extends Command<SPEC> {
  get tags() {
    return this.spec.tags ?? ["mark"]
  }
  get category() {
    return this.spec.category ?? "editor"
  }
  
  run(options?: any, e?: Event) {
    const {exec} = this.host.activeEditor ?? {exec: () => {}}
    return super.run(options, e, this.spec.run ?? ((host, options) => exec(toggleOrUpdateMark(this.id, options))))
  }
  get active() {
    return this.spec.active? this.spec.active(this.host): !!this.host.store.document.activeMarkMap[this.id]
  }
  get value() {
    return this.spec.value? this.spec.value(this.host): this.host.store.document.activeMarkMap[this.id]
  }
}

class LayoutCommand<SPEC extends CommandSpec = CommandSpec> extends Command<SPEC> {
  get tags() {
    return this.spec.tags ?? ["layout"]
  }
  get category() {
    return this.spec.category ?? "editor"
  }

  run(options?: any, e?: Event) {
    const {exec} = this.host.activeEditor ?? {exec: () => {}}
    return super.run(options, e, (host, options) => exec(setAttributeOnSelectedBlocks(this.id, options?.value)as any))
  }
  get active() {
    return this.host.store.document.getActiveAttributeValue(this.id) !== undefined
  }
  get value() {
    return this.host.store.document.getActiveAttributeValue(this.id)
  }
}

export class CommandController implements ReactiveController {

  host: App
	store: RootStore

  constructor(host: App, store: RootStore) {
		this.store = store;
    (this.host = host).addController(this)
  }

  hostConnected() {}

  queryCommands = (query: keyof typeof this.commands | {id?: string, category?: string, tags?: string[]}) => {
    if(typeof query === "string") {
      return [this.commands[query]]
    }
    else {
       return Object.values(this.commands).filter(v => true 
        && (!query.id || (v.id === query.id)) 
        && (!query.category || (v.category === query.category))
        && (!query.tags || query.tags?.some(t => v.tags?.includes(t)))
      )
    }
  }
  
  @Memoize() get markCommands() {
    return this.queryCommands({tags: ["mark"]})
  }
  
  @Memoize() get nodeCommands() {
    return this.queryCommands({tags: ["node"]})
  }

  @Memoize() get groupedNodeCommands() {
    return groupBy(this.nodeCommands, "group")
  }

  @Memoize() get groupedContainerCommands() {
    return Object.values(groupBy(this.containerCommands, "group"))
  }
  
  @Memoize() get containerCommands() {
    return this.queryCommands({tags: ["container"]}).filter(cmd => !cmd.tags?.includes("advanced"))
  }

  @Memoize() get layoutCommands() {
    return this.queryCommands({tags: ["layout"]})
  }

  @Memoize() get generalCommands() {
    return this.queryCommands({tags: ["general"]})
  }

  @Memoize() get fontCommands() {
    return this.queryCommands({tags: ["font"]})
  }

  @Memoize() get fontFamilyCommand() {
    return this.queryCommands("fontFamily")[0]
  }

  @Memoize() get fontSizeCommand() {
    return this.queryCommands("fontSize")[0]
  }

  @Memoize() get clearFormattingCommand() {
    return this.queryCommands("clearFormatting")[0]
  }

  @Memoize() get documentCommands() {
    return this.queryCommands({category: "document"})
  }

  @Memoize() get appCommands() {
    return this.queryCommands({category: "app"})
  }

  @Memoize() get phrasingCommands() {
    return this.queryCommands({tags: ["phrasing"]})
  }

  @Memoize() get elementCommands() {
    return this.queryCommands({tags: ["element"]})
  }

  /*
  get priorityContainerCommands() {
    const commands = this.containerCommands
    const activeI = commands.findIndex(cmd => cmd.active)
    const activeCommand = commands[activeI]
    const activeCommandGroup = commands.filter(cmd => activeCommand?.group && activeCommand.group === cmd.group).map(cmd => cmd.id)
    const activeOffset = activeCommandGroup.indexOf(activeCommand?.id)
    const nextCmd = activeCommandGroup[(activeOffset + 1) % activeCommandGroup.length]
    const nextI = commands.findIndex(cmd => cmd.id === nextCmd)
    const priorityCommands = commands.filter((cmd, i) => {
      const primaryI = commands.findIndex(c => c.group === cmd.group)
      return !cmd.group || (activeI !== undefined && activeCommandGroup.includes(cmd.id)? nextI: primaryI) === i
    })
    return priorityCommands
  }*/

  
  get categoryLabels() {
    return {
      "document": msg("Document"),
      "app": msg("App"),
      "editor": msg("Editor"),
      "miscellaneous": msg("Miscellaneous")
    }
  }

  @Memoize() get commands() {
    return {
      save: new Command(this.host, {
        id: "save",
        label: () => msg("Save"),
        icon: "device-floppy",
        description: () => msg("Save the active document"),
        shortcut: "ctrl+s",
        run: host => host.store.document.save(),
        category: "document",
        disabled: host => host.sourceMode
      }),
      saveAs: new Command(this.host, {
        id: "saveAs",
        label: () => msg("Save As"),
        icon: "file-export",
        description: () => msg("Save the active document as a copy"),
        shortcut: "ctrl+shift+s",
        run: host => host.store.document.save(true),
        category: "document",
        disabled: host => host.sourceMode
      }),
      print: new Command(this.host, {
        id: "print",
        label: () => msg("Print"),
        icon: "printer",
        description: () => msg("Print the active document"),
        shortcut: "ctrl+p",
        run: (host, _, e) => {
          if(e?.isTrusted) {
            host.activeEditor?.pmEditor?.window?.print()
          }
        },
        category: "document",
        disabled: host => host.sourceMode
      }),
      preview: new Command(this.host, {
        id: "preview",
        label: () => msg("Preview"),
        icon: "eye",
        description: () => msg("Toggles the preview for the active document"),
        shortcut: "ctrl+b",
        run: host => host.store.document.preview(),
        category: "document",
        disabled: host => host.sourceMode
      }),
      editHead: new Command(this.host, {
        id: "editHead",
        label: () => msg("Edit Metadata"),
        icon: "chevron-right",
        description: () => msg("Toggles the metadata editor"),
        shortcut: "ctrl+h",
        run: host => host.foldOpen = !host.foldOpen,
        category: "document",
        disabled: host => host.sourceMode
      }),
      openSettings: new Command(this.host, {
        id: "openSettings",
        label: () => msg("Open Settings"),
        icon: "settings-filled",
        description: () => msg("Opens the settings"),
        shortcut: "ctrl+i",
        run: (host) => host.environment.api.createWindow("settings.html", {...WINDOW_OPTIONS, title: `${msg("Settings")} - WebWriter`, visible: false, label: "settings"}),
        category: "app"
      }),
      open: new Command(this.host, {
        id: "open",
        label: () => msg("Open"),
        icon: "file-symlink",
        shortcut: "ctrl+o",
        description: () => msg("Open a document"),
        run: async host => {
          const url = await host.environment.api.Dialog.promptRead({filters: INDIVIDUAL_FILTERS})
          if(url && !this.host.store.document.sameAsInitial) {
            host.environment.api.createWindow(`?open=${url}`, WINDOW_OPTIONS)
          }
          else if(url) {
            this.host.store.document.load(url as string)
          }
        },
        category: "app"
      }),
      create: new Command(this.host, {
        id: "create",
        label: () => msg("Create"),
        icon: "file-plus",
        description: () => msg("Create a new document"),
        shortcut: "ctrl+n",
        run: host => host.environment.api.createWindow("", WINDOW_OPTIONS),
        category: "app"
      }),
      /*discard: new Command(this.host, {
        id: "discard",
        label: () => msg("Discard"),
        tags: ["active"],
        icon: "file-x",
        description: () => msg("Close the active document"),
        shortcut: "ctrl+w",
        run: () => this.store.resources.discard(),
        category: "document"
      }),*/
      br: new NodeCommand(this.host, {
        id: "br",
        label: () => msg("Line Break"),
        icon: "arrow-forward",
        description: () => msg("Insert a line break")
      }),
      wbr: new NodeCommand(this.host, {
        id: "wbr",
        label: () => msg("Line Break Opportunity"),
        icon: "arrow-forward",
        description: () => msg("Insert a line break opportunity")
      }),
      b: new MarkCommand(this.host, {
        id: "b",
        label: () => msg("Bold"),
        icon: "bold",
        description: () => msg("Mark the selection as bold"),
        shortcut: "alt+shift+b"
      }),
      i: new MarkCommand(this.host, {
        id: "i",
        label: () => msg("Italic"),
        icon: "italic",
        description: () => msg("Mark the selection as italic"),
        shortcut: "alt+shift+i"
      }),
      u: new MarkCommand(this.host, {
        id: "u",
        label: () => msg("Underline"),
        icon: "underline",
        description: () => msg("Mark the selection as underlined"),
        shortcut: "alt+shift+u",
      }),
      s: new MarkCommand(this.host, {
        id: "s",
        label: () => msg("Strikethrough"),
        icon: "strikethrough",
        description: () => msg("Mark the selection as struck through"),
        shortcut: "alt+shift+s",
      }),
      sup: new MarkCommand(this.host, {
        id: "sup",
        label: () => msg("Superscript"),
        icon: "superscript",
        description: () => msg("Mark the selection as a superscript"),
        shortcut: "alt+shift+o",
        group: "supsub"
      }),
      sub: new MarkCommand(this.host, {
        id: "sub",
        label: () => msg("Subscript"),
        icon: "subscript",
        description: () => msg("Mark the selection as a subscript"),
        shortcut: "alt+shift+l",
      }),
      code: new MarkCommand(this.host, {
        id: "code",
        label: () => msg("Code"),
        icon: "code",
        description: () => msg("Mark the selection as code"),
        shortcut: "alt+shift+c"
      }),
      a: new MarkCommand(this.host, {
        id: "a",
        label: () => msg("Link"),
        icon: "link",
        description: () => msg("Mark the selection as a link"),
        shortcut: "alt+shift+k",
        fields: {
          href: {
            type: "string",
            placeholder: "https://example.com"
          }
        }
      }),
      q: new MarkCommand(this.host, {
        id: "q",
        label: () => msg("Quotation"),
        description: () => msg("Mark the selection as a quotation"),
        shortcut: "alt+shift+q",
        icon: "quote",
        fields: {
          title: {
            type: "string",
            placeholder: msg("Citation Source")
          }
        }
      }),
      kbd: new MarkCommand(this.host, {
        id: "kbd",
        label: () => msg("Keyboard Shortcut"),
        description: () => msg("Mark the selection as a keyboard shortcut"),
        shortcut: "alt+shift+p",
        icon: "command"
      }),
      abbr: new MarkCommand(this.host, {
        id: "abbr",
        label: () => msg("Abbreviation"),
        description: () => msg("Mark the selection as an abbreviation"),
        icon: "emphasis",
        shortcut: "alt+shift+a",
        fields: {
          title: {
            type: "string",
            placeholder: msg("Full Term")
          }
        }
      }),
      bdi: new MarkCommand(this.host, {
        id: "bdi",
        label: () => msg("Bidirectional Isolate"),
        description: () => msg("Mark the selection as a 'bidirectional isolate'"),
        icon: "text-direction-ltr",
        shortcut: "alt+shift+g",
        tags: ["mark", "advanced"]
      }),
      bdo: new MarkCommand(this.host, {
        id: "bdo",
        label: () => msg("Bidirectional Override"),
        description: () => msg("Mark the selection as a 'bidirectional override'"),
        icon: "text-direction-ltr",
        shortcut: "alt+shift+h",
        tags: ["mark", "advanced"]
      }),
      cite: new MarkCommand(this.host, {
        id: "cite",
        label: () => msg("Citation Source"),
        description: () => msg("Mark the selection as a citation source"),
        icon: "letter-c",
        shortcut: "alt+shift+j",
        tags: ["mark", "advanced"]
      }),
      data: new MarkCommand(this.host, {
        id: "data",
        label: () => msg("Data Annotation"),
        description: () => msg("Mark the selection with a data annotation"),
        icon: "circle-dot",
        shortcut: "alt+shift+f",
        tags: ["mark", "advanced"]
      }),
      del: new MarkCommand(this.host, {
        id: "del",
        label: () => msg("Deletion"),
        description: () => msg("Mark the selection as a deletion"),
        icon: "pencil-minus",
        shortcut: "alt+shift+d",
        tags: ["mark", "advanced"]
      }),
      dfn: new MarkCommand(this.host, {
        id: "dfn",
        label: () => msg("Defined Term"),
        description: () => msg("Mark the selection as a defined term"),
        icon: "vocabulary",
        shortcut: "alt+shift+t",
        tags: ["mark", "advanced"]
      }),
      em: new MarkCommand(this.host, {
        id: "em",
        label: () => msg("Emphasis"),
        description: () => msg("Mark the selection as emphasized"),
        icon: "italic",
        shortcut: "alt+shift+z",
        tags: ["mark", "advanced"]
      }),
      ins: new MarkCommand(this.host, {
        id: "ins",
        label: () => msg("Insertion"),
        description: () => msg("Mark the selection as an insertion"),
        icon: "pencil-plus",
        shortcut: "alt+shift+y",
        tags: ["mark", "advanced"]
      }),
      ruby: new MarkCommand(this.host, {
        id: "ruby",
        label: () => msg("Ruby Annotation"),
        description: () => msg("Mark the selection with a ruby annotation"),
        icon: "letter-r",
        shortcut: "alt+shift+r",
        tags: ["mark", "advanced"]
      }),
      samp: new MarkCommand(this.host, {
        id: "samp",
        label: () => msg("Sample Output"),
        description: () => msg("Mark the selection as sample output"),
        icon: "source-code",
        shortcut: "alt+shift+n",
        tags: ["mark", "advanced"]
      }),
      small: new MarkCommand(this.host, {
        id: "small",
        label: () => msg("Side Comment"),
        description: () => msg("Mark the selection as a side comment"),
        icon: "letter-s",
        shortcut: "alt+shift+m",
        tags: ["mark", "advanced"]
      }),
      span: new MarkCommand(this.host, {
        id: "span",
        label: () => msg("Span"),
        description: () => msg("Mark the selection as a span"),
        icon: "rectangle",
        shortcut: "alt+shift+x",
        tags: ["mark", "advanced"]
      }),
      strong: new MarkCommand(this.host, {
        id: "strong",
        label: () => msg("Strong Importance"),
        description: () => msg("Mark the selection as strongly important"),
        icon: "bold",
        shortcut: "alt+shift+w",
        tags: ["mark", "advanced"]
      }),
      time: new MarkCommand(this.host, {
        id: "time",
        label: () => msg("Date/Time Annotation"),
        description: () => msg("Mark the selection as a date/time annotation"),
        icon: "calendar-time",
        shortcut: "alt+shift+t",
        tags: ["mark", "advanced"]
      }),
      var: new MarkCommand(this.host, {
        id: "var",
        label: () => msg("Variable"),
        description: () => msg("Mark the selection as a variable"),
        icon: "variable",
        shortcut: "alt+shift+v",
        tags: ["mark", "advanced"]
      }),
      p: new NodeCommand(this.host, {
        id: "p",
        label: () => msg("Paragraph"),
        icon: "align-justified",
        description: () => msg("Insert a paragraph"),
        group: "textblock",
        tags: ["node", "container"]
      }),
      div: new NodeCommand(this.host, {
        id: "div",
        label: () => msg("Division"),
        icon: "square",
        description: () => msg("Insert a division"),
        tags: ["node", "container", "advanced"]
      }),
      pre: new NodeCommand(this.host, {
        id: "pre",
        label: () => msg("Preformatted Text"),
        icon: "code-dots",
        description: () => msg("Insert a preformatted text block"),
        tags: ["node", "container"]
      }),
      h1: new NodeCommand(this.host, {
        id: "h1",
        label: () => msg("Heading"),
        icon: "h-1",
        description: () => msg("Insert a heading (level 1)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h2: new NodeCommand(this.host, {
        id: "h2",
        label: () => msg("Heading 2"),
        icon: "h-2",
        description: () => msg("Insert a heading (level 2)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h3: new NodeCommand(this.host, {
        id: "h3",
        label: () => msg("Heading 3"),
        icon: "h-3",
        description: () => msg("Insert a heading (level 3)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h4: new NodeCommand(this.host, {
        id: "h4",
        label: () => msg("Heading 4"),
        icon: "h-4",
        description: () => msg("Insert a heading (level 4)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h5: new NodeCommand(this.host, {
        id: "h5",
        label: () => msg("Heading 5"),
        icon: "h-5",
        description: () => msg("Insert a heading (level 5)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      h6: new NodeCommand(this.host, {
        id: "h6",
        label: () => msg("Heading 6"),
        icon: "h-6",
        description: () => msg("Insert a heading (level 6)"),
        group: "heading",
        tags: ["node", "container"]
      }),
      hgroup: new NodeCommand(this.host, {
        id: "hgroup",
        label: () => msg("Heading Group"),
        icon: "heading",
        description: () => msg("Insert a heading group")
      }),
      ul: new NodeCommand(this.host, {
        id: "ul",
        label: () => msg("List"),
        icon: "list",
        description: () => msg("Insert a list (unordered)"),
        group: "list",
        tags: ["node", "container"]
      }),
      ol: new NodeCommand(this.host, {
        id: "ol",
        label: () => msg("Ordered List"),
        icon: "list-numbers",
        description: () => msg("Insert a list (ordered)"),
        group: "list",
        tags: ["node", "container"]
      }),
      li: new NodeCommand(this.host, {
        id: "li",
        label: () => msg("List Item"),
        icon: "separator",
        description: () => msg("Insert a list item")
      }),
      form: new NodeCommand(this.host, {
        id: "form",
        label: () => msg("Form"),
        icon: "forms",
        group: "form",
        description: () => msg("Insert a form"),
        tags: ["node", "container", "advanced"]
      }),
      details: new NodeCommand(this.host, {
        id: "details",
        label: () => msg("Details"),
        icon: "circle-chevron-right",
        description: () => msg("Insert details"),
        group: "details",
        tags: ["node", "container"]
      }),
      summary: new NodeCommand(this.host, {
        id: "summary",
        label: () => msg("Summary"),
        icon: "circle-letter-s",
        description: () => msg("Insert summary")
      }),
      button: new NodeCommand(this.host, {
        id: "button",
        label: () => msg("Button"),
        icon: "square-f1",
        group: "form",
        description: () => msg("Insert a button"),
        tags: ["node", "container", "advanced"]
      }),
      input: new NodeCommand(this.host, {
        id: "input",
        label: () => msg("Input"),
        icon: "forms",
        group: "form",
        description: () => msg("Insert an input"),
        tags: ["node", "container", "advanced"]
      }),
      select: new NodeCommand(this.host, {
        id: "select",
        label: () => msg("Select"),
        icon: "select",
        group: "form",
        description: () => msg("Insert a select"),
        tags: ["node", "container", "advanced"]
      }),
      meter: new NodeCommand(this.host, {
        id: "meter",
        label: () => msg("Meter"),
        icon: "progress",
        group: "form",
        description: () => msg("Insert a meter"),
        tags: ["node", "container", "advanced"]
      }),
      datalist: new NodeCommand(this.host, {
        id: "datalist",
        label: () => msg("Data List"),
        icon: "stack-2",
        description: () => msg("Insert a data list")
      }),
      fieldset: new NodeCommand(this.host, {
        id: "fieldset",
        label: () => msg("Field Set"),
        icon: "forms",
        description: () => msg("Insert a field set")
      }),
      label: new NodeCommand(this.host, {
        id: "label",
        label: () => msg("Label"),
        icon: "capsule-horizontal",
        description: () => msg("Insert a label")
      }),
      legend: new NodeCommand(this.host, {
        id: "legend",
        label: () => msg("Legend"),
        icon: "tags",
        description: () => msg("Insert a legend")
      }),
      optgroup: new NodeCommand(this.host, {
        id: "optgroup",
        label: () => msg("Option Group"),
        icon: "circles",
        description: () => msg("Insert an option group")
      }),
      option: new NodeCommand(this.host, {
        id: "option",
        label: () => msg("Option"),
        icon: "circle",
        description: () => msg("Insert an option")
      }),
      output: new NodeCommand(this.host, {
        id: "output",
        label: () => msg("Output"),
        icon: "clipboard-text",
        group: "form",
        description: () => msg("Insert an output"),
        tags: ["node", "container", "advanced"]
      }),
      progress: new NodeCommand(this.host, {
        id: "progress",
        label: () => msg("Progress Indicator"),
        icon: "progress",
        group: "form",
        description: () => msg("Insert a progress indicator"),
        tags: ["node", "container", "advanced"]
      }),
      math: new NodeCommand(this.host, {
        id: "math",
        label: () => msg("Math Formula"),
        icon: "math",
        group: "math",
        description: () => msg("Insert a math formula"),
        tags: ["node", "container", "advanced"]
      }),      
      figure: new NodeCommand(this.host, {
        id: "figure",
        label: () => msg("Figure"),
        icon: "layout-bottombar",
        description: () => msg("Insert a figure"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      figcaption: new NodeCommand(this.host, {
        id: "figcaption",
        label: () => msg("Figure Caption"),
        icon: "text-caption",
        description: () => msg("Insert a figure caption")
      }),
      img: new NodeCommand(this.host, {
        id: "img",
        label: () => msg("Image"),
        icon: "photo",
        description: () => msg("Insert an image")
      }),
      source: new NodeCommand(this.host, {
        id: "source",
        label: () => msg("Source"),
        icon: "circles-relation",
        description: () => msg("Insert a source")
      }),
      track: new NodeCommand(this.host, {
        id: "track",
        label: () => msg("Track"),
        icon: "track",
        description: () => msg("Insert a track")
      }),
      picture: new NodeCommand(this.host, {
        id: "picture",
        label: () => msg("Picture"),
        icon: "photo",
        group: "image",
        description: () => msg("Insert a picture"),
        tags: ["node", "container"]
      }),
      audio: new NodeCommand(this.host, {
        id: "audio",
        label: () => msg("Audio"),
        icon: "music",
        group: "audio",
        description: () => msg("Insert audio"),
        tags: ["node", "container"],
        defaultAttrs: {"controls": ""}
      }),
      video: new NodeCommand(this.host, {
        id: "video",
        label: () => msg("Video"),
        icon: "movie",
        group: "video",
        description: () => msg("Insert video"),
        tags: ["node", "container"],
        defaultAttrs: {"controls": ""}
      }),
      object: new NodeCommand(this.host, {
        id: "object",
        label: () => msg("Object"),
        icon: "frame",
        description: () => msg("Insert object")
      }),
      embed: new NodeCommand(this.host, {
        id: "embed",
        label: () => msg("Embed"),
        icon: "frame",
        description: () => msg("Insert embed")
      }),
      iframe: new NodeCommand(this.host, {
        id: "iframe",
        label: () => msg("Website"),
        icon: "world-www",
        group: "site",
        description: () => msg("Insert a website (as an inline frame)"),
        tags: ["node", "container"]
      }),
      portal: new NodeCommand(this.host, {
        id: "portal",
        label: () => msg("Portal"),
        icon: "window",
        group: "site",
        description: () => msg("Insert a portal"),
        tags: ["node", "container", "advanced"]
      }),
      script: new NodeCommand(this.host, {
        id: "script",
        label: () => msg("Script"),
        icon: "script",
        group: "script",
        description: () => msg("Insert a script"),
        tags: ["node", "container", "advanced"]
      }),
      style: new NodeCommand(this.host, {
        id: "style",
        label: () => msg("Style"),
        icon: "brush",
        group: "script",
        description: () => msg("Insert a style"),
        tags: ["node", "container", "advanced"]
      }),
      template: new NodeCommand(this.host, {
        id: "template",
        label: () => msg("Template"),
        icon: "template",
        description: () => msg("Insert a template")
      }),
      slot: new NodeCommand(this.host, {
        id: "slot",
        label: () => msg("Slot"),
        icon: "outlet",
        description: () => msg("Insert a slot")
      }),
      noscript: new NodeCommand(this.host, {
        id: "noscript",
        label: () => msg("NoScript"),
        icon: "code-off",
        description: () => msg("Insert a NoScript")
      }),
      dialog: new NodeCommand(this.host, {
        id: "dialog",
        label: () => msg("Dialog"),
        icon: "app-window",
        group: "details",
        description: () => msg("Insert a dialog"),
        tags: ["node", "container", "advanced"]
      }),
      article: new NodeCommand(this.host, {
        id: "article",
        label: () => msg("Article"),
        icon: "article",
        description: () => msg("Insert an article"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      aside: new NodeCommand(this.host, {
        id: "aside",
        label: () => msg("Aside"),
        icon: "notes",
        description: () => msg("Insert an aside"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      nav: new NodeCommand(this.host, {
        id: "nav",
        label: () => msg("Navigation"),
        icon: "directions",
        description: () => msg("Insert a navigation"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      section: new NodeCommand(this.host, {
        id: "section",
        label: () => msg("Section"),
        icon: "section-sign",
        description: () => msg("Insert a section"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      header: new NodeCommand(this.host, {
        id: "header",
        label: () => msg("Header"),
        icon: "layout-navbar",
        description: () => msg("Insert a header"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      footer: new NodeCommand(this.host, {
        id: "footer",
        label: () => msg("Footer"),
        icon: "layout-bottombar",
        description: () => msg("Insert a footer"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      main: new NodeCommand(this.host, {
        id: "main",
        label: () => msg("Main"),
        icon: "news",
        description: () => msg("Insert a main"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      search: new NodeCommand(this.host, {
        id: "search",
        label: () => msg("Search"),
        icon: "list-search",
        description: () => msg("Insert a search"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),
      address: new NodeCommand(this.host, {
        id: "address",
        label: () => msg("Address"),
        icon: "address-book",
        description: () => msg("Insert an address"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),  
      blockquote: new NodeCommand(this.host, {
        id: "blockquote",
        label: () => msg("Blockquote"),
        icon: "blockquote",
        description: () => msg("Insert a blockquote"),
        group: "semanticsection",
        tags: ["node", "container", "advanced"]
      }),  
      svg: new NodeCommand(this.host, {
        id: "svg",
        label: () => msg("SVG Drawing"),
        icon: "vector",
        description: () => msg("Insert an SVG Drawing"),
        group: "svg",
        tags: ["node", "container", "advanced"]
      }),
      table: new NodeCommand(this.host, {
        id: "table",
        label: () => msg("Table"),
        icon: "table",
        group: "table",
        description: () => msg("Insert a table"),
        tags: ["node", "container", "advanced"]
      }),
      caption: new NodeCommand(this.host, {
        id: "caption",
        label: () => msg("Table Caption"),
        icon: "table-alias",
        description: () => msg("Insert a table caption")
      }),
      col: new NodeCommand(this.host, {
        id: "col",
        label: () => msg("Table Column"),
        icon: "table-column",
        description: () => msg("Insert a table column")
      }),
      colgroup: new NodeCommand(this.host, {
        id: "colgroup",
        label: () => msg("Table Column Group"),
        icon: "columns-3",
        description: () => msg("Insert a table column group")
      }),
      tbody: new NodeCommand(this.host, {
        id: "tbody",
        label: () => msg("Table Body"),
        icon: "table",
        description: () => msg("Insert a table body")
      }),
      td: new NodeCommand(this.host, {
        id: "td",
        label: () => msg("Table cell"),
        icon: "square",
        description: () => msg("Insert a table cell")
      }),
      tfoot: new NodeCommand(this.host, {
        id: "tfoot",
        label: () => msg("Table Footer"),
        icon: "table-row",
        description: () => msg("Insert a table footer")
      }),
      th: new NodeCommand(this.host, {
        id: "th",
        label: () => msg("Table header"),
        icon: "table-row",
        description: () => msg("Insert a table header row")
      }),
      thead: new NodeCommand(this.host, {
        id: "thead",
        label: () => msg("Table Head"),
        icon: "table-options",
        description: () => msg("Insert a table head")
      }),
      tr: new NodeCommand(this.host, {
        id: "tr",
        label: () => msg("Table Row"),
        icon: "table-row",
        description: () => msg("Insert a table row")
      }),
      canvas: new NodeCommand(this.host, {
        id: "br",
        label: () => msg("Canvas"),
        icon: "chalkboard",
        group: "canvas",
        description: () => msg("Insert a canvas"),
        tags: ["node", "container", "advanced"]
      }),
      fontSize:  new MarkCommand(this.host, {
        id: "fontSize",
        tags: [],
        label: () => msg("Set font size"),
        icon: "letter-case",
        description: () => msg("Sets the selection's font size"),
        run: (host, {value}) => host.activeEditor?.exec(toggleOrUpdateMark("span", {style: `font-size: ${value}`})),
        value: host => ["14pt"] || getStyleValues(host.activeEditor?.pmEditor.state!, host.activeEditor?.pmEditor as any, "font-size")
      }),
      fontFamily:  new MarkCommand(this.host, {
        id: "fontFamily",
        tags: [],
        label: () => msg("Set font family"),
        icon: "typography",
        description: () => msg("Sets the selection's font family"),
        value: host => ["Arial"] || getStyleValues(host.activeEditor?.pmEditor.state!, host.activeEditor?.pmEditor as any, "font-family")
      }),
      setTextColor: new Command(this.host, {
        id: "setTextColor",
        tags: ["mark", "color"],
        label: () => msg("Set text color"),
        icon: "letter-a",
        description: () => msg("Sets the color of the selected text"),
        run: (host, options) => host.activeEditor?.exec(toggleOrUpdateMark("textBackground", options)),
        category: "editor",
        value: host => (getActiveMarks(host.activeEditor?.editorState!).find(mark => mark.type.name === "textColor")?.attrs.value) ?? "#000000"
      }),
      setTextBackground: new Command(this.host, {
        id: "setTextBackground",
        tags: ["mark", "color"],
        label: () => msg("Set text background"),
        icon: "highlight",
        description: () => msg("Sets the background color of the selected text"),
        run: (host, options) => host.activeEditor!.exec(toggleOrUpdateMark("textBackground", options)),
        category: "editor",
        value: host => (getActiveMarks(host.activeEditor!.editorState).find(mark => mark.type.name === "textBackground")?.attrs.value) ?? "#fff000"
      }),/*
      incrementFontSize: new Command(this.host, {
        id: "incrementFontSize",
        tags: ["font", "color"],
        label: () => msg("Increment font size"),
        icon: "text-increase",
        description: () => msg("Increment the selection's font size"),
        run: () => this.commands.fontSize.run({ //@ts-ignore
          value: `${parseInt(commands.fontSize.value()) + 1}pt`
        }),
        category: "editor",
        group: "font"
      }),
      decrementFontSize: new Command(this.host, {
        id: "decrementFontSize",
        tags: ["font"],
        label: () => msg("Decrement font size"),
        icon: "text-decrease",
        description: () => msg("Decrement the selection's font size"),
        run: () => this.commands.fontSize.run({
          value: `${Math.max(0, parseInt(this.commands.fontSize.value()) - 1)}pt`
        }),
        category: "editor",
        group: "font"
      }),*/
      inspect: new Command(this.host, {
        id: "inspect",
        label: () => msg("Inspect selection"),
        description: () => msg("Inspect the selection"),
        shortcut: "ctrl+alt+y",
        icon: "info-square",
        run: host => host.activeEditor?.inspect(),
        category: "editor",
        tags: ["element"]
      }),
      edit: new Command(this.host, {
        id: "edit",
        label: () => msg("Edit selection"),
        description: () => msg("Edit the "),
        shortcut: "ctrl+alt+a",
        icon: "edit",
        run: host => host.activeEditor?.edit(),
        category: "editor",
        tags: ["element"]
      }),
      transform: new Command(this.host, {
        id: "transform",
        label: () => msg("Transform selection"),
        description: () => msg("Transform the selection"),
        shortcut: "ctrl+alt+s",
        icon: "transform",
        run: host => host.activeEditor?.transform(),
        category: "editor",
        tags: ["element"]
      }),
      copy: new Command(this.host, {
        id: "copy",
        label: () => msg("Copy selection"),
        description: () => msg("Copy the selection"),
        shortcut: "ctrl+c",
        icon: "copy",
        run: host => host.activeEditor?.copy(),
        preview: host => host.activeEditor!.editingStatus = host.activeEditor?.editingStatus !== "copying"? "copying": undefined,
        category: "editor",
        tags: ["element"],
        fixedShortcut: true
      }),
      cut: new Command(this.host, {
        id: "cut",
        label: () => msg("Cut selection"),
        description: () => msg("Cut the selection"),
        shortcut: "ctrl+x",
        icon: "cut",
        run: host => host.activeEditor?.cut(),
        preview: host => host.activeEditor!.editingStatus = host.activeEditor?.editingStatus !== "cutting"? "cutting": undefined,
        category: "editor",
        tags: ["element"],
        fixedShortcut: true
      }),
      paste: new Command(this.host, {
        id: "paste",
        label: () => msg("Cut element"),
        description: () => msg("Cut the selection"),
        shortcut: "ctrl+v",
        icon: "clipboard",
        run: host => host.activeEditor?.paste(),
        preview: host => host.activeEditor!.editingStatus = host.activeEditor?.editingStatus !== "pasting"? "pasting": undefined,
        category: "editor",
        fixedShortcut: true
      }),
      delete: new Command(this.host, {
        id: "delete",
        label: () => msg("Delete element"),
        description: () => msg("Delete the selection"),
        shortcut: "del",
        icon: "trash",
        run: host => host.activeEditor?.delete(),
        preview: host => host.activeEditor!.editingStatus = host.activeEditor?.editingStatus !== "deleting"? "deleting": undefined,
        category: "editor",
        tags: ["element"],
        fixedShortcut: true
      }),
      lineHeight: new LayoutCommand(this.host, {
        id: "lineHeight",
        label: () => msg("Set line height"),
        icon: "line-height",
        description: () => msg("Set the line height of the selected element"),
        category: "editor",
      }),
      border: new LayoutCommand(this.host, {
        id: "border",
        label: () => msg("Set element border"),
        icon: "border-style-2",
        description: () => msg("Set the border of the selected element")
      }),
      margin: new LayoutCommand(this.host, {
        id: "margin",
        label: () => msg("Set element margin"),
        icon: "box-margin",
        description: () => msg("Set the margins of the selected element")
      }),
      padding: new LayoutCommand(this.host, {
        id: "padding",
        label: () => msg("Set element padding"),
        icon: "box-padding",
        description: () => msg("Set the padding of the selected element")
      }),
      background: new LayoutCommand(this.host, {
        id: "background",
        label: () => msg("Set element background"),
        icon: "texture",
        description: () => msg("Set the background of the selected element")
      }),
      textAlign: new LayoutCommand(this.host, {
        id: "textAlign",
        label: () => msg("Align element text"),
        icon: "align-center",
        description: () => msg("Set the text alignment of the selected element")
      }),
      toggleSourceMode: new Command(this.host, {
        id: "toggleSourceMode",
        tags: ["general"],
        label: () => msg("Edit source"),
        icon: "code",
        description: () => msg("Edit the HTML of the document directly"),
        shortcut: "ctrl+u",
        run: host => {
          if(host.sourceMode) {
            host.store.document.deriveEditorState()
          }
          else {
            host.store.document.deriveCodeState()
          }
          host.sourceMode = !host.sourceMode
        },
        category: "editor",
        active: host => Boolean(host.sourceMode),
      }),
      undo: new Command(this.host, {
        id: "undo",
        tags: ["general"],
        label: () => msg("Undo"),
        icon: "arrow-back-up",
        description: () => msg("Undo the last change in the active document"),
        shortcut: "ctrl+z",
        run: host => host.activeEditor?.undo(),
        category: "editor",
        disabled: host => host.store.document.undoDepth === 0
      }),
      redo: new Command(this.host, {
        id: "redo",
        tags: ["general"],
        label: () => msg("Redo"),
        icon: "arrow-forward-up",
        description: () => msg("Redo the last undone change in the active document"),
        shortcut: "ctrl+y",
        run: host => host.activeEditor?.redo(),
        category: "editor",
        disabled: host => host.store.document.redoDepth === 0
      }),
      toggleDevTools: new Command(this.host, {
        id: "toggleDevTools",
        label: () => msg("Toggle Dev Tools"),
        icon: "terminal",
        description: () => msg("Open the developer tools"),
        shortcut: "ctrl+shift+i",
        category: "miscellaneous",
        fixedShortcut: true
      }),
      setDocAttrs: new Command(this.host, {
        id: "setDocAttrs",
        run: (host, options) => host.activeEditor?.exec(setDocAttributes(options)),
        category: "miscellaneous"
      })
    }
  }

  /*
  static sameShortcutEvent(e1: KeyboardEvent, e2: KeyboardEvent) {
    return e1.key === e2.key && e1.altKey === e2.altKey && e1.shiftKey === e2.shiftKey && e1.ctrlKey === e2.ctrlKey && e1.metaKey === e2.metaKey
  }*/
}