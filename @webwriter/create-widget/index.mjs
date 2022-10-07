#!/usr/bin/env node

import prompts from "prompts"
import fs from "fs-extra"
import path from "path"
import merge from "lodash.merge"
import validateNpmName from "validate-npm-package-name"
import validateElementName from "validate-element-name"
import {fileURLToPath} from 'url'
import child_process from "child_process"

const WORKING_DIR = path.normalize(process.cwd())
const EXISTING_PACKAGE_JSON = path.join(WORKING_DIR, "package.json")
const TMP_DIR = path.join(WORKING_DIR, "tmp")
const SCRIPT_DIR = path.normalize(path.dirname(fileURLToPath(import.meta.url)))
const TEMPLATES_DIR = path.join(SCRIPT_DIR, "templates")

function dashCaseToCamelCase(str) {
  return str.split("-").map(s => s.replace(/^[a-z]/g, m => m.toUpperCase())).join("")
}

const options = [
  {
    name: "name",
    type: "text",
    message: "widget name",
    initial: path.basename(process.cwd()),
    validate: value => {
      const {validForNewPackages, errors, warnings} = validateNpmName(value)
      if(!validForNewPackages) {
        console.log(errors)
        return [...(errors ?? []), ...(warnings ?? [])].join(", ")
      }
      const valueWithoutOrg = value.replace(/@.+\//, "")
      const {isValid, message} = validateElementName(valueWithoutOrg)
      if(!isValid) {
        return message
      }
      return true
    }
  },
  {
    name: "version",
    type: "text",
    message: "package version",
    initial: "0.1.0"
  },
  {
    name: "description",
    type: "text",
    message: "package description",
    initial: ""
  },
  {
    name: "keywords",
    type: "list",
    message: "package keywords",
    initial: "webwriter"
  },
  {
    name: "author",
    type: "text",
    message: "package author",
    initial: "Your Name <your@email.here>"
  },
  {
    name: "license",
    type: "text",
    message: "package license",
    initial: "MIT"
  },
  {
    name: "template",
    type: "select",
    message: "choose a template",
    choices: [
      ...fs.readdirSync(TEMPLATES_DIR).map(title => ({title, value: title})),
      {title: "None", value: null}
    ]
  }
]

/** Prompts for variables. */
async function cli(callback=create) {
  const response = await prompts(options)
  return callback(response)
}

async function create({template, ...variables}) {
  
  // Set up staging dir
  await fs.mkdir(TMP_DIR)

  if(template) {
    // Copy template to staging dir
    const templateDir = path.join(TEMPLATES_DIR, template)
    await fs.copy(templateDir, TMP_DIR)


    // Interpolate variables
    let filenames = await fs.readdir(TMP_DIR, {encoding: "utf8"})
    let extendedVariables = {
      ...variables,
      className: dashCaseToCamelCase(variables.name)
    }
    filenames = filenames.filter(name => name !== "package.json")
    for(let name of filenames) {
      const filePath = path.join(TMP_DIR, name)
      let contents = await fs.readFile(filePath, {encoding: "utf8"})
      for(let [key, value] of Object.entries(extendedVariables)) {
        contents = contents.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
      }
      await fs.writeFile(filePath, contents)
    }
  }

  // Create merged package.json
  let existingPkg
  try {
    existingPkg = await fs.readJSON(EXISTING_PACKAGE_JSON)
  }
  catch(err) {
    existingPkg = {}
  }
  const templatePkg = await (template?  fs.readJSON(path.join(TMP_DIR, "package.json")): {})
  const pkg = merge(merge(templatePkg, variables), existingPkg)
  await fs.writeJSON(path.join(TMP_DIR, "package.json"), pkg, {spaces: 2})

  // Copy results to main dir
  try {
    if(fs.readdirSync(TMP_DIR).length > 1) {
      await fs.copy(TMP_DIR, WORKING_DIR, {overwrite: false, errorOnExist: true})
    }
    else {
      await fs.copy(TMP_DIR, WORKING_DIR)
    }
  }
  catch(error) {
    console.log(`Detected existing files in ${WORKING_DIR} that the template files would overwrite.`)
    const {shouldOverwrite} = await prompts({
      type: "confirm",
      name: "shouldOverwrite",
      message: "Overwrite and continue?"
    })
    if(!shouldOverwrite) {
      return
    }
    else {
      await fs.copy(TMP_DIR, WORKING_DIR)
    }
  }
  finally {
    await fs.rm(TMP_DIR, {recursive: true, force: true})
  }
  
  // Install dependencies
  console.log("Installing dependencies...")
  child_process.execSync("npm install --no-fund --loglevel=error", {encoding: "utf8", stdio: [0,1,2]})
  console.log(`Finished setting up ${variables.name}! Try 'npm run dev' to get started.`)
}

cli()