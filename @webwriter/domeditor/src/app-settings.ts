import {isOnApple} from "./utility"
import {hasStandardMarkShortcut, primaryMarkOptions, secondaryMarkOptions} from "./marks"
import {graphicArrangeOperations, graphicShapeOptions, graphicViewportOperations} from "./graphic"

export const APP_SETTINGS_STORAGE_KEY = "webwriter_app_settings_v1"

export type AppCommand = {
  id: string
  section: "Document" | "Editor" | "Text" | "Insert" | "Table" | "Graphic"
  label: string
  description: string
  icon: string
  action: string
  defaultShortcut?: (applePlatform: boolean) => string
  legacyShortcuts?: (applePlatform: boolean) => string[]
}

const primary = (key: string) => (applePlatform: boolean) => `${applePlatform ? "Meta" : "Ctrl"}+${key}`
const alternate = (key: string) => (_applePlatform: boolean) => `Alt+Shift+${key}`

const operationLabel = (operation: string) => operation
  .split("-")
  .map((part, index) => index ? part : `${part[0].toLocaleUpperCase()}${part.slice(1)}`)
  .join(" ")

/** User-facing application commands. Keeping this list declarative lets the
 * settings UI and keyboard dispatcher share one source of truth. */
export const appCommands: readonly AppCommand[] = [
  {id: "document.new", section: "Document", label: "New", description: "Create a new document", icon: "New", action: "New"},
  {id: "document.open", section: "Document", label: "Open", description: "Open a document", icon: "Open", action: "Open"},
  {id: "document.save", section: "Document", label: "Save", description: "Save the active document", icon: "Save", action: "Save", defaultShortcut: primary("S")},
  {id: "document.saveAs", section: "Document", label: "Save as", description: "Save the active document as a copy", icon: "Save as", action: "Save as", defaultShortcut: apple => `${apple ? "Meta" : "Ctrl"}+Shift+S`},
  {id: "document.print", section: "Document", label: "Print", description: "Print the active document", icon: "Print", action: "Print", defaultShortcut: primary("P")},
  {id: "document.download", section: "Document", label: "Download", description: "Download the active document", icon: "Download", action: "Download"},
  {id: "editor.undo", section: "Editor", label: "Undo", description: "Undo the last document change", icon: "Undo", action: "Undo", defaultShortcut: primary("Z")},
  {
    id: "editor.redo", section: "Editor", label: "Redo", description: "Redo the last undone document change",
    icon: "Redo", action: "Redo",
    defaultShortcut: apple => apple ? "Meta+Shift+Z" : "Ctrl+Y",
    legacyShortcuts: apple => apple ? [] : ["Ctrl+Shift+Z"],
  },
  {id: "editor.preview", section: "Editor", label: "Preview", description: "Toggle the document preview", icon: "Preview", action: "Preview"},
  ...primaryMarkOptions.map(option => ({
    id: `text.${option.name}`,
    section: "Text" as const,
    label: option.label,
    description: `Toggle ${option.label.toLocaleLowerCase()} formatting`,
    icon: option.icon,
    action: `mark:${option.name}`,
    defaultShortcut: hasStandardMarkShortcut(option)
      ? primary(option.shortcutKey!.toLocaleUpperCase())
      : alternate(option.shortcutKey!.toLocaleUpperCase()),
    legacyShortcuts: hasStandardMarkShortcut(option)
      ? (apple: boolean) => [alternate(option.shortcutKey!.toLocaleUpperCase())(apple)]
      : undefined,
  })),
  ...secondaryMarkOptions.map(option => ({
    id: `text.${option.name}`,
    section: "Text" as const,
    label: option.label,
    description: `Toggle ${option.label.toLocaleLowerCase()} formatting`,
    icon: option.icon,
    action: `mark-detail:${option.name}`,
  })),
  {id: "text.clear", section: "Text", label: "Clear formatting", description: "Remove text formatting", icon: "Clear", action: "removeMarks"},
  {id: "text.increase", section: "Text", label: "Increase font size", description: "Increase the selected text size", icon: "IncreaseFontSize", action: "increaseFontSize"},
  {id: "text.decrease", section: "Text", label: "Decrease font size", description: "Decrease the selected text size", icon: "DecreaseFontSize", action: "decreaseFontSize"},
  ...[
    ["paragraph", "Paragraph", "Paragraph", "Paragraph"],
    ["section", "Section", "Section", "Section"],
    ["heading", "Heading", "Heading", "Heading 1"],
    ["details", "Details", "Details", "insert-details"],
    ["list", "List", "List", "toggle-list:ul"],
    ["table", "Table", "Table", "Table"],
    ["image", "Image", "Image", "Image"],
    ["graphic", "Graphic", "Graphic", "Graphic"],
    ["audio", "Audio", "Audio", "Audio"],
    ["website", "Website", "Website", "Website"],
    ["video", "Video", "Video", "Video"],
    ["formula", "Formula", "Formula", "Formula"],
    ["form", "Form", "Form", "Form"],
    ["script", "Script", "Develop", "Script"],
  ].map(([id, label, icon, action]) => ({
    id: `insert.${id}`,
    section: "Insert" as const,
    label,
    description: `Insert ${label.toLocaleLowerCase()} content`,
    icon,
    action,
  })),
  ...[
    ["rowAbove", "Row above", "TableRowAbove", "table-row-above"],
    ["rowBelow", "Row below", "TableRowBelow", "table-row-below"],
    ["columnLeft", "Column left", "TableColumnLeft", "table-column-left"],
    ["columnRight", "Column right", "TableColumnRight", "table-column-right"],
    ["merge", "Merge cells", "TableMergeCells", "table-merge-cells"],
    ["splitCells", "Split cells", "TableSplitCells", "table-split-cells"],
    ["split", "Split table", "TableSplit", "table-split"],
    ["caption", "Caption", "TableCaption", "table-caption"],
  ].map(([id, label, icon, action]) => ({
    id: `table.${id}`,
    section: "Table" as const,
    label,
    description: `${label} in the active table`,
    icon,
    action,
  })),
  ...graphicShapeOptions.flatMap(shape => [{
    id: `graphic.insert.${shape.type}`,
    section: "Graphic" as const,
    label: `Insert ${shape.label}`,
    description: `Insert a graphic containing a ${shape.label.toLocaleLowerCase()}`,
    icon: shape.icon,
    action: `insert-graphic-shape:${shape.type}`,
  }, {
    id: `graphic.add.${shape.type}`,
    section: "Graphic" as const,
    label: `Add ${shape.label}`,
    description: `Add a ${shape.label.toLocaleLowerCase()} to the active graphic`,
    icon: shape.icon,
    action: `add-graphic-shape:${shape.type}`,
  }]),
  ...graphicArrangeOperations.map(operation => ({
    id: `graphic.arrange.${operation}`,
    section: "Graphic" as const,
    label: operationLabel(operation),
    description: `${operationLabel(operation)} in the active graphic`,
    icon: operationLabel(operation),
    action: `arrange-graphic:${operation}`,
  })),
  ...graphicViewportOperations.filter(operation => operation !== "set-zoom").map(operation => ({
    id: `graphic.view.${operation}`,
    section: "Graphic" as const,
    label: operationLabel(operation),
    description: `${operationLabel(operation)} in the graphic canvas`,
    icon: operation === "fit-content" ? "Fullscreen" : "Zoom",
    action: `navigate-graphic:${operation}`,
  })),
] as const

