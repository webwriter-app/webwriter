import { Schema } from "prosemirror-model"
import { Environment } from "../environment"
import { EditorStateWithHead } from "../schemas"

export abstract class ParserSerializer {
  static readonly format: string
  static readonly isBinary: boolean = false
  static readonly extensions: ReadonlyArray<string> = []
  static readonly mediaType: string

  constructor(readonly Environment: Environment) {}

  abstract parse(data: string, schema: Schema): Promise<EditorStateWithHead>
  abstract serialize(state: EditorStateWithHead): Promise<string | Uint8Array>  
}