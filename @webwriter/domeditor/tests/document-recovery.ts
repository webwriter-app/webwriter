import {deleteDocumentRecovery, listDocumentRecoveries, readDocumentRecovery, writeDocumentRecovery} from "../src/document-recovery"

export async function checkDocumentRecovery() {
  const id = crypto.randomUUID()
  const first = {id, title: "First recovery", updatedAt: 1}
  const second = {id: id + "-second", title: "Second recovery", updatedAt: 2}
  const image = "data:image/png;base64,AQID"
  const audio = "data:audio/mpeg;base64,BAUG"
  const video = "data:video/mp4;base64,BwgJ"
  const svg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'></svg>"
  const html = `<!DOCTYPE html><html><body><!--authored--><img src="${image}" srcset="${image}, ${image} 2x"><img src="${svg}"><audio src="${audio}"></audio><video src="${video}"></video></body></html>`
  try {
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
    await writeDocumentRecovery(first, "<p>Replaced</p>")
    await deleteDocumentRecovery(first.id)
    if(await readDocumentRecovery(second.id) !== html) throw new Error("Deleting another draft removed shared media")
  }
  finally { await Promise.all([deleteDocumentRecovery(first.id), deleteDocumentRecovery(second.id)]) }
}
