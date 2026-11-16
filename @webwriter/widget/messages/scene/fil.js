var fil_default = {
  selection: (count) => count === 0 ? "Na-clear ang pagpili." : count === 1 ? "1 item ang napili." : `Mga napiling item: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Inilipat." : `Mga inilipat na item: ${count}.`,
  notMoved: "Hindi inilipat.",
  port: (port, node) => `${port} ng ${node}`,
  linkPort: (port) => `Kumonekta mula sa ${port}`,
  wiring: (from, count) => count === 1 ? `Wire mula sa ${from}. 1 port ang tumatanggap nito. Pumipili ang mga arrow key, kumokonekta ang Enter, kumakansela ang Escape.` : `Wire mula sa ${from}. Mga port na tumatanggap nito: ${count}. Pumipili ang mga arrow key, kumokonekta ang Enter, kumakansela ang Escape.`,
  target: (to, index, count) => `${to}, ${index} sa ${count}.`,
  noTarget: "Walang port na tumatanggap sa wire na ito.",
  connected: (from, to) => `Nakakonekta ang ${from} sa ${to}.`,
  notConnected: "Hindi nakakonekta."
};
export {
  fil_default as default
};
