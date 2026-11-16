var tg_default = {
  selection: (count) => count === 0 ? "Интихоб бекор карда шуд." : count === 1 ? "1 унсур интихоб шуд." : `Шумораи унсурҳои интихобшуда: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Ҷойивазкунӣ шуд." : `Шумораи унсурҳои ҷойивазкардашуда: ${count}.`,
  notMoved: "Ҷойивазкунӣ нашуд.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: (port) => `Оғози пайвастшавӣ аз ${port}`,
  wiring: (from, count) => count === 1 ? `Оғози пайвастшавӣ: ${from}. 1 порт қабул мекунад. Барои интихоб тугмаҳои тирча, барои пайваст кардан Enter, барои бекор кардан Escape.` : `Оғози пайвастшавӣ: ${from}. Шумораи портҳои қабулкунанда: ${count}. Барои интихоб тугмаҳои тирча, барои пайваст кардан Enter, барои бекор кардан Escape.`,
  target: (to, index, count) => `${to}, ${index} аз ${count}.`,
  noTarget: "Ягон порт ин пайвастшавиро қабул намекунад.",
  connected: (from, to) => `Пайваст шуд: ${from} ва ${to}.`,
  notConnected: "Пайваст нашуд."
};
export {
  tg_default as default
};
