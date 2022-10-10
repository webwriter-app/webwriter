import {Command} from "@tauri-apps/api/shell"
import {readTextFile, writeTextFile, removeFile, createDir, readDir} from "@tauri-apps/api/fs"
import { join, appDir as getAppDir } from '@tauri-apps/api/path'
import {call, put, takeLeading, all, takeEvery, select, actionChannel, take, ActionPattern} from "redux-saga/effects"

import { createRequestedActionEntry, hashCode } from "../../utility"
import {slice as packagesSlice, selectors as packageSelectors} from "../slices/packages"
import { Action } from "@redux-saga/types"
import {PackageJson} from ".."
import * as resources from "../resources"

function computeBundleHash(packages: PackageJson[]) {
  const packageVersions = packages.map(pkg => `${pkg.name}@${pkg.version}`)
  return hashCode(packageVersions.join())
}

async function isBundleOutdated(packages: PackageJson[], bundlename="bundle") {
  try {
    const bundleFilename = `${bundlename}#${computeBundleHash(packages)}`
    const appDir = await getAppDir()
    const bundlePath = await join(appDir, bundleFilename)
    await readTextFile(bundlePath)
    return false
  }
  catch(e) {
    return true
  }
}

export async function bundle(args: string[] = []) {
  const output = await Command.sidecar("../../../binaries/esbuild", [...args]).execute()
  if(output.code !== 0) {
    return Error(output.stderr)
  }
  else {
    return {data: output.stdout}
  }
}

export async function search(text: string, params?: {size?: number, from?: number, quality?: number, popularity?: number, maintenance?: number}, searchEndpoint="https://registry.npmjs.com/-/v1/search") {
  // Replaced with https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md, since `search` CLI command does not support any search qualifiers
  const allParams = {text, ...{size: 250, ...params}}
  const url = new URL(searchEndpoint)
  Object.entries(allParams).forEach(([k, v]) => v? url.searchParams.append(k, v.toString()): null)
  const result = await fetch(url.href)
  return result.ok
    ? result.json()
    : new Error(`${result.status} ${result.statusText}`)
}

export async function npm(command: string, commandArgs: string[] = [], json=true, appDir=true) {
  const cmdArgs = [command, ...(json ? ["--json"]: []), ...commandArgs]
  const opts = appDir? {cwd: await getAppDir()}: {}
  const output = await Command.sidecar("../../../binaries/npm", cmdArgs, opts).execute()
  if(output.stderr) {
    return new Error(output.stderr)
  }
  else {
    return json? (output.stdout? JSON.parse(output.stdout): null): output.stdout
  }
}

type CLIAction<T extends string> = {type: `${T}_REQUESTED`, args: string[]}

function* initialize() {
  yield put({type: "initialize_REQUESTED"})
  try {
    let appDir = yield call(getAppDir)
    try {
      yield call(readDir, appDir)
    }
    catch(err) {
      yield call(createDir, appDir)
    }
    const list = yield call(npm, "ls")
    if(!list?.name) {
      yield call(npm, "init", ["--yes"], false)
      const corePackages = yield select(state => state.packages.corePackages)
      yield call(npm, "install", corePackages)
    }
    const packages = yield call(fetchInstalledPackages)
    yield call(writeBundle, {type: "writeBundle_REQUESTED", packages})
    yield call(importBundle, {type: "importBundle_REQUESTED", packages})
    yield put({type: "initialize_SUCCEEDED"})
  }
  catch(error) {
    yield put({type: "initialize_FAILED", error: {...error}})
    throw error
  }
}

function* install({args}: CLIAction<"install">) {
  try {
    yield call(npm, "install", args)
    const packages = yield call(fetchAllPackages, {type: "fetchAllPackages_REQUESTED", from: 0})
    yield call(writeBundle, {type: "writeBundle_REQUESTED", packages})
    yield call(importBundle, {type: "importBundle_REQUESTED", packages})
    yield put({type: "install_SUCCEEDED", payload: {args}})
  }
  catch(error) {
    yield put({type: "install_FAILED", payload: {args}, error: {...error}})
    throw error
  }
}

function* uninstall({args}: CLIAction<"uninstall">) {
  try {
    yield call(npm, "uninstall", args)
    yield call(fetchAllPackages, {type: "fetchAllPackages_REQUESTED", from: 0})
    // yield put(packagesSlice.actions.removeAvailableBlockTypes({blockTypes: args}))
    yield put({type: "uninstall_SUCCEEDED", payload: {args}})
  }
  catch(error) {
    yield put({type: "uninstall_FAILED", payload: {args}, error: {...error}})
    throw error
  }
}

