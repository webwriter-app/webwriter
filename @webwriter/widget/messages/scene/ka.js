var ka_default = {
  selection: (count) => count === 0 ? "არჩევანი გაუქმებულია." : count === 1 ? "არჩეულია 1 ელემენტი." : `არჩეული ელემენტების რაოდენობა: ${count}.`,
  moving: (x, y) => `x ${x}, y ${y}.`,
  moved: (count) => count === 1 ? "გადაადგილებულია." : `გადაადგილებული ელემენტების რაოდენობა: ${count}.`,
  notMoved: "არ გადაადგილებულა.",
  port: (port, node) => `${node}: ${port}`,
  linkPort: (port) => `კავშირის დაწყება აქედან: ${port}`,
  wiring: (from, count) => count === 1 ? `კავშირის დასაწყისი: ${from}. მას იღებს 1 პორტი. არჩევისთვის ისრების კლავიშები, დასაკავშირებლად Enter, გასაუქმებლად Escape.` : `კავშირის დასაწყისი: ${from}. მისი მიმღები პორტების რაოდენობა: ${count}. არჩევისთვის ისრების კლავიშები, დასაკავშირებლად Enter, გასაუქმებლად Escape.`,
  target: (to, index, count) => `${to}, ${index} / ${count}.`,
  noTarget: "არც ერთი პორტი არ იღებს ამ კავშირს.",
  connected: (from, to) => `დაკავშირებულია: ${from} და ${to}.`,
  notConnected: "არ დაკავშირებულა."
};
export {
  ka_default as default
};
