import {fetchNpmFile, NPM_FILE_TIMEOUT_MS} from "./npm-files"
import {packageCdnUrl, resolvePackageExport, type PackageExportTarget, type WebWriterPackage, type WebWriterPackageManifest} from "./packages"

export const packagePreviewSize = 800
export const packagePreviewMaxBytes = 1_000_000

export type PackagePreview = {url: string, kind: "image" | "video"}

const previewExportName = (name: string) => name === "./preview" || name.startsWith("./preview/")

function previewExportPath(target: PackageExportTarget | undefined) {
  const path = resolvePackageExport(target)
  if(path && /^\.\/[^*?#\\]+\.(webp|mp4)$/i.test(path)) return path
}

/** Resolve preview assets against the local package's versioned resource URLs. */
export function localPackagePreviewUrls(manifest: WebWriterPackageManifest, urlFor: (path: string) => string) {
  return Object.fromEntries(Object.entries(manifest.exports ?? {}).flatMap(([name, target]) => {
    if(!previewExportName(name)) return []
    const path = previewExportPath(target)
    if(!path) return []
    try { return [[name, urlFor(path)] as const] }
    catch { return [] }
  }))
}

/** Keeps the candidates in fallback order, including when an asset fails to load. */
export function packagePreviewCandidates(pkg: WebWriterPackage, locale: string): PackagePreview[] {
  const exports = pkg.manifest?.exports ?? {}
  const keys = Object.keys(exports)
  const exact = locale.toLowerCase()
  const names = new Set([`./preview/${exact}`, `./preview/${exact.split("-")[0]}`, "./preview"])
  const candidates: PackagePreview[] = []
  for(const name of names) {
    const key = name === "./preview" ? name : keys.find(key => key.startsWith("./preview/") && key.toLowerCase() === name)
    const path = key && previewExportPath(exports[key])
    if(!key || !path) continue
    try {
      const url = pkg.previewUrls || pkg.developerSource ? pkg.previewUrls?.[key] : packageCdnUrl(pkg.name, pkg.version, path)
      if(url && !candidates.some(candidate => candidate.url === url)) {
        candidates.push({url, kind: /\.webp$/i.test(path) ? "image" : "video"})
      }
    }
    catch { /* Invalid package-relative path. */ }
  }
  return candidates
}

function fourCC(bytes: DataView, offset: number) {
  return String.fromCharCode(...Array.from({length: 4}, (_, index) => bytes.getUint8(offset + index)))
}

/** RIFF WebP may contain either a single compressed frame or animation chunks. */
function isStillWebP(bytes: DataView) {
  if(bytes.byteLength < 20 || fourCC(bytes, 0) !== "RIFF" || fourCC(bytes, 8) !== "WEBP"
    || bytes.getUint32(4, true) !== bytes.byteLength - 8) return false
  let frame = false
  let offset = 12
  while(offset + 8 <= bytes.byteLength) {
    const type = fourCC(bytes, offset), size = bytes.getUint32(offset + 4, true)
    const end = offset + 8 + size + size % 2
    if(end > bytes.byteLength || type === "ANIM" || type === "ANMF") return false
    if(type === "VP8X" && (size !== 10 || bytes.getUint8(offset + 8) & 0x02)) return false
    if(type === "VP8 " || type === "VP8L") {
      if(frame || !size) return false
      frame = true
    }
    offset = end
  }
  return frame && offset === bytes.byteLength
}

type Box = {type: string, start: number, end: number}

/** ISO BMFF children, bounded by their parent's declared size. */
function boxes(bytes: DataView, start: number, end: number): Box[] {
  const result: Box[] = []
  while(start < end) {
    if(start + 8 > end) throw new Error("Incomplete MP4 box")
    let size = bytes.getUint32(start), header = 8
    if(size === 1) {
      if(start + 16 > end || bytes.getUint32(start + 8)) throw new Error("Invalid MP4 box length")
      size = bytes.getUint32(start + 12)
      header = 16
    }
    else if(size === 0) size = end - start
    if(size < header || start + size > end) throw new Error("Invalid MP4 box length")
    result.push({type: fourCC(bytes, start + 4), start: start + header, end: start + size})
    start += size
  }
  return result
}

/** The video track's sample descriptions identify its codec and stored frame size. */
function isH264MP4(bytes: DataView) {
  const top = boxes(bytes, 0, bytes.byteLength)
  const fileType = top.find(box => box.type === "ftyp")
  const movie = top.find(box => box.type === "moov")
  if(!fileType || fileType.end - fileType.start < 8 || !movie) return false
  const children = (box: Box) => boxes(bytes, box.start, box.end)
  const tracks = children(movie).filter(box => box.type === "trak")
  let video = false
  for(const track of tracks) {
    const media = children(track).find(box => box.type === "mdia")
    if(!media) return false
    const mediaBoxes = children(media)
    const handler = mediaBoxes.find(box => box.type === "hdlr")
    if(!handler || handler.end - handler.start < 12) return false
    const type = fourCC(bytes, handler.start + 8)
    if(type === "soun") return false
    if(type !== "vide") continue
    if(video) return false
    const info = mediaBoxes.find(box => box.type === "minf")
    const table = info && children(info).find(box => box.type === "stbl")
    const descriptions = table && children(table).find(box => box.type === "stsd")
    if(!descriptions || descriptions.end - descriptions.start < 8) return false
    const entries = boxes(bytes, descriptions.start + 8, descriptions.end)
    if(!entries.length || entries.length !== bytes.getUint32(descriptions.start + 4)) return false
    video = entries.every(entry => (entry.type === "avc1" || entry.type === "avc3")
      && entry.end - entry.start >= 78
      && bytes.getUint16(entry.start + 24) === packagePreviewSize
      && bytes.getUint16(entry.start + 26) === packagePreviewSize
      && boxes(bytes, entry.start + 78, entry.end).some(box => box.type === "avcC" && box.end - box.start >= 7))
    if(!video) return false
  }
  return video
}

async function previewBytes(response: Response, signal: AbortSignal) {
  if(!response.ok || !response.body) throw new Error("Package preview unavailable")
  let size = 0
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength
      if(size > packagePreviewMaxBytes) throw new Error("Package preview exceeds 1 MB")
      controller.enqueue(chunk)
    },
  }), {signal})
  return new Response(body).arrayBuffer()
}

