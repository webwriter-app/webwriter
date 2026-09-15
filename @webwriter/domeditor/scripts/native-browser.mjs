import {spawn} from "node:child_process"
import {mkdtemp, rm} from "node:fs/promises"
import {createServer as createNetServer} from "node:net"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createServer} from "vite"

const expectedChecks = [
  "native MathML editing preserves inline rendering and argument hit targets",
  "inline formula edges use text selections and block formula edges use gaps",
  "inline formulas retain distinct inner and outer text insertion positions",
  "leaving an empty inline formula removes it without moving the text caret",
  "bottom template cards retain native editing focus after rendering",
  "editor command preserves a live selection",
  "selection feature treats custom element as atomic",
  "layout based hit testing returns the rendered target",
  "layout insertion retains its selected grid wrapper after two frames",
  "layout presets create direct paragraph children",
  "layout geometry accounts for padding, gaps, and RTL",
  "keyboard separator resizing keeps adjacent fractions fluid",
  "cancelled layout gestures preserve remote style ownership",
  "one layout drag is one undoable operation",
  "auto rows use explicit minmax sizing after a keyboard resize",
  "removing an explicit row preserves content and exposes automatic tracks",
  "empty grid cells accept authored regions and survive export reload",
  "splitting a grid paragraph preserves column placement",
  "block widgets inherit empty grid paragraph placement",
  "removing a track preserves independent important grid placement longhands",
  "flex wrapping produces a second rendered line",
  "transformed grid geometry withholds misleading resize handles",
  "focused AI previews preserve widgets, contextual HTML, and rendered styles",
  "selection markers and appendix layout artifacts tear down cleanly",
  "standalone SVG affordances refit rotated elements and resize beyond their original size",
  "iframe lifecycle reaches load and cleans up",
  "canvas slot preserves hit testing and document coordinates at different zoom levels",
  "canvas paragraphs split into separate positioned items and conversion returns normal flow",
  "a clean canvas retains its initial item when moving and typing without inserting links",
  "CSS Slides use native fragment links while editing",
  "exported canvas runs its standalone viewer without editor dependencies",
  "saved Slides navigate with HTML and CSS and scripting disabled",
]
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
let reportResult
const resultPromise = new Promise(resolve => { reportResult = resolve })
const resultPlugin = {
  name: "native-result",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if(request.method !== "POST" || request.url !== "/__native-result") return next()
      const chunks = []
      request.on("data", chunk => chunks.push(chunk))
      request.on("end", () => {
        try { reportResult(JSON.parse(Buffer.concat(chunks).toString())) }
        catch(error) { reportResult({error: String(error)}) }
        response.end("ok")
      })
    })
  },
}

// Vite treats port 0 as its default port. Reserve a free loopback port first,
// then require that exact port so a concurrent run cannot silently redirect us.
const port = await new Promise((resolve, reject) => {
  const probe = createNetServer().once("error", reject).listen(0, "127.0.0.1", () => {
    const address = probe.address()
    probe.close(error => {
      if(error) reject(error)
      else if(!address || typeof address === "string") reject(new Error("No loopback port available"))
      else resolve(address.port)
    })
  })
})
const vite = await createServer({
  plugins: [resultPlugin],
  server: {host: "127.0.0.1", port, strictPort: true},
})
const profile = await mkdtemp(join(tmpdir(), "domeditor-native-"))
let browser
let browserClosed
let hasClosed = false
let timeout
try {
  await vite.listen()
  const errors = []
  browser = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${port}/tests/native-browser.html?run`,
  ], {stdio: ["ignore", "ignore", "pipe"]})
  browser.stderr.on("data", chunk => errors.push(chunk))
  browserClosed = new Promise(resolve => browser.once("close", (exitCode, signal) => {
    hasClosed = true
    resolve({error: `Native browser closed before reporting (${exitCode ?? signal})`})
  }))
  const failedToStart = new Promise(resolve => browser.once("error", error => resolve({error: String(error)})))
  const timedOut = new Promise(resolve => {
    timeout = setTimeout(() => resolve({error: "Native browser timed out"}), 20000)
  })
  const result = await Promise.race([resultPromise, browserClosed, failedToStart, timedOut])
  clearTimeout(timeout)
  const checks = Array.isArray(result?.checks) ? result.checks : []
  const valid = !result?.error && checks.length === expectedChecks.length
    && expectedChecks.every(name => checks.some(check => check?.name === name))
    && checks.every(check => check && typeof check.name === "string" && check.error === undefined)
  process.stdout.write(JSON.stringify(checks, null, 2) + "\n")
  if(!valid) {
    process.stderr.write(`${result?.error ?? "Native checks failed"}\n${Buffer.concat(errors).toString()}`)
    process.exitCode = 1
  }
}
finally {
  clearTimeout(timeout)
  if(browser && !hasClosed) {
    browser.kill("SIGTERM")
    // ChildProcess.killed only means a signal was sent; wait for close.
    const forceKill = setTimeout(() => browser.kill("SIGKILL"), 1000)
    try { await browserClosed }
    finally { clearTimeout(forceKill) }
  }
  await vite.close()
  await rm(profile, {recursive: true, force: true, maxRetries: 4, retryDelay: 300})
}
