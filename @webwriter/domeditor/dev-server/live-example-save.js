const extensions = {javascript: "js", typescript: "ts"}

export function widgetFiles({source, sourcePath, language, manifest, registration, registrationPath, shared, extraFiles}) {
  const extension = extensions[language] ?? language
  const [tag = "widget-example"] = Object.keys(manifest.exports ?? {})
    .filter(key => key.startsWith("./widgets/")).map(key => key.split("/").at(-1).replace(/\.[^.]+$/, ""))
  const files = new Map(extraFiles)
  const entry = Object.entries(manifest.exports ?? {}).find(([key]) => key.startsWith("./widgets/") && !key.endsWith(".css"))?.[1]
  const target = typeof entry === "string" ? entry : entry?.source ?? entry?.default
  const explicitSource = target?.replace(/^\.\//, "")
  let filename = explicitSource?.endsWith("." + extension) && !explicitSource.startsWith("dist/")
    ? explicitSource : `${tag}.${extension}`
  if(registration && !registrationPath) {
    const registrationName = explicitSource?.endsWith(".js") && !explicitSource.startsWith("dist/")
      ? explicitSource : `${tag}.js`
    const component = /\bfrom\s*["']\.\/([\w.-]+\.vue)["']/.exec(registration)?.[1]
    filename = files.has(registrationName) && component ? component : `${registrationName.slice(0, -3)}.vue`
    if(!files.has(registrationName)) {
      const module = registration.replace(/(\bfrom\s*["'])[^"']+\.vue(["'])/, `$1./${filename.split("/").at(-1)}$2`)
      files.set(registrationName, module)
    }
  } else if(language === "svelte" && files.has("compile.mjs")) {
    filename = /readFile\(["']([\w.-]+\.svelte)["']/.exec(files.get("compile.mjs"))?.[1] ?? filename
  }

  for(const {specifier, code, path} of shared) {
    const destination = manifest.imports?.[specifier] ?? path
    if(destination) files.set(destination.replace(/^\.\//, ""), code)
  }
  if(registrationPath && registration && !files.has(registrationPath)) files.set(registrationPath, registration)
  files.set(sourcePath ?? filename, source)
  files.set("package.json", JSON.stringify(manifest, null, 2))
  return files
}

export function mountLiveExampleSave(button, status, getFiles) {
  if(typeof window.showDirectoryPicker !== "function") {
    button.hidden = false
    button.setAttribute("aria-disabled", "true")
    button.title = "Folder saving is unavailable in this browser"
    button.addEventListener("click", () => {
      status.textContent = "Folder saving is unavailable in this browser."
    })
    return () => { status.textContent = "" }
  }
  button.hidden = false
  let generation = 0

  button.addEventListener("click", async () => {
    const revision = generation
    button.disabled = true
    status.textContent = ""
    let files
    let saved = 0
    let selectedFolder = false
    try {
      files = getFiles()
      for(const path of files.keys()) {
        if(path.split("/").some(segment => !/^[\w.-]+$/.test(segment) || segment === "." || segment === "..")) {
          throw new Error(`Invalid source file name ${path}.`)
        }
      }
      const root = await window.showDirectoryPicker({mode: "readwrite", id: "webwriter-widget-source"})
      selectedFolder = true
      for(const [path, source] of files) {
        const segments = path.split("/")
        let folder = root
        for(const segment of segments.slice(0, -1)) folder = await folder.getDirectoryHandle(segment, {create: true})
        const file = await folder.getFileHandle(segments.at(-1), {create: true})
        const writable = await file.createWritable()
        try {
          await writable.write(source.endsWith("\n") ? source : source + "\n")
          await writable.close()
        } catch(error) {
          await writable.abort().catch(() => {})
          throw error
        }
        saved++
      }
      if(revision === generation) status.textContent = `Saved ${saved} files to ${root.name}.`
    } catch(error) {
      if(revision === generation && (error.name !== "AbortError" || selectedFolder)) {
        const progress = saved ? `Saved ${saved} of ${files.size} files. ` : ""
        status.textContent = `${progress}Could not save widget files. ${error.message}`
      }
    } finally {
      button.disabled = false
    }
  })

  return () => {
    generation++
    status.textContent = ""
  }
}
