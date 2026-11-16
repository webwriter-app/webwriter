var sq_default = {
  selection: (count) => count === 0 ? "Zgjedhja u pastrua." : count === 1 ? "1 element i zgjedhur." : `Elemente të zgjedhura: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Lëvizur." : `Elemente të lëvizura: ${count}.`,
  notMoved: "Pa lëvizur.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Lidh nga: ${port}`,
  wiring: (from, count) => count === 1 ? `Tel nga: ${from}. E pranon 1 portë. Shigjetat zgjedhin, Enter lidh, Escape anulon.` : `Tel nga: ${from}. Portat që e pranojnë: ${count}. Shigjetat zgjedhin, Enter lidh, Escape anulon.`,
  target: (to, index, count) => `${to}, ${index} nga ${count}.`,
  noTarget: "Asnjë portë nuk e pranon këtë tel.",
  connected: (from, to) => `Lidhur: ${from} me ${to}.`,
  notConnected: "Pa lidhur."
};
export {
  sq_default as default
};
