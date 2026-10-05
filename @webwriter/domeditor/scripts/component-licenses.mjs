import {readFileSync, readdirSync, existsSync} from "node:fs"
import {createRequire} from "node:module"
import {join} from "node:path"

const moduleId = "virtual:component-licenses"

// Read installed packages at build time so the dialog works offline and follows
// the project's direct dependencies, including development tools.
export function componentLicensesPlugin(manifestPath) {
  const require = createRequire(manifestPath)
  return {
    name: "component-licenses",
    resolveId(id) {
      if(id === moduleId) return `\0${moduleId}`
    },
    load(id) {
      if(id !== `\0${moduleId}`) return
      this.addWatchFile(manifestPath)
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
      const names = Object.keys({...manifest.dependencies, ...manifest.devDependencies}).sort()
      const text = names.map(name => {
        // Looking up package directories also supports packages that do not
        // export package.json and workspace installations with hoisted modules.
        const directory = require.resolve.paths(name)
          ?.map(path => join(path, name))
          .find(path => existsSync(join(path, "package.json")))
        if(!directory) throw new Error(`Cannot find installed component ${name}`)
        const packagePath = join(directory, "package.json")
        this.addWatchFile(packagePath)
        const pkg = JSON.parse(readFileSync(packagePath, "utf8"))
        const files = readdirSync(directory, {withFileTypes: true})
          .filter(file => file.isFile() && /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file.name))
          .map(file => file.name).sort()
        if(!files.some(file => /^(licen[sc]e|copying)([.-]|$)/i.test(file))) {
          throw new Error(`Cannot find license text for ${name}`)
        }
        const license = typeof pkg.license === "string" ? pkg.license
          : pkg.license?.type ?? pkg.licenses?.map(license => license.type).join(" OR ")
        const heading = `${name} ${pkg.version}${license ? ` (${license})` : ""}`
        const contents = files.map(file => {
          const path = join(directory, file)
          this.addWatchFile(path)
          return `${file}\n\n${readFileSync(path, "utf8").trim()}`
        })
        return [heading, "=".repeat(heading.length), ...contents].join("\n\n")
      }).join("\n\n\n")
      return `export default ${JSON.stringify(text)}`
    },
  }
}
