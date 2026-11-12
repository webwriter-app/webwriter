import {deleteDocumentRecovery, listDocumentBlobAssets, listDocumentRecoveries, readDocumentBlobAssets, readDocumentRecovery, readDocumentRecoverySnapshot, writeDocumentBlobAssets, writeDocumentRecovery} from "../src/document-recovery"

async function seedLegacyRecoveries(id: string, html: string) {
  return new Promise<boolean>((resolve, reject) => {
    // A fresh native test profile starts at v1 here, before the recovery
    // module opens the database. Leave any existing database alone.
    const request = indexedDB.open("webwriter-document-recovery")
    let seeded = false
    request.onupgradeneeded = () => {
      seeded = true
      const db = request.result
      const documents = db.createObjectStore("documents", {keyPath: "id"})
      documents.createIndex("assetDigests", "assetDigests", {multiEntry: true})
      const metadata = db.createObjectStore("metadata", {keyPath: "id"})
      db.createObjectStore("assets", {keyPath: "digest"})
      for(const [suffix, updatedAt, parts] of [["old", 1, [html]], ["latest", 2, [html]], ["unidentified", 3, ["<p>Unidentified</p>"]]] as const) {
        const draftId = id + "-" + suffix
        documents.put({id: draftId, parts, assetDigests: []})
        metadata.put({id: draftId, title: "Legacy draft", updatedAt})
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { request.result.close(); resolve(seeded) }
  })
}

export async function checkDocumentRecovery() {
  const id = crypto.randomUUID()
  const legacyHTML = `<!DOCTYPE html><html id="ww${id}" lang="en"><body><p>Recovered draft</p></body></html>`
  const seeded = await seedLegacyRecoveries(id, legacyHTML)
  const first = {id, documentKey: "source:local:" + id, title: "First recovery", updatedAt: 1}
  const second = {id: id + "-second", documentKey: "source:local:" + id + "-second", title: "Second recovery", updatedAt: 2}
  const replacement = {...first, id: id + "-replacement", updatedAt: 4}
  const image = "data:image/png;base64,AQID"
  const audio = "data:audio/mpeg;base64,BAUG"
  const video = "data:video/mp4;base64,BwgJ"
  const attachment = "data:application/octet-stream;base64,CgsM"
  const svg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>"
  const html = `<!DOCTYPE html><html><body><!--authored--><img src="${image}" srcset="${image}, ${image} 2x"><img src="${svg}"><audio src="${audio}"></audio><video src="${video}"></video><a download="notes.bin" href="${attachment}">Notes</a></body></html>`
  try {
    if(seeded) {
      const legacy = (await listDocumentRecoveries()).filter(item => item.id.startsWith(id + "-"))
      if(legacy.map(item => item.id).join(",") !== `${id}-unidentified,${id}-latest`
        || await readDocumentRecovery(id + "-latest") !== legacyHTML) throw new Error("Legacy recovery migration did not retain the latest identifiable draft")
      const adopted = await writeDocumentRecovery(replacement, legacyHTML)
      if(adopted?.replacedIds.join(",") !== id + "-latest") throw new Error("A known document source did not replace its legacy checkpoint")
      await deleteDocumentRecovery(replacement.id)
    }
    await writeDocumentRecovery(first, html)
    await writeDocumentRecovery(second, html)
    const metadata = (await listDocumentRecoveries()).filter(item => item.id === first.id || item.id === second.id)
    if(metadata.map(item => item.title).join(",") !== "Second recovery,First recovery") throw new Error("Recovery metadata is missing or unsorted")
    const [drafts, cachedAssets] = await new Promise<[unknown[], {url: string}[]]>((resolve, reject) => {
      const request = indexedDB.open("webwriter-document-recovery")
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(["documents", "assets"], "readonly")
        const docs = tx.objectStore("documents").getAll()
        const assets = tx.objectStore("assets").getAll()
        tx.onabort = () => { db.close(); reject(tx.error) }
        tx.oncomplete = () => { db.close(); resolve([docs.result, assets.result]) }
      }
    })
    if([image, svg, audio, video, attachment].some(url => JSON.stringify(drafts).includes(url) || cachedAssets.filter(asset => asset.url === url).length !== 1)) {
      throw new Error("Media must be cached separately and deduplicated across recovery drafts")
    }
    if(await readDocumentRecovery(first.id) !== html) throw new Error("Recovery did not preserve the exact HTML")
    const cleanup = new AbortController()
    const deleting = deleteDocumentRecovery(first.id, cleanup.signal)
    cleanup.abort()
    await deleting.then(() => { throw new Error("Aborted recovery deletion completed") }, error => {
      if(error !== cleanup.signal.reason) throw error
    })
    if(await readDocumentRecovery(first.id) !== html) throw new Error("Aborted cleanup removed the recovery draft")
    const [latest] = await Promise.all([
      writeDocumentRecovery(replacement, "<p>Replaced</p>"),
      writeDocumentRecovery({...first, updatedAt: 3}, html),
    ])
    const stale = await writeDocumentRecovery({...first, updatedAt: 3}, html)
    if(latest?.replacedIds.join(",") !== first.id || stale !== null
      || await readDocumentRecovery(replacement.id) !== "<p>Replaced</p>") throw new Error("A newer checkpoint did not replace the previous draft")
    await deleteDocumentRecovery(first.id)
    if(await readDocumentRecovery(replacement.id) !== "<p>Replaced</p>") throw new Error("Stale cleanup removed the replacement")
    if(await readDocumentRecovery(second.id) !== html) throw new Error("Replacing another draft removed shared media")
    const remaining = (await listDocumentRecoveries()).filter(item => item.documentKey === first.documentKey)
    if(remaining.map(item => item.id).join(",") !== replacement.id) throw new Error("More than one checkpoint was kept for the same document")
    await checkBinaryRecovery(id)
  }
  finally {
    await Promise.all([first.id, second.id, replacement.id, ...(seeded ? [id + "-old", id + "-latest", id + "-unidentified"] : [])]
      .map(draftId => deleteDocumentRecovery(draftId)))
  }
}

function countStoredBlobs() {
  return new Promise<number>((resolve, reject) => {
    const request = indexedDB.open("webwriter-document-recovery")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction("blobs", "readonly")
      const count = tx.objectStore("blobs").count()
      tx.onabort = () => { db.close(); reject(tx.error) }
      tx.oncomplete = () => { db.close(); resolve(count.result) }
    }
  })
}

