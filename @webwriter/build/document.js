#!/usr/bin/env node

import {execFile as execFileSync} from "child_process"
import {createRequire} from "module"
import {promisify} from "util"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from 'os'

// Name and version of this package, for the signature line of a generated README.
const selfPkg = JSON.parse(await fs.readFile(new URL("./package.json", import.meta.url), "utf8"))

const execFile = promisify(execFileSync)

function tableEscape(str) {
  return str?.replaceAll("|", "\\|")?.replaceAll("\n", "<br>")
}

export async function document() {
  await generateManifest()
  await generateReadme()
}

/**
 * The source file of each widget export, from the `source` condition or, for a browser-ready
 * export, from the file itself. A wildcard key (`./widgets/ww-x.*`) has one source file.
 */
export function widgetSources(pkgExports) {
  return Object.entries(pkgExports)
    .filter(([key]) => key.startsWith("./widgets/") && !key.endsWith(".css"))
    .map(([, target]) => typeof target === "string" ? target : target?.source ?? (typeof target?.default === "string" ? target.default : undefined))
    .filter(path => typeof path === "string" && !path.includes("*") && /\.[cm]?[jt]sx?$/.test(path))
    .map(path => path.replace(/^\.\//, ""))
    .filter((path, index, all) => all.indexOf(path) === index)
}

/** Files that the analyzer never reads: declarations, tests, build output, dependencies and generated catalogs. */
const analyzerExclude = ["**/*.d.ts", "**/*.test.*", "**/node_modules/**", "**/dist/**", "**/localization/**", "**/generated/**", "**/tests/**"]

/**
 * The globs for the analyzer: the folder that holds each widget source, or the file itself at the
 * package root. The analyzer reads only the sources and what they import from the same folder,
 * never `dist/` chunks or generated translation catalogs.
 */
export function analyzerGlobs(sources) {
  return [...new Set(sources.map(path => path.includes("/") ? `${path.split("/")[0]}/**/*.{js,ts,tsx}` : path))]
}

/** A plugin of the manifest analyzer: from the installed package, or else downloaded once. Undefined when neither works. */
async function pluginScript(tempPath) {
  try {
    const url = import.meta.resolve("@wc-toolkit/cem-inheritance")
    return `import {cemInheritancePlugin} from ${JSON.stringify(url)}\nexport default {plugins: [cemInheritancePlugin()]}\n`
  }
  catch {}
  try {
    // Not installed: fetch the bundled plugins as before. This needs a network connection.
    const download = async url => {
      const response = await fetch(url)
      if(!response.ok) throw new Error(`${response.status} for ${url}`)
      return response.text()
    }
    const jsdoctags = await download("https://cdn.jsdelivr.net/npm/@wc-toolkit/jsdoc-tags@1.1.0")
    const inheritance = (await download("https://cdn.jsdelivr.net/npm/@wc-toolkit/cem-inheritance@1.2.2")).replace(`@wc-toolkit/jsdoc-tags`, `./jsdoctags.js`)
    await fs.writeFile(join(tempPath, "jsdoctags.js"), jsdoctags)
    await fs.writeFile(join(tempPath, "inheritance.js"), inheritance)
    return `import {cemInheritancePlugin} from "./inheritance.js"\nexport default {plugins: [cemInheritancePlugin()]}\n`
  }
  catch(error) {
    console.warn(`Could not load the inheritance plugin (${error.message}). Continuing without it: members of base classes are not copied into the manifest. Add @wc-toolkit/cem-inheritance to the dependencies of @webwriter/build to avoid the download.`)
  }
}

async function generateManifest() {
  console.log("Generating custom elements manifest")
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"))
  const sources = widgetSources(pkg?.exports ?? {})
  const tempPath = await fs.mkdtemp(join(tmpdir(), "wwbuild-"))
  try {
    const configPath = join(tempPath, "custom-elements-manifest.config.mjs")
    await fs.writeFile(configPath, await pluginScript(tempPath) ?? "export default {}\n")
    // The analyzer is a dependency of this package, so it runs from there and needs no download.
    const analyzer = createRequire(import.meta.url).resolve("@custom-elements-manifest/analyzer/cem.js")
    const globs = sources.length ? analyzerGlobs(sources) : ["**/*.{js,ts,tsx}"]
    const {stdout, stderr} = await execFile(process.execPath, [analyzer, "analyze", "--litelement", "--config", configPath, "--globs", ...globs, "--exclude", ...analyzerExclude], {maxBuffer: 64 * 1024 * 1024})
    stderr? console.error(stderr): console.log(stdout)
  }
  finally {
    await fs.rm(tempPath, {recursive: true, force: true})
  }
  if(sources.length) {
    // Keep only the widget modules; a failure here must not leave an unfiltered manifest.
    const cem = JSON.parse(await fs.readFile("custom-elements.json", "utf8"))
    cem.modules = cem.modules.filter(mod => sources.includes(mod.path))
    await fs.writeFile("custom-elements.json", JSON.stringify(cem, undefined, 2))
  }
  console.log("Updating package.json")
  pkg.customElements = "custom-elements.json"
  pkg.exports = {...pkg.exports, "./custom-elements.json": "./custom-elements.json"}
  await fs.writeFile("./package.json", JSON.stringify(pkg, undefined, 2), "utf8")
}

function widgetMarkdown(pkg, manifest, id) {
const pkgExports = pkg?.exports ?? {}

const tag = id.replace("./widgets/", "").slice(0, -2)
const scriptId = id.slice(0, -1) + "js"
const scriptPath = pkgExports[scriptId]?.default ?? pkgExports[scriptId]
const scriptLocal = [pkg.name, scriptId.slice(2)].join("/")
const scriptCDN = new URL(scriptLocal, "https://cdn.jsdelivr.net/npm/").href
const styleId = id.slice(0, -1) + "css"
const stylePath = pkgExports[styleId]?.default ?? pkgExports[styleId]
const styleLocal = [pkg.name, styleId.slice(2)].join("/")
const styleCDN = new URL(styleLocal, "https://cdn.jsdelivr.net/npm/").href

const editingConfig = pkg?.editingConfig?.[`./widgets/${tag}`] ?? {}
const widgetModule = manifest.modules?.find(mod => mod.exports.some(exp => exp.kind === "custom-element-definition" && exp.name === tag))
const className = widgetModule.exports.find(exp => exp.kind === "custom-element-definition" && exp.name === tag).declaration.name
const widgetClass = widgetModule.declarations.find(decl => decl.kind === "class" && decl.name === className)
const publicFields = widgetClass?.members?.filter(decl => decl.kind === "field" && (!decl.privacy || decl.privacy === "public")) ?? []
const excludedMethodNames = [
  "connectedCallback", "disconnectedCallback", "attributeChangedCallback", "adoptedCallback", // standard lifecycle
  "shouldUpdate", "willUpdate", "update", "render", "firstUpdated", "updated" // lit lifecycle
]
const publicMethods = widgetClass?.members?.filter(decl => decl.kind === "method" && (!decl.privacy || decl.privacy === "public") && !excludedMethodNames.includes(decl.name)) ?? []

const fieldsTemplate = !publicFields.length? undefined:
`| Name (Attribute Name) | Type | Description | Default | Reflects |
| :-------------------: | :--: | :---------: | :-----: | :------: |
${publicFields.map(field => `| \`${tableEscape(field.static? `${className}.${field.name}`: field.name)}\`${tableEscape(field.attribute? ` (\`${field.attribute}\`)`: "")} | ${field.type?.text? tableEscape("\`" + field.type?.text + "\`"): "-"} | ${tableEscape(field.description ?? "-")} | ${field.default? tableEscape("\`" + field.default + "\`"): "-"} | ${field.reflects? "✓": "✗"} |`).join("\n")}

*Fields including [properties](https://developer.mozilla.org/en-US/docs/Glossary/Property/JavaScript) and [attributes](https://developer.mozilla.org/en-US/docs/Glossary/Attribute) define the current state of the widget and offer customization options.*`

const methodsTemplate = !publicMethods.length? undefined:
`| Name | Description | Parameters |
| :--: | :---------: | :-------: |
${publicMethods.map(field => `| \`${tableEscape(field.name)}\` | ${tableEscape(field.description ?? "-")} | ${field.parameters?.length? field.parameters.map(param => "\`" + param.name + (param.type?.text? `: ${param.type.text}`: "") + (param.default? `=${param.default}`: "") + "\`").join(", "): "-"}`).join("\n")}

