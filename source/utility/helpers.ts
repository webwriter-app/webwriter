import * as marshal from "../marshal"
import * as connect from "../connect"

type Format = keyof typeof marshal
type Protocol = keyof typeof connect

export const isOverflownX = (el: Element) => el.scrollWidth > el.clientWidth
export const isOverflownY = (el: Element) => el.scrollHeight > el.clientHeight
export const isOverflown = (el: Element) => isOverflownX(el) || isOverflownY(el)
export const escapeHTML = (unsafe: string) => unsafe
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;")

export const getFileExtension = (path: string) => path.slice((path.lastIndexOf(".") - 1 >>> 0) + 2)

export type WWURLString = string

export class WWURL extends URL {
  constructor(url: string, base?: string) {
    super(url, base)
    const protocol = this.protocol.slice(0, -1)
    const format = this.wwformat
    if(protocol && !(protocol in connect)) {
      throw TypeError(`Protocol specified is not supported by WebWriter: ${protocol}`)
    }
    else if(format && !(format in marshal)) {
      throw TypeError(`Format specified is not supported by WebWriter: ${format}`)
    }
  }

  get wwformat() {
    return getFileExtension(this.pathname)
  }

  set wwformat(value: string) {
    const i = this.pathname.lastIndexOf(this.wwformat)
    this.pathname = this.pathname.slice(0, i) + (i > -1? ".": "") + value
  }
}

window["WWURL"] = WWURL