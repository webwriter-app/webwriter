var ms_default = {
  picked: (item) => `${item} diambil. Gunakan kekunci anak panah untuk memilih tempat, Enter untuk menjatuhkan, Escape untuk membatalkan.`,
  pickedLink: (item) => `Memautkan ${item}. Gunakan kekunci anak panah untuk memilih sasaran pautan, Enter untuk memaut, Escape untuk membatalkan.`,
  selected: (item) => `${item} dipilih. Klik tempat yang dituju, atau klik sekali lagi untuk membatalkan.`,
  nextTarget: "Tab beralih ke sasaran seterusnya.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}kedudukan ${position.index} daripada ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} dari kiri, ${y} dari atas`,
  dropped: (item, target) => target ? `${item} dijatuhkan pada ${target}.` : `${item} dijatuhkan.`,
  copied: (item, target) => target ? `${item} ditambah ke ${target}.` : `${item} ditambah.`,
  linked: (item, target) => `${item} dipautkan kepada ${target}.`,
  cancelled: () => "Dibatalkan.",
  notAllowed: "Dibatalkan. Perkara ini tidak lagi dibenarkan di sini."
};
export {
  ms_default as default
};
