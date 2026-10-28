/** srcdoc may report about:srcdoc as its base in some browser contexts. */
export function runtimeDocumentBaseURL(root: Document = document) {
  const candidates = [root.baseURI]
  try { candidates.push(root.defaultView?.parent?.location.href ?? "") }
  catch { /* A standalone cross-origin document has no accessible parent. */ }
  for(const candidate of candidates) {
    try {
      if(/^https?:$/.test(new URL(candidate).protocol)) return candidate
    }
    catch { /* Try the next document context. */ }
  }
  throw new Error("Could not resolve the document's HTTP base URL")
}
