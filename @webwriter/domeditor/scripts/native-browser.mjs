import {spawn} from "node:child_process"
import {existsSync} from "node:fs"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {createServer as createNetServer} from "node:net"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createServer} from "vite"

const expectedChecks = [
  "float previews match projected media bounds",
  "lane media fills available width and resizes with native handles",
  "wide widgets remain centered between symmetric float lanes",
  "far floats adapt to column margins and survive standalone export",
  "Harper checks English in a worker without authored DOM artifacts",
  "version previews preserve editing mode and reject native and direct mutations",
  "collaborated scripts remain inert with namespace prefixes, clones and later edits",
  "new paragraphs and line breaks reveal the caret at the document end",
  "native drag floats in preview areas and preserves ordinary gap drops",
  "native MathML editing preserves inline rendering and argument hit targets",
  "dead-key composition stays outside authored formulas",
  "whole formulas receive one blue selection layer",
  "empty formula carets fit their space and blink across presentation refreshes",
  "empty roots keep their baseline and one caret across focus and formula edges",
  "structural formula carets match inserted text without duplicate capture carets",
  "formula clicks distinguish script endings and select whole formulas",
  "inline formula edges use text selections and block formula edges use gaps",
  "inline formulas retain distinct inner and outer text insertion positions",
  "typing after a formula inserted at paragraph end stays outside MathML",
  "blank space around a formula paragraph selects gaps for every click count",
  "leaving an empty inline formula removes it without moving the text caret",
  "bottom layout cards retain native editing focus after rendering",
  "iframe reactivation restores hit testing without changing the document or selection",
  "table commands complete across the real iframe bridge",
  "canvas and slide gestures relay pointer dismissal before feature capture",
  "editor command preserves a live selection",
  "node drag borders leave native text and table editing reachable",
  "selection feature treats custom element as atomic",
  "layout based hit testing returns the rendered target",
  "focused AI previews preserve widgets, contextual HTML, and rendered styles",
  "standalone SVG affordances refit rotated elements and resize beyond their original size",
  "ribbon shapes retain their aspect ratio under the document theme",
  "ribbon dropdowns join their triggers without gaps at viewport edges",
  "shape labels retain capture while typing and selecting text",
  "iframe lifecycle reaches load and cleans up",
  "canvas box selection retains disjoint ranges and stays in the document top layer",
  "canvas slot preserves hit testing and document coordinates at different zoom levels",
  "canvas Enter inserts a line break and conversion returns normal flow",
  "paragraphs grow with content and retain explicit sizes in canvas",
  "paragraphs grow with content and retain explicit sizes in slides",
  "ribbon elements drop on the blank canvas slot",
  "relayed ribbon elements drop onto the selected element beneath editor overlays",
  "ribbon snippets drop at the caret and center in freeform layouts",
  "a clean canvas retains its initial item when moving and typing without inserting links",
  "CSS Slides use native fragment links while editing",
  "exported canvas runs its standalone viewer without editor dependencies",
  "saved Slides navigate with HTML and CSS and scripting disabled",
]
const mathVisual = process.argv.includes("--math-visual")
const importMapMode = process.argv.includes("--import-map")
const smoke = process.argv.includes("--smoke")
const checkFilter = process.argv.find(argument => argument.startsWith("--filter="))?.slice("--filter=".length)
const filteredChecks = checkFilter ? expectedChecks.filter(name => name.includes(checkFilter)) : expectedChecks
if(checkFilter && (!filteredChecks.length || smoke || mathVisual || importMapMode)) throw new Error("The filter must match a native check")
const browserArgument = process.argv.find(argument => argument.startsWith("--browser="))?.slice("--browser=".length)
const browserName = browserArgument ?? "chromium"
if(!["chromium", "firefox", "webkit"].includes(browserName)) throw new Error(`Unsupported native browser: ${browserName}`)
if(browserName !== "chromium" && !smoke) throw new Error("Firefox and WebKit are supported by --smoke only")
const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const firefox = process.env.FIREFOX_BIN ?? "/Applications/Firefox.app/Contents/MacOS/firefox"
const bundledXcodeDeveloperDir = "/Applications/Xcode.app/Contents/Developer"
const swiftDeveloperDir = process.env.WEBKIT_DEVELOPER_DIR ?? process.env.DEVELOPER_DIR
  ?? (existsSync(`${bundledXcodeDeveloperDir}/Toolchains/XcodeDefault.xctoolchain/usr/bin/swift`)
    ? bundledXcodeDeveloperDir
    : undefined)
