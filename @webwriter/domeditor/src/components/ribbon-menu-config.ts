import type {AIEffort} from "../ai-client"
import {graphicShapeOptions} from "../graphic"
import {
  detailsInsertionTags,
  formInsertionTags,
  headingInsertionTags,
  insertionMenuItems,
  scriptInsertionTags,
  sectionInsertionTags,
} from "./insertion-menu"
import {type RibbonMenuButton, type RibbonMenuGroup} from "./ribbon-menu"
import {elementStyleCategories} from "../element-styles"

export type RibbonMenuName = "File" | "Start" | "Insert" | "Edit" | "Style" | "Develop" | "History"

export const menuTabs: RibbonMenuName[] = ["File", "Insert", "Edit", "Style", "Develop"]
export const dropdownMenus: RibbonMenuName[] = ["File", "Insert", "Edit", "Style"]

export const aiEfforts: {label: string, value: AIEffort}[] = [
  {label: "Low effort", value: "low"},
  {label: "Medium effort", value: "medium"},
  {label: "High effort", value: "high"},
]

export const storageLocations = [
  {label: "Local", value: "local", icon: "Local"},
  {label: "Development server", value: "development-server", icon: "Cloud"},
] as const
export type StorageLocation = typeof storageLocations[number]["value"]

export const placeholderSharingLink = "https://webwriter.app/share/placeholder"

type InsertionSection = "Text" | "Lists" | "Media"

const insertGraphicShapeButtons: RibbonMenuButton[] = graphicShapeOptions.map(option => ({
  label: option.label,
  action: `insert-graphic-shape:${option.type}`,
  icon: option.icon,
}))

export const addGraphicShapeButtons: RibbonMenuButton[] = graphicShapeOptions.map(option => ({
  label: option.label,
  action: `add-graphic-shape:${option.type}`,
  icon: option.icon,
}))

export const graphicAlignButtons: RibbonMenuButton[] = [
  {label: "Align left", action: "arrange-graphic:align-left", icon: "Graphic align left"},
  {label: "Align center", action: "arrange-graphic:align-center", icon: "Graphic align center"},
  {label: "Align right", action: "arrange-graphic:align-right", icon: "Graphic align right"},
  {label: "Align top", action: "arrange-graphic:align-top", icon: "Graphic align top"},
  {label: "Align middle", action: "arrange-graphic:align-middle", icon: "Graphic align middle"},
  {label: "Align bottom", action: "arrange-graphic:align-bottom", icon: "Graphic align bottom"},
]

export const graphicDistributeButtons: RibbonMenuButton[] = [
  {label: "Distribute horizontally", action: "arrange-graphic:distribute-horizontal", icon: "Distribute horizontally"},
  {label: "Distribute vertically", action: "arrange-graphic:distribute-vertical", icon: "Distribute vertically"},
]

export const graphicOrderButtons: RibbonMenuButton[] = [
  {label: "Bring forward", action: "arrange-graphic:bring-forward", icon: "Bring forward"},
  {label: "Send backward", action: "arrange-graphic:send-backward", icon: "Send backward"},
  {label: "Bring to front", action: "arrange-graphic:bring-front", icon: "Bring to front"},
  {label: "Send to back", action: "arrange-graphic:send-back", icon: "Send to back"},
]

const insertionButtonForTag = (tag: string): RibbonMenuButton => {
  const item = insertionMenuItems.find(candidate => candidate.tag === tag)
  if(!item) throw new TypeError(`Missing insertion menu item for <${tag}>`)
  return {label: item.name, action: item.name, icon: item.icon ?? item.name}
}

const insertionSubmenuForTags = (tags: readonly string[]) => tags.map(insertionButtonForTag)

const glossaryInsertionButton: RibbonMenuButton = {
  label: "Glossary",
  action: "toggle-list:dl",
  icon: "Glossary",
}