*[Methods](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Method_definitions) allow programmatic access to the widget.*`

const slotsTemplate = !widgetClass?.slots?.length? undefined:
`| Name | Description | Content Type |
| :--: | :---------: | :----------: |
${widgetClass?.slots.map(field => `| ${field.name? `\`${tableEscape(field.name)}\``: "*(default)*"} | ${tableEscape(field.description ?? "-")} | ${editingConfig?.content? tableEscape(editingConfig.content): "-"} |`).join("\n")}

*[Slots](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots) define how the content of the widget is rendered.*`

const eventsTemplate = !widgetClass?.events?.length? undefined:
`| Name | Description |
| :--: | :---------: |
${widgetClass?.events.map(field => `| ${tableEscape(field.name)} | ${tableEscape(field.description ?? "-")} |`).join("\n")}

*[Events](https://developer.mozilla.org/en-US/docs/Web/Events) are dispatched by the widget after certain triggers.*`

const cssPropertiesTemplate = !widgetClass?.cssProperties?.length? undefined:
`| Name | Description |
| :--: | :---------: |
${widgetClass?.cssProperties.map(field => `| ${tableEscape(field.name)} | ${tableEscape(field.description ?? "-")} |`).join("\n")}

*[Custom CSS properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties) offer defined customization of the widget's style.*`

const cssPartsTemplate = !widgetClass?.cssParts?.length? undefined:
`| Name | Description |
| :--: | :---------: |
${widgetClass?.cssParts.map(field => `| ${tableEscape(field.name)} | ${tableEscape(field.description ?? "-")} |`).join("\n")}

*[CSS parts](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_shadow_parts) allow freely styling internals of the widget with CSS.*`

const editingConfigTemplate = !editingConfig? undefined:
`| Name | Value |
| :--: | :---------: |
${Object.keys(editingConfig).map(k => `| \`${tableEscape(k)}\` | \`${tableEscape(String(editingConfig[k]))}\` |`).join("\n")}

