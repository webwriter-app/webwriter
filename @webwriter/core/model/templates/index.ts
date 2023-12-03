import { capitalizeWord, unscopePackageName } from "../../utility"
import { Package } from "../schemas"

import litIndex from "./presets/lit/index.ts?raw" 
import litPackage from "./presets/lit/package.json?raw"
import litTsconfig from "./presets/lit/tsconfig.json?raw"
import MIT from "./licenses/MIT.txt?raw"
import ISC from "./licenses/ISC.txt?raw"
import Apache2 from "./licenses/Apache-2.0.txt?raw"
import BSD2 from "./licenses/BSD-2-Clause.txt?raw"
import BSD3 from "./licenses/BSD-3-Clause.txt?raw"


const interpolateTemplate = (template: string, pkg: Package) => {

  let result = template

  const replacementMap: Record<string, string> = {
    "____classname____": pkg.name.split("-").slice(1).map(capitalizeWord).join("") || "MyWidget",
    "____year____": String(new Date().getFullYear())
  }
  for (const [key, value] of Object.entries(pkg.toJSON())) {
    replacementMap[`___${key}___`] = String(value)
    replacementMap[`---${key}---`] = String(value)
  }
  replacementMap["---name---"] = unscopePackageName(pkg.name)
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
    "index.ts": litIndex,
    "package.json": litPackage,
    "tsconfig.json": litTsconfig
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