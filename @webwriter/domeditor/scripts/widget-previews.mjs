// Record the landing page's widget previews in the real editor with Chrome and ffmpeg.
// Start the development server first, then run:
//   node scripts/widget-previews.mjs [automaton …] [--lang=en] [--url=http://127.0.0.1:1234] [--out=<directory>] [--retries=2] [--debug=<directory>]
// Each scenario in scripts/widget-previews/<name>.mjs produces src/assets/widgets/<name>.mp4, or src/assets/widgets/<lang>/<name>.mp4.
// --lang records the editor, the document and the snippet in that language. A scenario module may export a function
// `({lang}) => scenario` for language-specific labels and typed text; its takes also receive `lang`.
// --out writes the videos elsewhere, for example drafts: a new video in src/assets/widgets reloads every open editor.
// --retries repeats a failed recording; later widgets still record when one fails.
// --debug writes <name>-sheet.png (two frames per second) and failure screenshots for review.
import {execFileSync, spawn} from "node:child_process"
import {mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {WebSocket} from "ws"

const chrome = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const option = name => process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3)
const appURL = option("url") ?? "http://127.0.0.1:1234"
const debug = option("debug")
const retries = Number(option("retries") ?? 2)
const lang = option("lang") ?? "en"
const scenarioDirectory = new URL("./widget-previews/", import.meta.url)
const output = option("out") ? new URL(`file://${resolve(option("out"))}/`) : new URL(`../src/assets/widgets/${lang === "en" ? "" : `${lang}/`}`, import.meta.url)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const ease = t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

/** Two takes of 5.25 s joined by a 0.5 s wipe make ten seconds. */
const fps = 30, segment = 5.25, transition = .5
/** The landing page shows previews at 400 CSS px; a 400 px crop at double density fills the 800 px video at 1:1. */
const cropSize = 400, videoSize = 800

async function launch(width, height) {
  const profile = await mkdtemp(join(tmpdir(), "webwriter-widget-preview-"))
  const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${width},${height}`,
    // Screencast frames keep their device resolution only when the browser itself uses it.
    "--force-device-scale-factor=2", "--hide-scrollbars", "--force-color-profile=srgb", "--no-first-run", "--no-default-browser-check", `--lang=${lang}`, "--mute-audio", "about:blank"],
  {stdio: "ignore"})
  let port
  for(let attempt = 0; attempt < 100 && !port; attempt++) {
    await sleep(100)
    port = await readFile(join(profile, "DevToolsActivePort"), "utf8").then(text => text.split("\n"), () => undefined)
  }
  if(!port) throw new Error("Chrome did not start")
  const socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`)
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject) })
  let id = 0
  const pending = new Map(), frames = new Map(), listeners = new Set()
  socket.on("message", data => {
    const message = JSON.parse(String(data))
    if(pending.has(message.id)) {
      const {resolve, reject} = pending.get(message.id)
      pending.delete(message.id)
      if(message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    }
    else if(message.method === "Target.attachedToTarget") {
      frames.set(message.params.targetInfo.targetId, message.params.sessionId)
      void send("Target.setAutoAttach", {autoAttach: true, flatten: true, waitForDebuggerOnStart: false}, message.params.sessionId).catch(() => {})
    }
    else for(const listener of listeners) listener(message)
  })
  // A command that never answers would otherwise keep the recording lock forever.
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const messageId = ++id
    const timeout = setTimeout(() => {
      pending.delete(messageId)
      reject(new Error(`${method} did not answer within 90 s`))
    }, 90_000)
    pending.set(messageId, {
      resolve: value => { clearTimeout(timeout); resolve(value) },
      reject: error => { clearTimeout(timeout); reject(error) },
    })
    socket.send(JSON.stringify({id: messageId, method, params, sessionId}))
  })
  const {targetInfos} = await send("Target.getTargets")
  const {sessionId} = await send("Target.attachToTarget", {targetId: targetInfos.find(target => target.type === "page").targetId, flatten: true})
  await send("Target.setAutoAttach", {autoAttach: true, flatten: true, waitForDebuggerOnStart: false}, sessionId)
  await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 2, mobile: false}, sessionId)
  const evaluate = async (expression, session = sessionId) => {
    const {result, exceptionDetails} = await send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true}, session)
    if(exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }
  const frame = async kind => {
    const {targetInfos: targets} = await send("Target.getTargets")
    return frames.get(targets.findLast(target => target.type === "iframe" && target.url.includes(`kind=${kind}&`))?.targetId)
  }
  const close = async () => {
    socket.close()
    const exited = new Promise(resolve => child.once("exit", resolve))
    child.kill()
    await exited
    await rm(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 200})
  }
  const on = (method, listener) => {
    const filtered = message => message.method === method && message.sessionId === sessionId && listener(message.params)
    listeners.add(filtered)
    return () => listeners.delete(filtered)
  }
  return {send: (method, params) => send(method, params, sessionId), evaluate, frame, on, close}
}