export const orderedListStyles: RibbonMenuButton[] = [
  {label: "1, 2, 3", action: "list-style:ol:decimal", icon: "Enumeration"},
  {label: "01, 02, 03", action: "list-style:ol:decimal-leading-zero", icon: "Enumeration"},
  {label: "a, b, c", action: "list-style:ol:lower-alpha", icon: "Enumeration"},
  {label: "A, B, C", action: "list-style:ol:upper-alpha", icon: "Enumeration"},
  {label: "i, ii, iii", action: "list-style:ol:lower-roman", icon: "Enumeration"},
  {label: "I, II, III", action: "list-style:ol:upper-roman", icon: "Enumeration"},
  {label: "No marker", action: "list-style:ol:none", icon: "Enumeration"},
]

export const listInsertionOptions: RibbonMenuButton[] = [
  {
    label: "Enumeration",
    action: "toggle-list:ol",
    icon: "Enumeration",
    submenu: orderedListStyles,
  },
  {label: "Menu", action: "toggle-list:menu", icon: "List"},
  {label: "Disc", action: "list-style:ul:disc", icon: "List"},
  {label: "Circle", action: "list-style:ul:circle", icon: "List"},
  {label: "Square", action: "list-style:ul:square", icon: "List"},
  {label: "No marker", action: "list-style:ul:none", icon: "List"},
  glossaryInsertionButton,
]

const mediaInsertionSubmenuTags = (tag: string): readonly string[] | undefined => {
  if(tag === "form") return formInsertionTags
  if(tag === "section") return sectionInsertionTags
  if(tag === "script") return scriptInsertionTags
}

const groupedMediaInsertionTags = new Set<string>([
  ...formInsertionTags,
  ...sectionInsertionTags,
  ...scriptInsertionTags,
])

const insertionMenuButtons = (sections: readonly InsertionSection[]) => insertionMenuItems
  .filter(item => sections.includes(item.section))
  .flatMap<RibbonMenuButton>(item => {
    if(item.section === "Lists" && detailsInsertionTags.includes(item.tag as typeof detailsInsertionTags[number])) return []
    if(item.section === "Lists") {
      if(item.tag === "ul") {
        return [{
          label: item.name,
          action: "toggle-list:ul",
          icon: "List",
          submenu: listInsertionOptions,
        }]
      }
      if(item.tag === "ol" || item.tag === "dl") return []
      return [{
        label: item.name,
        action: item.tag === "details" ? "insert-details" : `toggle-list:${item.tag}`,
        icon: item.icon ?? item.name,
        ...(item.tag === "details" ? {submenu: insertionSubmenuForTags(detailsInsertionTags)} : {}),
      } satisfies RibbonMenuButton]
    }
    if(item.section === "Text" && item.tag === "p") {
      return [{
        label: item.name,
        action: item.name,
        submenu: insertionMenuItems
          .filter(submenuItem => submenuItem.section === item.section && submenuItem.tag === "pre")
          .map(submenuItem => submenuItem.name),
      } satisfies RibbonMenuButton]
    }
    if(item.section === "Text" && item.tag === "pre") return []
    if(item.section === "Text" && item.tag === "h1") {
      return [{
        label: "Heading",
        action: item.name,
        submenu: insertionSubmenuForTags(headingInsertionTags),
      } satisfies RibbonMenuButton]
    }
    if(item.section === "Text" && headingInsertionTags.includes(item.tag as typeof headingInsertionTags[number])) return []
    const mediaSubmenuTags = item.section === "Media" ? mediaInsertionSubmenuTags(item.tag) : undefined
    if(mediaSubmenuTags) {
      return [{
        label: item.name,
        action: item.name,
        icon: item.icon ?? item.name,
        submenu: insertionSubmenuForTags(mediaSubmenuTags),
      }]
    }
    if(item.section === "Media" && groupedMediaInsertionTags.has(item.tag)) return []
    if(item.section === "Media" && item.tag === "svg") {
      return [{label: item.name, action: item.name, icon: "Graphic", submenu: insertGraphicShapeButtons}]
    }
    return [item.name]
  })

