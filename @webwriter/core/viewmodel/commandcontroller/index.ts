import { ReactiveController } from "lit";
import Hotkeys from "hotkeys-js";
import { Memoize } from "typescript-memoize";
import { msg } from "@lit/localize";

import { CSSPropertySpecs, RootStore, getActiveMarks, getStyleValues, setDocAttributes, toggleOrUpdateMark, wrapSelection } from "#model";
import { App } from "#view";
import { groupBy } from "#utility";
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, removeRow } from "@massifrg/prosemirror-tables-sections";
import { addComment } from "#model/schemas/resource/comment.js";
import { NodeSelection, TextSelection } from "prosemirror-state";

export const WINDOW_OPTIONS = {
  fileDropEnabled: false,
  fullscreen: false,
  height: 600,
  resizable: true,
  title: "WebWriter",
  width: 800,
  minWidth: 600,
  minHeight: 600,
};

export const PICKER_COMMAND_PROPERTIES = {
  
  boxStyle: [
    "position",
    "clear",
    "margin",
    "margin-top",
    "margin-left",
    "margin-right",
    "margin-bottom",
    "border",
    "border-color",
    "border-style",
    "border-width",
    "border-top",
    "border-top-color",
    "border-top-style",
    "border-top-width",
    "border-left",
    "border-left-color",
    "border-left-style",
    "border-left-width",
    "border-right",
    "border-right-color",
    "border-right-style",
    "border-right-width",
    "border-bottom",
    "border-bottom-color",
    "border-bottom-style",
    "border-bottom-width",
    "border-radius",
    "padding",
    "padding-top",
    "padding-left",
    "padding-right",
    "padding-bottom",
    "width",
    "height",
    "min-width",
    "min-height",
    "max-width",
    "max-height",
    "aspect-ratio",
    "outline",
    "outline-width",
    "outline-color",
    "outline-style",
    "box-sizing",
    "transform",
    "transform-box",
    "translate",
    "scale",
    "rotate",
    "perspective",
    "perspective-origin",
    "transform-origin",
    "zoom",
    "transform-style",
    "backface-visibility",
    "shape-outside",
    "shape-image-threshold",
    "shape-margin",
    "shape-rendering",
    "clip-path",
    "clip-rule",
    "mask",
    "mask-type",
    "list-style-type",
    "list-style-position",
    "order",
    "align-self",
    "justify-self",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "column-span",
    "grid-area",
    "vertical-align",
    "inset",
    "top",
    "left",
    "bottom",
    "right",
    "z-index",
    "overflow",
    "overflow-x",
    "overflow-y",
    "overflow-anchor",
    "float",
    "display"
  ] as const,
  
  layoutStyle: [
    "display",
    "flex-direction",
    "row-gap",
    "column-gap",
    "flex-wrap",
    "align-content",
    "justify-content",
    "align-items",
    "justify-items",
    // "place-items",
    // "place-content",
    "grid-auto-flow",
    "grid-auto-rows",
    "grid-auto-columns",
    "grid-template",
    "border-spacing",
    "table-layout",
    "border-collapse",
    "caption-side",
    "empty-cells",
    "vertical-align",
    "object-fit",
    "object-position",
    "image-rendering",
    "image-resolution",
    "image-orientation",
    "math-style",
    "math-shift",
    "math-depth",
    "ruby-align",
    "ruby-position",
    "column-count",
    "column-width",
    "column-gap",
    "column-fill",
    "column-rule-style",
    "column-rule-width",
    "column-rule-color",
    "break-before",
    "break-inside",
    "break-after"
  ] as const,
  
  blendingStyle: [
    "color",
    "background",
    "background-color",
    "color-scheme",
    "print-color-adjust",
    "visibility",
    "content-visibility",
    "opacity",
    "mix-blend-mode",
    "background-blend-mode",
    "backdrop-filter",
    "filter",
    "isolation"
  ] as const,
  
  textStyle: [
    "text-align",
    "text-align-last",
    "text-indent",
    "writing-mode",
    "alignment-baseline",
    "dominant-baseline",
    "text-orientation",
    "text-combine-upright",
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-thickness",
    "text-decoration-color",
    "text-decoration-skip-ink",
    "text-underline-offset",
    "text-underline-position",
    "text-emphasis",
    "text-emphasis-position",
    "text-emphasis-style",
    "text-emphasis-color",
    "text-shadow",
    "text-transform",
    "line-height",
    "text-wrap",
    "text-wrap-mode",
    "text-wrap-style",
    "hyphens",
    "line-break",
    "word-break",
    "white-space-collapse",
    "tab-size",
    "word-spacing",
    "text-spacing-trim",
    "text-overflow",
    "font-family",
    "font-size",
    "font-stretch",
    "letter-spacing",
    "font-kerning",
    "font-weight",
    "font-style",
    "font-synthesis",
    "text-rendering",
    "font-feature-settings",
    "font-variant",
    "font-size-adjust",
    "font-palette",
    "font-language-override",
    "quotes",
    "hyphenate-character",
    "font-optical-sizing"
  ] as const,
  
  interactivityStyle: [
    "animation",
    "animation-composition",
    "transition",
    "accent–color",
    "caret–color",
    "cursor",
    "appearance",
    "resize",
    "user-select",
    "touch-action",
    "scrollbar-width",
    "scrollbar-color",
    "scroll-margin",
    "scroll-margin-top",
    "scroll-margin-left",
    "scroll-margin-right",
    "scroll-margin-bottom",
    "scroll-padding",
    "scroll-padding-top",
    "scroll-padding-left",
    "scroll-padding-right",
    "scroll-padding-bottom",
    "overscroll-behavior-x",
    "overscroll-behavior-y",
    "scrollbar-gutter",
    "scroll-snap-type",
    "scroll-snap-stop",
    "scroll-snap-align",
    "scroll-behavior"
  ] as const
} as const

type FieldEntry = {
  type: "string" | "number" | "boolean";
  placeholder?: string;
};

type FieldRecord<K extends string = string> = Record<K, FieldEntry>;

type FieldType<T extends FieldEntry> = T["type"] extends "string"
  ? string
  : T["type"] extends "number"
  ? number
  : boolean;

type FieldOptions<T extends FieldRecord, K extends keyof T = keyof T> = Record<
  K,
  FieldType<T[K]>
>;

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

export type CommandSpec<
  ID extends string = string,
  T extends FieldRecord = FieldRecord
> = {
  id: ID;
  /** Keyboard shortcut for the command. */
  shortcut?: {
    "pc": string,
    "mac": string
  } | string;
  /** Rough categorization of the command. */
  category?: string;
  /** Grouping for exclusive commands. */
  group?: string;
  /** Allow the default keyboard event in addition to the run. */
  allowDefault?: boolean;
  /** Whether the shortcut has been changed from the default. */
  fixedShortcut?: boolean;
  /** Fields of the command that will be passed as arguments. */
  fields?: T;
  /** Tags to classify the command. */
  tags?: string[];
  /** Icon to represent the command to the user. */
  icon?: string | ((host: App) => string);
  /** Description of the commmand for the user. */
  description?: string | ((host: App) => string);
  /** Label of the command for the user. */
  label?: string | ((host: App) => string);
  /** Callback handling the event. Receives the keyboard event and combo if the run was triggered by a keyboard shortcut. */
  run?: (host: App, options?: any, e?: Event) => any | Promise<any>;
  /** Whether the command should be disabled. */
  disabled?: (host: App) => boolean;
  /** Whether the command should be disabled. */
  active?: (host: App) => boolean;
  /** Associated value of the command. */
  value?: (host: App) => any;
  /** Callback to preview the command's result, for example on hovering a command button. */
  preview?: (host: App, options?: any, e?: Event) => any | Promise<any>;
  /** Whether the command is currently in progress. */
  loading?: (host: App) => boolean;
};

export type NodeCommandSpec<
  ID extends string = string,
  T extends FieldRecord = FieldRecord
> = CommandSpec<ID, T> & { defaultAttrs?: Record<string, any>, replaceOnly?: boolean };