export type AppSettings = {
  language: string
  updateDocumentLanguage: boolean
  shortcuts: Record<string, string>
}

export function defaultAppSettings(applePlatform = isOnApple()): AppSettings {
  return {
    language: "en",
    updateDocumentLanguage: true,
    shortcuts: Object.fromEntries(appCommands.map(command => [
      command.id,
      command.defaultShortcut?.(applePlatform) ?? "",
    ])),
  }
}

export function loadAppSettings(): AppSettings {
  const defaults = defaultAppSettings()
  try {
    const stored = globalThis.localStorage?.getItem(APP_SETTINGS_STORAGE_KEY)
    if(!stored) return defaults
    const value = JSON.parse(stored) as Partial<AppSettings>
    const shortcuts = value.shortcuts && typeof value.shortcuts === "object"
      ? Object.fromEntries(appCommands.map(command => [
        command.id,
        typeof value.shortcuts?.[command.id] === "string"
          ? value.shortcuts[command.id]
          : defaults.shortcuts[command.id],
      ]))
      : defaults.shortcuts
    return {
      language: typeof value.language === "string" && value.language ? value.language : defaults.language,
      updateDocumentLanguage: typeof value.updateDocumentLanguage === "boolean"
        ? value.updateDocumentLanguage
        : defaults.updateDocumentLanguage,
      shortcuts,
    }
  }
  catch {
    return defaults
  }
}

