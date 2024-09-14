import { ParserSerializer } from "./parserserializer"
import { createEditorState } from "../schemas";

import { z } from "zod"
import { DOMSerializer, Schema } from "prosemirror-model";
import { HTMLParserSerializer } from "./html";
import {parse, } from "marked"

export class MarkdownParserSerializer extends ParserSerializer {
  static readonly format = "markdown" as const
  static readonly extensions = ["md"] as const
  static readonly isParseOnly: boolean = true as const
  static readonly mediaType = "text/markdown" as const

  async parseToHTML(data: string) {
    return parse(data.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,""), {gfm: true})
  }

  async parse(data: string, schema: Schema) {
    const html = await this.parseToHTML(data)
    const htmlParserSerializer = new HTMLParserSerializer(this.Environment)
    return htmlParserSerializer.parse(html, schema)
  }
}