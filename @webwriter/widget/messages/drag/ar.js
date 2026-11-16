var ar_default = {
  picked: (item) => `تم التقاط ${item}. استخدم مفاتيح الأسهم لاختيار مكان، ثم Enter للإفلات أو Escape للإلغاء.`,
  pickedLink: (item) => `جارٍ ربط ${item}. استخدم مفاتيح الأسهم لاختيار ما سيُربط به، ثم Enter للربط أو Escape للإلغاء.`,
  selected: (item) => `تم تحديد ${item}. انقر على المكان المطلوب، أو انقر عليه مرة أخرى للإلغاء.`,
  nextTarget: "ينقلك مفتاح Tab إلى الهدف التالي.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}الموضع ${position.index} من ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} من اليسار، ${y} من الأعلى`,
  dropped: (item, target) => target ? `تم إفلات ${item} في ${target}.` : `تم إفلات ${item}.`,
  copied: (item, target) => target ? `تمت إضافة ${item} إلى ${target}.` : `تمت إضافة ${item}.`,
  linked: (item, target) => `تم ربط ${item} بـ ${target}.`,
  cancelled: () => "تم الإلغاء.",
  notAllowed: "تم الإلغاء. لم يعد هذا مسموحًا هنا."
};
export {
  ar_default as default
};
