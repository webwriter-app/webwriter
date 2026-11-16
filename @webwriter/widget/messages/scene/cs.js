var cs_default = {
  selection: (count) => count === 0 ? "Výběr zrušen." : count === 1 ? "Vybrána 1 položka." : `Vybrané položky: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Přesunuto." : `Přesunuté položky: ${count}.`,
  notMoved: "Nepřesunuto.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Propojit z: ${port}`,
  wiring: (from, count) => count === 1 ? `Vodič z: ${from}. Přijímá ho 1 port. Šipkami vyberte, klávesou Enter propojte, klávesou Escape zrušte.` : `Vodič z: ${from}. Porty, které ho přijímají: ${count}. Šipkami vyberte, klávesou Enter propojte, klávesou Escape zrušte.`,
  target: (to, index, count) => `${to}, ${index} z ${count}.`,
  noTarget: "Žádný port tento vodič nepřijímá.",
  connected: (from, to) => `Propojeno: ${from} a ${to}.`,
  notConnected: "Nepropojeno."
};
export {
  cs_default as default
};