async function checkBinaryRecovery(id: string) {
  const record = {id: id + "-binary", title: "Binary recovery", updatedAt: 1, documentKey: "binary:" + id}
  const replacement = {...record, id: record.id + "-replacement", updatedAt: 3}
  const fontOwner = "font:" + id
  const url = "blob:" + location.origin + "/" + id
  const secondURL = url + "-second"
  const bytes = [new Uint8Array(1024 * 1024), id]
  const video = new Blob(bytes, {type: "video/mp4"})
  const attachment = new File(bytes, "attachment.bin", {type: "application/octet-stream", lastModified: 100})
  const font = new File(bytes, "font.woff2", {type: "font/woff2", lastModified: 200})
  const html = `<video src="${url}"></video><a href="${secondURL}" download="attachment.bin">Attachment</a>`
  const snapshot = {html, assets: [{url, blob: video}, {url: secondURL, blob: attachment}]}
  const initialCount = await countStoredBlobs()
  try {
    await Promise.all([
      writeDocumentRecovery(record, snapshot),
      writeDocumentBlobAssets(fontOwner, [{url: font.name, blob: font}]),
    ])
    await writeDocumentRecovery({...record, updatedAt: 2}, snapshot)
    if(await countStoredBlobs() !== initialCount + 1) throw new Error("Equal bytes were stored more than once across snapshots and file types")
    const stale = await writeDocumentRecovery(record, {html, assets: [{url, blob: new Blob(["stale bytes"])}]})
    if(stale !== null || await countStoredBlobs() !== initialCount + 1) throw new Error("An older write published stale blobs")
    const latest = await writeDocumentRecovery(replacement, snapshot)
    if(latest?.replacedIds.join(",") !== record.id) throw new Error("The new recovery did not replace the previous blob owner")
    const recovered = await readDocumentRecoverySnapshot(replacement.id)
    const [recoveredVideo, recoveredAttachment] = recovered.assets
    if(recovered.html !== html || recovered.assets.length !== 2
      || recoveredVideo.url !== url || recoveredVideo.blob.type !== video.type || recoveredVideo.blob.size !== video.size
      || await recoveredVideo.blob.slice(-id.length).text() !== id
      || recoveredAttachment.url !== secondURL || !(recoveredAttachment.blob instanceof File)
      || recoveredAttachment.blob.type !== attachment.type || recoveredAttachment.blob.name !== attachment.name
      || recoveredAttachment.blob.lastModified !== attachment.lastModified) throw new Error("Recovery lost asset bytes or reference metadata")

    const fontOwners = await listDocumentBlobAssets(fontOwner)
    if(fontOwners.length !== 1 || fontOwners[0].owner !== fontOwner || fontOwners[0].assets[0]?.url !== font.name
      || (await listDocumentBlobAssets(record.documentKey)).length) throw new Error("Asset listing crossed owner namespaces")
    await deleteDocumentRecovery(replacement.id)
    const [storedFont] = await readDocumentBlobAssets(fontOwner)
    if(!(storedFont?.blob instanceof File) || storedFont.blob.name !== font.name || storedFont.blob.type !== font.type
      || storedFont.blob.lastModified !== font.lastModified || await storedFont.blob.slice(-id.length).text() !== id
      || await countStoredBlobs() !== initialCount + 1) throw new Error("Removing a recovery removed another owner's file")
    await writeDocumentBlobAssets(fontOwner, [])
    if(await countStoredBlobs() !== initialCount) throw new Error("The last owner did not release its blob")
  }
  finally {
    await Promise.all([deleteDocumentRecovery(record.id), deleteDocumentRecovery(replacement.id), writeDocumentBlobAssets(fontOwner, [])])
  }
}
