import {call, put, all, takeEvery} from "redux-saga/effects"
import {Schema} from "prosemirror-model"

import * as marshal from "../../marshal"
import * as connect from "../../connect"
import { PayloadAction } from "@reduxjs/toolkit"
import { createRequestedActionEntry, WWURL } from "../../utility"
import {Resource} from ".."
import * as resources from "../resources"

const BINARY_EXTENSIONS = Object.entries(marshal).flatMap(([k, v]) => v.isBinary? v.extensions: [])
const ALL_FILTER = {name: "Explorable", extensions: Object.values(marshal).flatMap(v => v.extensions)}
const INDIVIDUAL_FILTERS = Object.entries(marshal).map(([k, v]) => ({name: v.label, extensions: v.extensions}))
const FILTERS = [ALL_FILTER, ...INDIVIDUAL_FILTERS]


function* saveResource({payload}: PayloadAction<{type: "saveResource_REQUESTED", resource: Resource}, "saveResource_REQUESTED">) {
  try {
    let wwURL: WWURL = new WWURL(payload.resource?.url ?? "memory:/")
    if(wwURL.protocol === "memory:") {
      const path = yield call(connect["file"].pickSave, INDIVIDUAL_FILTERS)
      if(path === null) {
        return
      }
      wwURL = new WWURL("file:/")
      wwURL.pathname = path
    }

    const save = connect[wwURL.protocol.slice(0, -1)].save
    const serialize = marshal[wwURL.wwformat].serialize
  
    let data = yield call(serialize, payload.resource.editorState.doc)
    yield call(save, data, wwURL.href)
    yield put(resources.actions.relocate({url: payload.resource.url, newURL: wwURL.href}))
    yield put({type: "saveResource_SUCCEEDED", payload: {url: wwURL.href}})
  }
  catch(error) {
    yield put({type: "saveResource_FAILED", error})
  }
}

function* loadResource({payload}: PayloadAction<{type: "loadResource_REQUESTED", url: string, schema: Schema, overwriteURL: string}, "loadResource_REQUESTED">) {
  try {
    let wwURL: WWURL = new WWURL("memory:/")
    if(!payload?.url) {
      wwURL.protocol = "file:"
      const path = yield call(connect["file"].pickLoad, INDIVIDUAL_FILTERS)
      if(path === null) {
        return
      }
      wwURL.pathname = path
    }
    else {
      wwURL = new WWURL(payload?.url)
    }

    const load = connect[wwURL.protocol.slice(0, -1)].load
    const parse = marshal[wwURL.wwformat].parse
    
    let data = yield call(load, wwURL.href, BINARY_EXTENSIONS)
    let editorState = yield call(parse, data, payload.schema)
    const resource: Resource = {url: wwURL.href, editorState}
    console.log(resource)
    yield put(resources.actions.put({resource}))
    yield put({type: "loadResource_SUCCEEDED"})
  }
  catch(error) {
    yield put({type: "loadResource_FAILED", error})
  }
}


export function* rootSaga() {
  yield all([
    takeEvery("saveResource_REQUESTED", saveResource),
    takeEvery("loadResource_REQUESTED", loadResource)
  ])
}

export const actions = {
  ...createRequestedActionEntry("saveResource", saveResource),
  ...createRequestedActionEntry("loadResource", loadResource)
}