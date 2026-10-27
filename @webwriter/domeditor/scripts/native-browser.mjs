import {spawn} from "node:child_process"
import {existsSync} from "node:fs"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {createServer as createNetServer} from "node:net"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {createServer} from "vite"

const expectedChecks = [
  "SVG arrowheads select their connector, fit its outline and resize independently",
  "SVG shape fills keep overlaps solid and intentional holes open",
  "SVG stroke colors preserve line placement and selection",
  "repeated canvas modifier selections preserve item placement and camera",
  "canvas multiline text keeps partial selections after formatting",
  "editing suppresses native autoplay while preserving attributes and explicit playback",
  "rotated figure captions flow upright and their transformation frames fit the content",
  "legacy widget options use document gutters and sit beside freeform widgets",
  "bundled document themes always render light colors",
  "standalone live learners open the document without editor controls or an iframe",
  "standalone live learners receive large initial documents over HTTP and synchronize activity",
  "live learners render host widgets with shared dependencies and a fresh preview policy",
  "live learners initialize bundled local widgets without host resources",
  "Lit documentation examples render and synchronize with LitElementWw",
  "LitElementWw uses native registries and shared data handlers without the adapter",
  "legacy and native scoped registries coexist without replacing browser globals",
  "global directional shorthands preserve authored overrides in native CSSOM",
  "gap carets track their authored boundary",
  "insertion and saved-reader controls align inside symmetric scrollbar gutters",
  "SVG shape outlines and handles align inside symmetric scrollbar gutters",
  "SVG drag previews preserve rotated graphic viewports in canvas and slides",
  "SVG overflow fades while retaining native shape selection",
  "standalone SVG arrowheads remain visible in canvas previews and exports",
  "editing affordances align with media inside symmetric scrollbar gutters",
  "document scrollbar gutters stay symmetric as content grows",
  "empty Details retains summary height and padding in standalone documents",
  "media stays centered in editing and standalone documents",
  "unfloated placements align within the content column",
  "Placement arrows move elements in normal document flow",
  "crop preview reveals the source and restores content outside the frame",
  "video crop controls remain available after repeated crops",
  "media interiors capture while outline edges element-select",
  "Settings tabs share the heading and embed AI provider cards in Cloud",
  "AI messages use normal padding without template whitespace",
  "Closed AI bar shows status and anchored reply speech bubbles",
  "Document toolbox combines metadata and layouts with primary and detailed options",
  "Border controls are narrow and dropdown chevrons overlay field values",
  "Ribbon text colors share the toolbox palette and commit chosen colors",
  "File actions align with the font size controls",
  "Editor UI prevents text selection while preserving editable fields and the document",
  "Toolbox choices distinguish defaults from explicit matching values",
  "Style dropdowns draw a single border and focus ring",
  "marker image uploads preview before applying",
  "character deletion preserves adjacent spaces",
  "cut paragraphs retain a visible native caret position",
  "paragraph boundary deletion reverses Enter in Document and Board",
  "triple clicks preserve native paragraph selections in Document and Board",
  "Elements pullout reserves matching padding after its opening animation",
  "Board columns and cards retain native editing and standalone layout",
  "Board media shrinks with card height in editing and standalone documents",
  "tiny images open media inputs in a speech bubble",
  "document resizing and graphic fitting preserve normal flow",
  "text containers resize horizontally and fit their content",
  "canvas and slide text exposes eight functional resize handles",
  "block formulas expose block controls and resize horizontally",
  "iframes default to 16:9 and resize vertically in document flow",
  "images stretch independently of their intrinsic aspect ratio",
  "resize handles follow alignment and centered edges track the cursor",
  "cancelled resizing accepts the first delete activation",
  "media and graphics enforce minimum editing dimensions",
  "details remain intact after applying style presets",
  "table presets respect whole-table and cell selections without changing layout",
  "figure permalinks align with padded caption numbering",
  "empty caption numbering is visible as a grey editing placeholder",
  "empty media controls wrap to fit their element",
  "whitespace beside a lone floated figure selects document start",
  "audio insertion retains element selection at the document start",
  "float previews match projected media bounds",
  "lane media fills available width and resizes with native handles",
  "wide widgets remain centered between symmetric float lanes",
  "far floats adapt to column margins and survive standalone export",
  "wrapped attribution keeps two text columns and moves contact to the opposite side",
  "Harper checks English in a worker without authored DOM artifacts",
  "Accessibility review shares Issues controls without loading while disabled",
  "Review shares bounded scroll areas and lays out versions beside responsive changes",
  "version previews preserve editing mode and reject native and direct mutations",
  "collaborated scripts remain inert with namespace prefixes, clones and later edits",
  "saved document module references do not poison trusted widget loading",
  "attribution is limited to top-level elements and follows nesting",
  "attribution inputs keep visible carets during element and capture selection",
  "toolbox attribution opens for multiple elements and deletes metadata together",
  "attribution license picker wraps definitions on a third line and offers only current CC licenses",
  "block splitting retains attribution only on the original part",
  "new paragraphs and line breaks reveal the caret at the document end",
  "native drag floats in preview areas and preserves ordinary gap drops",
  "document shape drops use float lanes and ordinary content flow",
  "keyboard shape drags capture graphics and finish drops through appendix surfaces",
  "ribbon elements drop inside captured graphics with native content and cleanup",
  "empty document gutters prefer floats throughout the viewport",
  "empty graphics drag through their full capture outline into floats",
  "native MathML editing preserves inline rendering and argument hit targets",
  "dead-key composition stays outside authored formulas",
  "whole formulas receive one blue selection layer",
  "empty formula carets fit their space and blink across presentation refreshes",
  "empty roots keep their baseline and one caret across focus and formula edges",
  "structural formula carets match inserted text without duplicate capture carets",
  "formula carets follow canvas and slide zoom",
  "formula clicks distinguish script endings and select whole formulas",
  "inline formula edges use text selections and block formula edges use gaps",
  "inline formulas retain distinct inner and outer text insertion positions",
  "typing after a formula inserted at paragraph end stays outside MathML",
  "blank space around a formula paragraph selects gaps for every click count",
  "leaving an empty inline formula removes it without moving the text caret",
  "bottom layout cards retain native editing focus after rendering",
  "toolbox Canvas to Document conversion retains the document selection",
  "recent documents fit one layout card when space is limited",
  "narrow ribbons show only the AI sparkles button",
  "AI toolbox adapts its width and short-screen controls",
  "narrow toolboxes collapse below bottom panels and restore on tab activation",
  "ribbon collapses when vertical space is constrained",
  "iframe reactivation restores hit testing without changing the document or selection",
  "table commands complete across the real iframe bridge",
  "graphic imports open host pickers synchronously and retry across the iframe bridge",
  "canvas and slide gestures relay pointer dismissal before feature capture",
  "link keyboard preserves iframe selections and applies document, web, and reference links",
  "editor command preserves a live selection",
  "node drag borders leave native text and table editing reachable",
  "selection feature treats custom element as atomic",
  "modifier clicks select table cells and outer borders",
  "table insertion controls follow rotated edges and preview lines",
  "touch caret and ranges use shared pointer selection",
  "layout based hit testing returns the rendered target",
  "clicks below closed details keep hidden media collapsed",
  "focused AI previews preserve widgets, contextual HTML, and rendered styles",
  "standalone SVG affordances refit rotated elements and resize beyond their original size",
  "ribbon shapes retain their aspect ratio under the document theme",
  "ribbon dropdowns join their triggers without gaps at viewport edges",
  "font dropdowns join their white controls at viewport edges",
  "font list previews only load the active web font",
  "font searches split installed and web results without scrolling",
  "local fonts embed selected bytes and load under the editor CSP",
  "shape labels retain capture while typing and selecting text",
  "iframe lifecycle reaches load and cleans up",
  "New discards the previous canvas iframe and its document state",
  "uploaded videos survive installing and removing packages",
  "canvas and slide delete affordances follow rotation placement",
  "canvas and slide element selections keep Delete borderless",
  "canvas and slide copyright controls share freeform placement",
  "canvas and slide captions remain available through toolbox commands",
  "bundled layouts render under the strict editor CSP without widgets",
  "editing frame blocks meta refresh and retains same-document navigation",
  "canvas box selection retains disjoint ranges and stays in the document top layer",
  "freeform box selections transform as a group",
  "canvas slot preserves hit testing and document coordinates at different zoom levels",
  "canvas Enter inserts a line break and conversion returns normal flow",
  "canvas and slide Enter preserves empty lists and repeated breaks",
  "paragraphs grow with content and retain explicit sizes in canvas",
  "paragraphs grow with content and retain explicit sizes in slides",
  "ribbon elements drop on the blank canvas slot",
  "relayed ribbon elements drop onto the selected element beneath editor overlays",
  "ribbon snippets drop at the caret and center in freeform layouts",
  "typing after moving a text box preserves its text and position",
  "a clean canvas retains its initial item when moving and typing without inserting links",
  "CSS Slides use native fragment links while editing",
  "slide editing retains text and media selections after focus",
  "exported canvas runs its standalone viewer without editor dependencies",
  "image hotspots scale and open popovers in preview and standalone reading mode",
  "canvas hotspot clicks preserve the camera in preview and standalone reading mode",
  "hotspot popovers use grey editing placeholders and compact controls",
  "saved Slides navigate with HTML and CSS and scripting disabled",
]
const mathVisual = process.argv.includes("--math-visual")
const performanceMode = process.argv.includes("--performance")
const widgetStateDiagnostics = process.argv.includes("--widget-state-diagnostics")
const widgetStateMode = process.argv.includes("--widget-state-benchmark") || widgetStateDiagnostics
const widgetStorageMode = process.argv.includes("--widget-data-storage")
const widgetAggregationMode = process.argv.includes("--widget-aggregation")
const importMapMode = process.argv.includes("--import-map")
const smoke = process.argv.includes("--smoke")
const checkFilter = process.argv.find(argument => argument.startsWith("--filter="))?.slice("--filter=".length)
const filteredChecks = checkFilter ? expectedChecks.filter(name => name.includes(checkFilter)) : expectedChecks
if(checkFilter && (!filteredChecks.length || smoke || mathVisual || importMapMode || performanceMode || widgetStateMode || widgetStorageMode || widgetAggregationMode)) throw new Error("The filter must match a native check")
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
let activeCheck
const resultPromise = new Promise(resolve => { reportResult = resolve })
const resultPlugin = {
  name: "native-result",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if(request.url === "/__native-progress" && request.method === "POST") {
        let name = ""
        request.on("data", chunk => { name += chunk })
        request.on("end", () => {
          activeCheck = name
          process.stdout.write(`Running: ${name}\n`)
          response.end()
        })
        return
      }
      if(request.url?.startsWith("/__webwriter/local-packages/live-fixture/")) {
        const name = request.url.slice("/__webwriter/local-packages/live-fixture/".length).split("?")[0]
        if(!["widget.js", "label.js", "widget.css", "icon.svg"].includes(name)) return next()
        void readFile(new URL(`../tests/local-live-fixture/${name}`, import.meta.url)).then(source => {
          response.setHeader("Content-Type", name.endsWith(".css") ? "text/css" : name.endsWith(".svg") ? "image/svg+xml" : "text/javascript")
          response.end(source)
        }, next)
        return
      }
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
  ...(widgetStateMode || widgetStorageMode ? {logLevel: "silent"} : {}),
  plugins: [resultPlugin],
  server: {host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null},
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
let liveServer
try {
  await vite.listen()
  let liveServerURL
  if(!smoke && !mathVisual && !importMapMode && !performanceMode && !widgetStateMode && !widgetStorageMode && !widgetAggregationMode
    && filteredChecks.some(name => name.startsWith("standalone live learners"))) {
    const {createDevServer} = await import("../dev-server/server.mjs")
    liveServer = await createDevServer({vite: false, port: 0, dataDirectory: join(profile, "live-session")})
    const address = await liveServer.listen()
    liveServerURL = address.url.replace(/^http/, "ws")
  }
  const errors = []
  const url = `http://127.0.0.1:${port}/tests/${widgetAggregationMode ? "widget-aggregation" : widgetStorageMode ? "widget-data-storage" : widgetStateMode ? "widget-state-benchmark" : performanceMode ? "performance" : smoke ? "browser-smoke" : mathVisual ? "math-visual" : importMapMode ? "import-map-browser" : "native-browser"}.html?run${widgetStateDiagnostics ? "&diagnostics" : ""}${checkFilter ? `&filter=${encodeURIComponent(checkFilter)}` : ""}${liveServerURL ? `&liveServer=${encodeURIComponent(liveServerURL)}` : ""}`
  const command = browserName === "webkit" ? "xcrun" : browserName === "firefox" ? firefox : chrome
  const args = browserName === "webkit" ? ["swift", "scripts/native-webkit.swift", url]
    : browserName === "firefox" ? ["--headless", "--no-remote", "--new-instance", "--profile", profile, url]
    // Exercise editor autoplay suppression even when Chrome permits playback.
    : ["--headless=new", "--disable-gpu", "--disable-software-rasterizer", "--no-first-run", "--disable-popup-blocking", "--autoplay-policy=no-user-gesture-required", ...(performanceMode ? ["--window-size=1920,1080"] : []), `--user-data-dir=${profile}`, url]
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
    // The full regression suite runs its iframe and layout checks serially.
    const timeoutMs = widgetStateMode || widgetStorageMode ? 600000 : mathVisual || importMapMode ? 60000 : browserName === "webkit" ? 90000 : browserName === "firefox" ? 60000
      : !smoke && !checkFilter && !performanceMode && !widgetAggregationMode ? 600000 : 30000
    timeout = setTimeout(() => resolve({error: `Native browser timed out${activeCheck ? ` while running: ${activeCheck}` : ""}`}), timeoutMs)
  })
  const result = await Promise.race([resultPromise, browserClosed, failedToStart, timedOut])
  clearTimeout(timeout)
  const checks = Array.isArray(result?.checks) ? result.checks : []
  const valid = !result?.error && (widgetAggregationMode ? checks.length === 13 && checks.every(check => typeof check?.name === "string")
    : widgetStorageMode ? checks.length === 15 && result.samples?.length === 72 && result.paced?.length === 1
    : widgetStateMode ? checks.length === 1 && checks[0].name === "widget state benchmark"
    && checks[0].samples?.length === (widgetStateDiagnostics ? 30 : 180) && result.paced?.length === (widgetStateDiagnostics ? 0 : 27)
    : performanceMode ? checks.length === 5 && ["hover float candidates", "local and remote reconciliation", "frame snapshot processing", "unchanged widget data", "catalog rendering and Lit settling"].every(name => checks.some(check => check?.name === name))
    : importMapMode ? checks.length === expectedImportMapChecks.length && expectedImportMapChecks.every(name => checks.some(check => check?.name === name))
    : mathVisual ? checks.length >= 4640 && new Set(checks.map(check => check.name)).size === checks.length
    : smoke ? checks.length === expectedSmokeChecks.length && expectedSmokeChecks.every(name => checks.some(check => check?.name === name))
    : checks.length === filteredChecks.length
    && filteredChecks.every(name => checks.some(check => check?.name === name)))
    && checks.every(check => check && typeof check.name === "string" && check.error === undefined)
  process.stdout.write(JSON.stringify(widgetStateMode || widgetStorageMode ? result : checks, null, 2) + "\n")
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
  await liveServer?.close()
  await rm(profile, {recursive: true, force: true, maxRetries: 4, retryDelay: 300})
}
