var nn_default = {
  selection: (count) => count === 0 ? "Val oppheva." : count === 1 ? "1 element valt." : `${count} element valde.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Flytta." : `${count} element flytta.`,
  notMoved: "Ikkje flytta.",
  port: (port, node) => `${port} på ${node}`,
  linkPort: (port) => `Kopla frå ${port}`,
  wiring: (from, count) => count === 1 ? `Kopling frå ${from}. 1 port godtek ho. Piltastar vel, Enter koplar, Escape avbryt.` : `Kopling frå ${from}. ${count} portar godtek ho. Piltastar vel, Enter koplar, Escape avbryt.`,
  target: (to, index, count) => `${to}, ${index} av ${count}.`,
  noTarget: "Ingen port godtek denne koplinga.",
  connected: (from, to) => `Kopla ${from} til ${to}.`,
  notConnected: "Ikkje kopla."
};
export {
  nn_default as default
};
