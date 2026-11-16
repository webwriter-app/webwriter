let answer: boolean | undefined

/**
 * True if this browser gives out a WebGL context, which the Pixi renderer
 * needs. A widget asks before it chooses its renderer:
 *
 *     static scopedElements = {...sceneElements, "ww-scene": webglAvailable() ? PixiScene : Scene}
 *
 * The answer is found once, with a canvas that is thrown away. A context can
 * still fail later, for example when a page holds too many: the Pixi renderer
 * then reports `ww-sceneerror` with the code `webgl`.
 */
export function webglAvailable(): boolean {
  if(answer === undefined) {
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl")
    answer = !!context
    context?.getExtension("WEBGL_lose_context")?.loseContext()
  }
  return answer
}
