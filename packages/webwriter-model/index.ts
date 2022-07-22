import type { LearningResource } from "./learningresource"

export type RequiredAttributes = {
  type: string
}

export type CoreAttributes = Pick<LearningResource, "name" | "url" | "additionalType" | "description" | "author" | "copyrightNotice" | "creditText" | "encodingFormat" | "inLanguage" | "interactivityType" | "keywords" | "isAccessibleForFree" | "learningResourceType" | "license" | "assesses" | "competencyRequired" | "educationalLevel" | "educationalUse" | "learningResourceType" | "teaches" | "typicalAgeRange" | "dateModified" | "headline">

export type Attributes = Record<string, any> & RequiredAttributes & LearningResource

export type WWURLString = string

export type BlockElement<B extends Block = Block> = HTMLElement & {
  label: string
  author: string
  license: string
  printable: boolean
  editing: boolean
  onlineOnly: boolean
} & Omit<B["attributes"], "type">

export interface BlockActionElement<B extends Block = Block> extends HTMLElement {
  block: B
}

export interface BlockElementConstructor<B extends Block = Block, A extends BlockActionElementConstructor = any> {
  new (...params: any[]): BlockElement<B>
  actions?: A[]
  experienceEvents?: string[]
  tagName?: string
}

export interface BlockActionElementConstructor {
  new (...params: any[]): BlockActionElement
}

export class Block {
  attributes: Attributes
  content: Block[]

  constructor(attributes?: Attributes, content: Block["content"] = null) {
      if(!attributes?.type) {
          throw TypeError("Missing required 'type' attribute in Block")
      }
      let attrs = {type: "", ...attributes}
      this.attributes = {...attrs}
      this.content = content
  }
}

export class Document { 

  constructor(id?: Document["id"], url?: Document["url"], attributes: Document["attributes"] = {type: "document"}, content: Document["content"] = []) {
      this.id = id
      this.url = url
      this.attributes = attributes
      this.content = content
  }

  get revisions() {
    const dateModified = this.attributes?.dateModified as Date[]
    const author = this.attributes?.author as string[]
    return Array.isArray(author)? author.map((author, i) => ({author, date: dateModified[i]})): []
  }

  /**Uniquely identifies the document among all opened documents */
  id: number

  attributes: Omit<Attributes, "type"> & {type: "document"}

  /**Remote location where the document is persisted ("remote" may also be on disk) */ 
  url: WWURLString

  content: Block[] = []
}

export class WWURL extends URL {
  constructor(url: string, base?: string) {
    super(url, base)
    const protocol = this.protocol.slice(0, -1)
    const format = this.wwformat
  }

  get wwformat() {
    return this.pathname.slice((this.pathname.lastIndexOf(".") - 1 >>> 0) + 2)
  }

  set wwformat(value: string) {
    const i = this.pathname.lastIndexOf(this.wwformat)
    this.pathname = this.pathname.slice(0, i) + (i > -1? ".": "") + value
  }
}