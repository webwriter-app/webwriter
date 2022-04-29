type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | JSONValue[] | {[k: string]: JSONValue}
type JSONSchema = JSONValue
type BlockMetadata = JSONValue & {
    label: string,
    type: string
}

export type Block<
    M extends BlockMetadata=BlockMetadata,
    C extends object=object,
    S extends object=object> = 
{
    id: string
    metadata: M
    content: C
    state: S
}

export type WWDocument<
    C extends Block<BlockMetadata, object, object>[] = [],
    S extends object=object> = 
    Block<BlockMetadata & {type: "document"}, object, object>

export class Document { 
    constructor(
        public readonly id: number = Document.generateID(),
        public readonly name: string = "",
        public readonly text: string = ""
    ) {}

    static maxID = -1
    
    static generateID() {
        Document.maxID += 1
        return Document.maxID
    }
}

export interface Package<S extends JSONSchema, E extends HTMLElement, V extends HTMLElement, A extends HTMLElement> {
    schema: S
    edit: (data: S) => E
    display: (data: S, editable: boolean, printable: boolean) => V
    actions: (data: S) => A
}

type CSSSelector = string
type AnnotationMap = Record<CSSSelector, string>