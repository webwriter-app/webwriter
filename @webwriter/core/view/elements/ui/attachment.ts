import { LitElement, css, html } from "lit"
import { customElement } from "lit/decorators.js"

import iconPhotoRaw from "@tabler/icons/filled/photo.svg?raw"
import iconVolume2Raw from "@tabler/icons/outline/volume-2.svg?raw"
import iconAlignJustifiedRaw from "@tabler/icons/outline/align-justified.svg?raw"
import iconMovieRaw from "@tabler/icons/outline/movie.svg?raw"
import iconCubeRaw from "@tabler/icons/outline/cube.svg?raw"
import iconTypographyRaw from "@tabler/icons/outline/typography.svg?raw"
import iconFileZipRaw from "@tabler/icons/outline/file-zip.svg?raw"
import iconTableRaw from "@tabler/icons/outline/table.svg?raw"
import iconPresentationRaw from "@tabler/icons/outline/presentation.svg?raw"
import iconFloatLeftRaw from "@tabler/icons/outline/float-left.svg?raw"
import iconPdfRaw from "@tabler/icons/outline/pdf.svg?raw"


function svgStringToElement(text: string) {
  const span = document.createElement("span")
  span.className = "ww-icon"
  span.innerHTML = text
  return span
}

const FILE_TYPE_ICON_SVG = {
  "application/pdf": iconPdfRaw,
  "application/vnd.ms-excel": iconTableRaw,
  "application/vnd.ms-powerpoint": iconPresentationRaw,
  "application/vnd.oasis.opendocument.text": iconFloatLeftRaw,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": iconPresentationRaw,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": iconTableRaw,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": iconFloatLeftRaw,
  "application/zip": iconFileZipRaw,
  "font": iconTypographyRaw,
  "image": iconPhotoRaw,
  "audio": iconVolume2Raw,
  "video": iconMovieRaw,
  "text": iconAlignJustifiedRaw,
  "model": iconCubeRaw
}

@customElement("ww-attachment")
export class Attachment extends LitElement {

	static styles = css`
    :host > * {
      display: none;
    }

    
	`

	render() {
    return html`
      <div part="file-wrapper">
        <div part="icon"></div>
        <div part="type"></div>
      </div>
      <div part="label"></div>
    `
	}
}