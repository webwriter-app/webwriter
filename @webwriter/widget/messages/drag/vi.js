var vi_default = {
  picked: (item) => `Đã nhấc ${item}. Dùng các phím mũi tên để chọn vị trí, Enter để thả, Escape để hủy.`,
  pickedLink: (item) => `Đang liên kết ${item}. Dùng các phím mũi tên để chọn đối tượng cần liên kết, Enter để liên kết, Escape để hủy.`,
  selected: (item) => `Đã chọn ${item}. Nhấp vào nơi cần đặt, hoặc nhấp lại để hủy.`,
  nextTarget: "Phím Tab chuyển sang đích tiếp theo.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}vị trí ${position.index} trên ${position.count}` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} từ bên trái, ${y} từ phía trên`,
  dropped: (item, target) => target ? `Đã thả ${item} vào ${target}.` : `Đã thả ${item}.`,
  copied: (item, target) => target ? `Đã thêm ${item} vào ${target}.` : `Đã thêm ${item}.`,
  linked: (item, target) => `Đã liên kết ${item} với ${target}.`,
  cancelled: () => "Đã hủy.",
  notAllowed: "Đã hủy. Thao tác này không còn được phép ở đây."
};
export {
  vi_default as default
};
