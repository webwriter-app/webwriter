const assert = (condition: unknown, message: string) => { if(!condition) throw new Error(message) }

export async function checkPopupAnchors(inspect = false) {
  const frame = document.createElement("iframe")
  frame.style.cssText = "width:900px;height:700px;border:0;max-width:none"
  frame.src = "/tests/popup-anchors.html"
  document.body.append(frame)
  try {
    const view = frame.contentWindow as Window & {runPopupAnchorCheck?: () => Promise<void>}
    for(let attempt = 0; !view.runPopupAnchorCheck && attempt < 250; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
    assert(view.runPopupAnchorCheck, "popup anchor fixture did not initialize")
    await view.runPopupAnchorCheck!()
    frame.style.width = "420px"; frame.style.height = "320px"
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    await view.runPopupAnchorCheck!()
    if(!inspect) frame.remove()
  }
  finally { if(!inspect) frame.remove() }
}
