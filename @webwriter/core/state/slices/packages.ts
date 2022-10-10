import { createSlice, createEntityAdapter, PayloadAction, Action } from "@reduxjs/toolkit"

import { PackageJson } from ".."
import { unscopePackageName } from "../../utility"

type MutatingBundleAction = PayloadAction<{args?: string[]}, `${"install" | "uninstall" | "update"}_${"REQUESTED" | "SUCCEEDED" | "FAILED"}`>
type FetchingBundleAction = Action<`${"fetchInstalled" | "fetchAvailable" |"fetchAll"}Packages_${"REQUESTED" | "SUCCEEDED" | "FAILED"}`>
type InitializingBundleAction = Action<`initialize_${"REQUESTED" | "SUCCEEDED" | "FAILED"}`>

function isMutatingBundleAction(action: Action<string>): action is MutatingBundleAction {
  return ["install", "uninstall", "update"].some(s => action.type.startsWith(s)) && ["_REQUESTED", "_SUCCEEDED", "_FAILED"].some(s => action.type.endsWith(s))
}

function isFetchingBundleAction(action: Action<string>): action is FetchingBundleAction {
  return ["fetchInstalled", "fetchAvailable", "fetchAll"].some(s => action.type.startsWith(s)) && ["_REQUESTED", "_SUCCEEDED", "_FAILED"].some(s => action.type.endsWith(s))
}

function isInitializingBundleAction(action: Action<string>): action is InitializingBundleAction {
  return action.type.startsWith("initialize") && ["_REQUESTED", "_SUCCEEDED", "_FAILED"].some(s => action.type.endsWith(s))
}

const packagesAdapter = createEntityAdapter<PackageJson>({
  selectId: pkg => pkg.name,
})

const {setOne, setMany, setAll, removeOne, removeMany, removeAll} = packagesAdapter

let isFetchingAll = false

type State = typeof initialState
const initialState = packagesAdapter.getInitialState({
  corePackages: ["@webwriter/embed", "@webwriter/textarea", "@webwriter/figure", "@open-wc/scoped-elements"],
  isInitializing: true,
  isFetching: false,
  installPackages: [] as PackageJson["name"][],
  uninstallPackages: [] as PackageJson["name"][],
  updatePackages: [] as PackageJson["name"][],
})

export const slice = createSlice({name: "packages", initialState, 
  reducers: {
    setOne, setMany, setAll, removeOne, removeMany, removeAll,
  },
  extraReducers: (builder) => builder
    .addMatcher(isMutatingBundleAction, (state, action) => {
      const [cmd, phase] = action.type.split("_")
      const pkgs = action.payload.args.filter(arg => !arg.startsWith("-")) ?? []
      const packagesArray = state[cmd + "Packages"] as PackageJson["name"][]
      state[cmd + "Packages"] = phase === "REQUESTED"
        ? packagesArray.concat(pkgs)
        : packagesArray.filter(pkg => !pkgs.includes(pkg))
    })
    .addMatcher(isFetchingBundleAction, (state, action) => {
      const [cmd, phase] = action.type.split("_")
      if(cmd === "fetchAllPackages" && phase === "REQUESTED") {
        isFetchingAll = true
        state.isFetching = true
      }
      else if(cmd !== "fetchAllPackages") {
        state.isFetching = isFetchingAll || phase === "REQUESTED"
      }
      else if(cmd === "fetchAllPackages" && phase !== "REQUESTED") {
        isFetchingAll = false
        state.isFetching = false
      }
    })
    .addMatcher(isInitializingBundleAction, (state, action) => {
      const [_, phase] = action.type.split("_")
      state.isInitializing = phase === "REQUESTED"
    })
})

export const selectors = {
  ...packagesAdapter.getSelectors(),
  selectAvailableWidgetTypes: (state: State) => Object.keys(state.entities).map(unscopePackageName) 
}
