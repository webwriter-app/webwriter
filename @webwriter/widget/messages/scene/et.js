var et_default = {
  selection: (count) => count === 0 ? "Valik tühistatud." : count === 1 ? "Valitud 1 üksus." : `Valitud üksusi: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Teisaldatud." : `Teisaldatud üksusi: ${count}.`,
  notMoved: "Ei teisaldatud.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Alusta ühendamist: ${port}`,
  wiring: (from, count) => count === 1 ? `Juhe: ${from}. Selle võtab vastu 1 port. Vali nooleklahvidega, ühenda klahviga Enter, tühista klahviga Escape.` : `Juhe: ${from}. Seda vastuvõtvaid porte: ${count}. Vali nooleklahvidega, ühenda klahviga Enter, tühista klahviga Escape.`,
  target: (to, index, count) => `${to}, ${index}, kokku ${count}.`,
  noTarget: "Ükski port ei võta seda juhet vastu.",
  connected: (from, to) => `Ühendatud: ${from} ja ${to}.`,
  notConnected: "Ühendamata."
};
export {
  et_default as default
};
