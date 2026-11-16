var ar_default = {
  selection: (count) => count === 0 ? "تم مسح التحديد." : count === 1 ? "تم تحديد عنصر واحد." : `العناصر المحددة: ${count}.`,
  moving: (x, y) => `x ${x}، y ${y}.`,
  moved: (count) => count === 1 ? "تم النقل." : `العناصر المنقولة: ${count}.`,
  notMoved: "لم يتم النقل.",
  port: (port, node) => `${port} في ${node}`,
  linkPort: (port) => `الاتصال من ${port}`,
  wiring: (from, count) => count === 1 ? `توصيل من ${from}. منفذ واحد يقبله. استخدم مفاتيح الأسهم للاختيار، وEnter للتوصيل، وEscape للإلغاء.` : `توصيل من ${from}. المنافذ التي تقبله: ${count}. استخدم مفاتيح الأسهم للاختيار، وEnter للتوصيل، وEscape للإلغاء.`,
  target: (to, index, count) => `${to}، ${index} من ${count}.`,
  noTarget: "لا يوجد منفذ يقبل هذا التوصيل.",
  connected: (from, to) => `تم توصيل ${from} بـ ${to}.`,
  notConnected: "لم يتم التوصيل."
};
export {
  ar_default as default
};