async function waitFor(check, timeout = 30_000) {
  for(const start = Date.now(); Date.now() - start < timeout; await sleep(150)) {
    const value = await check().catch(() => undefined)
    if(value) return value
  }
  throw new Error(`Timed out waiting for ${check}`)
}

/** Concurrent recordings would slow each other's frames, so takes run one at a time across processes. */
async function withRecordingLock(task) {
  const lock = join(tmpdir(), "webwriter-widget-preview.lock")
  for(;;) {
    try {
      await mkdir(lock)
      await writeFile(join(lock, "pid"), String(process.pid))
      break
    }
    catch(error) {
      if(error.code !== "EEXIST") throw error
      const pid = Number(await readFile(join(lock, "pid"), "utf8").catch(() => 0))
      const age = Date.now() - await stat(lock).then(info => info.mtimeMs, () => Date.now())
      let alive = !pid && age < 10_000
      try { if(pid) alive = process.kill(pid, 0) } catch {}
      if(!alive) await rm(lock, {recursive: true, force: true})
      else await sleep(500)
    }
  }
  try { return await task() }
  finally { await rm(lock, {recursive: true, force: true}) }
}

// Searches open shadow roots so widget internals can be targeted like a user would see them.
const deepSearch = predicate => `(() => {
  const found = []
  const walk = root => { for(const element of root.querySelectorAll("*")) { found.push(element); if(element.shadowRoot) walk(element.shadowRoot) } }
  walk(document)
  const element = found.find(element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (${predicate})(element) })
  const box = element?.getBoundingClientRect()
  return box ? {x: box.x + box.width / 2, y: box.y + box.height / 2, r: box.width / 2, width: box.width, height: box.height, left: box.left, top: box.top} : null
})()`

/** A drawn pointer for the recording; the headless browser renders no cursor of its own. It is recreated if the page replaced it. */
const cursorScript = `(document.getElementById("widget-preview-cursor") ?? (() => {
  const cursor = document.createElement("div")
  cursor.id = "widget-preview-cursor"
  cursor.style.cssText = "position: fixed; inset: 0 auto auto 0; z-index: 2147483647; pointer-events: none; transform-origin: 3px 2px; transition: scale 90ms"
  cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 20 20"><path d="M3 2v14.5l3.8-3.5 2.6 5.6 2.4-1.1-2.5-5.5h5.2z" fill="#172033" stroke="white" stroke-width="1.4" stroke-linejoin="round"/></svg>'
  document.documentElement.append(cursor)
  return cursor
})())`

const keyCodes = {Enter: 13, Tab: 9, Backspace: 8, Escape: 27, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, " ": 32}

/** The published snippet, or an excerpt of an existing lesson for packages without snippets. */
async function sourceMarkup(browser, scenario, base) {
  if(scenario.snippet) {
    const response = await fetch(`${base}/${scenario.snippet}`)
    if(!response.ok) throw new Error(`Cannot fetch ${scenario.snippet}`)
    return response.text()
  }
  const {file, selector} = scenario.example
  const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8")
  return browser.evaluate(`new DOMParser().parseFromString(${JSON.stringify(html)}, "text/html").querySelector(${JSON.stringify(selector)}).outerHTML`)
}

const entities = {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'"}
const decode = text => text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => entities[name])