const expectedSmokeChecks = [
  "typing after deleting the initial paragraph stays in a paragraph",
  "native widget grouping dialog and processing instruction roundtrip",
  "native Range and Selection",
  "designMode editing",
  "atomic widget editability survives serialization",
  "shadow appendix stays out of authored serialization",
  "Yjs remote updates and local undo",
  "SVG and MathML namespaces survive serialization",
  "document template serialization",
  "package migrations run in an opaque sandbox",
  "package tests run in a separate frame",
]
const expectedImportMapChecks = [
  "JSPM links two local ESM entries to one shared dependency",
  "native import map loads the shared module once",
  "nonce CSP permits the editor's import map and module graph",
  "esbuild-wasm bundles the resolved graph for offline execution",
  "offline bundling runs under the editor frame CSP",
  "offline bundling leaves out unused modules of side-effect-free packages",
]
let reportResult
const resultPromise = new Promise(resolve => { reportResult = resolve })
const resultPlugin = {
  name: "native-result",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if(request.url?.startsWith("/tests/import-map-fixture/")) {
        const name = request.url.slice("/tests/import-map-fixture/".length).split("?")[0]
        const fixtures = ["a.js", "b.js", "shared.js", "pure-entry.js", ...["package.json", "index.js", "used.js", "unused.js"].map(file => `pure-fixture@1.0.0/${file}`)]
        if(!fixtures.includes(decodeURIComponent(name))) return next()
        void readFile(new URL(`../tests/import-map-fixture/${decodeURIComponent(name)}`, import.meta.url)).then(source => {
          response.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "text/javascript; charset=utf-8")
          response.end(source)
        }, next)
        return
      }
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
if(browserName === "firefox") {
  await writeFile(join(profile, "user.js"), [
    'user_pref("app.update.enabled", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.page", 0);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("browser.newtabpage.enabled", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
    "",
  ].join("\n"))
}
let browser
let browserClosed
let hasClosed = false
let timeout
try {
  await vite.listen()
  const errors = []
  const url = `http://127.0.0.1:${port}/tests/${smoke ? "browser-smoke" : mathVisual ? "math-visual" : importMapMode ? "import-map-browser" : "native-browser"}.html?run${checkFilter ? `&filter=${encodeURIComponent(checkFilter)}` : ""}`
  const command = browserName === "webkit" ? "xcrun" : browserName === "firefox" ? firefox : chrome
  const args = browserName === "webkit" ? ["swift", "scripts/native-webkit.swift", url]
    : browserName === "firefox" ? ["--headless", "--no-remote", "--new-instance", "--profile", profile, url]
    : ["--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--no-first-run", `--user-data-dir=${profile}`, url]
  browser = spawn(command, args, {
    stdio: ["ignore", "ignore", "pipe"],
    ...(browserName === "webkit" && swiftDeveloperDir
      ? {env: {...process.env, DEVELOPER_DIR: swiftDeveloperDir}}
      : {}),
  })
  browser.stderr.on("data", chunk => errors.push(chunk))
  browserClosed = new Promise(resolve => browser.once("close", (exitCode, signal) => {
    hasClosed = true
    resolve({error: `Native browser closed before reporting (${exitCode ?? signal})`})
  }))
  const failedToStart = new Promise(resolve => browser.once("error", error => resolve({error: String(error)})))
  const timedOut = new Promise(resolve => {
    const timeoutMs = mathVisual || importMapMode ? 60000 : browserName === "webkit" ? 90000 : browserName === "firefox" ? 60000 : 30000
    timeout = setTimeout(() => resolve({error: "Native browser timed out"}), timeoutMs)
  })
  const result = await Promise.race([resultPromise, browserClosed, failedToStart, timedOut])
  clearTimeout(timeout)
  const checks = Array.isArray(result?.checks) ? result.checks : []
  const valid = !result?.error && (importMapMode ? checks.length === expectedImportMapChecks.length && expectedImportMapChecks.every(name => checks.some(check => check?.name === name))
    : mathVisual ? checks.length >= 4640 && new Set(checks.map(check => check.name)).size === checks.length
    : smoke ? checks.length === expectedSmokeChecks.length && expectedSmokeChecks.every(name => checks.some(check => check?.name === name))
    : checks.length === filteredChecks.length
    && filteredChecks.every(name => checks.some(check => check?.name === name)))
    && checks.every(check => check && typeof check.name === "string" && check.error === undefined)
  process.stdout.write(JSON.stringify(checks, null, 2) + "\n")
  if(!valid) {
    process.stderr.write(`${result?.error ?? "Native checks failed"}\n${mathVisual && checks.length ? "" : Buffer.concat(errors).toString()}`)
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
