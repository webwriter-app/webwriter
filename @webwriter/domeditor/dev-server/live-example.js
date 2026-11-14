import {html} from "@codemirror/lang-html"
import {javascript} from "@codemirror/lang-javascript"
import {mountExampleCodeEditor, mountExampleHTMLEditor} from "../src/example-code-editor"
import {createLiveExampleDocument} from "./live-example-frame.js"
import {mountLiveExampleFullscreen} from "./live-example-fullscreen.js"
import {loadLiveExampleLibrary} from "./live-example-library.js"
import {mountLiveExampleSave, widgetFiles} from "./live-example-save.js"
import {readWidgetFolder, resolveFolderImports} from "./live-example-upload.js"

const editDelay = 300
const previewTimeout = 5000

export function mountLiveExample(example) {
  const sourcePane = example.querySelector("[data-live-source]")
  const packagePane = example.querySelector("[data-live-package]")
  const htmlPane = example.querySelector("[data-live-html]")
  const shadowPane = example.querySelector("[data-live-shadow]")
  const shadow = shadowPane.querySelector("code")
  const preview = example.querySelector("[data-live-preview]")
  const status = example.querySelector("[data-live-status]")
  const reset = example.querySelector("[data-live-reset]")
  const modes = example.querySelector("[data-live-modes]")
  const participants = example.querySelector("[data-live-participants]")
  const previewLabel = example.querySelector("[data-live-preview-label]")
  const picker = example.querySelector("[data-live-picker]")
  const upload = example.querySelector("[data-live-upload]")
  const fileStatus = example.querySelector("[data-live-save-status]")
  const readCode = (template, key) => template?.content.querySelector(`[data-live-${key}]`)?.textContent
  const extraCode = template => ({
    shared: [...(template?.content.querySelectorAll("[data-live-shared]") ?? [])]
      .map(code => ({specifier: code.dataset.liveShared, code: code.textContent, path: code.dataset.savePath})),
    extraFiles: [...(template?.content.querySelectorAll("[data-live-file]") ?? [])]
      .map(code => [code.dataset.liveFile, code.textContent]),
    setup: readCode(template, "setup"),
    registration: readCode(template, "registration"),
  })
  const original = {
    library: example.dataset.liveLibrary,
    language: sourcePane.dataset.language,
    ...extraCode(example.querySelector("template[data-live-extra]")),
    source: sourcePane.querySelector("pre code").textContent,
    title: example.querySelector("[data-live-title]")?.textContent,
    manifest: packagePane.querySelector("pre"),
    markup: htmlPane.querySelector("pre code").textContent,
    collaboration: example.hasAttribute("data-live-collaboration"),
  }
  let {library, language, shared, setup, registration, extraFiles} = original
  let {collaboration} = original
  let sourcePath, registrationPath, aliases
  let packageRevision = 0
  const libraryAssets = new Map()
  let editing = true
  let split = false
  let active, pending, peer, editTimer, editingAsset
  let runId = 0

  function mountEditor(mount, pane, initial, ...extensions) {
    const editor = mount(pane, initial, pane.querySelector("figcaption").textContent, schedulePreview, ...extensions)
    pane.querySelector("pre")?.remove()
    return {editor, initial}
  }

  const sourceLanguage = () => language === "vue" || language === "svelte" ? html()
    : javascript({jsx: ["jsx", "tsx"].includes(language), typescript: ["ts", "tsx"].includes(language)})
  let widgetSource = mountEditor(mountExampleCodeEditor, sourcePane, original.source, sourceLanguage())
  let documentHTML = mountEditor(mountExampleHTMLEditor, htmlPane, original.markup)
  const resetSaveStatus = mountLiveExampleSave(example.querySelector("[data-live-save]"),
    fileStatus, () => widgetFiles({
      source: widgetSource.editor.state.doc.toString(), sourcePath, language, registration, registrationPath, shared, extraFiles,
      manifest: JSON.parse(packagePane.querySelector("code").textContent),
    }))
  const sourceTabs = example.querySelector("[data-live-source-tabs]")
  const selectSourceTab = mountCodeTabs(sourceTabs, [sourcePane, packagePane],
    () => widgetSource.editor.requestMeasure())
  mountPreviewError(preview, status, () => {
    selectSourceTab(0)
    widgetSource.editor.focus()
  })
  mountCodeTabs(example.querySelector("[data-live-code-tabs]"), [htmlPane, shadowPane],
    () => documentHTML.editor.requestMeasure())
  mountLiveExampleFullscreen(example)
  reset.closest(".live-example-controls").hidden = false
  modes.hidden = false
  updateParticipants()
  upload.hidden = false
  if(typeof window.showDirectoryPicker !== "function") {
    upload.setAttribute("aria-disabled", "true")
    upload.title = "Folder loading is unavailable in this browser"
  }
  upload.addEventListener("click", async () => {
    if(typeof window.showDirectoryPicker !== "function") {
      fileStatus.textContent = "Folder loading is unavailable in this browser."
      return
    }
    const revision = packageRevision
    upload.disabled = true
    fileStatus.textContent = ""
    try {
      const directory = await window.showDirectoryPicker({mode: "read", id: "webwriter-widget-source"})
      const project = await readWidgetFolder(directory)
      if(revision !== packageRevision) return
      if(picker) {
        picker.querySelector('option[value="uploaded"]')?.remove()
        picker.add(new Option(project.manifest.name || directory.name, "uploaded"))
        picker.value = "uploaded"
      }
      const manifest = document.createElement("pre")
      const code = manifest.appendChild(document.createElement("code"))
      code.textContent = JSON.stringify(project.manifest, null, 2)
      applyExample({...project, manifest, title: project.manifest.name || directory.name})
      selectSourceTab(0)
      fileStatus.textContent = `Loaded widget files from ${directory.name}.`
    } catch(error) {
      if(revision === packageRevision && error.name !== "AbortError") {
        fileStatus.textContent = `Could not load widget files. ${error.message}`
      }
    } finally {
      upload.disabled = false
    }
  })
  picker?.addEventListener("change", () => {
    picker.querySelector('option[value="uploaded"]')?.remove()
    const option = [...example.querySelectorAll("template[data-live-option]")]
      .find(template => template.dataset.liveOption === picker.value)
    applyExample(option ? {
      ...extraCode(option),
      source: readCode(option, "source"), markup: readCode(option, "html"),
      manifest: option.content.querySelector("template[data-live-package]").content.querySelector("pre"),
      library: option.dataset.library, language: option.dataset.language,
      collaboration: option.hasAttribute("data-live-collaboration"),
    } : original)
  })

  function applyExample(project) {
    packageRevision++
    const {source, markup, manifest} = project
    const title = example.querySelector("[data-live-title]")
    if(title) title.textContent = project.title ?? original.title
    library = project.library
    language = project.language
    shared = project.shared
    setup = project.setup
    registration = project.registration
    extraFiles = project.extraFiles
    collaboration = project.collaboration
    sourcePath = project.sourcePath
    registrationPath = project.registrationPath
    aliases = project.aliases
    split = false
    updateParticipants()
    example.dataset.liveLibrary = library
    clearTimeout(editTimer)
    closeSession(active)
    closeSession(pending)
    closeSession(peer)
    active = pending = peer = undefined
    shadow.replaceChildren()
    packagePane.querySelector("pre").replaceWith(manifest.cloneNode(true))
    packagePane.querySelector("pre").tabIndex = packagePane.hidden ? -1 : 0
    resetSaveStatus()
    widgetSource.editor.destroy()
    documentHTML.editor.destroy()
    widgetSource = mountEditor(mountExampleCodeEditor, sourcePane, source, sourceLanguage())
    documentHTML = mountEditor(mountExampleHTMLEditor, htmlPane, markup)
    runPreview()
  }
  modes.addEventListener("click", event => {
    const button = event.target.closest("button[data-live-mode]")
    if(!button || button.getAttribute("aria-pressed") === "true") return
    editing = button.dataset.liveMode === "editing"
    for(const option of modes.querySelectorAll("button")) option.setAttribute("aria-pressed", String(option === button))
    for(const session of [active, pending, peer]) configureSession(session)
    if(editing && peer?.ready) sendRun(peer, documentHTML.editor.state.doc.toString())
  })
  participants.addEventListener("click", event => {
    const button = event.target.closest("button[data-live-layout]")
    if(!button || !collaboration || button.getAttribute("aria-pressed") === "true") return
    split = button.dataset.liveLayout === "shared"
    if(!split) {
      closeSession(peer)
      peer = undefined
    }
    updateParticipants()
    configureSession(active)
    configureSession(pending)
    ensurePeer()
  })
  reset.addEventListener("click", () => {
    packageRevision++
    resetSaveStatus()
    for(const {editor, initial} of [widgetSource, documentHTML]) {
      editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: initial}, selection: {anchor: 0}})
      editor.scrollDOM.scrollTop = 0
      editor.scrollDOM.scrollLeft = 0
    }
  })

  function schedulePreview() {
    clearTimeout(editTimer)
    editTimer = setTimeout(runPreview, editDelay)
  }

  function updateParticipants() {
    participants.hidden = !collaboration
    previewLabel.hidden = collaboration
    preview.toggleAttribute("data-live-split", split && peer?.ready === true)
    for(const button of participants.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(split === (button.dataset.liveLayout === "shared")))
    }
    if(active?.frame) active.frame.title = split ? "Participant 1 preview" : "Widget preview"
  }

  function isCurrent(session) {
    return session && [active, pending, peer].includes(session)
  }

  async function configureSession(session) {
    if(!session?.connected) return
    const configure = editor => session.channel.port1.postMessage({editing, collaboration, sharedReading: split && !editing, editor})
    configure()
    if(!editing || session.editorSent) return
    try {
      editingAsset ??= import("virtual:live-example-editing").then(module => module.default).catch(error => {
        editingAsset = undefined
        throw error
      })
      const editor = await editingAsset
      if(!isCurrent(session) || !editing || session.editorSent) return
      session.editorSent = true
      configure(editor)
    }
    catch(error) { if(isCurrent(session) && editing) status.textContent = String(error) }
  }

  function ensurePeer() {
    if(!split || !active?.ready || peer?.source === active.source) return
    closeSession(peer)
    peer = {
      source: active.source, code: active.code, runtime: active.runtime, shared: active.shared, participant: true,
      markup: documentHTML.editor.state.doc.toString(),
    }
    updateParticipants()
    openFrame(peer)
  }

  function closeSession(session) {
    if(!session) return
    clearTimeout(session.timeout)
    session.channel?.port1.close()
    session.channel?.port2.close()
    session.frame?.remove()
  }

  function reportFailure(session, message) {
    if(session === pending) {
      pending = undefined
      closeSession(session)
    }
    if(session === peer && !session.ready) {
      peer = undefined
      closeSession(session)
      updateParticipants()
    }
    status.textContent = message
  }

  function sendRun(session, markup, source, runtime) {
    const id = ++runId
    session.id = id
    session.sentMarkup = markup
    clearTimeout(session.timeout)
    session.timeout = setTimeout(() => {
      session.id = 0
      session.failed = true
      reportFailure(session, "The preview did not respond.")
    }, previewTimeout)
    session.channel.port1.postMessage({id, html: markup, source, runtime,
      shared: source === undefined ? undefined : (session.shared ?? shared).map(({specifier, code}) => [specifier, code])})
  }

  function showShadow(markup) {
    const [root, ...lines] = markup.slice(0, 16000).split("\n")
    const first = document.createElement("span")
    first.className = "line"
    first.textContent = root
    shadow.replaceChildren(first, lines.length ? "\n" + lines.join("\n") : "")
  }

  function acceptPreviewHTML(session, markup) {
    if(typeof markup !== "string" || markup.length > 250000) return false
    const {editor} = documentHTML
    const current = editor.state.doc.toString()
    // A message from the preview must never overwrite text typed since its last run.
    if(current !== session.sentMarkup || widgetSource.editor.state.doc.toString() !== session.source) return false
    session.sentMarkup = markup
    if(markup === current) return false
    let from = 0
    let to = current.length
    let end = markup.length
    while(from < Math.min(to, end) && current[from] === markup[from]) from++
    while(to > from && end > from && current[to - 1] === markup[end - 1]) { to--; end-- }
    editor.dispatch({changes: {from, to, insert: markup.slice(from, end)}, userEvent: "input.preview"})
    return true
  }

  function applySnapshot(session, data) {
    const currentSource = widgetSource.editor.state.doc.toString()
    if(currentSource !== session.source) return
    if(session === active) {
      showShadow(data.shadow)
      if(acceptPreviewHTML(session, data.html) && editing && peer?.ready && peer.sentMarkup !== data.html) sendRun(peer, data.html)
    } else if(editing && session === peer) {
      if(acceptPreviewHTML(session, data.html) && active?.ready && active.sentMarkup !== data.html) sendRun(active, data.html)
    }
    if(!split || editing || !Array.isArray(data.data) || data.data.length > 128) return
    const other = session === active ? peer : active
    if(!other?.ready || other.source !== session.source) return
    const changes = data.data.filter(entry => Array.isArray(entry) && typeof entry[0] === "string" && entry[0].length < 1024
      && typeof entry[1] === "string" && entry[1].length <= 250000)
    if(changes.length) other.channel.port1.postMessage({id: other.id, data: changes})
  }

  async function runPreview() {
    const source = widgetSource.editor.state.doc.toString()
    const markup = documentHTML.editor.state.doc.toString()
    status.textContent = ""
    if(active?.source === source && active.id !== 0) {
      closeSession(pending)
      pending = undefined
      if(active.sentMarkup !== markup || active.failed) sendRun(active, markup)
      if(peer?.ready && (peer.sentMarkup !== markup || peer.failed)) sendRun(peer, markup)
      return
    }
    if(pending?.source === source) {
      pending.markup = markup
      return
    }
    closeSession(pending)
    const session = {source, markup}
    pending = session
    let runtime, code
    try {
      const modules = [source, setup, registration, ...shared.map(({code}) => code)].join("\n")
      const useLitWidget = /["'](?:@webwriter\/lit|@lit-labs\/signals)["']/.test(modules)
      const useWidgetEffects = modules.includes('"#preview-widget-effects"')
      const useWidgetRuntime = /["']@webwriter\/widget["']/.test(modules)
      const key = `${library}:${language}:${useLitWidget}:${useWidgetEffects}:${useWidgetRuntime}`
      if(!libraryAssets.has(key)) {
        libraryAssets.set(key, loadLiveExampleLibrary(library, language, useLitWidget, useWidgetEffects, useWidgetRuntime).catch(error => {
          libraryAssets.delete(key)
          throw error
        }))
      }
      const assets = await libraryAssets.get(key)
      runtime = assets.runtime
      if(session !== pending) return
      code = await assets.compile(source, registration)
      if(sourcePath) {
        const imports = JSON.parse(packagePane.querySelector("code").textContent).imports
        code = await resolveFolderImports(code, sourcePath, shared, imports, aliases, registrationPath)
        session.shared = await Promise.all(shared.map(async module => ({...module,
          code: await resolveFolderImports(module.code, module.path, shared, imports, aliases),
        })))
      }
    }
    catch(error) {
      if(session === pending) {
        if(widgetSource.editor.state.doc.toString() === source) reportFailure(session, String(error))
        else pending = undefined
      }
      return
    }
    if(session !== pending || widgetSource.editor.state.doc.toString() !== source) {
      if(session === pending) pending = undefined
      return
    }
    if(setup) code = `${setup}\n${code}`
    Object.assign(session, {code, runtime})
    openFrame(session)
  }

  function openFrame(session) {
    const frame = document.createElement("iframe")
    frame.title = session.participant ? "Participant 2 preview" : split ? "Participant 1 preview" : "Widget preview"
    frame.dataset.liveParticipant = session.participant ? "2" : "1"
    frame.height = "110"
    frame.setAttribute("sandbox", "allow-scripts")
    frame.setAttribute("referrerpolicy", "no-referrer")
    frame.setAttribute("aria-hidden", "true")
    frame.tabIndex = -1
    frame.dataset.staging = ""
    const channel = new MessageChannel()
    Object.assign(session, {frame, channel})

    channel.port1.onmessage = ({data}) => {
      if(!isCurrent(session) || !data) return
      if(typeof data.editorError === "string") {
        status.textContent = data.editorError.slice(0, 2000)
        return
      }
      if(data.id !== session.id) return
      if(data.resize === true && session.ready && Number.isFinite(data.height)) {
        resizeFrame(frame, data.height)
        return
      }
      if(data.changed === true) {
        if(session.ready && typeof data.shadow === "string") applySnapshot(session, data)
        return
      }
      clearTimeout(session.timeout)
      if(typeof data.error === "string") {
        session.failed = true
        reportFailure(session, data.error.slice(0, 2000))
        return
      }
      if(typeof data.shadow !== "string" || !Number.isFinite(data.height)) return
      session.failed = false
      if(session === pending) {
        if(widgetSource.editor.state.doc.toString() !== session.source) {
          closeSession(session)
          pending = undefined
          return
        }
        closeSession(active)
        active = session
        pending = undefined
      }
      const firstRender = !session.ready
      session.ready = true
      delete frame.dataset.staging
      frame.removeAttribute("aria-hidden")
      frame.removeAttribute("tabindex")
      if(session === peer && firstRender) updateParticipants()
      resizeFrame(frame, data.height)
      applySnapshot(session, data)
      if(session === active) ensurePeer()
      const currentHTML = documentHTML.editor.state.doc.toString()
      if(session === active && session.sentMarkup !== currentHTML && widgetSource.editor.state.doc.toString() === session.source) schedulePreview()
      if(session === peer && (firstRender || editing) && session.sentMarkup !== currentHTML) sendRun(session, currentHTML)
    }

    frame.addEventListener("load", () => {
      if(!isCurrent(session)) return
      // An opaque sandbox cannot receive a message addressed to a tuple origin.
      // The handshake transfers a port only, and code is sent over that port.
      frame.contentWindow.postMessage({type: "live-example-connect"}, "*", [channel.port2])
      session.connected = true
      configureSession(session)
      sendRun(session, session.markup, session.code, session.runtime)
    }, {once: true})
    session.timeout = setTimeout(() => reportFailure(session, "The preview could not load."), previewTimeout)
    frame.srcdoc = createLiveExampleDocument(library)
    preview.append(frame)
  }

  runPreview()
}

function mountPreviewError(preview, status, focusSource) {
  const pane = preview.parentElement
  const covered = [pane.querySelector("figcaption"), preview]
  const overlay = pane.querySelector("[data-live-error]")
  const message = overlay.querySelector("p")
  const dismiss = overlay.querySelector("button")
  const supportsTopLayer = typeof overlay.showPopover === "function"
  const scrollport = pane.closest(".docs-layout")
  let frame
  let bounds

  function align() {
    const {left, top, width, height} = pane.getBoundingClientRect()
    const viewport = (document.fullscreenElement ?? scrollport)?.getBoundingClientRect()
    const visibleTop = Math.max(top, viewport?.top ?? 0)
    const visibleBottom = Math.min(top + height, viewport?.bottom ?? window.innerHeight)
    if(width && visibleBottom > visibleTop && !pane.inert) {
      const next = `${visibleTop},${left},${width},${visibleBottom - visibleTop}`
      if(next !== bounds) {
        bounds = next
        overlay.style.setProperty("--preview-top", `${visibleTop}px`)
        overlay.style.setProperty("--preview-left", `${left}px`)
        overlay.style.setProperty("--preview-width", `${width}px`)
        overlay.style.setProperty("--preview-height", `${visibleBottom - visibleTop}px`)
      }
      if(!overlay.matches(":popover-open")) {
        const previousFocus = document.activeElement
        overlay.showPopover()
        if(previousFocus !== document.activeElement && !pane.contains(previousFocus)) {
          previousFocus?.focus({preventScroll: true})
        }
      }
    } else if(overlay.matches(":popover-open")) overlay.hidePopover()
  }

  function track() {
    if(!pane.isConnected) return
    align()
    frame = requestAnimationFrame(track)
  }

  function sync() {
    const error = status.textContent
    if(error) {
      message.textContent = error
      if(!overlay.hidden) return
      const focused = pane.contains(document.activeElement)
      for(const child of covered) child.inert = true
      overlay.hidden = false
      if(supportsTopLayer) track()
      else overlay.setAttribute("open", "")
      if(focused) {
        if(!supportsTopLayer || overlay.matches(":popover-open")) dismiss.focus({preventScroll: true})
        else focusSource()
      }
    } else if(!overlay.hidden) {
      const focused = overlay.contains(document.activeElement)
      if(supportsTopLayer) {
        cancelAnimationFrame(frame)
        if(overlay.matches(":popover-open")) overlay.hidePopover()
      } else overlay.removeAttribute("open")
      overlay.hidden = true
      for(const child of covered) child.inert = false
      if(focused) focusSource()
    }
  }

  dismiss.addEventListener("click", () => { status.textContent = "" })
  overlay.addEventListener("keydown", event => {
    if(event.key !== "Escape") return
    event.preventDefault()
    event.stopPropagation()
    status.textContent = ""
  })
  new MutationObserver(sync).observe(status, {childList: true})
}

function mountCodeTabs(tablist, panes, measureEditor) {
  const tabs = [...tablist.querySelectorAll("button")]

  function select(index) {
    for(const [position, tab] of tabs.entries()) {
      const current = index === position
      tab.setAttribute("aria-selected", String(current))
      tab.tabIndex = current ? 0 : -1
      panes[position].hidden = !current
      if(position === 1) panes[position].querySelector("pre").tabIndex = current ? 0 : -1
    }
    if(index === 0) measureEditor()
  }

  for(const [index, tab] of tabs.entries()) {
    const pane = panes[index]
    pane.setAttribute("role", "tabpanel")
    pane.setAttribute("aria-labelledby", tab.id)
    tab.addEventListener("click", () => select(index))
  }
  tablist.addEventListener("keydown", event => {
    const index = tabs.indexOf(event.target)
    if(index === -1) return
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : ["ArrowLeft", "ArrowRight"].includes(event.key) ? 1 - index : undefined
    if(next === undefined) return
    event.preventDefault()
    select(next)
    tabs[next].focus()
  })
  select(0)
  tablist.hidden = false
  return select
}

function resizeFrame(frame, height) {
  const size = String(Math.max(45, Math.min(1000, Math.ceil(height))))
  if(frame.height !== size) frame.height = size
}
