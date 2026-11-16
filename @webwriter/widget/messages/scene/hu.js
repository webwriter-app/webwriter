var hu_default = {
  selection: (count) => count === 0 ? "Kijelölés megszüntetve." : count === 1 ? "1 elem kijelölve." : `Kijelölt elemek: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Áthelyezve." : `Áthelyezett elemek: ${count}.`,
  notMoved: "Nem lett áthelyezve.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Kapcsolat indítása: ${port}`,
  wiring: (from, count) => count === 1 ? `Vezeték innen: ${from}. 1 csatlakozó fogadja el. A nyílbillentyűkkel válasszon, az Enter billentyűvel kapcsoljon össze, az Esc billentyűvel vonja vissza.` : `Vezeték innen: ${from}. Az elfogadó csatlakozók száma: ${count}. A nyílbillentyűkkel válasszon, az Enter billentyűvel kapcsoljon össze, az Esc billentyűvel vonja vissza.`,
  target: (to, index, count) => `${to}, ${index}. a(z) ${count} közül.`,
  noTarget: "Egyik csatlakozó sem fogadja el ezt a vezetéket.",
  connected: (from, to) => `Összekapcsolva: ${from} és ${to}.`,
  notConnected: "Nincs összekapcsolva."
};
export {
  hu_default as default
};
