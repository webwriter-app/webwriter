var sr_Cyrl_default = {
  selection: (count) => count === 0 ? "Избор је поништен." : count === 1 ? "Изабран је 1 елемент." : `Изабрани елементи: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Премештено." : `Премештени елементи: ${count}.`,
  notMoved: "Није премештено.",
  port: (port, node) => `${port} на ${node}`,
  linkPort: (port) => `Повежи од ${port}`,
  wiring: (from, count) => count === 1 ? `Веза од ${from}. Прихвата је 1 прикључак. Стрелицама бирате, тастером Enter повезујете, тастером Escape одустајете.` : `Веза од ${from}. Прикључци који је прихватају: ${count}. Стрелицама бирате, тастером Enter повезујете, тастером Escape одустајете.`,
  target: (to, index, count) => `${to}, ${index} од ${count}.`,
  noTarget: "Ниједан прикључак не прихвата ову везу.",
  connected: (from, to) => `${from} је повезано са ${to}.`,
  notConnected: "Није повезано."
};
export {
  sr_Cyrl_default as default
};