const insertionButtonLabel = (button: RibbonMenuButton) => typeof button === "string" ? button : button.label

const groupedInsertionMenuGroup = (
  label: string,
  buttonLabels: readonly string[],
): RibbonMenuGroup => {
  const buttons = insertionMenuButtons(["Text", "Lists", "Media"])
  return {
    label,
    buttons: buttonLabels.map(buttonLabel => {
      const button = buttons.find(candidate => insertionButtonLabel(candidate) === buttonLabel)
      if(!button) throw new TypeError(`Missing insertion button ${buttonLabel}`)
      return button
    }),
  }
}

const condensedInsertionMenuButtons = (section: InsertionSection): RibbonMenuButton[] => insertionMenuButtons([section])
  .map(button => {
    const item = typeof button === "string" ? {label: button} : button
    return {
      label: item.label,
      action: item.action ?? item.label,
      icon: item.icon ?? item.label,
      ...(section === "Lists" && item.label === "List" ? {submenu: item.submenu} : {}),
    }
  })

const elementInsertionMenuGroup: RibbonMenuGroup = {
  label: "Elements",
  buttons: [
    {
      label: "Prose",
      action: "Paragraph",
      icon: "Paragraph",
      submenu: condensedInsertionMenuButtons("Text"),
    },
    {
      label: "Lists",
      action: "toggle-list:ul",
      icon: "Lists",
      submenu: condensedInsertionMenuButtons("Lists"),
    },
    {
      label: "Media",
      action: "Table",
      icon: "Table",
      submenu: condensedInsertionMenuButtons("Media"),
    },
  ],
}

export const menuGroups: Record<RibbonMenuName, RibbonMenuGroup[]> = {
  File: [
    {
      label: "File",
      buttons: [
        "New",
        "Open",
        {
          label: "Save",
          submenu: [
            {label: "HTML (.html)", action: "save:html"},
            {label: "Offline HTML (.offline.html)", action: "save:offline"},
          ],
        },
        {
          label: "Save as",
          submenu: [
            {label: "HTML (.html)", action: "save-as:html"},
            {label: "Offline HTML (.offline.html)", action: "save-as:offline"},
          ],
        },
      ],
    },
    {label: "Metadata", buttons: []},
    {label: "Sharing", buttons: ["Share", "Print", "Download"]},
    {label: "Editor", buttons: ["General", "Shortcuts", "Accessibility"]},
    {label: "Appearance", buttons: ["Theme", "Zoom", "Fullscreen"]},
    {label: "Advanced", buttons: ["Preferences", "Extensions", "About"]},
  ],
  Start: [
    {label: "Marks", buttons: []},
    {label: "Table", buttons: []},
    elementInsertionMenuGroup,
  ],
  Insert: [
    groupedInsertionMenuGroup("Text", ["Paragraph", "Section", "Heading", "Details"]),
    groupedInsertionMenuGroup("Lists", ["List", "Table"]),
    groupedInsertionMenuGroup("Media", ["Image", "Graphic", "Audio", "Website", "Video", "Formula"]),
    groupedInsertionMenuGroup("Interactive", ["Form", "Script"]),
  ],
  Edit: [
    {label: "Marks", buttons: []},
    {label: "Table", buttons: []},
    {label: "Graphic", buttons: []},
    {
      label: "Review",
      buttons: [
        "Spelling", "Grammar", "Translate",
        "New Comment", "Previous", "Next",
        "Track Changes", "Accept", "Reject",
      ],
    },
    {label: "View", buttons: ["Zoom", "Guides", "Fullscreen"]},
  ],
  Style: elementStyleCategories.map(category => ({label: category.label, buttons: []})),
  Develop: [
    {label: "Local packages", buttons: []},
    {label: "Metadata", buttons: []},
    {label: "Development", buttons: []},
    {label: "Exports", buttons: []},
  ],
  History: [
    {label: "Versions", buttons: []},
  ],
}