export class Command<SPEC extends CommandSpec = CommandSpec>
  implements ReactiveController
{
  host: App;
  spec: SPEC;

  constructor(host: App, spec: SPEC) {
    this.spec = spec;
    (this.host = host)?.addController(this);
  }

  hostConnected(): void {
    !this.fixedShortcut && this.assignShortcut(this.shortcut);
  }

  get id() {
    return this.spec.id;
  }

  private get osShortcut() {
    const isMac = WEBWRITER_ENVIRONMENT.os.name === "Mac OS"
    if(!this.spec.shortcut) {
      return undefined
    }
    else if(typeof this.spec.shortcut === "string") {
      const modKey = isMac? "cmd": "ctrl"
      return this.spec.shortcut.replaceAll("mod", modKey).replaceAll("Mod", modKey)
    }
    else {
      return isMac? this.spec.shortcut?.mac: this.spec.shortcut?.pc
    }
  }

  /** Keyboard shortcut for the command. */
  get shortcut() {
    return this.configuredShortcut ?? this.osShortcut
  }
  set shortcut(value: string) {
    if (this.fixedShortcut) {
      return;
    }
    this.assignShortcut(value, this.shortcut);
  }
  get configuredShortcut() {
    return this.host.store.get("ui", "keymap")[this.id]?.shortcut;
  }

  assignShortcut = (newShortcut: string, oldShortcut?: string) => {
    oldShortcut && Hotkeys.unbind(oldShortcut);
    Hotkeys(newShortcut, (e) => this.run(undefined, e));
  };

  /** Label of the command for the user. */
  get tags() {
    return this.spec.tags;
  }
  /** Description of the commmand for the user. */
  get label() {
    return typeof this.spec.label === "string" || !this.spec.label
      ? this.spec.label
      : this.spec.label(this.host);
  }
  /** Description of the commmand for the user. */
  get description() {
    return typeof this.spec.description === "string" || !this.spec.description
      ? this.spec.description
      : this.spec.description(this.host);
  }
  /** Icon to represent the command to the user. */
  get icon() {
    return typeof this.spec.icon === "string" || !this.spec.icon
      ? this.spec.icon
      : this.spec.icon(this.host);
  }
  /** Rough categorization of the command. */
  get category() {
    return this.spec.category;
  }
  /** Grouping for exclusive commands. */
  get group() {
    return this.spec.group;
  }
  /** Whether the shortcut has been changed from the default. */
  get modified() {
    return !!this.configuredShortcut;
  }
  /** Whether to disallow changing the shortcut. */
  get fixedShortcut() {
    return this.spec.fixedShortcut;
  }
  /** Allow the default keyboard event in addition to the run. */
  get allowDefault() {
    return this.spec.allowDefault;
  }
  /** Fields of the command that will be passed as arguments. */
  get fields() {
    return this.spec.fields;
  }
  /** Whether the command should be disabled. */
  get disabled() {
    return !this.spec.disabled || !this.host.activeEditor
      ? false
      : this.spec.disabled(this.host);
  }
  /** Whether the command should be disabled. */
  get active() {
    return !this.spec.active || !this.host.activeEditor
      ? false
      : this.spec.active(this.host);
  }
  /** Associated value of the command. */
  get value() {
    return !this.spec.value || !this.host.activeEditor
      ? undefined
      : this.spec.value(this.host);
  }

  get loading() {
    return this.spec.loading && this.spec.loading(this.host);
  }

  /** Callback to preview the command's result, for example on hovering a command button. */
  preview(options?: any, e?: Event, preview = this.spec.preview ?? (() => {})) {
    if (!this.disabled && this.host.activeEditor) {
      return preview(this.host, options, e);
    }
  }

  run(options?: any, e?: Event, run = this.spec.run ?? (() => {})) {
    if (e && !this.allowDefault) {
      e.preventDefault();
    }
    if (!this.disabled && this.host.activeEditor) {
      try {
        return run(this.host, options, e);
      } catch (err) {
        console.error(err);
        throw err;
      }
    }
  }

  toObject() {
    const {
      id,
      tags,
      label,
      description,
      icon,
      category,
      group,
      shortcut,
      modified,
      fixedShortcut,
      allowDefault,
      fields,
      disabled,
      active,
      value,
      loading,
    } = this;
    return {
      id,
      tags,
      label,
      description,
      icon,
      category,
      group,
      modified,
      shortcut,
      fixedShortcut,
      allowDefault,
      fields,
      disabled,
      active,
      value,
      loading,
    };
  }
}

export class NodeCommand<
  SPEC extends NodeCommandSpec = NodeCommandSpec
> extends Command<SPEC> {
  get tags() {
    return this.spec.tags ?? ["node"];
  }
  get category() {
    return this.spec.category ?? "editor";
  }
  run(options?: any, e?: Event) {
    const { exec, editorState } = this.host.activeEditor ?? { exec: () => {} };
    this.host.activeEditor!.editingStatus = undefined;
    return super.run(options, e, this.spec.run ?? ((host, attrs) =>
      exec(wrapSelection(this.id, { ...attrs, ...this.spec.defaultAttrs }, this.spec.replaceOnly))
    ));
  }
  get active() {
    return this.spec.active
      ? this.spec.active(this.host)
      : !!this.host.store.document.activeNodeMap[this.id];
  }
  get value() {
    return this.spec.value
      ? this.spec.value(this.host)
      : this.host.store.document.activeNodeMap[this.id];
  }
  preview(options?: any, e?: Event) {
    return super.preview(options, e, (host) => {
      host.activeEditor!.editingStatus =
        host.activeEditor?.editingStatus !== "inserting"
          ? "inserting"
          : undefined;
    });
  }
}

export class MarkCommand<
  SPEC extends CommandSpec = CommandSpec
> extends Command<SPEC> {
  get tags() {
    return this.spec.tags ?? ["mark"];
  }
  get category() {
    return this.spec.category ?? "editor";
  }

  run(options?: any, e?: Event) {
    const { exec } = this.host.activeEditor ?? { exec: () => {} };
    return super.run(
      options,
      e,
      this.spec.run ??
        ((host, options) => exec(toggleOrUpdateMark(this.id, options)))
    );
  }
  get active() {
    return this.spec.active
      ? this.spec.active(this.host)
      : !!this.host.store.document.activeMarkMap[this.id];
  }
  get value() {
    return this.spec.value
      ? this.spec.value(this.host)
      : this.host.store.document.activeMarkMap[this.id];
  }
}

export class LayoutCommand<
  SPEC extends CommandSpec = CommandSpec
> extends Command<SPEC> {

  get tags() {
    return this.spec.tags ?? ["layout"];
  }
  get category() {
    return this.spec.category ?? "editor";
  }

  run(options?: any, e?: Event) {
    if (this.host.activeEditor) {
      return super.run(
        options,
        e,
        (host, options) =>
          (this.host.activeEditor!.toolbox.activeLayoutCommand =
            this.host.activeEditor!.toolbox.activeLayoutCommand !== this
              ? this
              : undefined)
      );
    }
  }

  get active() {
    return Boolean((PICKER_COMMAND_PROPERTIES as any)[this.id]?.some((name: string) => this.host.activeEditor?.activeElement?.style.getPropertyValue(name)))
  }
}

export class CommandController implements ReactiveController {
  host: App;
  store: RootStore;

  constructor(host: App, store: RootStore) {
    this.store = store;
    (this.host = host).addController(this);
  }

  hostConnected() {}

  queryCommands = (
    query:
      | keyof typeof this.commands
      | { id?: string; category?: string; tags?: string[] }
  ) => {
    if (typeof query === "string") {
      return [this.commands[query]];
    } else {
      return Object.values(this.commands).filter(
        (v) =>
          true &&
          (!query.id || v.id === query.id) &&
          (!query.category || v.category === query.category) &&
          (!query.tags || query.tags?.some((t) => v.tags?.includes(t)))
      );
    }
  };

  @Memoize() get markCommands() {
    return this.queryCommands({ tags: ["mark"] });
  }

  @Memoize() get nodeCommands() {
    return this.queryCommands({ tags: ["node"] });
  }

  @Memoize() get groupedNodeCommands() {
    return groupBy(this.nodeCommands, "group");
  }

  @Memoize() get groupedContainerCommands() {
    return Object.values(groupBy(this.containerCommands, "group"));
  }

  @Memoize() get containerCommands() {
    return this.queryCommands({ tags: ["container"] }).filter(
      (cmd) => !cmd.tags?.includes("advanced")
    );
  }

  @Memoize() get semanticMarkCommands() {
    return this.queryCommands({ tags: ["semanticmark"] }).filter(
      (cmd) => !cmd.tags?.includes("advanced")
    );
  }

  @Memoize() get layoutCommands() {
    return this.queryCommands({ tags: ["layout"] });
  }

  @Memoize() get generalCommands() {
    return this.queryCommands({ tags: ["general"] });
  }

  @Memoize() get fontCommands() {
    return this.queryCommands({ tags: ["font"] });
  }

  @Memoize() get fontFamilyCommand() {
    return this.queryCommands("fontFamily")[0];
  }

  @Memoize() get fontSizeCommand() {
    return this.queryCommands("fontSize")[0];
  }

  @Memoize() get clearFormattingCommand() {
    return this.queryCommands("clearFormatting")[0];
  }

  @Memoize() get documentCommands() {
    return this.queryCommands({ category: "document" });
  }

  @Memoize() get appCommands() {
    return this.queryCommands({ category: "app" });
  }

  @Memoize() get phrasingCommands() {
    return this.queryCommands({ tags: ["phrasing"] });
  }

  @Memoize() get elementCommands() {
    return this.queryCommands({ tags: ["element"] });
  }

  @Memoize() get tableCommands() {
    return this.queryCommands({ tags: ["table"] });
  }

  @Memoize() get saveCommand() {
    return this.queryCommands({ id: "save" })[0];
  }

  @Memoize() get openCommand() {
    return this.queryCommands({ id: "open" })[0];
  }

  @Memoize() get deleteDocumentCommand() {
    return this.queryCommands({ id: "deleteDocument" })[0];
  }

