let answer;
function webglAvailable() {
  if (answer === void 0) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    answer = !!context;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return answer;
}
export {
  webglAvailable
};