export function persistAppSettings(settings: AppSettings) {
  try {
    globalThis.localStorage?.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }
  catch {
    // Settings remain active for this session when storage is unavailable.
  }
}

const keyFromEvent = (event: KeyboardEvent) => {
  if(/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  if(/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if(/^F(?:[1-9]|1[0-2])$/.test(event.key)) return event.key
  if(event.key === " ") return "Space"
  if(event.key.length === 1) return event.key.toLocaleUpperCase()
  return event.key
}

/** Stable, layout-independent shortcut serialization used in localStorage. */
export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = keyFromEvent(event)
  if(!key || ["Alt", "AltGraph", "Control", "Meta", "Shift"].includes(key)) return null
  const modifiers = [
    event.metaKey ? "Meta" : "",
    event.ctrlKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
  ].filter(Boolean)
  if(!modifiers.length && !/^F(?:[1-9]|1[0-2])$/.test(key)) return null
  return [...modifiers, key].join("+")
}

export function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent) {
  return Boolean(shortcut) && shortcutFromEvent(event) === shortcut
}

export function shortcutParts(shortcut: string, applePlatform = isOnApple()) {
  const labels: Record<string, string> = applePlatform
    ? {Meta: "⌘ Command", Ctrl: "⌃ Control", Alt: "⌥ Option", Shift: "⇧ Shift", Space: "Space"}
    : {Meta: "Meta", Ctrl: "Ctrl", Alt: "Alt", Shift: "⇧ Shift", Space: "Space"}
  return shortcut.split("+").filter(Boolean).map(part => labels[part] ?? part)
}

export function formatShortcut(shortcut: string, applePlatform = isOnApple()) {
  if(!shortcut) return ""
  if(applePlatform) {
    const compact: Record<string, string> = {Meta: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧"}
    return shortcut.split("+").map(part => compact[part] ?? part).join("")
  }
  return shortcut
}

/** Combinations consumed by the current operating system or browser chrome
 * cannot be dependable application shortcuts, so the recorder rejects them. */
export function reservedShortcutReason(shortcut: string, applePlatform = isOnApple()) {
  const common = new Set(["F1", "F5", "F6", "F11", "F12", "Alt+F4"])
  const apple = new Set([
    "Meta+L", "Meta+N", "Meta+Q", "Meta+R", "Meta+T", "Meta+W",
    "Meta+Shift+N", "Meta+Shift+R", "Meta+Shift+T", "Meta+Shift+W",
    "Meta+Alt+C", "Meta+Alt+I", "Meta+Alt+J", "Meta+Tab", "Meta+Shift+Tab",
  ])
  const other = new Set([
    "Ctrl+L", "Ctrl+N", "Ctrl+R", "Ctrl+T", "Ctrl+W",
    "Ctrl+Shift+I", "Ctrl+Shift+J", "Ctrl+Shift+N", "Ctrl+Shift+T",
    "Ctrl+Tab", "Ctrl+Shift+Tab", "Ctrl+Alt+Delete",
  ])
  return common.has(shortcut) || (applePlatform ? apple : other).has(shortcut)
    ? "That shortcut is reserved by your system or browser. Press a different shortcut."
    : ""
}

export function builtinShortcuts(applePlatform = isOnApple()) {
  return new Set(appCommands.flatMap(command => [
    command.defaultShortcut?.(applePlatform) ?? "",
    ...(command.legacyShortcuts?.(applePlatform) ?? []),
  ]).filter(Boolean))
}
