var zh_Hant_default = {
  picked: (item) => `已拿起${item}。使用方向鍵選擇位置，按 Enter 放下，按 Esc 取消。`,
  pickedLink: (item) => `正在連結${item}。使用方向鍵選擇連結目標，按 Enter 連結，按 Esc 取消。`,
  selected: (item) => `已選取${item}。請點擊要放置的位置，或再次點擊該項目以取消。`,
  nextTarget: "按 Tab 鍵切換到下一個目標。",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}第 ${position.index} 個位置，共 ${position.count} 個` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}距左側 ${x}，距頂端 ${y}`,
  dropped: (item, target) => target ? `已將${item}放到${target}。` : `已放下${item}。`,
  copied: (item, target) => target ? `已將${item}加入${target}。` : `已加入${item}。`,
  linked: (item, target) => `已將${item}連結到${target}。`,
  cancelled: () => "已取消。",
  notAllowed: "已取消。此處不再允許該操作。"
};
export {
  zh_Hant_default as default
};
