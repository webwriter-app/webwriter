import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} selecionado. Use as setas para escolher um local, Enter para largar, Esc para cancelar.`,
  pickedLink: item => `A ligar ${item}. Use as setas para escolher a que ligar, Enter para ligar, Esc para cancelar.`,
  selected: item => `${item} selecionado. Clique no local de destino ou clique novamente no item para cancelar.`,
  nextTarget: "A tecla Tab passa ao destino seguinte.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}posição ${position.index} de ${position.count}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}${x} a partir da esquerda, ${y} a partir do topo`,
  dropped: (item, target) => (target ? `${item} largado em ${target}.` : `${item} largado.`),
  copied: (item, target) => (target ? `${item} adicionado a ${target}.` : `${item} adicionado.`),
  linked: (item, target) => `${item} ligado a ${target}.`,
  cancelled: () => "Cancelado.",
  notAllowed: "Cancelado. Já não é permitido aqui.",
} satisfies Catalog<DragMessages>