  @Memoize() get preventedShortcuts() {
    const ctrlKey = ["ctrl", "control", "^"];
    const altKey = ["alt", "option", "⌥"];
    const shiftKey = ["shift", "⇧"];
    const metaKey = ["cmd", "command", "⌘"];
    const modifiers = [...ctrlKey, ...altKey, ...shiftKey, ...metaKey];
    return Object.values(this.commands)
      .filter((cmd) => cmd.shortcut && !cmd.allowDefault)
      .map((cmd) => cmd.shortcut)
      .map((code) => {
        const parts = code.split("+");
        const ctrl = parts.some((part) => ctrlKey.includes(part.toLowerCase()));
        const alt = parts.some((part) => altKey.includes(part.toLowerCase()));
        const shift = parts.some((part) =>
          shiftKey.includes(part.toLowerCase())
        );
        const meta = parts.some((part) => metaKey.includes(part.toLowerCase()));
        const key = parts.find(
          (part) => !modifiers.includes(part.toLowerCase())
        );
        return [
          ctrl ? "ctrl" : undefined,
          alt ? "alt" : undefined,
          shift ? "shift" : undefined,
          meta ? "meta" : undefined,
          key,
        ]
          .filter((k) => k)
          .join("+");
      });
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
      document: msg("Document"),
      app: msg("App"),
      editor: msg("Editor"),
      miscellaneous: msg("Miscellaneous"),
    };
  }

  @Memoize() get commands() {
    return {
      save: new Command(this.host, {
        id: "save",
        label: () => msg("Save"),
        icon: "device-floppy",
        description: () => msg("Save the active document"),
        shortcut: "mod+s",
        allowDefault: false,
        run: async (host, options) => {
          if (
            host.store.accounts.size === 1 ||
            (options?.client && options?.serializer) ||
            host.store.document.url
          ) {
            const url = await host.store.document.save(
              options?.saveAs,
              options?.serializer,
              options?.client,
              options?.metadata,
              options?.url
            );
            if (url) {
              host.dialog = undefined;
            }
          } else {
            host.dialog = "save";
          }
        },
        category: "document",
        disabled: (host) =>
          host.activeEditor!.mode !== "edit" ||
          host.store.document.ioState !== "idle",
      }),
      saveAs: new Command(this.host, {
        id: "saveAs",
        label: () => msg("Save As"),
        icon: "file-export",
        description: () => msg("Save the active document as a copy"),
        shortcut: "mod+shift+s",
        run: async (host, options) => {
          if (host.store.accounts.size === 1) {
            const url = await host.store.document.save(true);
            if (url) {
              host.dialog = undefined;
            }
          } else {
            host.dialog = "save";
          }
        },
        category: "document",
        disabled: (host) =>
          host.activeEditor!.mode !== "edit" ||
          host.store.document.ioState !== "idle",
      }),
      deleteDocument: new Command(this.host, {
        id: "deleteDocument",
        label: () => msg("Delete document"),
        icon: "trash",
        description: () => msg("Delete a document"),
        run: async (host, options) => {
          if (options.client && "deleteDocument" in options.client) {
            await options.client.deleteDocument(options.url);
            this.store.document.url = undefined;
          }
        },
      }),
      /** New share:
       * If not saved and not shared: Cloud-save and share
       * If cloud-saved and not shared: Share
       * If local-saved and not shared: Cloud-save and share
       * If cloud-saved and shared: Overwrite
       */
      share: new Command(this.host, {
        id: "share",
        label: () => msg("Share"),
        icon: "share",
        description: () => msg("Share the active document"),
        shortcut: "mod+l",
        run: (host) => (host.dialog = "share"),
        category: "document",
        disabled: (host) =>
          host.activeEditor!.mode === "source" ||
          host.store.accounts.size === 1 ||
          !("getSharingURLForDocument" in (host.store.document.client ?? {})),
      }),
      print: new Command(this.host, {
        id: "print",
        label: () => msg("Print"),
        icon: "printer",
        description: () => msg("Print the active document"),
        shortcut: "mod+p",
        run: (host) => {
          host.activeEditor?.pmEditor.window.focus();
          host.activeEditor?.pmEditor.iframe.contentWindow.print();
        },
        category: "document",
        disabled: (host) => host.activeEditor!.mode !== "edit",
      }),
      undo: new Command(this.host, {
        id: "undo",
        tags: ["general"],
        label: () => msg("Undo"),
        icon: "arrow-back-up",
        description: () => msg("Undo the last change in the active document"),
        shortcut: "mod+z",
        run: (host) => host.activeEditor?.undo(),
        category: "editor",
        disabled: (host) => host.store.document.undoDepth === 0 || host.activeEditor!.mode === "preview",
      }),
      redo: new Command(this.host, {
        id: "redo",
        tags: ["general"],
        label: () => msg("Redo"),
        icon: "arrow-forward-up",
        description: () =>
          msg("Redo the last undone change in the active document"),
        shortcut: "mod+y",
        run: (host) => host.activeEditor?.redo(),
        category: "editor",
        disabled: (host) => host.store.document.redoDepth === 0 || host.activeEditor!.mode === "preview",
      }),
      toggleTestMode: new Command(this.host, {
        id: "toggleTestMode",
        label: () => msg("Test"),
        icon: "checklist",
        description: () => msg("Toggles the test mode for the active document"),
        shortcut: "mod+alt+b",
        run: async (host) => {
          if(host.activeEditor!.mode !== "test") {
            await host.store.packages.loadTestEnvironment()
          }
          else {
            host.store.packages.testState = undefined
            host.store.packages.testBundleID = undefined
          }
          host.activeEditor!.mode = host.activeEditor!.mode === "test"? "edit": "test"
          host.requestUpdate();
        },
        category: "editor",
        tags: ["general"],
        disabled: (host) => host.store.document.ioState === "loadingPreview" || !host.store.packages.local.length,
        loading: (host) => host.store.packages.testLoading,
        active: (host) => host.activeEditor!.mode === "test"
      }),
      toggleSourceMode: new Command(this.host, {
        id: "toggleSourceMode",
        tags: ["general"],
        label: () => msg("Edit source"),
        icon: "code",
        description: () => msg("Edit the HTML of the document directly"),
        shortcut: "mod+u",
        run: async (host) => {
          if (host.activeEditor!.mode === "source") {
            host.store.document.deriveEditorState();
            host.activeEditor!.mode = "edit"
          } else {
            host.store.document.deriveCodeState();
            host.activeEditor!.mode = "source"
          }
          host.requestUpdate();
        },
        category: "editor",
        disabled: (host) => !host.store.ui.showSourceEditor,
        active: (host) => host.activeEditor!.mode === "source",
      }),
      togglePreviewMode: new Command(this.host, {
        id: "togglePreviewMode",
        label: () => msg("Preview"),
        icon: "eye",
        description: () => msg("Toggles the preview for the active document"),
        shortcut: "mod+b",
        run: async (host) => {
          if (host.activeEditor!.mode !== "preview") {
            host.activeEditor!.previewSrc = await host.store.document.preview();
            host.activeEditor!.mode = "preview"
          } else {
            host.activeEditor!.mode = "edit"
          }
          host.requestUpdate();
        },
        category: "editor",
        tags: ["general"],
        disabled: (host) => host.store.document.ioState === "loadingPreview",
        active: (host) => host.activeEditor!.mode === "preview",
        loading: (host) => host.store.document.ioState === "loadingPreview",
      }),
      editHead: new Command(this.host, {
        id: "editHead",
        label: () => msg("Edit Metadata"),
        icon: "chevron-right",
        description: () => msg("Toggles the metadata editor"),
        shortcut: "mod+h",
        run: (host) => (host.foldOpen = !host.foldOpen),
        category: "document",
        disabled: (host) => host.activeEditor!.mode !== "edit",
      }),
      openSettings: new Command(this.host, {
        id: "openSettings",
        label: () => msg("Open Settings"),
        icon: "settings-filled",
        description: () => msg("Opens the settings"),
        shortcut: "mod+i",
        run: (host) => open("./settings.html", undefined, "popup"),
        category: "app",
      }),
      open: new Command(this.host, {
        id: "open",
        label: () => msg("Open"),
        icon: "file-symlink",
        shortcut: "mod+o",
        description: () => msg("Open a document"),
        run: async (host, options) => {
          if (host.store.accounts.size === 1) {
            await host.store.document.load(options?.url);
          } else if (!options?.parser || !options?.client) {
            host.dialog = "open";
            return;
          } else {
            let url = options.url
            if(!options.url) {
              url = await options.client.pickLoad();
            }
            const data = await host.store.document.load(
              url,
              options.parser,
              options.client
            );
            if (data) {
              host.dialog = undefined;
            }
          }
          try {
            await host.backups.restore()
          }
          catch(err) {
            console.error(err)
          }
        },
        disabled: host => host.activeEditor!.mode !== "edit",
        category: "app",
      }),
      create: new Command(this.host, {
        id: "create",
        label: () => msg("Create"),
        icon: "file-plus",
        description: () => msg("Create a new document"),
        shortcut: "mod+n",
        run: (host) => window.open("."),
        category: "app",
      }),
      /*discard: new Command(this.host, {
        id: "discard",
        label: () => msg("Discard"),
        tags: ["active"],
        icon: "file-x",
        description: () => msg("Close the active document"),
        shortcut: "mod+w",
        run: () => this.store.resources.discard(),
        category: "document"
      }),*/
      br: new NodeCommand(this.host, {
        id: "br",
        label: () => msg("Line Break"),
        icon: "arrow-forward",
        description: () => msg("Insert a line break"),
      }),
      wbr: new NodeCommand(this.host, {
        id: "wbr",
        label: () => msg("Line Break Opportunity"),
        icon: "arrow-forward",
        description: () => msg("Insert a line break opportunity"),
      }),
      b: new MarkCommand(this.host, {
        id: "b",
        label: () => msg("Bold"),
        icon: "bold",
        description: () => msg("Mark the selection as bold"),
        shortcut: "alt+shift+b",
      }),
      i: new MarkCommand(this.host, {
        id: "i",
        label: () => msg("Italic"),
        icon: "italic",
        description: () => msg("Mark the selection as italic"),
        shortcut: "alt+shift+i",
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
      a: new MarkCommand(this.host, {
        id: "a",
        label: () => msg("Link"),
        icon: "link",
        description: () => msg("Mark the selection as a link"),
        shortcut: "alt+shift+k",
        fields: {
          href: {
            type: "string",
            placeholder: "https://example.com",
          },
        },
      }),
      sup: new MarkCommand(this.host, {
        id: "sup",
        label: () => msg("Superscript"),
        icon: "superscript",
        description: () => msg("Mark the selection as a superscript"),
        shortcut: "alt+shift+o",
        group: "supsub",
        tags: ["mark", "advanced"],
      }),
      sub: new MarkCommand(this.host, {
        id: "sub",
        label: () => msg("Subscript"),
        icon: "subscript",
        description: () => msg("Mark the selection as a subscript"),
        shortcut: "alt+shift+l",
        tags: ["mark", "advanced"],
      }),
      code: new MarkCommand(this.host, {
        id: "code",
        label: () => msg("Code"),
        icon: "code",
        description: () => msg("Mark the selection as code"),
        shortcut: "alt+shift+c",
        tags: ["mark", "advanced"],
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
            placeholder: msg("Citation Source"),
          },
        },
        tags: ["mark", "advanced"],
      }),
      kbd: new MarkCommand(this.host, {
        id: "kbd",
        label: () => msg("Keyboard Shortcut"),
        description: () => msg("Mark the selection as a keyboard shortcut"),
        shortcut: "alt+shift+p",
        icon: "command",
        tags: ["mark", "advanced"],
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
            placeholder: msg("Full Term"),
          },
        },
        tags: ["mark", "advanced"],
      }),
      bdi: new MarkCommand(this.host, {
        id: "bdi",
        label: () => msg("Bidirectional Isolate"),
        description: () =>
          msg("Mark the selection as a 'bidirectional isolate'"),
        icon: "text-direction-ltr",
        shortcut: "alt+shift+g",
        tags: ["mark", "advanced"],
      }),
      bdo: new MarkCommand(this.host, {
        id: "bdo",
        label: () => msg("Bidirectional Override"),
        description: () =>
          msg("Mark the selection as a 'bidirectional override'"),
        icon: "text-direction-ltr",
        shortcut: "alt+shift+h",
        tags: ["mark", "advanced"],
      }),
      cite: new MarkCommand(this.host, {
        id: "cite",
        label: () => msg("Citation Source"),
        description: () => msg("Mark the selection as a citation source"),
        icon: "letter-c",
        shortcut: "alt+shift+j",
        tags: ["mark", "advanced"],
      }),
      data: new MarkCommand(this.host, {
        id: "data",
        label: () => msg("Data Annotation"),
        description: () => msg("Mark the selection with a data annotation"),
        icon: "circle-dot",
        shortcut: "alt+shift+f",
        tags: ["mark", "advanced"],
      }),
      del: new MarkCommand(this.host, {
        id: "del",
        label: () => msg("Deletion"),
        description: () => msg("Mark the selection as a deletion"),
        icon: "pencil-minus",
        shortcut: "alt+shift+d",
        tags: ["mark", "advanced"],
      }),
      dfn: new MarkCommand(this.host, {
        id: "dfn",
        label: () => msg("Defined Term"),
        description: () => msg("Mark the selection as a defined term"),
        icon: "vocabulary",
        shortcut: "alt+shift+t",
        tags: ["mark", "advanced"],
      }),
      em: new MarkCommand(this.host, {
        id: "em",
        label: () => msg("Emphasis"),
        description: () => msg("Mark the selection as emphasized"),
        icon: "italic",
        shortcut: "alt+shift+z",
        tags: ["mark", "advanced"],
      }),
      ins: new MarkCommand(this.host, {
        id: "ins",
        label: () => msg("Insertion"),
        description: () => msg("Mark the selection as an insertion"),
        icon: "pencil-plus",
        shortcut: "alt+shift+y",
        tags: ["mark", "advanced"],
      }),
      ruby: new MarkCommand(this.host, {
        id: "ruby",
        label: () => msg("Ruby Annotation"),
        description: () => msg("Mark the selection with a ruby annotation"),
        icon: "letter-r",
        shortcut: "alt+shift+r",
        tags: ["mark", "advanced"],
      }),
      samp: new MarkCommand(this.host, {
        id: "samp",
        label: () => msg("Sample Output"),
        description: () => msg("Mark the selection as sample output"),
        icon: "source-code",
        shortcut: "alt+shift+n",
        tags: ["mark", "advanced"],
      }),
      small: new MarkCommand(this.host, {
        id: "small",
        label: () => msg("Side Comment"),
        description: () => msg("Mark the selection as a side comment"),
        icon: "letter-s",
        shortcut: "alt+shift+m",
        tags: ["mark", "advanced"],
      }),
      strong: new MarkCommand(this.host, {
        id: "strong",
        label: () => msg("Strong Importance"),
        description: () => msg("Mark the selection as strongly important"),
        icon: "bold",
        shortcut: "alt+shift+w",
        tags: ["mark", "advanced"],
      }),
      time: new MarkCommand(this.host, {
        id: "time",
        label: () => msg("Date/Time Annotation"),
        description: () => msg("Mark the selection as a date/time annotation"),
        icon: "calendar-time",
        shortcut: "alt+shift+t",
        tags: ["mark", "advanced"],
      }),
      var: new MarkCommand(this.host, {
        id: "var",
        label: () => msg("Variable"),
        description: () => msg("Mark the selection as a variable"),
        icon: "variable",
        shortcut: "alt+shift+v",
        tags: ["mark", "advanced"],
      }),
      span: new MarkCommand(this.host, {
        id: "span",
        label: () => msg("Span"),
        description: () => msg("Mark the selection as a span"),
        icon: "rectangle",
        shortcut: "alt+shift+x",
        tags: ["mark", "advanced"],
      }),
      p: new NodeCommand(this.host, {
        id: "p",
        label: () => msg("Paragraph"),
        icon: "align-justified",
        description: () => msg("Insert a paragraph"),
        group: "paragraph",
        tags: ["node", "container"],
      }),
      pre: new NodeCommand(this.host, {
        id: "pre",
        label: () => msg("Preformatted Text"),
        icon: "code-dots",
        description: () => msg("Insert a preformatted text block"),
        group: "paragraph",
        tags: ["node", "container"],
      }),
      hr: new NodeCommand(this.host, {
        id: "hr",
        label: () => msg("Thematic Break"),
        icon: "separator",
        description: () =>
          msg(
            "Insert a thematic break (usually displayed as a horizontal line)"
          ),
        group: "paragraph",
        tags: ["node", "container"],
      }),
      h1: new NodeCommand(this.host, {
        id: "h1",
        label: () => msg("Heading"),
        icon: "h-1",
        description: () => msg("Insert a heading (level 1)"),
        group: "heading",
        tags: ["node", "container"],
      }),
      h2: new NodeCommand(this.host, {
        id: "h2",
        label: () => msg("Heading 2"),
        icon: "h-2",
        description: () => msg("Insert a heading (level 2)"),
        group: "heading",
        tags: ["node", "container"],
      }),
      h3: new NodeCommand(this.host, {
        id: "h3",
        label: () => msg("Heading 3"),
        icon: "h-3",
        description: () => msg("Insert a heading (level 3)"),
        group: "heading",
        tags: ["node", "container"],
      }),
      h4: new NodeCommand(this.host, {
        id: "h4",
        label: () => msg("Heading 4"),
        icon: "h-4",
        description: () => msg("Insert a heading (level 4)"),
        group: "heading",
        tags: ["node", "container"],
      }),
      h5: new NodeCommand(this.host, {
        id: "h5",
        label: () => msg("Heading 5"),
        icon: "h-5",
        description: () => msg("Insert a heading (level 5)"),
        group: "heading",
        tags: ["node", "container"],
      }),
      h6: new NodeCommand(this.host, {
        id: "h6",
        label: () => msg("Heading 6"),
        icon: "h-6",
        description: () => msg("Insert a heading (level 6)"),
        group: "heading",
        tags: ["node", "container"],
      }),
      hgroup: new NodeCommand(this.host, {
        id: "hgroup",
        label: () => msg("Heading Group"),
        icon: "heading",
        group: "heading",
        description: () => msg("Insert a heading group"),
      }),
      ul: new NodeCommand(this.host, {
        id: "ul",
        label: () => msg("List"),
        icon: "list",
        description: () => msg("Insert a list (unordered)"),
        group: "list",
        tags: ["node", "container"],
      }),
      ol: new NodeCommand(this.host, {
        id: "ol",
        label: () => msg("Ordered List"),
        icon: "list-numbers",
        description: () => msg("Insert a list (ordered)"),
        group: "list",
        tags: ["node", "container"],
      }),
      details: new NodeCommand(this.host, {
        id: "details",
        label: () => msg("Details"),
        icon: "circle-chevron-right",
        description: () => msg("Insert details"),
        run: host => host.activeEditor!.exec(wrapSelection("summary")),
        group: "interactive",
        tags: ["node", "container"],
      }),
      summary: new NodeCommand(this.host, {
        id: "summary",
        label: () => msg("Summary"),
        icon: "circle-letter-s",
        description: () => msg("Insert summary"),
      }),
      table: new NodeCommand(this.host, {
        id: "table",
        label: () => msg("Table"),
        icon: "table",
        group: "table",
        description: () => msg("Insert a table"),
        run: host => host.activeEditor!.exec(wrapSelection(["tbody", "td"])),
        tags: ["node", "container"],
      }),
      caption: new NodeCommand(this.host, {
        id: "caption",
        label: () => msg("Table Caption"),
        icon: "table-options",
        description: () => msg("Insert a table caption"),
      }),
      col: new NodeCommand(this.host, {
        id: "col",
        label: () => msg("Table Column"),
        icon: "table-column",
        description: () => msg("Insert a table column"),
      }),
      colgroup: new NodeCommand(this.host, {
        id: "colgroup",
        label: () => msg("Table Column Group"),
        icon: "columns-3",
        description: () => msg("Insert a table column group"),
      }),
      tbody: new NodeCommand(this.host, {
        id: "tbody",
        label: () => msg("Table Body"),
        icon: "table-alias",
        description: () => msg("Insert a table body"),
      }),
      td: new NodeCommand(this.host, {
        id: "td",
        label: () => msg("Table cell"),
        icon: "square",
        description: () => msg("Insert a table cell"),
      }),
      tfoot: new NodeCommand(this.host, {
        id: "tfoot",
        label: () => msg("Table Footer"),
        icon: "table-alias",
        description: () => msg("Insert a table footer"),
      }),
      th: new NodeCommand(this.host, {
        id: "th",
        label: () => msg("Table header"),
        icon: "table-row",
        description: () => msg("Insert a table header row"),
      }),
      thead: new NodeCommand(this.host, {
        id: "thead",
        label: () => msg("Table Head"),
        icon: "table-alias",
        description: () => msg("Insert a table head"),
      }),
      tr: new NodeCommand(this.host, {
        id: "tr",
        label: () => msg("Table Row"),
        icon: "table-row",
        description: () => msg("Insert a table row"),
      }),
      picture: new NodeCommand(this.host, {
        id: "picture",
        label: () => msg("Picture"),
        icon: "photo",
        group: "image",
        description: () => msg("Insert a picture"),
        tags: ["node", "container"],
      }),
      svg: new NodeCommand(this.host, {
        id: "svg",
        label: () => msg("Vector Drawing"),
        icon: "circle-square",
        description: () => msg("Insert a vector drawing (SVG)"),
        group: "vector",
        tags: ["node", "container"],
      }),
      source: new NodeCommand(this.host, {
        id: "source",
        label: () => msg("Source"),
        icon: "circles-relation",
        description: () => msg("Insert a source"),
      }),
      track: new NodeCommand(this.host, {
        id: "track",
        label: () => msg("Track"),
        icon: "track",
        description: () => msg("Insert a track"),
      }),
      audio: new NodeCommand(this.host, {
        id: "audio",
        label: () => msg("Audio"),
        icon: "music",
        group: "audio",
        description: () => msg("Insert audio"),
        tags: ["node", "container"],
        defaultAttrs: { controls: "" },
      }),
      video: new NodeCommand(this.host, {
        id: "video",
        label: () => msg("Video"),
        icon: "movie",
        group: "video",
        description: () => msg("Insert video"),
        tags: ["node", "container"],
        defaultAttrs: { controls: "" },
      }),
      iframe: new NodeCommand(this.host, {
        id: "iframe",
        label: () => msg("Website"),
        icon: "world-www",
        description: () => msg("Insert a website (as an inline frame)"),
        tags: ["node", "container"],
        group: "frame",
      }),
      math: new NodeCommand(this.host, {
        tag: "math_inline",
        id: "math_inline",
        label: () => msg("Math Formula"),
        icon: "math",
        group: "math",
        description: () => msg("Insert a math formula"),
        tags: ["node", "container"],
        replaceOnly: true
      }),
      portal: new NodeCommand(this.host, {
        id: "portal",
        label: () => msg("Portal"),
        icon: "window",
        group: "frame",
        description: () => msg("Insert a portal"),
        tags: ["node", "container", "advanced"],
      }),
      script: new NodeCommand(this.host, {
        id: "script",
        label: () => msg("Script"),
        icon: "script",
        group: "script",
        description: () => msg("Insert a script"),
        tags: ["node", "container", "advanced"],
      }),
      style: new NodeCommand(this.host, {
        id: "style",
        label: () => msg("Style"),
        icon: "brush",
        group: "script",
        description: () => msg("Insert a style"),
        tags: ["node", "container", "advanced"],
      }),
      template: new NodeCommand(this.host, {
        id: "template",
        label: () => msg("Template"),
        icon: "template",
        description: () => msg("Insert a template"),
      }),
      slot: new NodeCommand(this.host, {
        id: "slot",
        label: () => msg("Slot"),
        icon: "outlet",
        description: () => msg("Insert a slot"),
      }),
      noscript: new NodeCommand(this.host, {
        id: "noscript",
        label: () => msg("NoScript"),
        icon: "code-off",
        description: () => msg("Insert a NoScript"),
      }),
      fontSize: new MarkCommand(this.host, {
        id: "fontSize",
        tags: [],
        label: () => msg("Set font size"),
        icon: "letter-case",
        description: () => msg("Sets the selection's font size"),
        run: (host, { value }) =>
          host.activeEditor?.exec(
            toggleOrUpdateMark("_fontsize", { value }, true)
          ),
        value: (host) =>
          getStyleValues(
            host.activeEditor?.pmEditor.state!,
            host.activeEditor?.pmEditor as any,
            "font-size"
          ),
        active: () => !!this.host.store.document.activeMarkMap["_fontsize"],
      }),
      fontFamily: new MarkCommand(this.host, {
        id: "fontFamily",
        tags: [],
        label: () => msg("Set font family"),
        icon: "typography",
        description: () => msg("Sets the selection's font family"),
        run: (host, { value }) =>
          host.activeEditor?.exec(
            toggleOrUpdateMark("_fontfamily", { value }, true)
          ),
        value: (host) =>
          getStyleValues(
            host.activeEditor?.pmEditor.state!,
            host.activeEditor?.pmEditor as any,
            "font-family"
          ),
        active: () => !!this.host.store.document.activeMarkMap["_fontfamily"],
      }),
      setTextColor: new Command(this.host, {
        id: "setTextColor",
        tags: ["mark", "color"],
        label: () => msg("Set text color"),
        icon: "letter-a",
        description: () => msg("Sets the color of the selected text"),
        run: (host, { value }) =>
          host.activeEditor?.exec(toggleOrUpdateMark("_color", { value })),
        category: "editor",
        value: () => "#000000",
        active: () => !!this.host.store.document.activeMarkMap["_color"],
      }),
      setTextBackground: new Command(this.host, {
        id: "setTextBackground",
        tags: ["mark", "color"],
        label: () => msg("Set text background"),
        icon: "highlight",
        description: () =>
          msg("Sets the background color of the selected text"),
        run: (host, { value }) =>
          host.activeEditor?.exec(toggleOrUpdateMark("_background", { value })),
        category: "editor",
        value: (host) => "#fff000",
        active: () => !!this.host.store.document.activeMarkMap["_background"],
      }),
      clearFormatting: new Command(this.host, {
        id: "clearFormatting",
        label: () => msg("Clear formatting"),
        icon: "clear-formatting",
        description: () =>
          msg("Removes all text formatting from the selection"),
        run: (host) => {
          const state = host.activeEditor?.pmEditor.state;
          if (state) {
            const { from, to } = state.selection;
            const tr = state.tr.removeMark(from, to).setStoredMarks(null);
            host.activeEditor?.pmEditor.dispatch(tr);
          }
        },
        category: "editor",
        disabled: (host) =>
          getActiveMarks(host.activeEditor!.editorState).length === 0 ||
          (host.activeEditor!.editorState.selection.empty &&
            !host.activeEditor!.editorState.storedMarks?.length),
      }),
      copy: new Command(this.host, {
        id: "copy",
        label: () => msg("Copy selection"),
        description: () => msg("Copy the selection"),
        shortcut: "mod+c",
        allowDefault: true,
        icon: "copy",
        run: (host) => {
          host.activeEditor?.copy();
          host.activeEditor!.editingStatus = undefined;
        },
        preview: (host) =>
          (host.activeEditor!.editingStatus =
            host.activeEditor?.editingStatus !== "copying"
              ? "copying"
              : undefined),
        disabled: host => host.activeEditor!.selection.empty,
        category: "editor",
        tags: ["element"],
        fixedShortcut: true,
      }),
      cut: new Command(this.host, {
        id: "cut",
        label: () => msg("Cut selection"),
        description: () => msg("Cut the selection"),
        shortcut: "mod+x",
        allowDefault: true,
        icon: "cut",
        run: (host) => {
          host.activeEditor?.cut();
          host.activeEditor!.editingStatus = undefined;
        },
        preview: (host) =>
          (host.activeEditor!.editingStatus =
            host.activeEditor?.editingStatus !== "cutting"
              ? "cutting"
              : undefined),
        disabled: host =>  host.activeEditor!.selection.empty,
        category: "editor",
        tags: ["element"],
        fixedShortcut: true,
      }),
      paste: new Command(this.host, {
        id: "paste",
        label: () => msg("Cut element"),
        description: () => msg("Cut the selection"),
        shortcut: "mod+v",
        allowDefault: true,
        icon: "clipboard",
        run: (host) => {
          host.activeEditor?.paste();
          host.activeEditor!.editingStatus = undefined;
        },
        preview: (host) =>
          (host.activeEditor!.editingStatus =
            host.activeEditor?.editingStatus !== "pasting"
              ? "pasting"
              : undefined),
        category: "editor",
        fixedShortcut: true,
      }),
      delete: new Command(this.host, {
        id: "delete",
        label: () => msg("Delete element"),
        description: () => msg("Delete the selection"),
        shortcut: "del",
        icon: "trash",
        run: (host) => {
          host.activeEditor?.delete();
          host.activeEditor!.editingStatus = undefined;
        },
        preview: (host) =>
          (host.activeEditor!.editingStatus =
            host.activeEditor?.editingStatus !== "deleting"
              ? "deleting"
              : undefined),
        disabled: host =>  host.activeEditor!.selection.empty,
        category: "editor",
        tags: ["element"],
        fixedShortcut: true,
      }),
      edit: new Command(this.host, {
        id: "edit",
        label: () => msg("Edit selection"),
        description: () => msg("Edit the selection"),
        shortcut: "mod+alt+a",
        icon: "edit",
        disabled: host =>  true, // || host.activeEditor!.isGapSelected,
        run: (host) => host.activeEditor?.edit(),
        category: "editor",
        tags: ["element"],
      }),
      pinSelection: new Command(this.host, {
        id: "pinSelection",
        label: () => msg("Pin selection"),
        description: () => msg("Pin the selection as a snippet in the palette"),
        shortcut: "mod+alt+p",
        icon: "pin",
        disabled: host => host.activeEditor!.selection.empty || host.activeEditor!.isGapSelected,
        preview: host => host.activeEditor!.editingStatus = host.activeEditor?.editingStatus !== "pinning"? "pinning": undefined,
        run: async host => {host.activeEditor!.palette.managing= true; await host.activeEditor!.pin(); host.activeEditor!.palette.focusSnippetTitle()},
        category: "editor",
        tags: ["element"],
      }),
      comment: new Command(this.host, {
        id: "_comment",
        label: () => msg("Comment selection"),
        description: () => msg("Comment selection"),
        shortcut: "mod+alt+c",
        icon: "message",
        preview: (host) =>
          (host.activeEditor!.editingStatus =
            host.activeEditor?.editingStatus !== "commenting"
              ? "commenting"
              : undefined),
        run: host => {
          console.log(host.activeEditor!.selection?.node?.attrs)
          if(!host.store.document.activeMarkMap["_comment"] && !(host.activeEditor!.selection instanceof NodeSelection && host.activeEditor!.selection.node.attrs["=comment"])) {
            host.activeEditor!.exec(addComment((host.store.accounts.getAccount("pocketbase") as any)?.email))
          }
          host.activeEditor!.toolbox.activeLayoutCommand = host.activeEditor!.toolbox.activeLayoutCommand?.id !== "_comment"? {id: "_comment", label: ""}: undefined
          if(host.activeEditor!.toolbox.activeLayoutCommand) {
            setTimeout(() => host.activeEditor!.toolbox.focusComments())
          }
        },
        disabled: host => !host.store.document.activeMarkMap["_comment"] && !(host.activeEditor!.selection instanceof NodeSelection && host.activeEditor!.selection.node.attrs["=comment"]) && !(host.activeEditor?.selection instanceof TextSelection && !host.activeEditor?.selection.empty || host.activeEditor?.selection instanceof NodeSelection), // || host.activeEditor!.isGapSelected,
        value: host => getActiveMarks(host.activeEditor!.state, false).filter(mark => mark.type.name === "_comment"),
        active: host => !!host.store.document.activeMarkMap["_comment"] || host.activeEditor!.selection instanceof NodeSelection && host.activeEditor!.selection.node.attrs["=comment"],
        category: "editor",
        tags: ["element"],
      }),
      /*
      grammar_check: new Command(this.host, {
        id: "grammar_check",
        label: () => msg("Spell Check"),
        tags: ["general"],
        icon: "text-spellcheck",

        description: () => msg("Checks the document for grammar errors"),
        shortcut: "mod+g",
        run: async (host) => {
          await host.store.document.spellcheck();
        },
        category: "editor",
        active: (host) => host.store.document.ioState === "grammarActive",
        disabled: (host) =>
          host.activeEditor!.sourceMode ||
          host.store.document.ioState === "loadingGrammar" ||
          (host.store.document.lang !== "en" &&
            host.store.document.lang !== "de"),
        loading: (host) => host.store.document.ioState === "loadingGrammar",
      }),
      translate: new Command(this.host, {
        id: "translate",
        label: () => msg("Translate"),
        tags: ["general"],
        icon: "language",

        description: () => msg("Translates part of the document"),
        shortcut: "mod+g",
        run: async (host) => {
          await host.store.document.translate();
        },
        category: "editor",
        disabled: (host) =>
          host.activeEditor!.sourceMode ||
          host.store.document.ioState === "loadingTranslation",

        loading: (host) => host.store.document.ioState === "loadingTranslation",
      }),*/
      boxStyle: new LayoutCommand(this.host, {
        id: "boxStyle",
        label: () => WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? msg("This feature is unavailable in Firefox. It is available in Chrome or Edge."): msg("Position/Shape"),
        icon: "box-margin",
        description: () => msg("Set the size, padding, and margins of the selected elements"), // "css-border-collapse"
        tags: ["layout"],
        active: host => PICKER_COMMAND_PROPERTIES.boxStyle.some(name => host.activeEditor?.activeElement?.style.getPropertyValue(name)),
        disabled: host => host.activeEditor!.isGapSelected || WEBWRITER_ENVIRONMENT.engine.name === "Gecko",
      }),
      layoutStyle: new LayoutCommand(this.host, {
        // + flex/grid/table/list container options
        id: "layoutStyle",
        label: () => WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? msg("This feature is unavailable in Firefox. It is available in Chrome or Edge."): msg("Layout"),
        icon: "layout",
        description: () => msg("Set the layout of the selected elements"),
        category: "editor",
        tags: [
          "layout",
          "css-display",
          "css-flex-direction",
          "css-flex-flow",
          "css-flex-wrap",
          "css-grid",
          "css-gap",
          "css-place-content",
          "css-place-items",
          "css-border-collapse",
          "css-border-spacing",
          "css-caption-side",
          "css-empty-cells",
          "css-table-layout",
          "css-list-style",
          "css-box-decoration-break",
          "css-columns",
          "css-column-rule",
          "css-column-gap",
          "css-image-orientation",
          "css-image-rendering",
          "css-image-resolution",
          "css-object-fit",
          "css-object-position",
          "css-place-self",
          "css-vertical-align",
          "css-inset",
          "css-float",
          "css-clear",
          "css-position",
          "css-z-index",
          "css-order",
          "css-page",
          "css-break-before",
          "css-break-inside",
          "css-break-after",
          "css-orphans",
          "css-widows",
          "css-column-fill",
          "css-column-span",
          "css-flex",
          "css-grid-area",
        ],
        disabled: host => host.activeEditor!.isGapSelected || WEBWRITER_ENVIRONMENT.engine.name === "Gecko",
      }),
      textStyle: new LayoutCommand(this.host, {
        id: "textStyle",
        label: () => WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? msg("This feature is unavailable in Firefox. It is available in Chrome or Edge."):msg("Text Style"),
        icon: "align-left",
        description: () => msg("Set text style (alignment, indentation, spacing, etc.) of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "css-hyphens",
          "css-hyphenate-character",
          "css-hyphenate-limit-chars",
          "css-letter-spacing",
          "css-line-break",
          "css-overflow-wrap",
          "css-tab-size",
          "css-text-align",
          "css-text-align-last",
          "css-text-indent",
          "css-text-justify",
          "css-text-transform",
          "css-text-wrap",
          "css-white-space",
          "css-white-space-collapse",
          "css-word-break",
          "css-word-spacing",
          "css-text-decoration",
          "css-text-emphasis",
          "css-text-shadow",
          "css-text-underline-offset",
          "css-text-underline-position",
          "css-quotes",
          "css-word-wrap",
          "css-font",
          "css-direction",
          "css-text-combine-upright",
          "css-text-orientation",
          "css-unicode-bidi",
          "css-writing-mode",
          "css-ruby-align",
          "css-ruby-position",
        ],
        active: host => PICKER_COMMAND_PROPERTIES.textStyle.some(name => host.activeEditor?.activeElement?.style.getPropertyValue(name)),
        disabled: host => host.activeEditor!.isGapSelected || WEBWRITER_ENVIRONMENT.engine.name === "Gecko",
      }),
      blendingStyle: new LayoutCommand(this.host, {
        // + opacity
        id: "blendingStyle",
        label: () => WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? msg("This feature is unavailable in Firefox. It is available in Chrome or Edge."): msg("Colors/Effects"),
        icon: "brightness",
        description: () => msg("Set filters, color, and blending of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "css-color",
          "css-color-scheme",
          "css-opacity",
          "css-visibility",
          "css-content-visibility",
          "css-isolation",
          "css-mix-blend-mode",
          "css-background-blend-mode",
          "css-filter",
          "css-backdrop-filter",
          "css-background",
          "css-background-position-x",
          "css-background-position-y",
        ],
        disabled: host => host.activeEditor!.isGapSelected || WEBWRITER_ENVIRONMENT.engine.name === "Gecko",
      }),
      interactivityStyle: new LayoutCommand(this.host, {
        id: "interactivityStyle",
        label: () => WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? msg("This feature is unavailable in Firefox. It is available in Chrome or Edge."): msg("Interactivity"),
        icon: "hand-click",
        description: () => msg("Set interactivity options for selected elements"),
        category: "editor",
        tags: [
          "layout",
          "css-accent-color",
          "css-appearance",
          "css-caret-color",
          "css-cursor",
          "css-pointer-events",
          "css-resize",
          "css-user-select",
          "css-touch-action",
          "css-scroll-behavior",
          "css-scroll-margin",
          "css-scroll-padding",
          "css-scrollbar-gutter",
          "css-scrollbar-width",
          "css-scrollbar-color",
          "css-overscroll-behavior",
          "css-scroll-snap-align",
          "css-scroll-snap-stop",
          "css-scroll-snap-type",
        ],
        disabled: host => host.activeEditor!.isGapSelected || WEBWRITER_ENVIRONMENT.engine.name === "Gecko",
      }),
      /*filterStyle: new LayoutCommand(this.host, {
        id: "filterStyle",
        label: () => msg("Filters & Colors"),
        icon: "filters",
        description: () =>
          msg(
            "Apply filters (blur, invert, etc.) to and set colors for the selected elements"
          ),
        category: "editor",
        tags: [
          "layout",
          "advanced",
        ],
      }),*/
      /*fragmentationStyle: new LayoutCommand(this.host, {
        // + paged media
        id: "fragmentationStyle",
        label: () => msg("Fragmentation"),
        icon: "section",
        description: () =>
          msg(
            "Set fragmentation (behaviour on page/region/column breaks) of selected elements"
          ),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-box-decoration-break",
          "css-break-before",
          "css-break-inside",
          "css-break-after",
          "css-orphans",
          "css-widows",
        ],
      }),*/
      /*imageStyle: new LayoutCommand(this.host, {
        // only on replaced elements
        id: "imageStyle",
        label: () => msg("Image sizing"),
        icon: "picture-in-picture-off",
        description: () => msg("Set image sizing options of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-image-orientation",
          "css-image-rendering",
          "css-image-resolution",
          "css-object-fit",
          "css-object-position",
        ],
        disabled: host => host.activeEditor!.isGapSelected,
      }),*/
      /*columnStyle: new LayoutCommand(this.host, {
        id: "columnStyle",
        label: () => msg("Column break"),
        icon: "columns",
        description: () => msg("Apply column layout to selected elements"),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-columns",
          "css-column-rule",
          "css-column-fill",
          "css-column-gap",
          "css-column-span",
        ],
      }),*/
      /*positionStyle: new LayoutCommand(this.host, {
        id: "positionStyle",
        label: () => msg("Positioning"),
        icon: "box-align-bottom-right",
        description: () => msg("Set positioning of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-place-self",
          "css-vertical-align",
          "css-inset",
          "css-float",
          "css-clear",
          "css-position",
          "css-z-index",
          "css-order",
          "css-break-before",
          "css-break-inside",
          "css-break-after",
          "css-orphans",
          "css-widows",
          "css-column-fill",
          "css-column-span",
        ],
        disabled: host => host.activeEditor!.isGapSelected,
      }),*/
      /*overflowStyle: new LayoutCommand(this.host, {
        // + overscroll, scrollbars styling
        id: "overflowStyle",
        label: () => msg("Overflow behavior"),
        icon: "layers-difference",
        description: () => msg("Set overflow behaviour of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "css-overflow",
          "css-overflow-clip-margin",
          "css-scroll-behavior",
          "css-scroll-margin",
          "css-scroll-padding",
          "css-scrollbar-gutter",
          "css-text-overflow",
          "css-scrollbar-width",
          "css-scrollbar-color",
          "css-overscroll-behavior",
          "css-scroll-snap-align",
          "css-scroll-snap-stop",
          "css-scroll-snap-type",
        ],
        disabled: host => host.activeEditor!.isGapSelected,
      }),*/
      /*shapeStyle: new LayoutCommand(this.host, {
        // + mask
        id: "shapeStyle",
        label: () => msg("Shaping"),
        icon: "triangle-square-circle",
        description: () => msg("Set shape of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-shape-image-threshold",
          "css-shape-margin",
          "css-shape-outside",
          "css-clip-path",
          "css-clip-rule",
          "css-mask",
          "css-mask-border",
          "css-mask-type",
          "css-flex",
          "css-grid-area",
        ],
        disabled: host => host.activeEditor!.isGapSelected,
      }),*/
      /*transformStyle: new LayoutCommand(this.host, {
        id: "transformStyle",
        label: () => msg("2D/3D transform"),
        icon: "transform-point",
        description: () =>
          msg("Apply 2D or 3D transformations to selected elements"),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-backface-visibility",
          "css-perspective",
          "css-perspective-origin",
          "css-rotate",
          "css-scale",
          "css-translate",
          "css-transform",
          "css-transform-box",
          "css-transform-origin",
          "css-transform-style",
          "css-translate",
        ],
        disabled: host => host.activeEditor!.isGapSelected,
      }),*/
      /*writingModeStyle: new LayoutCommand(this.host, {
        // + ruby layout
        id: "writingModeStyle",
        label: () => msg("Writing mode"),
        icon: "text-direction-ltr",
        description: () => msg("Set writing mode options of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "advanced",
          "css-direction",
          "css-text-combine-upright",
          "css-text-orientation",
          "css-unicode-bidi",
          "css-writing-mode",
          "css-ruby-align",
          "css-ruby-position",
        ],
      }),*/
      miscellaneousStyle: new LayoutCommand(this.host, {
        // --custom and all
        id: "miscellaneousStyle",
        label: () => WEBWRITER_ENVIRONMENT.engine.name === "Gecko"? msg("This feature is unavailable in Firefox. It is available in Chrome or Edge."): msg("Miscellaneous"),
        icon: "dots-circle-horizontal",
        description: () => msg("Set other style options of selected elements"),
        category: "editor",
        tags: [
          "layout",
          "css-custom",/*
          "css-contain",
          "css-container",
          "css-content",
          "css-counter-increment",
          "css-counter-reset",
          "css-counter-set",
          "css-will-change",
          "css-paint-order",
          "css-print-color-adjust"*/
        ],
        disabled: host => host.activeEditor!.isGapSelected || WEBWRITER_ENVIRONMENT.engine.name === "Gecko",
      }),
      toggleDevTools: new Command(this.host, {
        id: "toggleDevTools",
        label: () => msg("Toggle Dev Tools"),
        icon: "terminal",
        description: () => msg("Open the developer tools"),
        shortcut: "mod+shift+i",
        category: "miscellaneous",
        fixedShortcut: true,
      }),
      toggleToolbox: new Command(this.host, {
        id: "toggleToolbox",
        label: () => msg("Toggle Toolbox"),
        icon: "tools",
        description: () => msg("Open or close the toolbox (only on narrow screens, otherwise, the toolbox is always visible on the side)."),
        run: host => {host.activeEditor!.forceToolboxPopup = !host.activeEditor!.forceToolboxPopup; host.activeEditor?.palette.requestUpdate()},
        active: host => !!host.activeEditor!.forceToolboxPopup,
        shortcut: "contextmenu",
        category: "miscellaneous",
        fixedShortcut: true,
      }),
      setDocAttrs: new Command(this.host, {
        id: "setDocAttrs",
        run: (host, options) =>
          host.activeEditor?.exec(setDocAttributes(options)),
        category: "miscellaneous",
      }),
      insertTableColumnBefore: new Command(this.host, {
        id: "insertTableColumnBefore",
        icon: "column-insert-left",
        label: () => msg("Insert column before"),
        run: (host) => host.activeEditor?.exec(addColumnBefore),
        category: "editor",
        tags: ["table"] 
      }),
      insertTableColumnAfter: new Command(this.host, {
        id: "insertTableColumnAfter",
        icon: "column-insert-right",
        label: () => msg("Insert column after"),
        run: (host) => host.activeEditor?.exec(addColumnAfter),
        category: "editor",
        tags: ["table"] 
      }),
      insertTableRowBefore: new Command(this.host, {
        id: "insertTableRowBefore",
        icon: "row-insert-top",
        label: () => msg("Insert row before"),
        run: (host) => host.activeEditor?.exec(addRowBefore),
        category: "editor",
        tags: ["table"]
      }),
      insertTableRowAfter: new Command(this.host, {
        id: "insertTableRowAfter",
        icon: "row-insert-bottom",
        label: () => msg("Insert row after"),
        run: (host) => host.activeEditor?.exec(addRowAfter),
        category: "editor",
        tags: ["table"] 
      }),
      removeRow: new Command(this.host, {
        id: "removeRow",
        icon: "row-remove",
        label: () => msg("Remove row"),
        run: (host) => host.activeEditor?.exec(deleteRow),
        category: "editor",
        tags: ["table"] 
      }),
      removeColumn: new Command(this.host, {
        id: "removeColumn",
        icon: "column-remove",
        label: () => msg("Remove column"),
        run: (host) => host.activeEditor?.exec(deleteColumn),
        category: "editor",
        tags: ["table"] 
      }),
      li: new NodeCommand(this.host, {
        id: "li",
        label: () => msg("List item"),
        icon: "point"
      }),
      area: new NodeCommand(this.host, {
        id: "area",
        label: () => msg("Clickable area"),
        icon: "click"
      }),
      map: new NodeCommand(this.host, {
        id: "map",
        label: () => msg("Clickable map"),
        icon: "click"
      }),
      dd: new NodeCommand(this.host, {
        id: "dd",
        label: () => msg("Definition item"),
        icon: "label"
      }),
      dt: new NodeCommand(this.host, {
        id: "dt",
        label: () => msg("Definition term"),
        icon: "label"
      }),
      fencedframe: new NodeCommand(this.host, {
        id: "fencedframe",
        label: () => msg("Fenced Website"),
        icon: "world-www"
      }),
      menu: new NodeCommand(this.host, {
        id: "menu",
        label: () => msg("Menu"),
        icon: "adjustments-horizontal",
        // group: "list",
        // tags: ["node", "container"],
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
      dialog: new NodeCommand(this.host, {
        id: "dialog",
        label: () => msg("Dialog"),
        icon: "app-window",
        description: () => msg("Insert a dialog")
      }),
      canvas: new NodeCommand(this.host, {
        id: "br",
        label: () => msg("Canvas"),
        icon: "chalkboard",
        description: () => msg("Insert a canvas")
      }),
      img: new NodeCommand(this.host, {
        id: "img",
        label: () => msg("Image"),
        icon: "photo",
        description: () => msg("Insert an image")
      }),
      dl: new NodeCommand(this.host, {
        id: "dl",
        label: () => msg("Description List"),
        icon: "list-letters",
        description: () => msg("Insert a description list (glossary, term list)"),
        // group: "list",
        // tags: ["node", "container"],
      }),
      button: new NodeCommand(this.host, {
        id: "button",
        label: () => msg("Button"),
        icon: "square-f1",
        description: () => msg("Insert a button")
      }),
      input: new NodeCommand(this.host, {
        id: "input",
        label: () => msg("Input"),
        icon: "forms",
        description: () => msg("Insert an input")
      }),
      textarea: new NodeCommand(this.host, {
        id: "textarea",
        label: () => msg("Textarea"),
        icon: "forms",
        description: () => msg("Insert an textarea")
      }),
      select: new NodeCommand(this.host, {
        id: "select",
        label: () => msg("Select"),
        icon: "select",
        description: () => msg("Insert a select")
      }),
      meter: new NodeCommand(this.host, {
        id: "meter",
        label: () => msg("Meter"),
        icon: "progress",
        description: () => msg("Insert a meter")
      }),
      datalist: new NodeCommand(this.host, {
        id: "datalist",
        label: () => msg("Data List"),
        icon: "stack-2",
        description: () => msg("Insert a data list"),
      }),
      fieldset: new NodeCommand(this.host, {
        id: "fieldset",
        label: () => msg("Field Set"),
        icon: "forms",
        description: () => msg("Insert a field set"),
      }),
      label: new NodeCommand(this.host, {
        id: "label",
        label: () => msg("Label"),
        icon: "capsule-horizontal",
        description: () => msg("Insert a label"),
      }),
      legend: new NodeCommand(this.host, {
        id: "legend",
        label: () => msg("Legend"),
        icon: "tags",
        description: () => msg("Insert a legend"),
      }),
      optgroup: new NodeCommand(this.host, {
        id: "optgroup",
        label: () => msg("Option Group"),
        icon: "circles",
        description: () => msg("Insert an option group"),
      }),
      option: new NodeCommand(this.host, {
        id: "option",
        label: () => msg("Option"),
        icon: "circle",
        description: () => msg("Insert an option"),
      }),
      output: new NodeCommand(this.host, {
        id: "output",
        label: () => msg("Output"),
        icon: "clipboard-text",
        description: () => msg("Insert an output")
      }),
      progress: new NodeCommand(this.host, {
        id: "progress",
        label: () => msg("Progress"),
        icon: "progress",
        description: () => msg("Insert a progress indicator")
      }),
      div: new MarkCommand(this.host, {
        id: "div",
        label: () => msg("Group"),
        icon: "section-sign",
        description: () => msg("Insert a group"),
        tags: []
      }),
      section: new MarkCommand(this.host, {
        id: "section",
        label: () => msg("Section"),
        icon: "section-sign",
        description: () => msg("Insert a section"),
        tags: []
      }),
      figure: new MarkCommand(this.host, {
        id: "figure",
        label: () => msg("Figure"),
        icon: "layout-bottombar",
        description: () => msg("Insert a figure"),
        tags: []
      }),  
      article: new MarkCommand(this.host, {
        id: "article",
        label: () => msg("Article"),
        icon: "article",
        description: () => msg("Insert an article"),
        tags: []
      }),
      header: new MarkCommand(this.host, {
        id: "header",
        label: () => msg("Header"),
        icon: "layout-navbar",
        description: () => msg("Insert a header"),
        tags: []
      }),
      main: new MarkCommand(this.host, {
        id: "main",
        label: () => msg("Main"),
        icon: "news",
        description: () => msg("Insert a main"),
        tags: []
      }),
      aside: new MarkCommand(this.host, {
        id: "aside",
        label: () => msg("Aside"),
        icon: "notes",
        description: () => msg("Insert an aside"),
        tags: []
      }),
      footer: new NodeCommand(this.host, {
        id: "footer",
        label: () => msg("Footer"),
        icon: "layout-bottombar",
        description: () => msg("Insert a footer"),
        tags: []
      }),
      nav: new MarkCommand(this.host, {
        id: "nav",
        label: () => msg("Navigation"),
        icon: "directions",
        description: () => msg("Insert a navigation"),
        tags: []
      }),
      blockquote: new MarkCommand(this.host, {
        id: "blockquote",
        label: () => msg("Blockquote"),
        icon: "blockquote",
        description: () => msg("Insert a blockquote"),
        tags: []
      }),
      search: new MarkCommand(this.host, {
        id: "search",
        label: () => msg("Search"),
        icon: "list-search",
        description: () => msg("Insert a search"),
        tags: []
      }),
      address: new MarkCommand(this.host, {
        id: "address",
        label: () => msg("Address"),
        icon: "address-book",
        description: () => msg("Insert an address"),
        tags: []
      }), 
      form: new NodeCommand(this.host, {
        id: "form",
        label: () => msg("Form"),
        icon: "forms",
        description: () => msg("Insert a form")
      }),
      figcaption: new NodeCommand(this.host, {
        id: "figcaption",
        label: () => msg("Figure Caption"),
        icon: "text-caption",
        description: () => msg("Insert a figure caption")
      })
    } as const satisfies Record<string, Command>;
  }

  /*
  static sameShortcutEvent(e1: KeyboardEvent, e2: KeyboardEvent) {
    return e1.key === e2.key && e1.altKey === e2.altKey && e1.shiftKey === e2.shiftKey && e1.ctrlKey === e2.ctrlKey && e1.metaKey === e2.metaKey
  }*/
}
