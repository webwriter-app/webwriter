var pl_default = {
  selection: (count) => count === 0 ? "Wyczyszczono zaznaczenie." : count === 1 ? "Zaznaczono 1 element." : `Zaznaczone elementy: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Przeniesiono." : `Przeniesione elementy: ${count}.`,
  notMoved: "Nie przeniesiono.",
  port: (port, node) => `${port} – ${node}`,
  linkPort: (port) => `Rozpocznij połączenie od: ${port}`,
  wiring: (from, count) => count === 1 ? `Przewód od: ${from}. Akceptuje go 1 port. Strzałkami wybierz, klawiszem Enter połącz, klawiszem Escape anuluj.` : `Przewód od: ${from}. Porty, które go akceptują: ${count}. Strzałkami wybierz, klawiszem Enter połącz, klawiszem Escape anuluj.`,
  target: (to, index, count) => `${to}, ${index} z ${count}.`,
  noTarget: "Żaden port nie akceptuje tego przewodu.",
  connected: (from, to) => `Połączono: ${from} i ${to}.`,
  notConnected: "Nie połączono."
};
export {
  pl_default as default
};
