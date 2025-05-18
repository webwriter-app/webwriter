#!/usr/bin/env node

import {exec as execSync} from "child_process"
import {promisify} from "util"
import { promises as fs } from "fs"
import {join} from "path"

const selfPkg = {
  name: "@webwriter/build",
  version: "1.6.0"
}

const exec = promisify(execSync)

function tableEscape(str) {
  return str?.replaceAll("|", "\\|")
}

export async function document() {
  await generateManifest()
  await generateReadme()
}

async function generateManifest() {
  console.log("Generating custom elements manifest")
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"))
  const pkgExports = pkg?.exports ?? {}
  const widgetPaths = Object.keys(pkgExports).filter(k => k.startsWith("./widgets/")).map(k => pkgExports[k]?.source).filter(p => p)
  const globsPart = widgetPaths.length? `--globs ${widgetPaths.map(p => `"${p}"`).join(" ")}`: ""
  const {stdout, stderr} = await exec(`npx @custom-elements-manifest/analyzer analyze --litelement ${globsPart}`)
  stderr? console.error(stderr): console.log(stdout)
  console.log("Updating package.json")
  pkg.customElements = "custom-elements.json"
  pkg.exports = {...pkg.exports, "./custom-elements.json": "./custom-elements.json"}
  await fs.writeFile("./package.json", JSON.stringify(pkg, undefined, 2), "utf8")
}

function widgetMarkdown(pkg, manifest, id) {
const pkgExports = pkg.exports

const tag = id.replace("./widgets/", "").slice(0, -2)
const scriptId = id.slice(0, -1) + "js"
const scriptPath = pkgExports[scriptId]?.default ?? pkgExports[scriptId]
const scriptLocal = [pkg.name, scriptId.slice(2)].join("/")
const scriptCDN = new URL(scriptLocal, "https://cdn.jsdelivr.net/npm/").href
const styleId = id.slice(0, -1) + "css"
const stylePath = pkgExports[styleId]?.default ?? pkgExports[styleId]
const styleLocal = [pkg.name, styleId.slice(2)].join("/")
const styleCDN = new URL(styleLocal, "https://cdn.jsdelivr.net/npm/").href

const editingConfig = pkg?.editingConfig[`./widgets/${tag}`]
const widgetModule = manifest.modules?.find(mod => mod.exports.some(exp => exp.kind === "custom-element-definition" && exp.name === tag))
const className = widgetModule.exports.find(exp => exp.kind === "custom-element-definition" && exp.name === tag).declaration.name
const widgetClass = widgetModule.declarations.find(decl => decl.kind === "class" && decl.name === className)
const publicFields = widgetClass.members.filter(decl => decl.kind === "field" && (!decl.privacy || decl.privacy === "public"))
const excludedMethodNames = [
  "connectedCallback", "disconnectedCallback", "attributeChangedCallback", "adoptedCallback", // standard lifecycle
  "shouldUpdate", "willUpdate", "update", "render", "firstUpdated", "updated" // lit lifecycle
]
const publicMethods = widgetClass.members.filter(decl => decl.kind === "method" && (!decl.privacy || decl.privacy === "public") && !excludedMethodNames.includes(decl.name))

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

const slotsTemplate = !widgetClass.slots?.length? undefined:
`| Name | Description | Content Type |
| :--: | :---------: | :----------: |
${widgetClass.slots.map(field => `| ${field.name? `\`${tableEscape(field.name)}\``: "*(default)*"} | ${tableEscape(field.description ?? "-")} | ${editingConfig?.content? tableEscape(editingConfig.content): "-"} |`).join("\n")}

*[Slots](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots) define how the content of the widget is rendered.*`

const eventsTemplate = !widgetClass.events?.length? undefined:
`| Name | Description |
| :--: | :---------: |
${widgetClass.events.map(field => `| ${tableEscape(field.name)} | ${tableEscape(field.description ?? "-")} |`).join("\n")}

*[Events](https://developer.mozilla.org/en-US/docs/Web/Events) are dispatched by the widget after certain triggers.*`

const cssPropertiesTemplate = !widgetClass.cssProperties?.length? undefined:
`| Name | Description |
| :--: | :---------: |
${widgetClass.cssProperties.map(field => `| ${tableEscape(field.name)} | ${tableEscape(field.description ?? "-")} |`).join("\n")}

*[Custom CSS properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties) offer defined customization of the widget's style.*`

const cssPartsTemplate = !widgetClass.cssParts?.length? undefined:
`| Name | Description |
| :--: | :---------: |
${widgetClass.cssParts.map(field => `| ${tableEscape(field.name)} | ${tableEscape(field.description ?? "-")} |`).join("\n")}

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

const nonemptyNames = Object.keys(templates).filter(k => templates[k])
const emptyNames = Object.keys(templates).filter(k => !templates[k])

let emptyTemplate = ""
if(emptyNames.length >= 2) {
  emptyTemplate = `*No public ${emptyNames.slice(0, -1).join(", ")}, or ${emptyNames[emptyNames.length - 1]}.*`
}
else if(emptyNames.length === 1) {
  emptyTemplate = `*No public ${emptyNames[0]}.*`
}

return `## \`${className}\` (\`<${tag}>\`)
${widgetClass.description}

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
  if(readme && !readme.split("\n").at(-1).startsWith(`*Generated with ${selfPkg.name}@`)) {
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
${snippetIDs.map(id => `| ${id.replace("./snippets/", "").replace(".html", "").split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" ")} | ${pkg.name + id.slice(1)} |`).join("\n")}`

const themesTemplate = !themeIDs.length? "": 
`## Themes
[Themes](https://webwriter.app/docs/themes/themes/) are stylesheets to apply to a whole document.

| Name | Import Path |
| :--: | :---------: |
${themeIDs.map(id => `| ${id.replace("./themes/", "")} | ${pkg.name + id.slice(1)} |`).join("\n")}`

const prettyName = 
  pkg?.editingConfig["."]?.label?._ ?? pkg.name.slice(1).split("/")[1].split("-").map(part => part[0].toUpperCase() + part.slice(1))

const description = pkg?.editingConfig["."]?.description?._ ?? pkg?.description

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