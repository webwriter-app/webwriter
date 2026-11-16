var lo_default = {
  selection: (count) => count === 0 ? "ລ້າງການເລືອກແລ້ວ." : count === 1 ? "ເລືອກ 1 ລາຍການແລ້ວ." : `ຈຳນວນລາຍການທີ່ເລືອກ: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "ຍ້າຍແລ້ວ." : `ຈຳນວນລາຍການທີ່ຍ້າຍ: ${count}.`,
  notMoved: "ບໍ່ໄດ້ຍ້າຍ.",
  port: (port, node) => `${port} ຂອງ ${node}`,
  linkPort: (port) => `ເລີ່ມເຊື່ອມຕໍ່ຈາກ ${port}`,
  wiring: (from, count) => count === 1 ? `ສາຍຈາກ ${from}. ພອດທີ່ຮັບໄດ້: 1. ໃຊ້ປຸ່ມລູກສອນເພື່ອເລືອກ, ກົດ Enter ເພື່ອເຊື່ອມຕໍ່, ກົດ Esc ເພື່ອຍົກເລີກ.` : `ສາຍຈາກ ${from}. ຈຳນວນພອດທີ່ຮັບໄດ້: ${count}. ໃຊ້ປຸ່ມລູກສອນເພື່ອເລືອກ, ກົດ Enter ເພື່ອເຊື່ອມຕໍ່, ກົດ Esc ເພື່ອຍົກເລີກ.`,
  target: (to, index, count) => `${to}, ທີ ${index} ຈາກ ${count}.`,
  noTarget: "ບໍ່ມີພອດໃດຮັບສາຍນີ້.",
  connected: (from, to) => `ເຊື່ອມຕໍ່ ${from} ກັບ ${to} ແລ້ວ.`,
  notConnected: "ບໍ່ໄດ້ເຊື່ອມຕໍ່."
};
export {
  lo_default as default
};
