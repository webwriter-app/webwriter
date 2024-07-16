/// <reference path="../pb_data/types.d.ts" />

routerAdd("GET", "/explorables/:id", (c) => {
  const csp = "default-src * data: mediastream: blob: filesystem: about: ws: wss: 'unsafe-eval' 'wasm-unsafe-eval' 'unsafe-inline'; script-src * data: blob: 'unsafe-inline' 'unsafe-eval'; script-src-elem * data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src * data: blob: 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; media-src * data: blob: 'unsafe-inline'; frame-src * data: blob:; style-src * data: blob: 'unsafe-inline'; font-src * data: blob: 'unsafe-inline'; frame-ancestors * data: blob: 'unsafe-inline';"
  const id = c.pathParam("id")
  const collectionID = $app.dao().findCollectionByNameOrId("documents").id
  const record = $app.dao().findRecordById("documents", id)
  const filename = record.get("file")
  const key = `${collectionID}/${id}/${filename}`
  const fs = $app.newFilesystem()
  try {
    const header = c.response().header()
    header.set("Content-Disposition", "inline")
    header.set("Content-Security-Policy", csp)
    fs.serve(c.response().writer, c.request(), key, id)
  }
  finally {
    fs.close()
  }
})