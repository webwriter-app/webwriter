var tr_default = {
  picked: (item) => `${item} alındı. Yer seçmek için ok tuşlarını, bırakmak için Enter tuşunu, iptal etmek için Escape tuşunu kullanın.`,
  pickedLink: (item) => `${item} bağlanıyor. Bağlanacak hedefi seçmek için ok tuşlarını, bağlamak için Enter tuşunu, iptal etmek için Escape tuşunu kullanın.`,
  selected: (item) => `${item} seçildi. Gideceği yere tıklayın veya iptal etmek için ona yeniden tıklayın.`,
  nextTarget: "Tab tuşu sonraki hedefe geçer.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}konum ${position.index} / ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}soldan ${x}, yukarıdan ${y}`,
  dropped: (item, target) => target ? `${item} bırakıldı. Hedef: ${target}.` : `${item} bırakıldı.`,
  copied: (item, target) => target ? `${item} eklendi. Hedef: ${target}.` : `${item} eklendi.`,
  linked: (item, target) => `${item} bağlandı. Hedef: ${target}.`,
  cancelled: () => "İptal edildi.",
  notAllowed: "İptal edildi. Buna artık burada izin verilmiyor."
};
export {
  tr_default as default
};
