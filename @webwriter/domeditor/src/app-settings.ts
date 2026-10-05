import {isOnApple} from "./utility"
import {excludedMarkNames, hasStandardMarkShortcut, primaryMarkOptions, secondaryMarkOptions} from "./marks"
import {graphicArrangeOperations, graphicShapeOptions, graphicViewportOperations} from "./graphic"
import type {DocumentLayoutMode} from "./document-layout"

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
// Use the existing alternate modifier for commands whose familiar bindings
// open browser windows/files or switch system input sources (Ctrl+Space).
const alternate = (key: string) => (_applePlatform: boolean) => `Alt+Shift+${key}`

const operationLabel = (operation: string) => operation
  .split("-")
  .map((part, index) => index ? part : `${part[0].toLocaleUpperCase()}${part.slice(1)}`)
  .join(" ")

/** User-facing application commands. Keeping this list declarative lets the
 * settings UI and keyboard dispatcher share one source of truth. */
export const appCommands: readonly AppCommand[] = [
  {id: "document.new", section: "Document", label: "New", description: "Create a new document", icon: "New", action: "New", defaultShortcut: alternate("N")},
  {id: "document.open", section: "Document", label: "Open", description: "Open a document", icon: "Open", action: "Open", defaultShortcut: alternate("F")},
  {id: "document.save", section: "Document", label: "Save", description: "Save the active document", icon: "Save", action: "Save", defaultShortcut: primary("S")},
  {id: "document.saveAs", section: "Document", label: "Save as", description: "Save the active document as a copy", icon: "Save as", action: "Save as", defaultShortcut: apple => `${apple ? "Meta" : "Ctrl"}+Shift+S`},
  {id: "document.print", section: "Document", label: "Print", description: "Print the active document", icon: "Print", action: "Print", defaultShortcut: primary("P")},
  {id: "document.download", section: "Document", label: "Download", description: "Download the active document", icon: "Download", action: "Download", defaultShortcut: alternate("D")},
  {id: "editor.undo", section: "Editor", label: "Undo", description: "Undo the last document change", icon: "Undo", action: "Undo", defaultShortcut: primary("Z")},
  {
    id: "editor.redo", section: "Editor", label: "Redo", description: "Redo the last undone document change",
    icon: "Redo", action: "Redo",
    defaultShortcut: apple => apple ? "Meta+Shift+Z" : "Ctrl+Y",
    legacyShortcuts: apple => apple ? [] : ["Ctrl+Shift+Z"],
  },
  {id: "editor.preview", section: "Editor", label: "Preview", description: "Toggle the document preview", icon: "Preview", action: "Preview", defaultShortcut: primary("Alt+P")},
  ...primaryMarkOptions.filter(option => !excludedMarkNames.includes(option.name)).map(option => ({
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
  ...secondaryMarkOptions.filter(option => !excludedMarkNames.includes(option.name)).map(option => ({
    id: `text.${option.name}`,
    section: "Text" as const,
    label: option.label,
    description: `Toggle ${option.label.toLocaleLowerCase()} formatting`,
    icon: option.icon,
    action: `mark-detail:${option.name}`,
  })),
  {id: "text.clear", section: "Text", label: "Clear formatting", description: "Remove text formatting", icon: "Clear", action: "removeMarks", defaultShortcut: alternate("Backspace")},
  {id: "text.increase", section: "Text", label: "Increase font size", description: "Increase the selected text size", icon: "IncreaseFontSize", action: "increaseFontSize", defaultShortcut: primary("Shift+>")},
  {id: "text.decrease", section: "Text", label: "Decrease font size", description: "Decrease the selected text size", icon: "DecreaseFontSize", action: "decreaseFontSize", defaultShortcut: primary("Shift+<")},
  {id: "insert.paragraph", section: "Insert", label: "Paragraph", description: "Insert paragraph content", icon: "Paragraph", action: "Paragraph", defaultShortcut: alternate("Enter")},
  ...[
    ["heading", "Heading", "Heading", "Heading 1", "1"],
    ["details", "Details", "Details", "insert-details", "2"],
    ["list", "List", "List", "toggle-list:ul", "3"],
    ["table", "Table", "Table", "Table", "4"],
    ["image", "Image", "Image", "Image", "5"],
    ["graphic", "Graphic", "Graphic", "Graphic", "6"],
    ["audio", "Audio", "Audio", "Audio", "7"],
    ["website", "Website", "Website", "Website", "8"],
    ["video", "Video", "Video", "Video", "9"],
    ["formula", "Formula", "Formula", "Formula", "0"],
  ].map(([id, label, icon, action, key]) => ({
    id: `insert.${id}`,
    section: "Insert" as const,
    label,
    description: `Insert ${label.toLocaleLowerCase()} content`,
    icon,
    action,
    defaultShortcut: key ? primary(key) : undefined,
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

export const SNIPPET_LABEL_MAX_LENGTH = 250
export type UserSnippet = {id: string, label: string, html: string}

export type AppSettings = {
  userSnippets: UserSnippet[]
  language: string
  defaultLayout: DocumentLayoutMode
  updateDocumentLanguage: boolean
  disableAI: boolean
  showStyleToolbox: boolean
  pinDeveloperConsole: boolean
  autoReloadPackages: boolean
  autosaveCloudOnBundleChange: boolean
  disableAnimations: boolean
  shortcuts: Record<string, string>
}

export function defaultAppSettings(applePlatform = isOnApple()): AppSettings {
  return {
    userSnippets: [],
    language: "en",
    defaultLayout: "document",
    updateDocumentLanguage: true,
    disableAI: false,
    showStyleToolbox: false,
    pinDeveloperConsole: false,
    autoReloadPackages: true,
    autosaveCloudOnBundleChange: false,
    disableAnimations: false,
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
    const value = JSON.parse(stored) as Partial<AppSettings> & {shortcutsVersion?: number; defaultTemplate?: DocumentLayoutMode}
    const shortcuts = value.shortcuts && typeof value.shortcuts === "object"
      ? Object.fromEntries(appCommands.map(command => [
        command.id,
        typeof value.shortcuts?.[command.id] === "string"
          ? value.shortcuts[command.id]
          : defaults.shortcuts[command.id],
      ]))
      : defaults.shortcuts
    // Older settings saved every unassigned insertion command as an empty
    // string. Upgrade those defaults once, without stealing a custom binding.
    if(!value.shortcutsVersion) {
      for(const command of appCommands) {
        const shortcut = defaults.shortcuts[command.id]
        if(command.section === "Insert" && shortcut && !shortcuts[command.id]
          && !Object.values(shortcuts).includes(shortcut)) {
          shortcuts[command.id] = shortcut
        }
      }
    }
    if((value.shortcutsVersion ?? 0) < 2) {
      // Only commands that previously had no default participate in this upgrade.
      for(const id of ["document.new", "document.open", "document.download", "editor.preview",
        "text.clear", "text.increase", "text.decrease", "insert.paragraph"]) {
        const shortcut = defaults.shortcuts[id]
        if(!shortcuts[id] && !Object.values(shortcuts).includes(shortcut)) shortcuts[id] = shortcut
      }
    }
    const settings: AppSettings = {
      userSnippets: Array.isArray(value.userSnippets) ? value.userSnippets.filter((snippet): snippet is UserSnippet =>
        Boolean(snippet && typeof snippet.id === "string" && snippet.id && typeof snippet.label === "string"
          && snippet.label && typeof snippet.html === "string" && snippet.html)) : [],
      language: typeof value.language === "string" && value.language ? value.language : defaults.language,
      defaultLayout: value.defaultLayout === "canvas" || value.defaultLayout === "slides"
        ? value.defaultLayout
        : value.defaultLayout === "document" ? "document"
          : value.defaultTemplate === "canvas" || value.defaultTemplate === "slides" || value.defaultTemplate === "document"
            ? value.defaultTemplate : defaults.defaultLayout,
      updateDocumentLanguage: typeof value.updateDocumentLanguage === "boolean"
        ? value.updateDocumentLanguage
        : defaults.updateDocumentLanguage,
      disableAnimations: typeof value.disableAnimations === "boolean"
        ? value.disableAnimations
        : defaults.disableAnimations,
      disableAI: typeof value.disableAI === "boolean" ? value.disableAI : defaults.disableAI,
      showStyleToolbox: typeof value.showStyleToolbox === "boolean"
        ? value.showStyleToolbox
        : defaults.showStyleToolbox,
      pinDeveloperConsole: typeof value.pinDeveloperConsole === "boolean"
        ? value.pinDeveloperConsole
        : defaults.pinDeveloperConsole,
      autoReloadPackages: typeof value.autoReloadPackages === "boolean"
        ? value.autoReloadPackages
        : defaults.autoReloadPackages,
      autosaveCloudOnBundleChange: typeof value.autosaveCloudOnBundleChange === "boolean"
        ? value.autosaveCloudOnBundleChange : defaults.autosaveCloudOnBundleChange,
      shortcuts,
    }
    if((value.shortcutsVersion ?? 0) < 2) persistAppSettings(settings)
    return settings
  }
  catch {
    return defaults
  }
}

export function persistAppSettings(settings: AppSettings) {
  try {
    globalThis.localStorage?.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings, shortcutsVersion: 2}))
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