*The [editing config](https://webwriter.app/docs/packages/configuring/#editingconfig) defines how explorable authoring tools such as [WebWriter](https://webwriter.app) treat the widget.*`

const templates = {
  "fields": fieldsTemplate,
  "methods": methodsTemplate,
  "slots": slotsTemplate,
  "events": eventsTemplate,
  "custom CSS properties": cssPropertiesTemplate,
  "CSS parts": cssPartsTemplate,
  "editing config": editingConfigTemplate
}

const nonemptyNames = Object.keys(templates)?.filter(k => templates[k]) ?? []
const emptyNames = Object.keys(templates)?.filter(k => !templates[k]) ?? []

let emptyTemplate = ""
if(emptyNames.length >= 2) {
  emptyTemplate = `*No public ${emptyNames.slice(0, -1).join(", ")}, or ${emptyNames[emptyNames.length - 1]}.*`
}
else if(emptyNames.length === 1) {
  emptyTemplate = `*No public ${emptyNames[0]}.*`
}

return `## \`${className}\` (\`<${tag}>\`)
${widgetClass?.description}

### Usage

Use with a CDN (e.g. [jsdelivr](https://jsdelivr.com)):
\`\`\`html
<link href="${styleCDN}" rel="stylesheet">
<script type="module" src="${scriptCDN}"></script>
<${tag}></${tag}>
\`\`\`

Or use with a bundler (e.g. [Vite](https://vite.dev)):

\`\`\`
npm install ${pkg.name}
\`\`\`

\`\`\`html
<link href="${styleLocal}" rel="stylesheet">
<script type="module" src="${scriptLocal}"></script>
<${tag}></${tag}>
\`\`\`

${nonemptyNames.map(name => `## ${name[0].toUpperCase() + name.slice(1)}\n${templates[name]}`).join("\n\n")}

${emptyTemplate}
`
}

async function generateReadme() {

const pkg = JSON.parse(await fs.readFile("package.json", "utf8"))
let readme = null
let readmePath = "README.md"
do {
  try {
    readme = await fs.readFile(readmePath, "utf8")
  }
  catch(err) {
    break
  }
  // The signature is the last line with text; a trailing newline does not hide it.
  if(readme && !readme.trimEnd().split("\n").at(-1).startsWith(`*Generated with ${selfPkg.name}@`)) {
    if(readmePath === "README.md") {
      console.warn(`Existing ${readmePath} not signed by ${selfPkg.name}, using API.md instead.`)
      readmePath = "API.md"
      continue
    }
    else {
      console.warn(`Existing ${readmePath} not signed by ${selfPkg.name}, aborting. `)
      return
    }
  }
  break
} while(true)
const pkgExports = pkg?.exports ?? {}
const manifestPath = pkg?.customElements ?? "custom-elements.json"
let manifest
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
}
catch(err) {
  console.warn(`No manifest found at ${manifestPath}, aborting`)
  return
}

const memberIDs = Object.keys(pkgExports)
const widgetIDs = memberIDs.filter(id => id.startsWith("./widgets/"))
const snippetIDs = memberIDs.filter(id => id.startsWith("./snippets/"))
const themeIDs = memberIDs.filter(id => id.startsWith("./themes/"))

const widgetsTemplate = widgetIDs.map(id => widgetMarkdown(pkg, manifest, id)).join("\n\n")

const snippetsTemplate = !snippetIDs.length? "": 
`## Snippets
[Snippets](https://webwriter.app/docs/snippets/snippets/) are examples and templates using the package's widgets.

| Name | Import Path |
| :--: | :---------: |
${snippetIDs.map(id => `| ${id.replace("./snippets/", "").replace(".html", "").split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" ")} | \`${pkg.name + id.slice(1)}\` |`).join("\n")}`

const themesTemplate = !themeIDs.length? "": 
`## Themes
[Themes](https://webwriter.app/docs/themes/themes/) are stylesheets to apply to a whole document.

| Name | Import Path |
| :--: | :---------: |
${themeIDs.map(id => `| ${id.replace("./themes/", "")} | ${pkg.name + id.slice(1)} |`).join("\n")}`

const prettyName = 
  pkg?.editingConfig?.["."]?.label?._ ?? pkg.name.slice(1).split("/")[1].split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" ")

const description = pkg?.editingConfig?.["."]?.description?._ ?? pkg?.description

const template = 
`# ${prettyName} (\`${pkg.name}@${pkg.version}\`)
[License: ${pkg.license}](LICENSE) | Version: ${pkg.version}

${description}

${snippetsTemplate}

${themesTemplate}

${widgetsTemplate}

---
*Generated with ${selfPkg.name}@${selfPkg.version}*`

console.log(`Generating ${readmePath}`)
return fs.writeFile(readmePath, template, "utf8")
}