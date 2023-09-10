import {Node, Schema} from "prosemirror-model"
import JSZip from "jszip"

import { Environment } from ".."
import {docToBundle, parse as parseHTML} from "./html"

export function docToManifest(explorable: Node, webFileName: string, fileNames: string[]) {
  const xml = document.implementation.createDocument(null, "")
  
  const manifest = xml.createElement("manifest")
  manifest.setAttribute("identifier", "com.scorm.manifesttemplates.scorm2004.4thEd")
  manifest.setAttribute("version", "1")
  manifest.setAttributeNS("xsi", "schemaLocation", "http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd http://ltsc.ieee.org/xsd/LOM lom.xsd")

  const metadata = xml.createElement("metadata")
  const schema = xml.createElement("schema")
  schema.textContent = "ADL SCORM"
  const schemaversion = xml.createElement("schemaversion")
  schemaversion.textContent = "2004 4th Edition"
  metadata.appendChild(schema)
  metadata.appendChild(schemaversion)
  manifest.appendChild(metadata)

  const organizations = xml.createElement("organizations")
  organizations.setAttribute("default", "WebWriter")
  const organization = xml.createElement("organization")
  organization.setAttribute("identifier", "WebWriter")
  const title = xml.createElement("title")
  title.textContent = "WebWriter"
  organization.appendChild(title)
  const item = xml.createElement("item")
  item.setAttribute("identifier", "ident_index")
  item.setAttribute("identifierref", "index")
  item.setAttribute("isvisible", "true")
  const itemTitle = xml.createElement("title")
  itemTitle.textContent = "WebWriter"
  item.appendChild(itemTitle)
  organization.appendChild(item)
  organizations.appendChild(organization)
  manifest.appendChild(organizations)
  
  const resources = xml.createElement("resources")
  const resource = xml.createElement("resource")
  resource.setAttribute("identifier", "index")
  resource.setAttribute("type", "webcontent")
  resource.setAttributeNS("adlcp", "scormType", "sco")
  resource.setAttribute("href", webFileName)
  resources.appendChild(resource)
  fileNames.forEach(fileName => {
    const file = xml.createElement("file")
    file.setAttribute("href", fileName)
    resources.appendChild(file)
  })
  manifest.appendChild(resources)

  xml.appendChild(manifest)

  return xml
}

export async function parse(data: string, schema: Schema) {
  const zip = new JSZip()
  await zip.loadAsync(data)
  const htmlString = await zip.file("index.html")?.async("string") ?? ""
  return parseHTML(htmlString, schema)
}

export async function serialize(explorable: Node, head: Node, bundle: Environment["bundle"]) {
  
  const {html, js, css} = await docToBundle(explorable, head, bundle)

  const zip = new JSZip()

  zip.file("index.js", js)
  const script = html.createElement("script")
  script.type = "text/javascript"
  script.src = "index.js"
  script.setAttribute("data-ww-editing", "bundle")
  html.head.appendChild(script)

  zip.file("index.css", css)
  const link = html.createElement("link")
  link.rel = "stylesheet"
  link.type = "text/css"
  link.href = "index.css"
  link.setAttribute("data-ww-editing", "bundle")
  html.head.appendChild(link)

  const xml = docToManifest(explorable, "index.html", ["index.html", "index.css", "index.js"])

  zip.file("imsmanifest.xml", xml.documentElement.outerHTML)

  zip.file("index.html", `<!DOCTYPE html>` + html.documentElement.outerHTML)

  const content = await zip.generateAsync({type: "uint8array"})

  return content

}

export const label = "SCORM Package"
export const extensions = ["ww.zip", "zip"]
export const isBinary = true