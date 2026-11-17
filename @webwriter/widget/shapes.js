const isNumber = (value) => typeof value === "number" && Number.isFinite(value);
const isString = (value) => typeof value === "string";
const isBoolean = (value) => typeof value === "boolean";
const isSeries = (value) => Array.isArray(value) && value.every(isNumber);
const isTable = (value) => {
  if (!value || typeof value !== "object") return false;
  const { columns, rows } = value;
  return Array.isArray(columns) && columns.every(isString) && Array.isArray(rows) && rows.every((row) => Array.isArray(row) && row.every((cell) => cell === null || isString(cell) || isNumber(cell)));
};
const guards = { number: isNumber, string: isString, boolean: isBoolean, series: isSeries, table: isTable };
function hasShape(shape, value) {
  return Object.hasOwn(guards, shape) && guards[shape](value);
}
function effectAccepts(effect, shape) {
  const { accepts } = effect;
  if (!Array.isArray(accepts) || !accepts.length) return true;
  return typeof shape === "string" && accepts.includes(shape);
}
export {
  effectAccepts,
  hasShape,
  isBoolean,
  isNumber,
  isSeries,
  isString,
  isTable
};
