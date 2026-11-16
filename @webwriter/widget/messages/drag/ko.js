var ko_default = {
  picked: (item) => `${item}을(를) 집었습니다. 방향키로 위치를 선택하고, Enter 키로 놓고, Esc 키로 취소하세요.`,
  pickedLink: (item) => `${item} 연결 중입니다. 방향키로 연결할 대상을 선택하고, Enter 키로 연결하고, Esc 키로 취소하세요.`,
  selected: (item) => `${item} 선택됨. 놓을 위치를 클릭하거나, 다시 클릭하여 취소하세요.`,
  nextTarget: "Tab 키를 누르면 다음 대상으로 이동합니다.",
  over: (target, position) => position ? `${target ? `${target}, ` : ""}${position.count}개 중 ${position.index}번째 위치` : target,
  at: (target, x, y) => `${target ? `${target}, ` : ""}왼쪽에서 ${x}, 위쪽에서 ${y}`,
  dropped: (item, target) => target ? `${item} 놓음: ${target}.` : `${item}을(를) 놓았습니다.`,
  copied: (item, target) => target ? `${item} 추가됨: ${target}.` : `${item}을(를) 추가했습니다.`,
  linked: (item, target) => `${item} 연결됨: ${target}.`,
  cancelled: () => "취소되었습니다.",
  notAllowed: "취소되었습니다. 여기서는 더 이상 허용되지 않습니다."
};
export {
  ko_default as default
};
