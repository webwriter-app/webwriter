import { HTMLParserSerializer } from "./html"
import { ZipParserSerializer } from "./zip"

export default {
  "text/html": HTMLParserSerializer,
  "application/zip": ZipParserSerializer
}