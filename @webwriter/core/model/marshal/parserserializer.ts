import { Schema } from "prosemirror-model"
import { EditorStateWithHead } from "../schemas"

export interface ParserSerializer {
  serialize?(state: EditorStateWithHead): Promise<string | Uint8Array> 
}
export abstract class ParserSerializer {
  static readonly format: string
  static readonly isBinary: boolean = false
  static readonly isParseOnly: boolean = false
  static readonly extensions: ReadonlyArray<string> = []
  static readonly mediaType: string

  abstract parse(data: string, schema: Schema): Promise<EditorStateWithHead>
}