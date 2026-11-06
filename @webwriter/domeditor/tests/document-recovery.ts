import {deleteDocumentRecovery, listDocumentRecoveries, readDocumentRecovery, writeDocumentRecovery} from "../src/document-recovery"

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
  const svg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>"
  const html = `<!DOCTYPE html><html><body><!--authored--><img src="${image}" srcset="${image}, ${image} 2x"><img src="${svg}"><audio src="${audio}"></audio><video src="${video}"></video></body></html>`
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
    if([image, svg, audio, video].some(url => JSON.stringify(drafts).includes(url) || cachedAssets.filter(asset => asset.url === url).length !== 1)) {
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
  }
  finally {
    await Promise.all([first.id, second.id, replacement.id, ...(seeded ? [id + "-old", id + "-latest", id + "-unidentified"] : [])]
      .map(draftId => deleteDocumentRecovery(draftId)))
  }
}
