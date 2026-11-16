import type {Catalog} from "../../messages.js"
import type {DragMessages} from "./index.js"

export default {
  picked: item => `${item} ઉપાડ્યું. જગ્યા પસંદ કરવા માટે એરો કી, મૂકવા માટે Enter અને રદ કરવા માટે Escape દબાવો.`,
  pickedLink: item => `${item} જોડવામાં આવી રહ્યું છે. શેની સાથે જોડવું તે પસંદ કરવા માટે એરો કી, જોડવા માટે Enter અને રદ કરવા માટે Escape દબાવો.`,
  selected: item => `${item} પસંદ કર્યું. જ્યાં મૂકવું હોય ત્યાં ક્લિક કરો, અથવા રદ કરવા માટે તેના પર ફરી ક્લિક કરો.`,
  nextTarget: "Tab દબાવવાથી આગલા લક્ષ્ય પર જવાય છે.",
  over: (target, position) => (position ? `${target ? `${target}, ` : ""}${position.count} માંથી સ્થાન ${position.index}` : target),
  at: (target, x, y) => `${target ? `${target}, ` : ""}ડાબેથી ${x}, ઉપરથી ${y}`,
  dropped: (item, target) => (target ? `${item} મૂક્યું: ${target}.` : `${item} મૂક્યું.`),
  copied: (item, target) => (target ? `${item} ઉમેર્યું: ${target}.` : `${item} ઉમેર્યું.`),
  linked: (item, target) => `${item} અને ${target} જોડાયા.`,
  cancelled: () => "રદ કર્યું.",
  notAllowed: "રદ કર્યું. અહીં હવે આની મંજૂરી નથી.",
} satisfies Catalog<DragMessages>
