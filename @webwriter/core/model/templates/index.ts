import { capitalizeWord, unscopePackageName } from "../utility"
import { Package } from "../schemas"

import litWidget from "./presets/lit/widgets/webwriter-widget.ts?raw" 
import litPackage from "./presets/lit/package.json?raw"
import litTsconfig from "./presets/lit/tsconfig.json?raw"
import litCustomD from "./presets/lit/custom.d.ts?raw"
import MIT from "./licenses/MIT.txt?raw"
import ISC from "./licenses/ISC.txt?raw"
import Apache2 from "./licenses/Apache-2.0.txt?raw"
import BSD2 from "./licenses/BSD-2-Clause.txt?raw"
import BSD3 from "./licenses/BSD-3-Clause.txt?raw"


const interpolateTemplate = (template: string, pkg: Package) => {

  let result = template

  const {scope, name} = pkg.nameParts
  const defaultElementName = `${scope}-${name}`

  const replacementMap: Record<string, string> = {
    "____classname____": [scope ?? "", ...name.split("-")].map(capitalizeWord).join("") || "MyWidget",
    "____year____": String(new Date().getFullYear())
  }
  for (const [key, value] of Object.entries(pkg.toJSON())) {
    replacementMap[`___${key}___`] = String(value)
    replacementMap[`---${key}---`] = String(value)
  }
  replacementMap["---name---"] = defaultElementName
  for (const [key, value] of Object.entries(replacementMap)) {
    result = result.replaceAll(key, value)
  }
  return result
} 

const interpolateTemplateRecord = (record: Record<string, string>, pkg: Package) => {
  let result = {...record}
  for (const [key, template] of Object.entries(record)) {
    result[key] = interpolateTemplate(template, pkg)
  }
  return result
}


export const presets = {
  lit: (pkg: Package) => interpolateTemplateRecord({
    [`widgets/${pkg.nameParts.scope}-${pkg.nameParts.name}.ts`]: litWidget,
    "package.json": litPackage,
    "tsconfig.json": litTsconfig,
    "custom.d.ts": litCustomD
  }, pkg)
}

export const licenses = {
  "MIT": (pkg: Package) => interpolateTemplateRecord({
    "LICENSE": MIT
  }, pkg),
  "ISC": (pkg: Package) => interpolateTemplateRecord({
    "LICENSE": ISC
  }, pkg),
  "Apache-2.0": (pkg: Package) => interpolateTemplateRecord({
    "LICENSE": Apache2
  }, pkg),
  "BSD-2-Clause": (pkg: Package) => interpolateTemplateRecord({
    "LICENSE": BSD2
  }, pkg),
  "BSD-3-Clause": (pkg: Package) => interpolateTemplateRecord({
    "LICENSE": BSD3
  }, pkg),
}