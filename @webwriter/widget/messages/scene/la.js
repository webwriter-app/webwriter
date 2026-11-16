var la_default = {
  selection: (count) => count === 0 ? "Electio sublata est." : count === 1 ? "Unum elementum electum est." : `Numerus electorum: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Motum est." : `Numerus motorum: ${count}.`,
  notMoved: "Non motum est.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: (port) => `Nexum incipe a ${port}`,
  wiring: (from, count) => count === 1 ? `Nexus a ${from}. Unus portus accipit. Claves sagittarum eligunt, Enter nectit, Escape omittit.` : `Nexus a ${from}. Numerus portuum accipientium: ${count}. Claves sagittarum eligunt, Enter nectit, Escape omittit.`,
  target: (to, index, count) => `${to}, ${index} ex ${count}.`,
  noTarget: "Nullus portus hunc nexum accipit.",
  connected: (from, to) => `Nexa sunt: ${from} et ${to}.`,
  notConnected: "Non nexum est."
};
export {
  la_default as default
};
