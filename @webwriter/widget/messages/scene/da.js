var da_default = {
  selection: (count) => count === 0 ? "Markering ophævet." : count === 1 ? "1 element valgt." : `${count} elementer valgt.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Flyttet." : `${count} elementer flyttet.`,
  notMoved: "Ikke flyttet.",
  port: (port, node) => `${port} på ${node}`,
  linkPort: (port) => `Forbind fra ${port}`,
  wiring: (from, count) => count === 1 ? `Forbindelse fra ${from}. 1 port accepterer den. Piletaster vælger, Enter forbinder, Escape annullerer.` : `Forbindelse fra ${from}. ${count} porte accepterer den. Piletaster vælger, Enter forbinder, Escape annullerer.`,
  target: (to, index, count) => `${to}, ${index} af ${count}.`,
  noTarget: "Ingen port accepterer denne forbindelse.",
  connected: (from, to) => `${from} er forbundet med ${to}.`,
  notConnected: "Ikke forbundet."
};
export {
  da_default as default
};
