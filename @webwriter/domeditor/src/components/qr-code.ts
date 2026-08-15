import {LitElement, css, html} from "lit"
import qrcodejsSource from "qrcodejs/qrcode.js?raw"

type QRCodeOptions = {
  text: string
  width: number
  height: number
  colorDark: string
  colorLight: string
  correctLevel: number
  useSVG?: boolean
}

type QRCodeInstance = {
  clear(): void
}

type QRCodeConstructor = {
  new (element: HTMLElement, options: QRCodeOptions): QRCodeInstance
  CorrectLevel: {H: number}
}

let qrcodeConstructor: QRCodeConstructor | undefined
let pngQRCodeConstructor: QRCodeConstructor | undefined

const createQRCodeConstructor = () => {
  const factory = new Function(`${qrcodejsSource}\nreturn QRCode;`) as () => QRCodeConstructor
  return factory()
}

/**
 * The qrcodejs package exposes its browser build as qrcode.js rather than an
 * ES module. Evaluate that browser build lazily so the QRCode constructor is
 * available to the component without putting a global script in index.html.
 */
const getQRCodeConstructor = () => {
  if(qrcodeConstructor) return qrcodeConstructor
  qrcodeConstructor = createQRCodeConstructor()
  return qrcodeConstructor
}

const getPNGQRCodeConstructor = () => {
  if(pngQRCodeConstructor) return pngQRCodeConstructor
  // QRCode.js switches its drawing implementation globally when SVG mode is
  // enabled, so keep a separate constructor for the canvas-based PNG export.
  pngQRCodeConstructor = createQRCodeConstructor()
  return pngQRCodeConstructor
}

const defaultExportSize = 512

/** Renders a QR code with QRCode.js into a small, reusable custom element. */
export class QRCodeElement extends LitElement {
  static properties = {
    value: {type: String},
    size: {type: Number},
  }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
    }

    .code {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 0.15rem;
      background: transparent;
    }

    .code canvas,
    .code img,
    .code table,
    .code svg {
      display: block;
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      shape-rendering: crispEdges;
    }

    .code canvas,
    .code img {
      image-rendering: pixelated;
    }

    .export-code {
      display: none;
    }
  `

  value = ""
  size = 52

  protected firstUpdated() {
    this.renderCode()
  }

  protected updated(changed: Map<string, unknown>) {
    if(changed.has("value") || changed.has("size")) this.renderCode()
  }

  private renderCode() {
    const container = this.renderRoot.querySelector<HTMLElement>(".code")
    const exportContainer = this.renderRoot.querySelector<HTMLElement>(".export-code")
    if(!container || !exportContainer) return
    container.replaceChildren()
    exportContainer.replaceChildren()
    if(!this.value) return

    const size = Math.max(1, this.size)
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const renderSize = Math.max(1, Math.round(size * pixelRatio))
    const QRCode = getQRCodeConstructor()
    const PNGQRCode = getPNGQRCodeConstructor()
    new PNGQRCode(exportContainer, {
      text: this.value,
      width: defaultExportSize,
      height: defaultExportSize,
      colorDark: "#2f3742",
      colorLight: "transparent",
      correctLevel: PNGQRCode.CorrectLevel.H,
    })
    new QRCode(container, {
      text: this.value,
      width: renderSize,
      height: renderSize,
      colorDark: "#2f3742",
      colorLight: "transparent",
      correctLevel: QRCode.CorrectLevel.H,
      useSVG: true,
    })
  }

  toDataURL(): string | null {
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>(".export-code canvas")
    if(canvas) {
      try {
        return canvas.toDataURL("image/png")
      }
      catch {
        return null
      }
    }

    const image = this.renderRoot.querySelector<HTMLImageElement>(".export-code img")
    if(image?.src?.startsWith("data:image/png")) return image.src
    return null
  }

  async toBlob(): Promise<Blob | null> {
    const canvas = this.renderRoot.querySelector<HTMLCanvasElement>(".export-code canvas")
    if(canvas) {
      return new Promise(resolve => canvas.toBlob(resolve, "image/png"))
    }

    const image = this.renderRoot.querySelector<HTMLImageElement>(".export-code img")
    if(image?.src) {
      try {
        const blob = await fetch(image.src).then(response => response.blob())
        return blob.type === "image/png" ? blob : null
      }
      catch {
        return null
      }
    }
    return null
  }

  render() {
    return html`
      <div
        class="code"
        role="img"
        aria-label=${this.value ? `QR code for ${this.value}` : "QR code"}
      ></div>
      <div class="export-code" aria-hidden="true"></div>
    `
  }
}

if(!customElements.get("webwriter-qr-code")) {
  customElements.define("webwriter-qr-code", QRCodeElement)
}
