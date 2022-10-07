import type { LearningResource } from "./learningresource"

export type CoreAttributes = Pick<LearningResource, "name" | "url" | "additionalType" | "description" | "author" | "copyrightNotice" | "creditText" | "encodingFormat" | "inLanguage" | "interactivityType" | "keywords" | "isAccessibleForFree" | "learningResourceType" | "license" | "assesses" | "competencyRequired" | "educationalLevel" | "educationalUse" | "learningResourceType" | "teaches" | "typicalAgeRange" | "dateModified" | "headline">

export type Attributes = Record<string, any> & LearningResource

export type Widget = HTMLElement & {
  editable?: boolean
  printable?: boolean
  analyzable?: boolean
} & Attributes

export interface WidgetConstructor<W extends Widget = Widget> {
  new (...params: any[]): W

  /** Flag to mark the widget for inline display instead of block display */
  category?: "leaf" | "inline" | "container"
}