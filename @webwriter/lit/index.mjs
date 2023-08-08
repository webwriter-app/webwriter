/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const H = window, q = H.ShadowRoot && (H.ShadyCSS === void 0 || H.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, ht = Symbol(), F = /* @__PURE__ */ new WeakMap();
let $t = class {
  constructor(t, e, s) {
    if (this._$cssResult$ = !0, s !== ht)
      throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = e;
  }
  get styleSheet() {
    let t = this.o;
    const e = this.t;
    if (q && t === void 0) {
      const s = e !== void 0 && e.length === 1;
      s && (t = F.get(e)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), s && F.set(e, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
};
const vt = (o) => new $t(typeof o == "string" ? o : o + "", void 0, ht), K = (o, t) => {
  q ? o.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet) : t.forEach((e) => {
    const s = document.createElement("style"), i = H.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = e.cssText, o.appendChild(s);
  });
}, G = q ? (o) => o : (o) => o instanceof CSSStyleSheet ? ((t) => {
  let e = "";
  for (const s of t.cssRules)
    e += s.cssText;
  return vt(e);
})(o) : o;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var k;
const N = window, Q = N.trustedTypes, _t = Q ? Q.emptyScript : "", X = N.reactiveElementPolyfillSupport, V = { toAttribute(o, t) {
  switch (t) {
    case Boolean:
      o = o ? _t : null;
      break;
    case Object:
    case Array:
      o = o == null ? o : JSON.stringify(o);
  }
  return o;
}, fromAttribute(o, t) {
  let e = o;
  switch (t) {
    case Boolean:
      e = o !== null;
      break;
    case Number:
      e = o === null ? null : Number(o);
      break;
    case Object:
    case Array:
      try {
        e = JSON.parse(o);
      } catch {
        e = null;
      }
  }
  return e;
} }, at = (o, t) => t !== o && (t == t || o == o), j = { attribute: !0, type: String, converter: V, reflect: !1, hasChanged: at };
let y = class extends HTMLElement {
  constructor() {
    super(), this._$Ei = /* @__PURE__ */ new Map(), this.isUpdatePending = !1, this.hasUpdated = !1, this._$El = null, this.u();
  }
  static addInitializer(t) {
    var e;
    this.finalize(), ((e = this.h) !== null && e !== void 0 ? e : this.h = []).push(t);
  }
  static get observedAttributes() {
    this.finalize();
    const t = [];
    return this.elementProperties.forEach((e, s) => {
      const i = this._$Ep(s, e);
      i !== void 0 && (this._$Ev.set(i, s), t.push(i));
    }), t;
  }
  static createProperty(t, e = j) {
    if (e.state && (e.attribute = !1), this.finalize(), this.elementProperties.set(t, e), !e.noAccessor && !this.prototype.hasOwnProperty(t)) {
      const s = typeof t == "symbol" ? Symbol() : "__" + t, i = this.getPropertyDescriptor(t, s, e);
      i !== void 0 && Object.defineProperty(this.prototype, t, i);
    }
  }
  static getPropertyDescriptor(t, e, s) {
    return { get() {
      return this[e];
    }, set(i) {
      const r = this[t];
      this[e] = i, this.requestUpdate(t, r, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) || j;
  }
  static finalize() {
    if (this.hasOwnProperty("finalized"))
      return !1;
    this.finalized = !0;
    const t = Object.getPrototypeOf(this);
    if (t.finalize(), t.h !== void 0 && (this.h = [...t.h]), this.elementProperties = new Map(t.elementProperties), this._$Ev = /* @__PURE__ */ new Map(), this.hasOwnProperty("properties")) {
      const e = this.properties, s = [...Object.getOwnPropertyNames(e), ...Object.getOwnPropertySymbols(e)];
      for (const i of s)
        this.createProperty(i, e[i]);
    }
    return this.elementStyles = this.finalizeStyles(this.styles), !0;
  }
  static finalizeStyles(t) {
    const e = [];
    if (Array.isArray(t)) {
      const s = new Set(t.flat(1 / 0).reverse());
      for (const i of s)
        e.unshift(G(i));
    } else
      t !== void 0 && e.push(G(t));
    return e;
  }
  static _$Ep(t, e) {
    const s = e.attribute;
    return s === !1 ? void 0 : typeof s == "string" ? s : typeof t == "string" ? t.toLowerCase() : void 0;
  }
  u() {
    var t;
    this._$E_ = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$Eg(), this.requestUpdate(), (t = this.constructor.h) === null || t === void 0 || t.forEach((e) => e(this));
  }
  addController(t) {
    var e, s;
    ((e = this._$ES) !== null && e !== void 0 ? e : this._$ES = []).push(t), this.renderRoot !== void 0 && this.isConnected && ((s = t.hostConnected) === null || s === void 0 || s.call(t));
  }
  removeController(t) {
    var e;
    (e = this._$ES) === null || e === void 0 || e.splice(this._$ES.indexOf(t) >>> 0, 1);
  }
  _$Eg() {
    this.constructor.elementProperties.forEach((t, e) => {
      this.hasOwnProperty(e) && (this._$Ei.set(e, this[e]), delete this[e]);
    });
  }
  createRenderRoot() {
    var t;
    const e = (t = this.shadowRoot) !== null && t !== void 0 ? t : this.attachShadow(this.constructor.shadowRootOptions);
    return K(e, this.constructor.elementStyles), e;
  }
  connectedCallback() {
    var t;
    this.renderRoot === void 0 && (this.renderRoot = this.createRenderRoot()), this.enableUpdating(!0), (t = this._$ES) === null || t === void 0 || t.forEach((e) => {
      var s;
      return (s = e.hostConnected) === null || s === void 0 ? void 0 : s.call(e);
    });
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    var t;
    (t = this._$ES) === null || t === void 0 || t.forEach((e) => {
      var s;
      return (s = e.hostDisconnected) === null || s === void 0 ? void 0 : s.call(e);
    });
  }
  attributeChangedCallback(t, e, s) {
    this._$AK(t, s);
  }
  _$EO(t, e, s = j) {
    var i;
    const r = this.constructor._$Ep(t, s);
    if (r !== void 0 && s.reflect === !0) {
      const n = (((i = s.converter) === null || i === void 0 ? void 0 : i.toAttribute) !== void 0 ? s.converter : V).toAttribute(e, s.type);
      this._$El = t, n == null ? this.removeAttribute(r) : this.setAttribute(r, n), this._$El = null;
    }
  }
  _$AK(t, e) {
    var s;
    const i = this.constructor, r = i._$Ev.get(t);
    if (r !== void 0 && this._$El !== r) {
      const n = i.getPropertyOptions(r), c = typeof n.converter == "function" ? { fromAttribute: n.converter } : ((s = n.converter) === null || s === void 0 ? void 0 : s.fromAttribute) !== void 0 ? n.converter : V;
      this._$El = r, this[r] = c.fromAttribute(e, n.type), this._$El = null;
    }
  }
  requestUpdate(t, e, s) {
    let i = !0;
    t !== void 0 && (((s = s || this.constructor.getPropertyOptions(t)).hasChanged || at)(this[t], e) ? (this._$AL.has(t) || this._$AL.set(t, e), s.reflect === !0 && this._$El !== t && (this._$EC === void 0 && (this._$EC = /* @__PURE__ */ new Map()), this._$EC.set(t, s))) : i = !1), !this.isUpdatePending && i && (this._$E_ = this._$Ej());
  }
  async _$Ej() {
    this.isUpdatePending = !0;
    try {
      await this._$E_;
    } catch (e) {
      Promise.reject(e);
    }
    const t = this.scheduleUpdate();
    return t != null && await t, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    var t;
    if (!this.isUpdatePending)
      return;
    this.hasUpdated, this._$Ei && (this._$Ei.forEach((i, r) => this[r] = i), this._$Ei = void 0);
    let e = !1;
    const s = this._$AL;
    try {
      e = this.shouldUpdate(s), e ? (this.willUpdate(s), (t = this._$ES) === null || t === void 0 || t.forEach((i) => {
        var r;
        return (r = i.hostUpdate) === null || r === void 0 ? void 0 : r.call(i);
      }), this.update(s)) : this._$Ek();
    } catch (i) {
      throw e = !1, this._$Ek(), i;
    }
    e && this._$AE(s);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    var e;
    (e = this._$ES) === null || e === void 0 || e.forEach((s) => {
      var i;
      return (i = s.hostUpdated) === null || i === void 0 ? void 0 : i.call(s);
    }), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
  }
  _$Ek() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$E_;
  }
  shouldUpdate(t) {
    return !0;
  }
  update(t) {
    this._$EC !== void 0 && (this._$EC.forEach((e, s) => this._$EO(s, this[s], e)), this._$EC = void 0), this._$Ek();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
};
y.finalized = !0, y.elementProperties = /* @__PURE__ */ new Map(), y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, X == null || X({ ReactiveElement: y }), ((k = N.reactiveElementVersions) !== null && k !== void 0 ? k : N.reactiveElementVersions = []).push("1.6.1");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var L;
const T = window, g = T.trustedTypes, tt = g ? g.createPolicy("lit-html", { createHTML: (o) => o }) : void 0, W = "$lit$", v = `lit$${(Math.random() + "").slice(9)}$`, ct = "?" + v, yt = `<${ct}>`, m = document, w = () => m.createComment(""), C = (o) => o === null || typeof o != "object" && typeof o != "function", dt = Array.isArray, ft = (o) => dt(o) || typeof (o == null ? void 0 : o[Symbol.iterator]) == "function", z = `[ 	
\f\r]`, S = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, et = /-->/g, st = />/g, _ = RegExp(`>|${z}(?:([^\\s"'>=/]+)(${z}*=${z}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), it = /'/g, ot = /"/g, pt = /^(?:script|style|textarea|title)$/i, A = Symbol.for("lit-noChange"), p = Symbol.for("lit-nothing"), rt = /* @__PURE__ */ new WeakMap(), f = m.createTreeWalker(m, 129, null, !1), gt = (o, t) => {
  const e = o.length - 1, s = [];
  let i, r = t === 2 ? "<svg>" : "", n = S;
  for (let l = 0; l < e; l++) {
    const h = o[l];
    let $, a, d = -1, u = 0;
    for (; u < h.length && (n.lastIndex = u, a = n.exec(h), a !== null); )
      u = n.lastIndex, n === S ? a[1] === "!--" ? n = et : a[1] !== void 0 ? n = st : a[2] !== void 0 ? (pt.test(a[2]) && (i = RegExp("</" + a[2], "g")), n = _) : a[3] !== void 0 && (n = _) : n === _ ? a[0] === ">" ? (n = i ?? S, d = -1) : a[1] === void 0 ? d = -2 : (d = n.lastIndex - a[2].length, $ = a[1], n = a[3] === void 0 ? _ : a[3] === '"' ? ot : it) : n === ot || n === it ? n = _ : n === et || n === st ? n = S : (n = _, i = void 0);
    const x = n === _ && o[l + 1].startsWith("/>") ? " " : "";
    r += n === S ? h + yt : d >= 0 ? (s.push($), h.slice(0, d) + W + h.slice(d) + v + x) : h + v + (d === -2 ? (s.push(void 0), l) : x);
  }
  const c = r + (o[e] || "<?>") + (t === 2 ? "</svg>" : "");
  if (!Array.isArray(o) || !o.hasOwnProperty("raw"))
    throw Error("invalid template strings array");
  return [tt !== void 0 ? tt.createHTML(c) : c, s];
};
class O {
  constructor({ strings: t, _$litType$: e }, s) {
    let i;
    this.parts = [];
    let r = 0, n = 0;
    const c = t.length - 1, l = this.parts, [h, $] = gt(t, e);
    if (this.el = O.createElement(h, s), f.currentNode = this.el.content, e === 2) {
      const a = this.el.content, d = a.firstChild;
      d.remove(), a.append(...d.childNodes);
    }
    for (; (i = f.nextNode()) !== null && l.length < c; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes()) {
          const a = [];
          for (const d of i.getAttributeNames())
            if (d.endsWith(W) || d.startsWith(v)) {
              const u = $[n++];
              if (a.push(d), u !== void 0) {
                const x = i.getAttribute(u.toLowerCase() + W).split(v), R = /([.?@])?(.*)/.exec(u);
                l.push({ type: 1, index: r, name: R[2], strings: x, ctor: R[1] === "." ? At : R[1] === "?" ? St : R[1] === "@" ? bt : M });
              } else
                l.push({ type: 6, index: r });
            }
          for (const d of a)
            i.removeAttribute(d);
        }
        if (pt.test(i.tagName)) {
          const a = i.textContent.split(v), d = a.length - 1;
          if (d > 0) {
            i.textContent = g ? g.emptyScript : "";
            for (let u = 0; u < d; u++)
              i.append(a[u], w()), f.nextNode(), l.push({ type: 2, index: ++r });
            i.append(a[d], w());
          }
        }
      } else if (i.nodeType === 8)
        if (i.data === ct)
          l.push({ type: 2, index: r });
        else {
          let a = -1;
          for (; (a = i.data.indexOf(v, a + 1)) !== -1; )
            l.push({ type: 7, index: r }), a += v.length - 1;
        }
      r++;
    }
  }
  static createElement(t, e) {
    const s = m.createElement("template");
    return s.innerHTML = t, s;
  }
}
function E(o, t, e = o, s) {
  var i, r, n, c;
  if (t === A)
    return t;
  let l = s !== void 0 ? (i = e._$Co) === null || i === void 0 ? void 0 : i[s] : e._$Cl;
  const h = C(t) ? void 0 : t._$litDirective$;
  return (l == null ? void 0 : l.constructor) !== h && ((r = l == null ? void 0 : l._$AO) === null || r === void 0 || r.call(l, !1), h === void 0 ? l = void 0 : (l = new h(o), l._$AT(o, e, s)), s !== void 0 ? ((n = (c = e)._$Co) !== null && n !== void 0 ? n : c._$Co = [])[s] = l : e._$Cl = l), l !== void 0 && (t = E(o, l._$AS(o, t.values), l, s)), t;
}
class mt {
  constructor(t, e) {
    this._$AV = [], this._$AN = void 0, this._$AD = t, this._$AM = e;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t) {
    var e;
    const { el: { content: s }, parts: i } = this._$AD, r = ((e = t == null ? void 0 : t.creationScope) !== null && e !== void 0 ? e : m).importNode(s, !0);
    f.currentNode = r;
    let n = f.nextNode(), c = 0, l = 0, h = i[0];
    for (; h !== void 0; ) {
      if (c === h.index) {
        let $;
        h.type === 2 ? $ = new P(n, n.nextSibling, this, t) : h.type === 1 ? $ = new h.ctor(n, h.name, h.strings, this, t) : h.type === 6 && ($ = new wt(n, this, t)), this._$AV.push($), h = i[++l];
      }
      c !== (h == null ? void 0 : h.index) && (n = f.nextNode(), c++);
    }
    return r;
  }
  v(t) {
    let e = 0;
    for (const s of this._$AV)
      s !== void 0 && (s.strings !== void 0 ? (s._$AI(t, s, e), e += s.strings.length - 2) : s._$AI(t[e])), e++;
  }
}
class P {
  constructor(t, e, s, i) {
    var r;
    this.type = 2, this._$AH = p, this._$AN = void 0, this._$AA = t, this._$AB = e, this._$AM = s, this.options = i, this._$Cp = (r = i == null ? void 0 : i.isConnected) === null || r === void 0 || r;
  }
  get _$AU() {
    var t, e;
    return (e = (t = this._$AM) === null || t === void 0 ? void 0 : t._$AU) !== null && e !== void 0 ? e : this._$Cp;
  }
  get parentNode() {
    let t = this._$AA.parentNode;
    const e = this._$AM;
    return e !== void 0 && (t == null ? void 0 : t.nodeType) === 11 && (t = e.parentNode), t;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t, e = this) {
    t = E(this, t, e), C(t) ? t === p || t == null || t === "" ? (this._$AH !== p && this._$AR(), this._$AH = p) : t !== this._$AH && t !== A && this._(t) : t._$litType$ !== void 0 ? this.g(t) : t.nodeType !== void 0 ? this.$(t) : ft(t) ? this.T(t) : this._(t);
  }
  k(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  $(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.k(t));
  }
  _(t) {
    this._$AH !== p && C(this._$AH) ? this._$AA.nextSibling.data = t : this.$(m.createTextNode(t)), this._$AH = t;
  }
  g(t) {
    var e;
    const { values: s, _$litType$: i } = t, r = typeof i == "number" ? this._$AC(t) : (i.el === void 0 && (i.el = O.createElement(i.h, this.options)), i);
    if (((e = this._$AH) === null || e === void 0 ? void 0 : e._$AD) === r)
      this._$AH.v(s);
    else {
      const n = new mt(r, this), c = n.u(this.options);
      n.v(s), this.$(c), this._$AH = n;
    }
  }
  _$AC(t) {
    let e = rt.get(t.strings);
    return e === void 0 && rt.set(t.strings, e = new O(t)), e;
  }
  T(t) {
    dt(this._$AH) || (this._$AH = [], this._$AR());
    const e = this._$AH;
    let s, i = 0;
    for (const r of t)
      i === e.length ? e.push(s = new P(this.k(w()), this.k(w()), this, this.options)) : s = e[i], s._$AI(r), i++;
    i < e.length && (this._$AR(s && s._$AB.nextSibling, i), e.length = i);
  }
  _$AR(t = this._$AA.nextSibling, e) {
    var s;
    for ((s = this._$AP) === null || s === void 0 || s.call(this, !1, !0, e); t && t !== this._$AB; ) {
      const i = t.nextSibling;
      t.remove(), t = i;
    }
  }
  setConnected(t) {
    var e;
    this._$AM === void 0 && (this._$Cp = t, (e = this._$AP) === null || e === void 0 || e.call(this, t));
  }
}
class M {
  constructor(t, e, s, i, r) {
    this.type = 1, this._$AH = p, this._$AN = void 0, this.element = t, this.name = e, this._$AM = i, this.options = r, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = p;
  }
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t, e = this, s, i) {
    const r = this.strings;
    let n = !1;
    if (r === void 0)
      t = E(this, t, e, 0), n = !C(t) || t !== this._$AH && t !== A, n && (this._$AH = t);
    else {
      const c = t;
      let l, h;
      for (t = r[0], l = 0; l < r.length - 1; l++)
        h = E(this, c[s + l], e, l), h === A && (h = this._$AH[l]), n || (n = !C(h) || h !== this._$AH[l]), h === p ? t = p : t !== p && (t += (h ?? "") + r[l + 1]), this._$AH[l] = h;
    }
    n && !i && this.j(t);
  }
  j(t) {
    t === p ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class At extends M {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === p ? void 0 : t;
  }
}
const Et = g ? g.emptyScript : "";
class St extends M {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    t && t !== p ? this.element.setAttribute(this.name, Et) : this.element.removeAttribute(this.name);
  }
}
class bt extends M {
  constructor(t, e, s, i, r) {
    super(t, e, s, i, r), this.type = 5;
  }
  _$AI(t, e = this) {
    var s;
    if ((t = (s = E(this, t, e, 0)) !== null && s !== void 0 ? s : p) === A)
      return;
    const i = this._$AH, r = t === p && i !== p || t.capture !== i.capture || t.once !== i.once || t.passive !== i.passive, n = t !== p && (i === p || r);
    r && this.element.removeEventListener(this.name, this, i), n && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    var e, s;
    typeof this._$AH == "function" ? this._$AH.call((s = (e = this.options) === null || e === void 0 ? void 0 : e.host) !== null && s !== void 0 ? s : this.element, t) : this._$AH.handleEvent(t);
  }
}
class wt {
  constructor(t, e, s) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = e, this.options = s;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    E(this, t);
  }
}
const nt = T.litHtmlPolyfillSupport;
nt == null || nt(O, P), ((L = T.litHtmlVersions) !== null && L !== void 0 ? L : T.litHtmlVersions = []).push("2.7.3");
const Ct = (o, t, e) => {
  var s, i;
  const r = (s = e == null ? void 0 : e.renderBefore) !== null && s !== void 0 ? s : t;
  let n = r._$litPart$;
  if (n === void 0) {
    const c = (i = e == null ? void 0 : e.renderBefore) !== null && i !== void 0 ? i : null;
    r._$litPart$ = n = new P(t.insertBefore(w(), c), c, void 0, e ?? {});
  }
  return n._$AI(o), n;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var B, D;
class b extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var t, e;
    const s = super.createRenderRoot();
    return (t = (e = this.renderOptions).renderBefore) !== null && t !== void 0 || (e.renderBefore = s.firstChild), s;
  }
  update(t) {
    const e = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t), this._$Do = Ct(e, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var t;
    super.connectedCallback(), (t = this._$Do) === null || t === void 0 || t.setConnected(!0);
  }
  disconnectedCallback() {
    var t;
    super.disconnectedCallback(), (t = this._$Do) === null || t === void 0 || t.setConnected(!1);
  }
  render() {
    return A;
  }
}
b.finalized = !0, b._$litElement$ = !0, (B = globalThis.litElementHydrateSupport) === null || B === void 0 || B.call(globalThis, { LitElement: b });
const lt = globalThis.litElementPolyfillSupport;
lt == null || lt({ LitElement: b });
((D = globalThis.litElementVersions) !== null && D !== void 0 ? D : globalThis.litElementVersions = []).push("3.3.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Ot = (o, t) => t.kind === "method" && t.descriptor && !("value" in t.descriptor) ? { ...t, finisher(e) {
  e.createProperty(t.key, o);
} } : { kind: "field", key: Symbol(), placement: "own", descriptor: {}, originalKey: t.key, initializer() {
  typeof t.initializer == "function" && (this[t.key] = t.initializer.call(this));
}, finisher(e) {
  e.createProperty(t.key, o);
} };
function Y(o) {
  return (t, e) => e !== void 0 ? ((s, i, r) => {
    i.constructor.createProperty(r, s);
  })(o, t, e) : Ot(o, t);
}
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var I;
((I = window.HTMLSlotElement) === null || I === void 0 ? void 0 : I.prototype.assignedElements) != null;
const ut = /* @__PURE__ */ new WeakMap();
function Pt(o, t) {
  let e = t;
  for (; e; ) {
    if (ut.get(e) === o)
      return !0;
    e = Object.getPrototypeOf(e);
  }
  return !1;
}
function xt(o) {
  return (t) => {
    if (Pt(o, t))
      return t;
    const e = o(t);
    return ut.set(e, o), e;
  };
}
const U = !!ShadowRoot.prototype.createElement, Rt = (o) => (
  /** @type {ScopedElementsHost} */
  class extends o {
    /**
     * Obtains the scoped elements definitions map if specified.
     *
     * @returns {ScopedElementsMap}
     */
    static get scopedElements() {
      return {};
    }
    /**
     * Obtains the ShadowRoot options.
     *
     * @type {ShadowRootInit}
     */
    static get shadowRootOptions() {
      return this.__shadowRootOptions;
    }
    /**
     * Set the shadowRoot options.
     *
     * @param {ShadowRootInit} value
     */
    static set shadowRootOptions(e) {
      this.__shadowRootOptions = e;
    }
    /**
     * Obtains the element styles.
     *
     * @returns {CSSResultOrNative[]}
     */
    static get elementStyles() {
      return this.__elementStyles;
    }
    static set elementStyles(e) {
      this.__elementStyles = e;
    }
    // either TS or ESLint will complain here
    // eslint-disable-next-line no-unused-vars
    constructor(...e) {
      super(), this.renderOptions = this.renderOptions || void 0;
    }
    /**
     * Obtains the CustomElementRegistry associated to the ShadowRoot.
     *
     * @returns {CustomElementRegistry}
     */
    get registry() {
      return this.constructor.__registry;
    }
    /**
     * Set the CustomElementRegistry associated to the ShadowRoot
     *
     * @param {CustomElementRegistry} registry
     */
    set registry(e) {
      this.constructor.__registry = e;
    }
    createRenderRoot() {
      const { scopedElements: e, shadowRootOptions: s, elementStyles: i } = (
        /** @type {typeof ScopedElementsHost} */
        this.constructor
      );
      if (!this.registry || // @ts-ignore
      this.registry === this.constructor.__registry && !Object.prototype.hasOwnProperty.call(this.constructor, "__registry")) {
        this.registry = U ? new CustomElementRegistry() : customElements;
        for (const [l, h] of Object.entries(e))
          this.defineScopedElement(l, h);
      }
      const n = {
        mode: "open",
        ...s,
        customElements: this.registry
      }, c = this.attachShadow(n);
      return U && (this.renderOptions.creationScope = c), c instanceof ShadowRoot && (K(c, i), this.renderOptions.renderBefore = this.renderOptions.renderBefore || c.firstChild), c;
    }
    createScopedElement(e) {
      return (U ? this.shadowRoot : document).createElement(e);
    }
    /**
     * Defines a scoped element.
     *
     * @param {string} tagName
     * @param {typeof HTMLElement} klass
     */
    defineScopedElement(e, s) {
      const i = this.registry.get(e);
      return i && U === !1 && i !== s && console.error(
        [
          `You are trying to re-register the "${e}" custom element with a different class via ScopedElementsMixin.`,
          "This is only possible with a CustomElementRegistry.",
          "Your browser does not support this feature so you will need to load a polyfill for it.",
          'Load "@webcomponents/scoped-custom-element-registry" before you register ANY web component to the global customElements registry.',
          'e.g. add "<script src="/node_modules/@webcomponents/scoped-custom-element-registry/scoped-custom-element-registry.min.js"><\/script>" as your first script tag.',
          "For more details you can visit https://open-wc.org/docs/development/scoped-elements/"
        ].join(`
`)
      ), i ? this.registry.get(e) : this.registry.define(e, s);
    }
    /**
     * @deprecated use the native el.tagName instead
     *
     * @param {string} tagName
     * @returns {string} the tag name
     */
    // eslint-disable-next-line class-methods-use-this
    getScopedTagName(e) {
      return this.constructor.getScopedTagName(e);
    }
    /**
     * @deprecated use the native el.tagName instead
     *
     * @param {string} tagName
     * @returns {string} the tag name
     */
    // eslint-disable-next-line class-methods-use-this
    static getScopedTagName(e) {
      return this.__registry.get(e) ? e : void 0;
    }
  }
), Ut = xt(Rt);
var Ht = Object.defineProperty, Nt = Object.getOwnPropertyDescriptor, J = (o, t, e, s) => {
  for (var i = s > 1 ? void 0 : s ? Nt(t, e) : t, r = o.length - 1, n; r >= 0; r--)
    (n = o[r]) && (i = (s ? n(t, e, i) : n(i)) || i);
  return s && i && Ht(t, e, i), i;
};
class Z extends Ut(b) {
  connectedCallback() {
    super.connectedCallback();
    let t = this.constructor.styles;
    t = Array.isArray(t) ? t : [t], this.shadowRoot && K(this.shadowRoot, t), this.getAttributeNames().forEach((e) => this.setAttribute(e, this.getAttribute(e)));
  }
}
J([
  Y({ type: Boolean, attribute: !0, reflect: !0 })
], Z.prototype, "printable", 2);
J([
  Y({ type: Boolean, attribute: !0, reflect: !0 })
], Z.prototype, "editable", 2);
J([
  Y({ type: Boolean, attribute: !0, reflect: !0 })
], Z.prototype, "analyzable", 2);
export {
  Z as LitElementWw
};
