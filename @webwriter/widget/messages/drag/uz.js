var uz_default = {
  picked: (item) => `${item} olindi. Joy tanlash uchun strelka tugmalaridan, qo‘yish uchun Enter tugmasidan, bekor qilish uchun Escape tugmasidan foydalaning.`,
  pickedLink: (item) => `${item} ulanmoqda. Ulanadigan nishonni tanlash uchun strelka tugmalaridan, ulash uchun Enter tugmasidan, bekor qilish uchun Escape tugmasidan foydalaning.`,
  selected: (item) => `${item} tanlandi. Qo‘yiladigan joyni bosing yoki bekor qilish uchun uni yana bir marta bosing.`,
  nextTarget: "Tab tugmasi keyingi nishonga o‘tadi.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}o‘rin ${position.index} / ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}chapdan ${x}, yuqoridan ${y}`,
  dropped: (item, target) => target ? `${item} qo‘yildi. Nishon: ${target}.` : `${item} qo‘yildi.`,
  copied: (item, target) => target ? `${item} qo‘shildi. Nishon: ${target}.` : `${item} qo‘shildi.`,
  linked: (item, target) => `${item} ulandi. Nishon: ${target}.`,
  cancelled: () => "Bekor qilindi.",
  notAllowed: "Bekor qilindi. Bunga endi bu yerda ruxsat yo‘q."
};
export {
  uz_default as default
};
