var lt_default = {
  selection: (count) => count === 0 ? "Pasirinkimas panaikintas." : count === 1 ? "Pasirinktas 1 elementas." : `Pasirinkti elementai: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Perkelta." : `Perkelti elementai: ${count}.`,
  notMoved: "Neperkelta.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Jungti nuo: ${port}`,
  wiring: (from, count) => count === 1 ? `Laidas iš: ${from}. Jį priima 1 jungtis. Rodyklėmis pasirinkite, klavišu Enter sujunkite, klavišu Escape atšaukite.` : `Laidas iš: ${from}. Jungtys, kurios jį priima: ${count}. Rodyklėmis pasirinkite, klavišu Enter sujunkite, klavišu Escape atšaukite.`,
  target: (to, index, count) => `${to}, ${index} iš ${count}.`,
  noTarget: "Jokia jungtis šio laido nepriima.",
  connected: (from, to) => `Sujungta: ${from} ir ${to}.`,
  notConnected: "Nesujungta."
};
export {
  lt_default as default
};
