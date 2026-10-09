import {Cite} from "@citation-js/core"
import "@citation-js/plugin-csl"
import "@citation-js/plugin-bibtex"
import type {ReferenceFormatter} from "./document-viewer.js"

/** Formatting input is disposable; authored anchors remain authoritative. */
export const formatReferences: ReferenceFormatter = (references, format, style = "apa") => {
  if(references.some(reference => reference.conflict)) throw new TypeError("Conflicting reference metadata")
  const cite = new Cite(references.map(({href, data}) => ({
    ...data, id: href, ...(!href.startsWith("#") ? {URL: href} : {}),
  })))
  return cite.format(format, format === "bibliography" ? {format: "text", template: style, lang: "en-US"} : {})
}
