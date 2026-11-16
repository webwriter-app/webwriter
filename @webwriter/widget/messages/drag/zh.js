var zh_default = {
  picked: (item) => `已拿起${item}。使用方向键选择位置，按 Enter 放下，按 Esc 取消。`,
  pickedLink: (item) => `正在连接${item}。使用方向键选择连接目标，按 Enter 连接，按 Esc 取消。`,
  selected: (item) => `已选中${item}。请点击要放置的位置，或再次点击该项以取消。`,
  nextTarget: "按 Tab 键切换到下一个目标。",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}第 ${position.index} 个位置，共 ${position.count} 个` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}距左侧 ${x}，距顶部 ${y}`,
  dropped: (item, target) => target ? `已将${item}放到${target}。` : `已放下${item}。`,
  copied: (item, target) => target ? `已将${item}添加到${target}。` : `已添加${item}。`,
  linked: (item, target) => `已将${item}连接到${target}。`,
  cancelled: () => "已取消。",
  notAllowed: "已取消。此处不再允许该操作。"
};
export {
  zh_default as default
};
