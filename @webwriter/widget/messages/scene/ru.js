var ru_default = {
  selection: (count) => count === 0 ? "Выбор отменён." : count === 1 ? "Выбран 1 элемент." : `Выбрано элементов: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Перемещено." : `Перемещено элементов: ${count}.`,
  notMoved: "Не перемещено.",
  port: (port, node) => `${port}: ${node}`,
  linkPort: (port) => `Соединить от ${port}`,
  wiring: (from, count) => count === 1 ? `Соединение от «${from}». Его принимает 1 порт. Стрелки — выбор, Enter — соединить, Escape — отмена.` : `Соединение от «${from}». Портов, которые его принимают: ${count}. Стрелки — выбор, Enter — соединить, Escape — отмена.`,
  target: (to, index, count) => `${to}, ${index} из ${count}.`,
  noTarget: "Ни один порт не принимает это соединение.",
  connected: (from, to) => `«${from}» соединён с «${to}».`,
  notConnected: "Не соединено."
};
export {
  ru_default as default
};