function* update({args}: CLIAction<"update">) {
  try {
    yield call(npm, "update", args)
    const packages = yield call(fetchAllPackages, {type: "fetchAllPackages_REQUESTED", from: 0})
    yield call(writeBundle, {type: "writeBundle_REQUESTED", packages})
    yield call(importBundle, {type: "importBundle_REQUESTED", packages})
    yield put({type: "update_SUCCEEDED", payload: {args}})
  }
  catch(error) {
    yield put({type: "update_FAILED", payload: {args}, error: {...error}})
    throw error
  }
}

function* ls({args}: CLIAction<"ls">) {
  try {
    yield call(npm, "ls", args)
    yield put({type: "ls_SUCCEEDED", payload: {args}})
  }
  catch(error) {
    yield put({type: "ls_FAILED", payload: {args}, error: {...error}})
  }
}

function* outdated({args}: CLIAction<"outdated">) {
  try {
    yield call(npm, "outdated", args)
    yield put({type: "outdated_SUCCEEDED", payload: {args}})
  }
  catch(error) {
    yield put({type: "outdated_FAILED", payload: {args}, error: {...error}})
  }
}

function* fetchInstalledPackages({setPackages} = {setPackages: true}) {
  try {
    let packages = [] as PackageJson[]
    const dependencies = (yield call(npm, "ls", ["--long"]))["dependencies"] as PackageJson["dependencies"]
    if(!dependencies) {
      return put(packagesSlice.actions.setAll(packages))
    }
    const packagePaths = Object.values(dependencies)
      .map(v => (v as any)?.path)
      .filter((path: string) => path)
    const packageStrings = yield all(packagePaths.map(path => call(readTextFile, path + "\\package.json")))
    const packagePathsAndStrings = packagePaths.map((path, i) => [path, packageStrings[i]])
    packages = packagePathsAndStrings
      .map(([path, packageString]) => [path, JSON.parse(packageString)])
      .filter(([path, pkg]) => pkg.keywords?.includes("webwriter"))
      .map(([path, pkg]) => ({...pkg, installed: true, root: path}))
    if(setPackages) {
      yield put(packagesSlice.actions.setAll(packages))
    }
    yield put({type: "fetchInstalledPackages_SUCCEEDED"})
    return packages
  }
  catch(error) {
    yield put({type: "fetchInstalledPackages_FAILED", error: {...error}})
    throw error
  }
}

function* fetchAvailablePackages({from}: {type: "fetchAvailablePackages_REQUESTED", from: number}) {
  try {
    const {total, objects} = yield call(search, "keywords:webwriter", {from})
    const packages = objects.map(obj => obj["package"])
    yield put({type: "fetchAvailablePackages_SUCCEEDED"})
    return packages
  }
  catch(error) {
    yield put({type: "fetchAvailablePackages_FAILED", error: {...error}})
    throw error
  }
}

function* fetchAllPackages({from}: {type: "fetchAllPackages_REQUESTED", from: number}) {
  try {
    const installed = yield call(fetchInstalledPackages, {setPackages: false})
    const available = yield call(fetchAvailablePackages, {type: "fetchAvailablePackages_REQUESTED", from})
    yield put(packagesSlice.actions.setAll([...installed, ...available]))
    yield put({type: "fetchAllPackages_SUCCEEDED"})
    const packages = yield select(state => packageSelectors.selectAll(state.packages))
    return packages
  }
  catch(error) {
    yield put({type: "fetchAllPackages_FAILED", error: {...error}})
  }
}

