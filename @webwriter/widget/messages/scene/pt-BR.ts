import type {Catalog} from "../../messages.js"
import type {SceneMessages} from "./index.js"

export default {
  selection: count => (count === 0 ? "Seleção removida." : count === 1 ? "1 item selecionado." : `Itens selecionados: ${count}.`),
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: count => (count === 1 ? "Movido." : `Itens movidos: ${count}.`),
  notMoved: "Não movido.",
  port: (port, node) => `${port} de ${node}`,
  linkPort: port => `Conectar a partir de ${port}`,
  wiring: (from, count) => (count === 1 ? `Fio a partir de ${from}. 1 porta o aceita. As setas escolhem, Enter conecta, Esc cancela.` : `Fio a partir de ${from}. Portas que o aceitam: ${count}. As setas escolhem, Enter conecta, Esc cancela.`),
  target: (to, index, count) => `${to}, ${index} de ${count}.`,
  noTarget: "Nenhuma porta aceita este fio.",
  connected: (from, to) => `${from} conectado a ${to}.`,
  notConnected: "Não conectado.",
} satisfies Catalog<SceneMessages>
