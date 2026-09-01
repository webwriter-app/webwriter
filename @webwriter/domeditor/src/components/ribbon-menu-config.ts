import type {AIEffort} from "../ai-client"
import {graphicShapeOptions} from "../graphic"
import {
  detailsInsertionTags,
  formInsertionTags,
  headingInsertionTags,
  hiddenRibbonInsertionTags,
  insertionMenuItems,
  sectionInsertionTags,
} from "./insertion-menu"
import {type RibbonMenuButton, type RibbonMenuGroup} from "./ribbon-menu"
import {elementStyleCategories} from "../element-styles"
import {topLevelFormElementTypes} from "../form"

export type RibbonMenuName = "File" | "Start" | "Edit" | "Style" | "Develop" | "History"

export const menuTabs: RibbonMenuName[] = ["File"]
export const dropdownMenus: RibbonMenuName[] = ["File"]

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

type InsertionSection = "Text" | "Lists" | "Media" | "Forms"

const insertGraphicShapeButtons: RibbonMenuButton[] = graphicShapeOptions.map(option => ({
  label: option.label,
  action: `insert-graphic-shape:${option.type}`,
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

const groupedMediaInsertionTags = new Set<string>([
  ...sectionInsertionTags,
  ...hiddenRibbonInsertionTags,
])

const insertionMenuButtons = (sections: readonly InsertionSection[]) => insertionMenuItems
  .filter(item => (sections as readonly string[]).includes(item.section))
  .flatMap<RibbonMenuButton>(item => {
    if(item.section === "Forms") {
      if(item.tag === "form") {
        return [{
          label: item.name,
          action: item.name,
          icon: item.icon ?? item.name,
          submenu: insertionSubmenuForTags(formInsertionTags.filter(tag => tag !== "form")),
        }]
      }
      if(topLevelFormElementTypes.includes(item.tag as typeof topLevelFormElementTypes[number])) return [item.name]
      return []
    }
    if(item.section === "Lists" && detailsInsertionTags.includes(item.tag as typeof detailsInsertionTags[number])) return []
    if(!item.tag) return [{label: item.name, action: item.name, icon: item.icon ?? item.name}]
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
    if(item.section === "Media" && item.tag === "section") {
      return [{label: item.name, action: "toggle-section", icon: item.icon ?? item.name}]
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
  const buttons = insertionMenuButtons(["Text", "Lists", "Media", "Forms"])
  return {
    label,
    buttons: buttonLabels.map(buttonLabel => {
      const button = buttons.find(candidate => insertionButtonLabel(candidate) === buttonLabel)
      if(!button) throw new TypeError(`Missing insertion button ${buttonLabel}`)
      return button
    }),
  }
}

export const insertionMenuGroups: RibbonMenuGroup[] = [
  groupedInsertionMenuGroup("Text", ["Paragraph", "Section", "Heading", "Details"]),
  groupedInsertionMenuGroup("Lists", ["List", "Table"]),
  groupedInsertionMenuGroup("Media", ["Image", "Graphic", "Audio", "Website", "Video", "Formula"]),
  groupedInsertionMenuGroup("Interactive", ["Form", "HTML"]),
]

const elementInsertionMenuGroup: RibbonMenuGroup = {
  label: "Elements",
  buttons: insertionMenuGroups.flatMap(group => group.buttons),
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
            {label: "Save as"},
          ],
        },
      ],
    },
    {label: "Sharing", buttons: ["Share", "Print", "Download"]},
    {label: "Metadata", buttons: []},
  ],
  Start: [
    {label: "Marks", buttons: []},
    elementInsertionMenuGroup,
  ],
  Edit: [
    {label: "Marks", buttons: []},
    {
      label: "Document",
      buttons: [
        {label: "Default", action: "set-document-template:body", icon: "Document"},
      ],
    },
    {label: "Section", buttons: []},
    {label: "Heading group", buttons: []},
    {label: "List", buttons: []},
    {label: "Disclosure", buttons: []},
    {label: "Attributes", buttons: []},
    {label: "Media", buttons: []},
    {label: "Dialog", buttons: []},
    {label: "Form", buttons: []},
    {label: "Layout", buttons: []},
    {label: "Graphic", buttons: []},
    {label: "Comments", buttons: []},
    {
      label: "Review",
      buttons: [
        "Spelling", "Grammar", "Translate",
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
