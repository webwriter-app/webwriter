import { HTMLParserSerializer } from "./html"
import { ZipParserSerializer } from "./zip"
import { MarkdownParserSerializer } from "./markdown"
import { IpynbParserSerializer } from "./ipynb"
import { getFileExtension } from "../../utility"

const formats = {
  "text/html": HTMLParserSerializer,
  "text/markdown": MarkdownParserSerializer,
  "application/zip": ZipParserSerializer,
  "application/ipynb+json": IpynbParserSerializer
}

export default formats

export function getParserSerializerByExtension(pathname: string) {
  const ext = getFileExtension(pathname)
  return Object.values(formats).find((ps: any) => ps.extensions.includes(ext))
}