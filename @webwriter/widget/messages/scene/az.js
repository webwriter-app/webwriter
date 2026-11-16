var az_default = {
  selection: (count) => count === 0 ? "Seçim ləğv edildi." : count === 1 ? "1 element seçildi." : `Seçilmiş elementlərin sayı: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "Köçürüldü." : `Köçürülən elementlərin sayı: ${count}.`,
  notMoved: "Köçürülmədi.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: (port) => `Əlaqəni buradan başlat: ${port}`,
  wiring: (from, count) => count === 1 ? `Əlaqənin başlanğıcı: ${from}. 1 port qəbul edir. Seçmək üçün ox düymələri, birləşdirmək üçün Enter, ləğv etmək üçün Escape.` : `Əlaqənin başlanğıcı: ${from}. Qəbul edən portların sayı: ${count}. Seçmək üçün ox düymələri, birləşdirmək üçün Enter, ləğv etmək üçün Escape.`,
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "Heç bir port bu əlaqəni qəbul etmir.",
  connected: (from, to) => `Birləşdirildi: ${from} və ${to}.`,
  notConnected: "Birləşdirilmədi."
};
export {
  az_default as default
};
