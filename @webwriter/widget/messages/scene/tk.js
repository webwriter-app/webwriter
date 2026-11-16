var tk_default = {
  selection: (count) => count === 0 ? "Saýlaw aýryldy." : count === 1 ? "1 element saýlandy." : `Saýlanan elementleriň sany: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Süýşürildi." : `Süýşürilen elementleriň sany: ${count}.`,
  notMoved: "Süýşürilmedi.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: (port) => `Baglanyşygy şu ýerden başla: ${port}`,
  wiring: (from, count) => count === 1 ? `Baglanyşygyň başy: ${from}. 1 port kabul edýär. Saýlamak üçin ok düwmeleri, baglamak üçin Enter, ýatyrmak üçin Escape.` : `Baglanyşygyň başy: ${from}. Kabul edýän portlaryň sany: ${count}. Saýlamak üçin ok düwmeleri, baglamak üçin Enter, ýatyrmak üçin Escape.`,
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "Hiç bir port bu baglanyşygy kabul etmeýär.",
  connected: (from, to) => `Baglandy: ${from} we ${to}.`,
  notConnected: "Baglanmady."
};
export {
  tk_default as default
};
