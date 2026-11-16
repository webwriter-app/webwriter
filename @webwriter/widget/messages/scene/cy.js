var cy_default = {
  selection: (count) => count === 0 ? "Dewis wedi'i glirio." : count === 1 ? "Dewiswyd 1 eitem." : `Eitemau wedi'u dewis: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Wedi symud." : `Eitemau wedi'u symud: ${count}.`,
  notMoved: "Heb symud.",
  port: (port, node) => `${port}, nod: ${node}`,
  linkPort: (port) => `Dechrau cysylltu: ${port}`,
  wiring: (from, count) => count === 1 ? `Gwifren yn dechrau: ${from}. Mae 1 porth yn ei derbyn. Mae'r allweddi saeth yn dewis, mae Enter yn cysylltu, mae Escape yn canslo.` : `Gwifren yn dechrau: ${from}. Pyrth sy'n ei derbyn: ${count}. Mae'r allweddi saeth yn dewis, mae Enter yn cysylltu, mae Escape yn canslo.`,
  target: (to, index, count) => `${to}, ${index} o ${count}.`,
  noTarget: "Nid oes unrhyw borth yn derbyn y wifren hon.",
  connected: (from, to) => `Cysylltwyd: ${from}, cyrchfan: ${to}.`,
  notConnected: "Heb gysylltu."
};
export {
  cy_default as default
};
