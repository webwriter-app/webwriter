export async function checkLighting(widget) {
  await widget.updateComplete
  if(widget.lighting !== "neon") throw new Error("Lighting was not restored")
  widget.resetLighting()
  await widget.updateComplete
  if(widget.getAttribute("lighting") !== "moonlight") throw new Error("Lighting did not reset")
}
