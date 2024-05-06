import {readFileSync, writeFileSync} from "fs"

const simulations = JSON.parse(readFileSync("simulations.json", "utf8"))
const pkg = JSON.parse(readFileSync("package.json", "utf8"))

for(const [name, simulation] of Object.entries(simulations)) {
  const template = `<iframe src="https://phet.colorado.edu/sims/html/${name}/latest/${name}_all.html"></iframe>`
  writeFileSync(`snippets/${name}.html`, template, "utf8")
  const key = `./snippets/${name}`
  const path = `./snippets/${name}.html`
  pkg.exports = {
    ...pkg?.exports,
    [key]: path
  }
  pkg.editingConfig = {
    ...pkg.editingConfig,
    [key]: {
      label: {
        _: simulation.title
      }
    }
  }
}

writeFileSync("package.json", JSON.stringify(pkg), "utf8")