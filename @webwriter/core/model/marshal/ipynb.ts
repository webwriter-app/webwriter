import { ParserSerializer } from "./parserserializer"
import { createEditorState } from "../schemas";

import { z } from "zod"
import { DOMSerializer, Schema } from "prosemirror-model";
import { HTMLParserSerializer } from "./html";
import { MarkdownParserSerializer } from "./markdown";

export const ipynbJsonSchema = z.object({
  "metadata": z.object({
    "kernelspec": z.object({ "name": z.string().describe("Name of the kernel specification."), "display_name": z.string().describe("Name to display in UI.") }).describe("Kernel information.").optional(), "language_info": z.object({
      "name": z.string().describe("The programming language which this kernel runs."), "codemirror_mode": z.any().superRefine((x, ctx) => {
        const schemas = [z.string(), z.record(z.any())];
        const errors = schemas.reduce<z.ZodError[]>(
          (errors, schema) =>
            ((result) =>
              result.error ? [...errors, result.error] : errors)(
                schema.safeParse(x),
              ),
          [],
        );
        if (schemas.length - errors.length !== 1) {
          ctx.addIssue({
            path: ctx.path,
            code: "invalid_union",
            unionErrors: errors,
            message: "Invalid input: Should pass single schema",
          });
        }
      }).describe("The codemirror mode to use for code in this language.").optional(), "file_extension": z.string().describe("The file extension for files in this language.").optional(), "mimetype": z.string().describe("The mimetype corresponding to files in this language.").optional(), "pygments_lexer": z.string().describe("The pygments lexer to use for code in this language.").optional()
    }).describe("Kernel information.").optional(), "orig_nbformat": z.number().int().gte(1).describe("Original notebook format (major number) before converting the notebook between versions. This should never be written to a file.").optional(), "title": z.string().describe("The title of the notebook document").optional(), "authors": z.array(z.any()).describe("The author(s) of the notebook document").optional()
  }).catchall(z.any()).describe("Notebook root-level metadata."), "nbformat_minor": z.number().int().gte(5).describe("Notebook format (minor number). Incremented for backward compatible changes to the notebook format."), "nbformat": z.number().int().gte(4).lte(4).describe("Notebook format (major number). Incremented between backwards incompatible changes to the notebook format."), "cells": z.array(z.any()).describe("Array of cells of the current notebook.")
}).strict().describe("Jupyter Notebook v4.5 JSON schema.")


export class IpynbParserSerializer extends ParserSerializer {
  static readonly format = "ipynb" as const
  static readonly extensions = ["ipynb"] as const
  static readonly isParseOnly: boolean = true as const
  static readonly mediaType = "application/ipynb+json" as const

  async parse(data: string, schema: Schema) {
    let json = ipynbJsonSchema.parse(JSON.parse(data))
    if(json.nbformat < 4) {
      throw Error(`Unsupported Jupyter Notebook version ${json.nbformat}.${json.nbformat_minor}. Only version 4 or higher is supported.`)
    }
    const state = createEditorState({schema})
    const htmlParserSerializer = new HTMLParserSerializer(this.Environment)
    const markdownParserSerializer = new MarkdownParserSerializer(this.Environment)
    const dom = await htmlParserSerializer.serializeToDOM(state)
    if(json.metadata.title) {
      const titleEl = dom.createElement("title")
      titleEl.textContent = json.metadata.title
      dom.head.append(titleEl)
    }
    if(json.metadata.authors) {
      const authorsEl = dom.createElement("meta")
      authorsEl.content = json.metadata.authors.join(", ")
      dom.head.append(authorsEl)
    }

    let cellLanguage = {name: "python", version: "3"}
    cellLanguage.name = json.metadata.name ?? json.metadata.language_info?.name ?? cellLanguage.name
    cellLanguage.version = json.metadata.version ?? cellLanguage.version
    for(const cell of json.cells) {
      if(cell.cell_type === "markdown") {
        let content: string = Array.isArray(cell.source)? cell.source.join("\n"): cell.source
        for(const [name, data] of Object.entries(cell.attachments ?? {})) {
          const mediaType = Object.keys(data as any)[0]
          const value = (data as any)[mediaType] as string
          const dataUrl = `data:${mediaType};base64,${value}`
          const pattern = new RegExp(`\\!\\[(.+)\\]\\(attachment:${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\)`, "g")
          content = content.replaceAll(pattern, `![$1](${dataUrl})`)
        }
        const cellHTML = await markdownParserSerializer.parseToHTML(content)
        console.log(cellHTML)
        dom.body.insertAdjacentHTML("beforeend", cellHTML)
      }
      else if(cell.cell_type === "code") {
        let content: string = Array.isArray(cell.source)? cell.source.join("\n"): cell.source
        const codeEl = dom.createElement("webwriter-code")
        codeEl.textContent = content
        for(const output of (cell.outputs ?? [])) {
          const resultEl = dom.createElement("webwriter-code-result") as any
          resultEl.slot = "result"
          if(output.output_type === "stream") {
            resultEl.type = "text/plain"
            resultEl.textContent = output.text
          }
          else if(["display_data", "execute_result"].includes(output.output_type)) {
            resultEl.type = "text/html"
            const resultContent = Array.isArray(output.data["text/html"])? output.data["text/html"].join("\n"): output.data["text/html"]
            resultEl.innerHTML = resultContent
            if(output.execution_count) {
              resultEl.executionCount = output.execution_count
            }
          }
          else if(output.output_type === "error") {
            resultEl.setAttribute("error", output.ename)
            resultEl.setAttribute("trace", JSON.stringify(output.evalue))
            resultEl.textContent = output.evalue
          }
          codeEl.append(resultEl)
        }
      }
    }
    return htmlParserSerializer.parse(dom.documentElement.outerHTML, schema)
    // For cell in cells:
    //   Convert markdown cells to HTML (CommonMark, GFM, MathJax)
    //     Resolve attackments to data urls (if possible)
    //   Convert code cells to <webwriter-code>
    //     Convert display_data/execute_result/error to output
    //     Process cell metadata into attributes (collapsed, scrolled, deletable, editable, name->data-name, tags->data-tags, jupyter.source_hidden, jupyter.output_hidden)


  }
}