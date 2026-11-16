var mn_default = {
  selection: (count) => count === 0 ? "Сонголтыг цуцалсан." : count === 1 ? "1 зүйл сонгосон." : `Сонгосон зүйлийн тоо: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Зөөсөн." : `Зөөсөн зүйлийн тоо: ${count}.`,
  notMoved: "Зөөгөөгүй.",
  port: (port, node) => `${node}-ийн ${port}`,
  linkPort: (port) => `${port}-оос холболт эхлүүлэх`,
  wiring: (from, count) => count === 1 ? `${from}-оос эхэлсэн утас. Хүлээн авах порт: 1. Сумтай товчоор сонгож, Enter-ээр холбож, Escape-ээр болиулна уу.` : `${from}-оос эхэлсэн утас. Хүлээн авах портын тоо: ${count}. Сумтай товчоор сонгож, Enter-ээр холбож, Escape-ээр болиулна уу.`,
  target: (to, index, count) => `${to}, ${count}-ийн ${index}-р.`,
  noTarget: "Энэ утсыг хүлээн авах порт алга.",
  connected: (from, to) => `${from}-г ${to}-тэй холбов.`,
  notConnected: "Холбоогүй."
};
export {
  mn_default as default
};