function* writeBundle({packages, bundlename="bundle", force=false}: {type: "writeBundle_REQUESTED", packages: PackageJson[], bundlename?: string, force?: boolean}) {
  if(isBundleOutdated(packages, bundlename) || force) {
    const appDir = yield call(getAppDir)
    const bundleFilename = `${bundlename}#${computeBundleHash(packages)}`
    const bundlePath = yield call(join, appDir, bundleFilename)
    const entrypointPath = yield call(join, appDir, "entrypoint.js")
    const exportStatements = packages.map(pkg => {
      const name = pkg.name.replaceAll("-", "ಠಠಠ").split(/\@.*\//).pop()
      return `export {default as ${name}} from '${pkg.name}'`
    })
    const entrypoint = exportStatements.join(";")
    yield call(writeTextFile as any, entrypointPath, entrypoint)
    yield call(bundle, [entrypointPath, "--bundle", `--outfile=${bundlePath}.js`, `--format=esm`])
    yield call(removeFile, entrypointPath)
    return bundlePath
  }
}

function* importBundle({packages, bundlename="bundle"}: {type: "importBundle_REQUESTED", packages: PackageJson[], bundlename?: string}) {
  try {
    const appDir = yield call(getAppDir)
    const bundleFilename = `${bundlename}#${computeBundleHash(packages)}.js`
    const bundlePath = yield call(join, appDir, bundleFilename)
    const bundleCode = yield call(readTextFile, bundlePath)
    let blobURL = URL.createObjectURL(new Blob([bundleCode], {type: 'application/javascript'}))
    /*
    const customElements = globalThis.customElements
    Object.defineProperty(window, "customElements", {
      get: () => new Proxy(customElements, {
        get: (_, prop, __) => {
          if(prop === "define") {
            return new Proxy(customElements.define, {apply: (target, thisArg, argumentsList) => {
              !customElements.get(argumentsList[0])? customElements.define(argumentsList[0], argumentsList[1], argumentsList[2]): null
            }})
          }
        } 
      })
    })
    Object.defineProperty(window, "customElements", {get: () => customElements})
    */
    const bundle = yield call(() => import( /*@vite-ignore*/ blobURL))
    /*
    const packageModules = Object.fromEntries(Object.entries(bundle).map(([k, v]) => [k.replaceAll("ಠಠಠ", "-"), v])) as Record<string, BlockElementConstructor>
    yield put({type: "addPackageModules", payload: {packageModules}})
    Object.entries(packageModules).forEach(([k, v]) => customElements.define(k, v))
    */
    const widgetTypes = Object.keys(bundle)
      .map(k => k.replaceAll("ಠಠಠ", "-"))
    yield put(resources.actions.setWidgetTypes({widgetTypes}))
    yield put({type: "importBundle_SUCCEEDED"})
  }
  catch(error) {
    yield put({type: "importBundle_FAILED", error: {...error}})
  }
}

/*

function* queueInstall(action: CLIAction<"install">) {
  const installRequestChannel = yield actionChannel("install")
  while(true) {
    const {payload} = yield take(installRequestChannel)
    yield call(install, payload)
  }
}

function* queueUninstall(action: CLIAction<"uninstall">) {
  const uninstallRequestChannel = yield actionChannel("uninstall")
  while(true) {
    const {payload} = yield take(uninstallRequestChannel)
    yield call(uninstall, payload)
  }
}

function* queueUpdate(action: CLIAction<"update">) {
  const updateRequestChannel = yield actionChannel("update")
  while(true) {
    const {payload} = yield take(updateRequestChannel)
    yield call(update, payload)
  }
}

*/

function* takeEverySerial(pattern: ActionPattern, worker: (action: Action) => any) {
  const channel = yield actionChannel(pattern)
  while(true) {
    const {payload} = yield take(channel)
    yield call(worker, payload)
  }
}


export function* rootSaga() {
  yield call(initialize)
  yield all([
    takeEverySerial("install_REQUESTED", install),
    takeEverySerial("uninstall_REQUESTED", uninstall),
    takeEverySerial("update_REQUESTED", update),
    takeEvery("ls_REQUESTED", ls),
    takeEvery("outdated_REQUESTED", outdated),
    takeLeading("fetchInstalledPackages_REQUESTED", fetchInstalledPackages),
    takeLeading("fetchAvailablePackages_REQUESTED", fetchAvailablePackages),
    takeLeading("fetchAllPackages_REQUESTED", fetchAllPackages),
    takeEvery("writeBundle_REQUESTED", writeBundle),
    takeEvery("importBundle_REQUESTED", importBundle)
  ])
}

export const actions = {
  ...createRequestedActionEntry("install", install),
  ...createRequestedActionEntry("uninstall", uninstall),
  ...createRequestedActionEntry("update", update),
  ...createRequestedActionEntry("ls", ls),
  ...createRequestedActionEntry("outdated", outdated),
  ...createRequestedActionEntry("fetchInstalledPackages", fetchInstalledPackages as any),
  ...createRequestedActionEntry("fetchAvailablePackages", fetchAvailablePackages),
  ...createRequestedActionEntry("fetchAllPackages", fetchAllPackages),
  ...createRequestedActionEntry("writeBundle", writeBundle),
  ...createRequestedActionEntry("importBundle", importBundle),
}