/** The widget's own lit-localize XLIFF, so scenarios can name controls by their English labels in any language. */
async function widgetTranslations(base) {
  const translations = new Map()
  if(lang === "en") return translations
  const config = await fetch(`${base}/lit-localize.json`).then(response => response.ok ? response.json() : {}, () => ({}))
  const directory = (config.interchange?.xliffDir ?? "localization").replace(/^\.\//, "").replace(/\/$/, "")
  const response = await fetch(`${base}/${directory}/${lang}.xlf`).catch(() => undefined)
  if(!response?.ok) return translations
  // Units with placeholders are left out: their text is assembled at runtime.
  for(const [, source, target] of (await response.text()).matchAll(/<source>([^<]*)<\/source>\s*<target[^>]*>([^<]*)<\/target>/g)) {
    translations.set(decode(source), decode(target))
  }
  return translations
}

/** The editor reads only the first localization script, so a scenario's additions join the snippet's own. */
function mergeLocalizations(html) {
  const pattern = /<script[^>]*class="snippet-localization"[^>]*>([\s\S]*?)<\/script>/g
  const scripts = [...html.matchAll(pattern)]
  if(scripts.length < 2) return html
  const merged = {}
  for(const [, json] of scripts) {
    for(const [key, value] of Object.entries(JSON.parse(json))) merged[key] = {...merged[key], ...value}
  }
  return html.replace(pattern, "") + `<script type="application/json" class="snippet-localization">${JSON.stringify(merged).replaceAll("<", "\\u003c")}</script>`
}

/** The editor installs a whole package from any one of its widget scripts. */
async function packageScript(scenario, base) {
  if(scenario.script) return `${base}/${scenario.script}`
  const manifest = await (await fetch(`${base}/package.json`)).json()
  const entry = Object.entries(manifest.exports ?? {}).find(([key, value]) => key.startsWith("./widgets/") && typeof value?.default === "string")
  if(!entry) throw new Error(`${scenario.package} exports no widget script`)
  return `${base}/${entry[1].default.replace(/^\.\//, "").replace(/\*$/, "js")}`
}

async function recordScenario(name, scenario) {
  const viewport = {width: scenario.width ?? 425, height: scenario.height ?? 720}
  const browser = await launch(viewport.width, viewport.height)
  const temporary = await mkdtemp(join(tmpdir(), `webwriter-${name}-preview-`))
  try {
    const base = `https://cdn.jsdelivr.net/npm/${scenario.package}@${scenario.version}`
    // A fresh profile would open the guided tour over the document. The script only runs once Page is enabled.
    await browser.send("Page.enable")
    await browser.send("Page.addScriptToEvaluateOnNewDocument", {source: `if(window === top && !localStorage.getItem("webwriter_app_settings_v1")) localStorage.setItem("webwriter_app_settings_v1", ${JSON.stringify(JSON.stringify({showGuidedTour: false}))})`})
    await browser.send("Page.navigate", {url: `${appURL}/editor/?lang=${lang}`})
    await waitFor(() => browser.evaluate(`!!document.querySelector("dom-editor")?.shadowRoot?.querySelector("app-ribbon")`))
    await sleep(2000)
    // `with: [{package, version, script?, html?}]` loads further packages and appends their optional markup after the source.
    const extras = await Promise.all((scenario.with ?? []).map(async entry => ({
      script: await packageScript(entry, `https://cdn.jsdelivr.net/npm/${entry.package}@${entry.version}`), html: entry.html ?? "",
      translations: await widgetTranslations(`https://cdn.jsdelivr.net/npm/${entry.package}@${entry.version}`),
    })))
    const translations = new Map([...extras.flatMap(extra => [...extra.translations]), ...await widgetTranslations(base)])
    /** A label in the recording's language: the widget's translation of an English label, or of the one it starts with. */
    const t = (label, {prefix = false} = {}) => translations.get(label)
      ?? (prefix ? [...translations].find(([source]) => source.startsWith(label))?.[1] : undefined) ?? label
    // The editor's own snippet localization translates the markup, as when an author inserts the snippet.
    // `localization` adds entries in the same format for snippets that lack the language, and `markup` can adjust
    // content that is not text, such as data blocks.
    let markup = await sourceMarkup(browser, scenario, base) + extras.map(({html}) => html).join("")
    if(scenario.localization) markup += `<script type="application/json" class="snippet-localization">${JSON.stringify(scenario.localization).replaceAll("<", "\\u003c")}</script>`
    markup = await browser.evaluate(`import("/src/packages.ts").then(({localizeSnippet}) => localizeSnippet(${JSON.stringify(mergeLocalizations(markup))}, ${JSON.stringify(lang)}))`)
    if(scenario.markup) markup = scenario.markup(markup)
    const source = `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><title>${scenario.package}</title>
<script type="module" src="${await packageScript(scenario, base)}"></script>${extras.map(({script}) => `<script type="module" src="${script}"></script>`).join("")}<style>${scenario.style ?? ""}</style></head>
<body>${markup}</body></html>`
    await browser.evaluate(`document.querySelector("dom-editor").reloadDocument(${JSON.stringify(source)}, false, null, false).then(String)`)
    await browser.evaluate(`void ${cursorScript}`)

    const context = async kind => {
      const session = await waitFor(() => browser.frame(kind))
      // A scenario may frame a different widget in each take.
      const tag = JSON.stringify(typeof scenario.tag === "function" ? scenario.tag(kind) : scenario.tag)
      await waitFor(() => browser.evaluate(scenario.ready ?? `(() => { const widget = document.querySelector(${tag}); return customElements.get(widget?.localName) && widget.shadowRoot?.childElementCount > 0 })()`, session), 60_000)
      await sleep(scenario.settle ?? 1500)
      const frameBox = await browser.evaluate(`(() => {
        const find = root => { for(const element of root.querySelectorAll("*")) { if(element.localName === "iframe" && element.src.includes("kind=${kind}&")) return element; const nested = element.shadowRoot && find(element.shadowRoot); if(nested) return nested } }
        const box = find(document).getBoundingClientRect()
        return {x: box.x, y: box.y}
      })()`)
      const box = await browser.evaluate(`(({x, y, width, height}) => ({x, y, width, height}))(document.querySelector(${tag}).getBoundingClientRect())`, session)
      const widget = {...box, x: box.x + frameBox.x, y: box.y + frameBox.y}
      // The square crop centers the widget, or the region a scenario names, with a small margin.
      // Regions larger than the crop are scaled down, which makes their text smaller than on the page.
      const region = scenario.crop?.(widget) ?? widget
      const margin = (Math.max(region.width, region.height) * .04 + 2) | 0
      const side = Math.max(cropSize, Math.max(region.width, region.height) + 2 * margin)
      const clip = {x: region.x + region.width / 2 - side / 2, y: region.y + region.height / 2 - side / 2, width: side, height: side}
      if(clip.x < 0 || clip.y < 0 || clip.x + side > viewport.width || clip.y + side > viewport.height) {
        throw new Error(`The ${kind} crop ${JSON.stringify(clip)} leaves the ${viewport.width}×${viewport.height} viewport; adjust width, height, or style`)
      }
      const locate = async (predicate, timeout = 5000) => {
        const point = await waitFor(() => browser.evaluate(deepSearch(predicate), session), timeout).catch(async error => {
          if(debug) {
            const {data} = await browser.send("Page.captureScreenshot", {format: "png"})
            await writeFile(join(debug, `${name}-${kind}-failure.png`), Buffer.from(data, "base64"))
          }
          throw new Error(`Cannot find ${predicate} in the ${kind}`, {cause: error})
        })
        return {...point, x: point.x + frameBox.x, y: point.y + frameBox.y, left: point.left + frameBox.x, top: point.top + frameBox.y}
      }
      let pointer = {x: clip.x + side, y: clip.y + side}
      const draw = () => browser.evaluate(`${cursorScript}.style.translate = "${pointer.x - 3}px ${pointer.y - 2}px"`)
      const dispatch = (type, extra = {}) => browser.send("Input.dispatchMouseEvent", {type, x: pointer.x, y: pointer.y, pointerType: "mouse", ...extra})
      let pressed = false
      const mouse = {
        get position() { return {...pointer} },
        place(x, y) { pointer = {x, y}; return draw() },
        /** Eases to a point; `offset(t)` bends the path, for example along an arc. */
        async move(x, y, duration, offset = () => [0, 0]) {
          const from = pointer, start = performance.now()
          for(let t = 0; t < 1;) {
            t = Math.min(1, (performance.now() - start) / duration)
            const [dx, dy] = offset(t)
            pointer = {x: from.x + (x - from.x) * ease(t) + dx, y: from.y + (y - from.y) * ease(t) + dy}
            await Promise.all([draw(), dispatch("mouseMoved", pressed ? {button: "left", buttons: 1} : {})])
            await sleep(12)
          }
        },
        async down() {
          pressed = true
          await browser.evaluate(`${cursorScript}.style.scale = ".86"`)
          await dispatch("mousePressed", {button: "left", buttons: 1, clickCount: 1})
        },
        async up() {
          pressed = false
          await dispatch("mouseReleased", {button: "left", buttons: 0, clickCount: 1})
          await browser.evaluate(`${cursorScript}.style.scale = "1"`)
        },
        async click() { await mouse.down(); await sleep(90); await mouse.up() },
        /** A right click, which opens a context menu. */
        async contextClick() {
          await browser.evaluate(`${cursorScript}.style.scale = ".86"`)
          await dispatch("mousePressed", {button: "right", buttons: 2, clickCount: 1})
          await sleep(90)
          await dispatch("mouseReleased", {button: "right", buttons: 0, clickCount: 1})
          await browser.evaluate(`${cursorScript}.style.scale = "1"`)
        },
        async doubleClick() {
          for(const clickCount of [1, 2]) {
            await dispatch("mousePressed", {button: "left", buttons: 1, clickCount})
            await dispatch("mouseReleased", {button: "left", buttons: 0, clickCount})
          }
        },
        async clickAt({x, y}) { await mouse.place(x, y); await mouse.click() },
        async wheel(deltaX, deltaY) { await dispatch("mouseWheel", {deltaX, deltaY}) },
        /** Leaves focus and hover outside the widget before a take begins. */
        async blur() { await mouse.clickAt({x: clip.x + side / 2, y: Math.min(viewport.height - 4, clip.y + side + 40)}); await sleep(600) },
      }
      const keyboard = {
        async type(text, delay = 120) {
          for(const key of text) {
            await browser.send("Input.dispatchKeyEvent", {type: "keyDown", key, text: key})
            await browser.send("Input.dispatchKeyEvent", {type: "keyUp", key})
            await sleep(delay)
          }
        },
        async press(key, modifiers = 0) {
          const code = keyCodes[key] ?? key.toUpperCase().charCodeAt(0)
          await browser.send("Input.dispatchKeyEvent", {type: "rawKeyDown", key, windowsVirtualKeyCode: code, modifiers, ...(key === "Enter" ? {text: "\r"} : {})})
          await browser.send("Input.dispatchKeyEvent", {type: "keyUp", key, windowsVirtualKeyCode: code, modifiers})
        },
      }
      const exact = label => JSON.stringify(t(label))
      return {
        kind, lang, t, clip, widget, mouse, keyboard, locate,
        /** Reads from the frame; change the widget only through pointer and keyboard input. */
        evaluate: expression => browser.evaluate(expression, session),
        text: label => locate(`element => element.childElementCount === 0 && element.textContent.trim() === ${exact(label)}`),
        button: label => locate(`element => (element.localName === "button" || element.getAttribute("role") === "button" || element.localName === "sl-button") && (element.textContent.trim() === ${exact(label)} || element.getAttribute("aria-label") === ${exact(label)} || element.title === ${exact(label)})`),
        field: placeholder => locate(`element => (element.localName === "input" || element.localName === "textarea") && element.placeholder.startsWith(${JSON.stringify(t(placeholder, {prefix: true}))})`),
      }
    }

    // A screencast observes compositor frames; clipped screenshots would rescale the page under the pointer.
    const record = async (take, perform) => {
      const frames = []
      const stop = browser.on("Page.screencastFrame", ({data, metadata, sessionId}) => {
        frames.push({time: (metadata.timestamp ?? Date.now() / 1000) * 1000, data})
        void browser.send("Page.screencastFrameAck", {sessionId})
      })
      await browser.send("Page.startScreencast", {format: "png", maxWidth: viewport.width * 2, maxHeight: viewport.height * 2})
      await sleep(400)
      const start = performance.now(), origin = Date.now()
      await perform({...take, at: ms => sleep(Math.max(0, start + ms - performance.now()))})
      await sleep(Math.max(0, start + segment * 1000 - performance.now()))
      await browser.send("Page.stopScreencast")
      stop()
      const relative = frames.map(frame => ({...frame, time: frame.time - origin}))
      const first = relative.findLast(frame => frame.time <= 0) ?? relative[0]
      return [{...first, time: 0}, ...relative.filter(frame => frame.time > 0 && frame.time < segment * 1000)]
    }

    const editTake = await context("editor")
    await scenario.prepareEdit?.(editTake)
    const [takes, edit, use] = await withRecordingLock(async () => {
      const edit = await record(editTake, scenario.edit)
      // The preview frame signals readiness; the command's own promise can stay pending.
      await browser.evaluate(`void document.querySelector("dom-editor").enterPreview()`)
      const useTake = await context("preview")
      await scenario.prepareUse?.(useTake)
      return [[editTake, useTake], edit, await record(useTake, scenario.use)]
    })

    const clips = []
    for(const [index, frames] of [edit, use].entries()) {
      const {clip} = takes[index]
      const directory = join(temporary, String(index))
      await mkdir(directory)
      const list = []
      for(const [frameIndex, frame] of frames.entries()) {
        const file = join(directory, `${String(frameIndex).padStart(5, "0")}.png`)
        await writeFile(file, Buffer.from(frame.data, "base64"))
        const end = frames[frameIndex + 1]?.time ?? segment * 1000
        list.push(`file '${file}'`, `duration ${Math.max(1, end - frame.time) / 1000}`)
      }
      list.push(list.at(-2))
      await writeFile(join(directory, "frames.txt"), list.join("\n"))
      const video = join(temporary, `${index}.mkv`)
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(directory, "frames.txt"),
        "-vf", `fps=${fps},crop=${[clip.width, clip.height, clip.x, clip.y].map(value => 2 * Math.round(value)).join(":")},scale=${videoSize}:${videoSize}:flags=lanczos,format=yuv444p`, "-t", String(segment), "-c:v", "libx264", "-qp", "0", video])
      clips.push(video)
      process.stdout.write(`${name} ${index ? "use" : "edit"}: ${(frames.length / segment).toFixed(1)} captures per second\n`)
    }
    await mkdir(output, {recursive: true})
    const file = new URL(`${name}.mp4`, output)
    // A soft wipe separates authoring from use; the final frame holds after playback.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clips[0], "-i", clips[1], "-filter_complex",
      `[0][1]xfade=transition=smoothleft:duration=${transition}:offset=${segment - transition},format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-crf", "28", "-g", String(fps * 10), "-movflags", "+faststart", "-an", file.pathname])
    if(debug) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file.pathname, "-vf", "fps=2,scale=320:-1,tile=5x4", "-frames:v", "1", join(debug, `${name}-sheet.png`)])
    process.stdout.write(`${name}: ${file.pathname} (${Math.round((await stat(file)).size / 1024)} KB)\n`)
  }
  finally {
    await browser.close()
    await rm(temporary, {recursive: true, force: true})
  }
}

const available = (await readdir(scenarioDirectory)).filter(file => file.endsWith(".mjs")).map(file => file.slice(0, -4))
const names = process.argv.slice(2).filter(argument => !argument.startsWith("--"))
const unknown = names.filter(name => !available.includes(name))
if(unknown.length) throw new Error(`Unknown widget preview: ${unknown.join(", ")}`)
const failed = []
for(const name of names.length ? names : available) {
  const {default: module} = await import(new URL(`${name}.mjs`, scenarioDirectory).href)
  const scenario = typeof module === "function" ? module({lang}) : module
  for(let attempt = 0; ; attempt++) {
    try {
      await recordScenario(name, scenario)
      break
    }
    catch(error) {
      process.stderr.write(`${name}, attempt ${attempt + 1}: ${error.stack ?? error}\n`)
      if(attempt >= retries) {
        failed.push(name)
        break
      }
    }
  }
}
if(failed.length) {
  process.stderr.write(`Failed: ${failed.join(", ")}\n`)
  process.exitCode = 1
}
