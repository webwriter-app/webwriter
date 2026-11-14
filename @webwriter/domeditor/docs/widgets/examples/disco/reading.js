export function readDance(data, ready, error) {
  if(!ready || !data) {
    return {move: "", ready: false, status: error?.message || "Waiting for dance data…"}
  }

  try {
    const {move} = JSON.parse(data)
    if(move === "float") return {move, ready, status: "The ghost floats!"}
    if(move === "twirl") return {move, ready, status: "The ghost twirls!"}
    return {move: "", ready, status: "Pick a dance move."}
  }
  catch {
    return {move: "", ready: false, status: "The dance data is invalid."}
  }
}

export function chooseDance(runtime, move) {
  const {editable, data, dataReady, dataError} = runtime.getSnapshot()
  if(editable || !readDance(data, dataReady, dataError).ready) return
  runtime.setData("application/json", JSON.stringify({...JSON.parse(data), move}))
}
