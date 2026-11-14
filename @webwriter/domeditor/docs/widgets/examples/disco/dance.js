export function readDance({data, dataType, dataSlot, dataReady, dataError}) {
  const ready = dataReady && dataType === "application/json" && dataSlot === "data"
  if(!ready) return {move: "", ready: false, error: dataError?.message}
  try {
    const {move} = JSON.parse(data || "{}")
    return {move: move === "float" || move === "twirl" ? move : "", ready, error: dataError?.message}
  }
  catch {
    return {move: "", ready: false, error: "Could not read the dance move."}
  }
}

export function chooseDance(host, move) {
  const runtime = host.widgetRuntime
  const snapshot = runtime.getSnapshot()
  if(snapshot.editable || !readDance(snapshot).ready) return
  try {
    runtime.setData("application/json", JSON.stringify({...JSON.parse(snapshot.data || "{}"), move}))
  }
  catch(error) {
    if(error?.name !== "InvalidStateError") throw error
  }
}
