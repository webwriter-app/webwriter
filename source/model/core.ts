import { WWURLString } from "../utility"

type BlockMetadata = {
    label: string,
    type: string
}

export class Block {
    attributes: Record<string, any> & BlockMetadata
    content: Block[]

    constructor(attributes?: Pick<BlockMetadata, "type"> & Record<string, any>, content: Block["content"] = null) {
        if(!attributes?.type) {
            throw TypeError("Missing required 'type' attribute in Block")
        }
        let attrs = {label: "", ...attributes}
        this.attributes = {...attrs}
        this.content = content
    }
}

export class Document { 

    constructor(id?: Document["id"], url?: Document["url"], attributes: Document["attributes"] = {label: "", type: "document"}, content: Document["content"] = []) {
        this.id = id
        this.url = url
        this.attributes = attributes
        this.content = content
    }

    // Uniquely identifies the document among all opened documents
    id: number

    attributes: Record<string, any> & Omit<BlockMetadata, "type"> & {type: "document"}

    // Remote location where the document is persisted ("remote" may also be on disk)
    url: WWURLString

    content: Block[] = []
}

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

export interface BlockElementConstructor<B extends Block = Block> {
    new (...params: any[]): BlockElement<B>
}

export interface BlockActionElementConstructor {
    new (...params: any[]): BlockActionElement
}

export interface Package<E extends BlockElementConstructor, A extends BlockActionElementConstructor> {
    element: E
    actions: A[]
    experienceEvents?: string[]
}

type CSSSelector = string
type AnnotationMap = Record<CSSSelector, string>