var ku_Arab_default = {
  selection: (count) => count === 0 ? "هەلبژارتن هاتە ڕاکرن." : count === 1 ? "1 تشت هاتە هەلبژارتن." : `تشتێن هەلبژارتی: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "هاتە ڤەگوهاستن." : `تشتێن هاتینە ڤەگوهاستن: ${count}.`,
  notMoved: "نەهاتە ڤەگوهاستن.",
  port: (port, node) => `${port} یا ${node}`,
  linkPort: (port) => `ژ ${port} گرێدە`,
  wiring: (from, count) => count === 1 ? `تێل ژ ${from}. 1 پۆرت دێ وی قەبوول کە. تیپێن تیران هەلدبژێرن، Enter گرێ ددە، Escape بەتال دکە.` : `تێل ژ ${from}. پۆرتێن کو دێ وی قەبوول کەن: ${count}. تیپێن تیران هەلدبژێرن، Enter گرێ ددە، Escape بەتال دکە.`,
  target: (to, index, count) => `${to}, ${index} ژ ${count}.`,
  noTarget: "چ پۆرت ڤی تێلی قەبوول ناکە.",
  connected: (from, to) => `${from} ب ${to} ڕە هاتە گرێدان.`,
  notConnected: "نەهاتە گرێدان."
};
export {
  ku_Arab_default as default
};
