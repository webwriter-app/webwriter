var ft = Object.defineProperty;
var gt = (n, t, e) => t in n ? ft(n, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : n[t] = e;
var _ = (n, t, e) => (gt(n, typeof t != "symbol" ? t + "" : t, e), e);
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const T = globalThis, V = T.ShadowRoot && (T.ShadyCSS === void 0 || T.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, rt = Symbol(), K = /* @__PURE__ */ new WeakMap();
let mt = class {
  constructor(t, e, s) {
    if (this._$cssResult$ = !0, s !== rt)
      throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = e;
  }
  get styleSheet() {
    let t = this.o;
    const e = this.t;
    if (V && t === void 0) {
      const s = e !== void 0 && e.length === 1;
      s && (t = K.get(e)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), s && K.set(e, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
};
const yt = (n) => new mt(typeof n == "string" ? n : n + "", void 0, rt), ot = (n, t) => {
  if (V)
    n.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
  else
    for (const e of t) {
      const s = document.createElement("style"), i = T.litNonce;
      i !== void 0 && s.setAttribute("nonce", i), s.textContent = e.cssText, n.appendChild(s);
    }
}, Z = V ? (n) => n : (n) => n instanceof CSSStyleSheet ? ((t) => {
  let e = "";
  for (const s of t.cssRules)
    e += s.cssText;
  return yt(e);
})(n) : n;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: At, defineProperty: vt, getOwnPropertyDescriptor: Et, getOwnPropertyNames: St, getOwnPropertySymbols: bt, getPrototypeOf: wt } = Object, g = globalThis, F = g.trustedTypes, Ct = F ? F.emptyScript : "", D = g.reactiveElementPolyfillSupport, P = (n, t) => n, k = { toAttribute(n, t) {
  switch (t) {
    case Boolean:
      n = n ? Ct : null;
      break;
    case Object:
    case Array:
      n = n == null ? n : JSON.stringify(n);
  }
  return n;
}, fromAttribute(n, t) {
  let e = n;
  switch (t) {
    case Boolean:
      e = n !== null;
      break;
    case Number:
      e = n === null ? null : Number(n);
      break;
    case Object:
    case Array:
      try {
        e = JSON.parse(n);
      } catch {
        e = null;
      }
  }
  return e;
} }, q = (n, t) => !At(n, t), G = { attribute: !0, type: String, converter: k, reflect: !1, hasChanged: q };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), g.litPropertyMetadata ?? (g.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
class E extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, e = G) {
    if (e.state && (e.attribute = !1), this._$Ei(), this.elementProperties.set(t, e), !e.noAccessor) {
      const s = Symbol(), i = this.getPropertyDescriptor(t, s, e);
      i !== void 0 && vt(this.prototype, t, i);
    }
  }
  static getPropertyDescriptor(t, e, s) {
    const { get: i, set: r } = Et(this.prototype, t) ?? { get() {
      return this[e];
    }, set(o) {
      this[e] = o;
    } };
    return { get() {
      return i == null ? void 0 : i.call(this);
    }, set(o) {
      const a = i == null ? void 0 : i.call(this);
      r.call(this, o), this.requestUpdate(t, a, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? G;
  }
  static _$Ei() {
    if (this.hasOwnProperty(P("elementProperties")))
      return;
    const t = wt(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(P("finalized")))
      return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(P("properties"))) {
      const e = this.properties, s = [...St(e), ...bt(e)];
      for (const i of s)
        this.createProperty(i, e[i]);
    }
    const t = this[Symbol.metadata];
    if (t !== null) {
      const e = litPropertyMetadata.get(t);
      if (e !== void 0)
        for (const [s, i] of e)
          this.elementProperties.set(s, i);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [e, s] of this.elementProperties) {
      const i = this._$Eu(e, s);
      i !== void 0 && this._$Eh.set(i, e);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t) {
    const e = [];
    if (Array.isArray(t)) {
      const s = new Set(t.flat(1 / 0).reverse());
      for (const i of s)
        e.unshift(Z(i));
    } else
      t !== void 0 && e.push(Z(t));
    return e;
  }
  static _$Eu(t, e) {
    const s = e.attribute;
    return s === !1 ? void 0 : typeof s == "string" ? s : typeof t == "string" ? t.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    var t;
    this._$Eg = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$ES(), this.requestUpdate(), (t = this.constructor.l) == null || t.forEach((e) => e(this));
  }
  addController(t) {
    var e;
    (this._$E_ ?? (this._$E_ = /* @__PURE__ */ new Set())).add(t), this.renderRoot !== void 0 && this.isConnected && ((e = t.hostConnected) == null || e.call(t));
  }
  removeController(t) {
    var e;
    (e = this._$E_) == null || e.delete(t);
  }
  _$ES() {
    const t = /* @__PURE__ */ new Map(), e = this.constructor.elementProperties;
    for (const s of e.keys())
      this.hasOwnProperty(s) && (t.set(s, this[s]), delete this[s]);
    t.size > 0 && (this._$Ep = t);
  }
  createRenderRoot() {
    const t = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return ot(t, this.constructor.elementStyles), t;
  }
  connectedCallback() {
    var t;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(!0), (t = this._$E_) == null || t.forEach((e) => {
      var s;
      return (s = e.hostConnected) == null ? void 0 : s.call(e);
    });
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    var t;
    (t = this._$E_) == null || t.forEach((e) => {
      var s;
      return (s = e.hostDisconnected) == null ? void 0 : s.call(e);
    });
  }
  attributeChangedCallback(t, e, s) {
    this._$AK(t, s);
  }
  _$EO(t, e) {
    var r;
    const s = this.constructor.elementProperties.get(t), i = this.constructor._$Eu(t, s);
    if (i !== void 0 && s.reflect === !0) {
      const o = (((r = s.converter) == null ? void 0 : r.toAttribute) !== void 0 ? s.converter : k).toAttribute(e, s.type);
      this._$Em = t, o == null ? this.removeAttribute(i) : this.setAttribute(i, o), this._$Em = null;
    }
  }
  _$AK(t, e) {
    var r;
    const s = this.constructor, i = s._$Eh.get(t);
    if (i !== void 0 && this._$Em !== i) {
      const o = s.getPropertyOptions(i), a = typeof o.converter == "function" ? { fromAttribute: o.converter } : ((r = o.converter) == null ? void 0 : r.fromAttribute) !== void 0 ? o.converter : k;
      this._$Em = i, this[i] = a.fromAttribute(e, o.type), this._$Em = null;
    }
  }
  requestUpdate(t, e, s) {
    if (t !== void 0) {
      if (s ?? (s = this.constructor.getPropertyOptions(t)), !(s.hasChanged ?? q)(this[t], e))
        return;
      this.C(t, e, s);
    }
    this.isUpdatePending === !1 && (this._$Eg = this._$EP());
  }
  C(t, e, s) {
    this._$AL.has(t) || this._$AL.set(t, e), s.reflect === !0 && this._$Em !== t && (this._$ET ?? (this._$ET = /* @__PURE__ */ new Set())).add(t);
  }
  async _$EP() {
    this.isUpdatePending = !0;
    try {
      await this._$Eg;
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
    var s;
    if (!this.isUpdatePending)
      return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [r, o] of this._$Ep)
          this[r] = o;
        this._$Ep = void 0;
      }
      const i = this.constructor.elementProperties;
      if (i.size > 0)
        for (const [r, o] of i)
          o.wrapped !== !0 || this._$AL.has(r) || this[r] === void 0 || this.C(r, this[r], o);
    }
    let t = !1;
    const e = this._$AL;
    try {
      t = this.shouldUpdate(e), t ? (this.willUpdate(e), (s = this._$E_) == null || s.forEach((i) => {
        var r;
        return (r = i.hostUpdate) == null ? void 0 : r.call(i);
      }), this.update(e)) : this._$Ej();
    } catch (i) {
      throw t = !1, this._$Ej(), i;
    }
    t && this._$AE(e);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    var e;
    (e = this._$E_) == null || e.forEach((s) => {
      var i;
      return (i = s.hostUpdated) == null ? void 0 : i.call(s);
    }), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
  }
  _$Ej() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$Eg;
  }
  shouldUpdate(t) {
    return !0;
  }
  update(t) {
    this._$ET && (this._$ET = this._$ET.forEach((e) => this._$EO(e, this[e]))), this._$Ej();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
}
E.elementStyles = [], E.shadowRootOptions = { mode: "open" }, E[P("elementProperties")] = /* @__PURE__ */ new Map(), E[P("finalized")] = /* @__PURE__ */ new Map(), D == null || D({ ReactiveElement: E }), (g.reactiveElementVersions ?? (g.reactiveElementVersions = [])).push("2.0.3");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const x = globalThis, L = x.trustedTypes, Q = L ? L.createPolicy("lit-html", { createHTML: (n) => n }) : void 0, ht = "$lit$", f = `lit$${(Math.random() + "").slice(9)}$`, at = "?" + f, Pt = `<${at}>`, v = document, U = () => v.createComment(""), M = (n) => n === null || typeof n != "object" && typeof n != "function", ct = Array.isArray, xt = (n) => ct(n) || typeof (n == null ? void 0 : n[Symbol.iterator]) == "function", I = `[ 	
\f\r]`, C = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, X = /-->/g, Y = />/g, m = RegExp(`>|${I}(?:([^\\s"'>=/]+)(${I}*=${I}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), tt = /'/g, et = /"/g, lt = /^(?:script|style|textarea|title)$/i, b = Symbol.for("lit-noChange"), d = Symbol.for("lit-nothing"), st = /* @__PURE__ */ new WeakMap(), y = v.createTreeWalker(v, 129);
function dt(n, t) {
  if (!Array.isArray(n) || !n.hasOwnProperty("raw"))
    throw Error("invalid template strings array");
  return Q !== void 0 ? Q.createHTML(t) : t;
}
const Ot = (n, t) => {
  const e = n.length - 1, s = [];
  let i, r = t === 2 ? "<svg>" : "", o = C;
  for (let a = 0; a < e; a++) {
    const h = n[a];
    let l, p, c = -1, u = 0;
    for (; u < h.length && (o.lastIndex = u, p = o.exec(h), p !== null); )
      u = o.lastIndex, o === C ? p[1] === "!--" ? o = X : p[1] !== void 0 ? o = Y : p[2] !== void 0 ? (lt.test(p[2]) && (i = RegExp("</" + p[2], "g")), o = m) : p[3] !== void 0 && (o = m) : o === m ? p[0] === ">" ? (o = i ?? C, c = -1) : p[1] === void 0 ? c = -2 : (c = o.lastIndex - p[2].length, l = p[1], o = p[3] === void 0 ? m : p[3] === '"' ? et : tt) : o === et || o === tt ? o = m : o === X || o === Y ? o = C : (o = m, i = void 0);
    const $ = o === m && n[a + 1].startsWith("/>") ? " " : "";
    r += o === C ? h + Pt : c >= 0 ? (s.push(l), h.slice(0, c) + ht + h.slice(c) + f + $) : h + f + (c === -2 ? a : $);
  }
  return [dt(n, r + (n[e] || "<?>") + (t === 2 ? "</svg>" : "")), s];
};
class H {
  constructor({ strings: t, _$litType$: e }, s) {
    let i;
    this.parts = [];
    let r = 0, o = 0;
    const a = t.length - 1, h = this.parts, [l, p] = Ot(t, e);
    if (this.el = H.createElement(l, s), y.currentNode = this.el.content, e === 2) {
      const c = this.el.content.firstChild;
      c.replaceWith(...c.childNodes);
    }
    for (; (i = y.nextNode()) !== null && h.length < a; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes())
          for (const c of i.getAttributeNames())
            if (c.endsWith(ht)) {
              const u = p[o++], $ = i.getAttribute(c).split(f), R = /([.?@])?(.*)/.exec(u);
              h.push({ type: 1, index: r, name: R[2], strings: $, ctor: R[1] === "." ? Mt : R[1] === "?" ? Ht : R[1] === "@" ? Nt : j }), i.removeAttribute(c);
            } else
              c.startsWith(f) && (h.push({ type: 6, index: r }), i.removeAttribute(c));
        if (lt.test(i.tagName)) {
          const c = i.textContent.split(f), u = c.length - 1;
          if (u > 0) {
            i.textContent = L ? L.emptyScript : "";
            for (let $ = 0; $ < u; $++)
              i.append(c[$], U()), y.nextNode(), h.push({ type: 2, index: ++r });
            i.append(c[u], U());
          }
        }
      } else if (i.nodeType === 8)
        if (i.data === at)
          h.push({ type: 2, index: r });
        else {
          let c = -1;
          for (; (c = i.data.indexOf(f, c + 1)) !== -1; )
            h.push({ type: 7, index: r }), c += f.length - 1;
        }
      r++;
    }
  }
  static createElement(t, e) {
    const s = v.createElement("template");
    return s.innerHTML = t, s;
  }
}
function w(n, t, e = n, s) {
  var o, a;
  if (t === b)
    return t;
  let i = s !== void 0 ? (o = e._$Co) == null ? void 0 : o[s] : e._$Cl;
  const r = M(t) ? void 0 : t._$litDirective$;
  return (i == null ? void 0 : i.constructor) !== r && ((a = i == null ? void 0 : i._$AO) == null || a.call(i, !1), r === void 0 ? i = void 0 : (i = new r(n), i._$AT(n, e, s)), s !== void 0 ? (e._$Co ?? (e._$Co = []))[s] = i : e._$Cl = i), i !== void 0 && (t = w(n, i._$AS(n, t.values), i, s)), t;
}
class Ut {
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
    const { el: { content: e }, parts: s } = this._$AD, i = ((t == null ? void 0 : t.creationScope) ?? v).importNode(e, !0);
    y.currentNode = i;
    let r = y.nextNode(), o = 0, a = 0, h = s[0];
    for (; h !== void 0; ) {
      if (o === h.index) {
        let l;
        h.type === 2 ? l = new N(r, r.nextSibling, this, t) : h.type === 1 ? l = new h.ctor(r, h.name, h.strings, this, t) : h.type === 6 && (l = new Rt(r, this, t)), this._$AV.push(l), h = s[++a];
      }
      o !== (h == null ? void 0 : h.index) && (r = y.nextNode(), o++);
    }
    return y.currentNode = v, i;
  }
  p(t) {
    let e = 0;
    for (const s of this._$AV)
      s !== void 0 && (s.strings !== void 0 ? (s._$AI(t, s, e), e += s.strings.length - 2) : s._$AI(t[e])), e++;
  }
}
class N {
  get _$AU() {
    var t;
    return ((t = this._$AM) == null ? void 0 : t._$AU) ?? this._$Cv;
  }
  constructor(t, e, s, i) {
    this.type = 2, this._$AH = d, this._$AN = void 0, this._$AA = t, this._$AB = e, this._$AM = s, this.options = i, this._$Cv = (i == null ? void 0 : i.isConnected) ?? !0;
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
    t = w(this, t, e), M(t) ? t === d || t == null || t === "" ? (this._$AH !== d && this._$AR(), this._$AH = d) : t !== this._$AH && t !== b && this._(t) : t._$litType$ !== void 0 ? this.g(t) : t.nodeType !== void 0 ? this.$(t) : xt(t) ? this.T(t) : this._(t);
  }
  k(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  $(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.k(t));
  }
  _(t) {
    this._$AH !== d && M(this._$AH) ? this._$AA.nextSibling.data = t : this.$(v.createTextNode(t)), this._$AH = t;
  }
  g(t) {
    var r;
    const { values: e, _$litType$: s } = t, i = typeof s == "number" ? this._$AC(t) : (s.el === void 0 && (s.el = H.createElement(dt(s.h, s.h[0]), this.options)), s);
    if (((r = this._$AH) == null ? void 0 : r._$AD) === i)
      this._$AH.p(e);
    else {
      const o = new Ut(i, this), a = o.u(this.options);
      o.p(e), this.$(a), this._$AH = o;
    }
  }
  _$AC(t) {
    let e = st.get(t.strings);
    return e === void 0 && st.set(t.strings, e = new H(t)), e;
  }
  T(t) {
    ct(this._$AH) || (this._$AH = [], this._$AR());
    const e = this._$AH;
    let s, i = 0;
    for (const r of t)
      i === e.length ? e.push(s = new N(this.k(U()), this.k(U()), this, this.options)) : s = e[i], s._$AI(r), i++;
    i < e.length && (this._$AR(s && s._$AB.nextSibling, i), e.length = i);
  }
  _$AR(t = this._$AA.nextSibling, e) {
    var s;
    for ((s = this._$AP) == null ? void 0 : s.call(this, !1, !0, e); t && t !== this._$AB; ) {
      const i = t.nextSibling;
      t.remove(), t = i;
    }
  }
  setConnected(t) {
    var e;
    this._$AM === void 0 && (this._$Cv = t, (e = this._$AP) == null || e.call(this, t));
  }
}
class j {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t, e, s, i, r) {
    this.type = 1, this._$AH = d, this._$AN = void 0, this.element = t, this.name = e, this._$AM = i, this.options = r, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = d;
  }
  _$AI(t, e = this, s, i) {
    const r = this.strings;
    let o = !1;
    if (r === void 0)
      t = w(this, t, e, 0), o = !M(t) || t !== this._$AH && t !== b, o && (this._$AH = t);
    else {
      const a = t;
      let h, l;
      for (t = r[0], h = 0; h < r.length - 1; h++)
        l = w(this, a[s + h], e, h), l === b && (l = this._$AH[h]), o || (o = !M(l) || l !== this._$AH[h]), l === d ? t = d : t !== d && (t += (l ?? "") + r[h + 1]), this._$AH[h] = l;
    }
    o && !i && this.O(t);
  }
  O(t) {
    t === d ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class Mt extends j {
  constructor() {
    super(...arguments), this.type = 3;
  }
  O(t) {
    this.element[this.name] = t === d ? void 0 : t;
  }
}
class Ht extends j {
  constructor() {
    super(...arguments), this.type = 4;
  }
  O(t) {
    this.element.toggleAttribute(this.name, !!t && t !== d);
  }
}
class Nt extends j {
  constructor(t, e, s, i, r) {
    super(t, e, s, i, r), this.type = 5;
  }
  _$AI(t, e = this) {
    if ((t = w(this, t, e, 0) ?? d) === b)
      return;
    const s = this._$AH, i = t === d && s !== d || t.capture !== s.capture || t.once !== s.once || t.passive !== s.passive, r = t !== d && (s === d || i);
    i && this.element.removeEventListener(this.name, this, s), r && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    var e;
    typeof this._$AH == "function" ? this._$AH.call(((e = this.options) == null ? void 0 : e.host) ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class Rt {
  constructor(t, e, s) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = e, this.options = s;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    w(this, t);
  }
}
const z = x.litHtmlPolyfillSupport;
z == null || z(H, N), (x.litHtmlVersions ?? (x.litHtmlVersions = [])).push("3.1.1");
const Tt = (n, t, e) => {
  const s = (e == null ? void 0 : e.renderBefore) ?? t;
  let i = s._$litPart$;
  if (i === void 0) {
    const r = (e == null ? void 0 : e.renderBefore) ?? null;
    s._$litPart$ = i = new N(t.insertBefore(U(), r), r, void 0, e ?? {});
  }
  return i._$AI(n), i;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
class O extends E {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var e;
    const t = super.createRenderRoot();
    return (e = this.renderOptions).renderBefore ?? (e.renderBefore = t.firstChild), t;
  }
  update(t) {
    const e = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t), this._$Do = Tt(e, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    var t;
    super.connectedCallback(), (t = this._$Do) == null || t.setConnected(!0);
  }
  disconnectedCallback() {
    var t;
    super.disconnectedCallback(), (t = this._$Do) == null || t.setConnected(!1);
  }
  render() {
    return b;
  }
}
var nt;
O._$litElement$ = !0, O.finalized = !0, (nt = globalThis.litElementHydrateSupport) == null || nt.call(globalThis, { LitElement: O });
const B = globalThis.litElementPolyfillSupport;
B == null || B({ LitElement: O });
(globalThis.litElementVersions ?? (globalThis.litElementVersions = [])).push("4.0.3");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const kt = { attribute: !0, type: String, converter: k, reflect: !1, hasChanged: q }, Lt = (n = kt, t, e) => {
  const { kind: s, metadata: i } = e;
  let r = globalThis.litPropertyMetadata.get(i);
  if (r === void 0 && globalThis.litPropertyMetadata.set(i, r = /* @__PURE__ */ new Map()), r.set(e.name, n), s === "accessor") {
    const { name: o } = e;
    return { set(a) {
      const h = t.get.call(this);
      t.set.call(this, a), this.requestUpdate(o, h, n);
    }, init(a) {
      return a !== void 0 && this.C(o, void 0, n), a;
    } };
  }
  if (s === "setter") {
    const { name: o } = e;
    return function(a) {
      const h = this[o];
      t.call(this, a), this.requestUpdate(o, h, n);
    };
  }
  throw Error("Unsupported decorator location: " + s);
};
function pt(n) {
  return (t, e) => typeof e == "object" ? Lt(n, t, e) : ((s, i, r) => {
    const o = i.hasOwnProperty(r);
    return i.constructor.createProperty(r, o ? { ...s, wrapped: !0 } : s), o ? Object.getOwnPropertyDescriptor(i, r) : void 0;
  })(n, t, e);
}
const ut = /* @__PURE__ */ new WeakMap();
function jt(n, t) {
  let e = t;
  for (; e; ) {
    if (ut.get(e) === n)
      return !0;
    e = Object.getPrototypeOf(e);
  }
  return !1;
}
function $t(n) {
  return (t) => {
    if (jt(n, t))
      return t;
    const e = n(t);
    return ut.set(e, n), e;
  };
}
const W = "3.0.0", it = window.scopedElementsVersions || (window.scopedElementsVersions = []);
it.includes(W) || it.push(W);
const Dt = (n) => {
  var t;
  return (
    /** @type {ScopedElementsHost} */
    t = class extends n {
      static get scopedElementsVersion() {
        return W;
      }
      /**
       * Obtains the CustomElementRegistry associated to the ShadowRoot.
       *
       * @returns {CustomElementRegistry=}
       */
      get registry() {
        return (
          /** @type {typeof ScopedElementsHost} */
          this.constructor.__registry
        );
      }
      /**
       * Set the CustomElementRegistry associated to the ShadowRoot
       *
       * @param {CustomElementRegistry} registry
       */
      set registry(s) {
        this.constructor.__registry = s;
      }
      /**
       * @param {ShadowRootInit} options
       * @returns {ShadowRoot}
       */
      attachShadow(s) {
        const { scopedElements: i } = (
          /** @type {typeof ScopedElementsHost} */
          this.constructor
        );
        if (!this.registry) {
          this.registry = new CustomElementRegistry();
          for (const [r, o] of Object.entries(i ?? {}))
            this.registry.define(r, o);
        }
        return super.attachShadow({
          ...s,
          // The polyfill currently expects the registry to be passed as `customElements`
          customElements: this.registry,
          // But the proposal has moved forward, and renamed it to `registry`
          // For backwards compatibility, we pass it as both
          registry: this.registry
        });
      }
    }, /**
     * Obtains the scoped elements definitions map if specified.
     *
     * @type {ScopedElementsMap=}
     */
    _(t, "scopedElements"), /** @type {CustomElementRegistry=} */
    _(t, "__registry"), t
  );
}, It = $t(Dt), zt = (n) => (
  /** @type {ScopedElementsHost} */
  class extends It(n) {
    createRenderRoot() {
      var r;
      const { shadowRootOptions: e, elementStyles: s } = (
        /** @type {TypeofLitElement} */
        this.constructor
      ), i = this.attachShadow(e);
      return this.renderOptions.creationScope = i, ot(i, s), (r = this.renderOptions).renderBefore ?? (r.renderBefore = i.firstChild), i;
    }
  }
), Bt = $t(zt);
var Wt = Object.defineProperty, Vt = Object.getOwnPropertyDescriptor, _t = (n, t, e, s) => {
  for (var i = s > 1 ? void 0 : s ? Vt(t, e) : t, r = n.length - 1, o; r >= 0; r--)
    (o = n[r]) && (i = (s ? o(t, e, i) : o(i)) || i);
  return s && i && Wt(t, e, i), i;
};
function Gt(n = { type: "string" }) {
  return (t, e) => {
    t.constructor[S] = { ...t[S], [e]: n };
  };
}
const S = Symbol("options");
var A, qt;
const J = (A = class extends Bt(O) {
  constructor() {
    super(...arguments);
    /** Declare attributes as options. Used by WebWriter to auto-generate input fields to modify these attributes. As the name suggests, this is mostly suited to simple attributes (boolean, string, etc.). Use a getter here (`get options() {...}`) to dynamically change options depending on the state of the widget.*/
    _(this, "options");
    _(this, "contentEditable");
    _(this, "lang");
  }
  get [(qt = S, S)]() {
    return { ...A[S], ...this.options };
  }
  connectedCallback() {
    super.connectedCallback(), this.getAttributeNames().forEach((e) => this.setAttribute(e, this.getAttribute(e)));
  }
}, _(A, "OptionsSymbol", S), _(A, qt, {}), A);
_t([
  pt({ type: String, attribute: !0, reflect: !0 })
], J.prototype, "contentEditable", 2);
_t([
  pt({ type: String, attribute: !0, reflect: !0 })
], J.prototype, "lang", 2);
let Qt = J;
export {
  Qt as LitElementWw,
  Gt as option
};