function loadPreviewElement(element: HTMLImageElement | HTMLVideoElement, url: string, signal: AbortSignal) {
  const video = element instanceof HTMLVideoElement
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const listeners = new AbortController()
    const done = (error?: unknown) => {
      listeners.abort()
      if(error) reject(error)
      else resolve()
    }
    const options = {signal: listeners.signal}
    element.addEventListener(video ? "loadeddata" : "load", () => done(), options)
    element.addEventListener("error", () => done(new Error("Package preview could not be decoded")), options)
    signal.addEventListener("abort", () => done(signal.reason), options)
    element.src = url
  })
}

/** Fetches only when needed and returns the first file that passes byte and browser validation. */
export async function loadPackagePreview(candidates: PackagePreview[], interest: AbortSignal) {
  for(const candidate of candidates) {
    if(interest.aborted) return
    const signal = AbortSignal.any([interest, AbortSignal.timeout(NPM_FILE_TIMEOUT_MS)])
    let url: string | undefined
    let element: HTMLImageElement | HTMLVideoElement | undefined
    try {
      const response = await fetchNpmFile(candidate.url, {signal, credentials: "omit"})
      const buffer = await previewBytes(response, signal)
      const video = candidate.kind === "video"
      if(!(video ? isH264MP4 : isStillWebP)(new DataView(buffer))) continue
      url = URL.createObjectURL(new Blob([buffer], {type: video ? "video/mp4" : "image/webp"}))
      if(video) {
        element = document.createElement("video")
        element.muted = true
        element.playsInline = true
        element.preload = "auto"
      }
      else {
        element = document.createElement("img")
        element.alt = ""
      }
      element.width = element.height = packagePreviewSize
      await loadPreviewElement(element, url, signal)
      signal.throwIfAborted()
      const [width, height] = element instanceof HTMLVideoElement
        ? [element.videoWidth, element.videoHeight] : [element.naturalWidth, element.naturalHeight]
      if(width === packagePreviewSize && height === packagePreviewSize) return {element, url}
    }
    catch { /* Try the next localized or default export. */ }
    element?.removeAttribute("src")
    if(url) URL.revokeObjectURL(url)
  }
}

export function disposePackagePreview({element, url}: NonNullable<Awaited<ReturnType<typeof loadPackagePreview>>>) {
  element.remove()
  element.removeAttribute("src")
  URL.revokeObjectURL(url)
}
