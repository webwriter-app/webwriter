import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "선택이 해제되었습니다." : count === 1 ? "항목 1개를 선택했습니다." : `선택한 항목 수: ${count}개.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "이동했습니다." : `이동한 항목 수: ${count}개.`),
  notMoved: "이동하지 않았습니다.",
  port: (port, node) => `${node}의 ${port}`,
  linkPort: port => `${port}에서 연결 시작`,
  wiring: (from, count) => (count === 1 ? `${from}에서 시작하는 연결선입니다. 받을 수 있는 포트: 1개. 방향키로 선택하고, Enter 키로 연결하고, Esc 키로 취소하세요.` : `${from}에서 시작하는 연결선입니다. 받을 수 있는 포트: ${count}개. 방향키로 선택하고, Enter 키로 연결하고, Esc 키로 취소하세요.`),
  target: (to, index, count) => `${to}, ${count}개 중 ${index}번째.`,
  noTarget: "이 연결선을 받을 수 있는 포트가 없습니다.",
  connected: (from, to) => `${from}을(를) ${to}에 연결했습니다.`,
  notConnected: "연결되지 않았습니다.",
} satisfies Catalog<SceneMessages>
