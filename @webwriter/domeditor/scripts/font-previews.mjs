// Regenerate bundled previews with Node 22 and Chrome; no font binaries are shipped.
import {spawn} from "node:child_process"
import {createServer} from "node:http"
import {mkdtemp, mkdir, writeFile, readdir, copyFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"

const output = new URL("../src/assets/font-previews/", import.meta.url)
const temporary = await mkdtemp(join(tmpdir(), "webwriter-font-previews-"))
const width = 320, rowHeight = 48, chunkSize = 50
let browser, timeout
let finish
const completed = new Promise((resolve, reject) => { finish = {resolve, reject} })
// The browser uses the same rendering and subset selection as the editor.
async function render() {
  const {families, width, rowHeight, chunkSize} = await (await fetch("/catalog")).json()
  for(let chunk = 0; chunk * chunkSize < families.length; chunk++) {
    const names = families.slice(chunk * chunkSize, (chunk + 1) * chunkSize)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = rowHeight * names.length
    const context = canvas.getContext("2d")
    let next = 0
    await Promise.all(Array.from({length: 6}, async () => {
      while(next < names.length) {
        const row = next++, name = names[row], family = `preview-${row}`
        for(let attempt = 0; ; attempt++) {
          const faces = []
          try {
            const response = await fetch(`/font/${chunk * chunkSize + row}`)
            if(!response.ok) throw new Error(`Cannot fetch ${name}`)
            const sheet = new CSSStyleSheet()
            sheet.replaceSync(await response.text())
            const rules = [...sheet.cssRules].filter(rule => rule.type === 5)
            const latin = rules.filter(rule => /[/-]latin-\d/.test(rule.style.getPropertyValue("src")))
            // Several CJK catalog responses also list large unbounded subsets. Only
            // the Latin face is needed to draw an English family name.
            faces.push(...(latin.length ? latin : rules).map(rule => new FontFace(family,
              rule.style.getPropertyValue("src"), {unicodeRange: rule.style.getPropertyValue("unicode-range") || "U+0-10FFFF"})))
            if(!faces.length) throw new Error(`No font faces for ${name}`)
            faces.forEach(face => document.fonts.add(face))
            await document.fonts.load(`28px "${family}"`, name)
            context.font = `28px "${family}"`
            const size = Math.min(28, 28 * (width - 8) / Math.max(1, context.measureText(name).width))
            context.font = `${size}px "${family}"`
            const metrics = context.measureText(name)
            context.fillStyle = "#2f3742"
            context.fillText(name, 2, row * rowHeight + (rowHeight + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2)
            break
          }
          catch(error) {
            if(attempt === 2) throw new Error(`${name}: ${error}`)
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
          finally { faces.forEach(face => document.fonts.delete(face)) }
        }
      }
    }))
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 1))
    const saved = await fetch(`/chunk-${chunk}.webp`, {method: "POST", body: blob})
    if(!saved.ok) throw new Error("Cannot save sprite")
  }
  await fetch("/done", {method: "POST"})
}

try {
  const response = await fetch("https://fonts.bunny.net/list")
  if(!response.ok) throw new Error("Cannot load Bunny font catalog")
  const fonts = Object.values(await response.json()).sort((a, b) => a.familyName.localeCompare(b.familyName, "en"))
  const metadata = {width, rowHeight, chunkSize, families: fonts.map(font => font.familyName)}
  const server = createServer(async (request, response) => {
    try {
      const path = request.url
      if(request.method === "GET" && path === "/") {
        response.setHeader("Content-Type", "text/html; charset=utf-8")
        response.end(`<script>(${render})().catch(error => fetch('/error', {method: 'POST', body: String(error.stack || error)}))</script>`)
      }
      else if(request.method === "GET" && path === "/catalog") response.end(JSON.stringify(metadata))
      else if(request.method === "GET" && /^\/font\/\d+$/.test(path)) {
        const font = fonts[Number(path.slice(6))]
        const weight = font.weights.reduce((a, b) => Math.abs(a - 400) <= Math.abs(b - 400) ? a : b)
        const url = new URL("https://fonts.bunny.net/css")
        url.searchParams.set("family", `${font.familyName}:${weight}${font.styles.includes("normal") ? "" : "i"}`)
        const css = await fetch(url)
        if(!css.ok) throw new Error(`Cannot load ${font.familyName}`)
        response.end(await css.text())
      }
      else if(request.method === "POST") {
        const parts = []
        for await (const part of request) parts.push(part)
        if(/^\/chunk-\d+\.(?:png|webp)$/.test(path)) {
          await writeFile(join(temporary, path.slice(1)), Buffer.concat(parts))
          process.stdout.write(`Rendered ${path.slice(1)}\n`)
        }
        else if(path === "/done") finish.resolve()
        else if(path === "/error") finish.reject(new Error(Buffer.concat(parts).toString()))
        else { response.writeHead(404).end(); return }
        response.end()
      }
      else response.writeHead(404).end()
    }
    catch(error) { response.writeHead(500).end(); finish.reject(error) }
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  try {
    browser = spawn(process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ["--headless=new", "--no-first-run", `--user-data-dir=${join(temporary, "chrome")}`, `http://127.0.0.1:${server.address().port}`], {stdio: "ignore"})
    browser.once("error", finish.reject)
    browser.once("exit", () => finish.reject(new Error("Chrome closed before completing previews")))
    timeout = setTimeout(() => finish.reject(new Error("Font preview generation timed out")), 900000)
    await completed
    await mkdir(output, {recursive: true})
    // Only replace checked-in assets after the entire catalog rendered successfully.
    for(const file of await readdir(output)) if(/^chunk-\d+\.(?:png|webp)$/.test(file)) await rm(new URL(file, output))
    for(const file of await readdir(temporary)) if(file.endsWith(".webp")) await copyFile(join(temporary, file), new URL(file, output))
    await writeFile(new URL("metadata.json", output), JSON.stringify(metadata, null, 2) + "\n")
    process.stdout.write(`Generated ${fonts.length} font previews.\n`)
  }
  finally { server.closeAllConnections(); server.close() }
}
finally {
  clearTimeout(timeout)
  if(browser && browser.exitCode === null) {
    const closed = new Promise(resolve => browser.once("exit", resolve))
    browser.kill()
    await closed
  }
  await rm(temporary, {recursive: true, force: true, maxRetries: 4, retryDelay: 300})
}
