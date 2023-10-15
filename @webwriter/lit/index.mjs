/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const M = globalThis, I = M.ShadowRoot && (M.ShadyCSS === void 0 || M.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, ot = Symbol(), J = /* @__PURE__ */ new WeakMap();
let pt = class {
  constructor(t, e, s) {
    if (this._$cssResult$ = !0, s !== ot)
      throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t, this.t = e;
  }
  get styleSheet() {
    let t = this.o;
    const e = this.t;
    if (I && t === void 0) {
      const s = e !== void 0 && e.length === 1;
      s && (t = J.get(e)), t === void 0 && ((this.o = t = new CSSStyleSheet()).replaceSync(this.cssText), s && J.set(e, t));
    }
    return t;
  }
  toString() {
    return this.cssText;
  }
};
const ut = (o) => new pt(typeof o == "string" ? o : o + "", void 0, ot), rt = (o, t) => {
  if (I)
    o.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
  else
    for (const e of t) {
      const s = document.createElement("style"), i = M.litNonce;
      i !== void 0 && s.setAttribute("nonce", i), s.textContent = e.cssText, o.appendChild(s);
    }
}, K = I ? (o) => o : (o) => o instanceof CSSStyleSheet ? ((t) => {
  let e = "";
  for (const s of t.cssRules)
    e += s.cssText;
  return ut(e);
})(o) : o;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const { is: $t, defineProperty: _t, getOwnPropertyDescriptor: ft, getOwnPropertyNames: yt, getOwnPropertySymbols: gt, getPrototypeOf: mt } = Object, f = globalThis, F = f.trustedTypes, At = F ? F.emptyScript : "", L = f.reactiveElementPolyfillSupport, b = (o, t) => o, N = { toAttribute(o, t) {
  switch (t) {
    case Boolean:
      o = o ? At : null;
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
} }, W = (o, t) => !$t(o, t), Z = { attribute: !0, type: String, converter: N, reflect: !1, hasChanged: W };
Symbol.metadata ?? (Symbol.metadata = Symbol("metadata")), f.litPropertyMetadata ?? (f.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
class A extends HTMLElement {
  static addInitializer(t) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t, e = Z) {
    if (e.state && (e.attribute = !1), this._$Ei(), this.elementProperties.set(t, e), !e.noAccessor) {
      const s = Symbol(), i = this.getPropertyDescriptor(t, s, e);
      i !== void 0 && _t(this.prototype, t, i);
    }
  }
  static getPropertyDescriptor(t, e, s) {
    const { get: i, set: n } = ft(this.prototype, t) ?? { get() {
      return this[e];
    }, set(r) {
      this[e] = r;
    } };
    return { get() {
      return i == null ? void 0 : i.call(this);
    }, set(r) {
      const a = i == null ? void 0 : i.call(this);
      n.call(this, r), this.requestUpdate(t, a, s);
    }, configurable: !0, enumerable: !0 };
  }
  static getPropertyOptions(t) {
    return this.elementProperties.get(t) ?? Z;
  }
  static _$Ei() {
    if (this.hasOwnProperty(b("elementProperties")))
      return;
    const t = mt(this);
    t.finalize(), t.l !== void 0 && (this.l = [...t.l]), this.elementProperties = new Map(t.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(b("finalized")))
      return;
    if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(b("properties"))) {
      const e = this.properties, s = [...yt(e), ...gt(e)];
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
        e.unshift(K(i));
    } else
      t !== void 0 && e.push(K(t));
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
    this._$Eg = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), (t = this.constructor.l) == null || t.forEach((e) => e(this));
  }
  addController(t) {
    var e;
    (this._$ES ?? (this._$ES = [])).push(t), this.renderRoot !== void 0 && this.isConnected && ((e = t.hostConnected) == null || e.call(t));
  }
  removeController(t) {
    var e;
    (e = this._$ES) == null || e.splice(this._$ES.indexOf(t) >>> 0, 1);
  }
  _$E_() {
    const t = /* @__PURE__ */ new Map(), e = this.constructor.elementProperties;
    for (const s of e.keys())
      this.hasOwnProperty(s) && (t.set(s, this[s]), delete this[s]);
    t.size > 0 && (this._$Ep = t);
  }
  createRenderRoot() {
    const t = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return rt(t, this.constructor.elementStyles), t;
  }
  connectedCallback() {
    var t;
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(!0), (t = this._$ES) == null || t.forEach((e) => {
      var s;
      return (s = e.hostConnected) == null ? void 0 : s.call(e);
    });
  }
  enableUpdating(t) {
  }
  disconnectedCallback() {
    var t;
    (t = this._$ES) == null || t.forEach((e) => {
      var s;
      return (s = e.hostDisconnected) == null ? void 0 : s.call(e);
    });
  }
  attributeChangedCallback(t, e, s) {
    this._$AK(t, s);
  }
  _$EO(t, e) {
    var n;
    const s = this.constructor.elementProperties.get(t), i = this.constructor._$Eu(t, s);
    if (i !== void 0 && s.reflect === !0) {
      const r = (((n = s.converter) == null ? void 0 : n.toAttribute) !== void 0 ? s.converter : N).toAttribute(e, s.type);
      this._$Em = t, r == null ? this.removeAttribute(i) : this.setAttribute(i, r), this._$Em = null;
    }
  }
  _$AK(t, e) {
    var n;
    const s = this.constructor, i = s._$Eh.get(t);
    if (i !== void 0 && this._$Em !== i) {
      const r = s.getPropertyOptions(i), a = typeof r.converter == "function" ? { fromAttribute: r.converter } : ((n = r.converter) == null ? void 0 : n.fromAttribute) !== void 0 ? r.converter : N;
      this._$Em = i, this[i] = a.fromAttribute(e, r.type), this._$Em = null;
    }
  }
  requestUpdate(t, e, s, i = !1, n) {
    if (t !== void 0) {
      if (s ?? (s = this.constructor.getPropertyOptions(t)), !(s.hasChanged ?? W)(i ? n : this[t], e))
        return;
      this.C(t, e, s);
    }
    this.isUpdatePending === !1 && (this._$Eg = this._$EP());
  }
  C(t, e, s) {
    this._$AL.has(t) || this._$AL.set(t, e), s.reflect === !0 && this._$Em !== t && (this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Set())).add(t);
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
      if (this._$Ep) {
        for (const [n, r] of this._$Ep)
          this[n] = r;
        this._$Ep = void 0;
      }
      const i = this.constructor.elementProperties;
      if (i.size > 0)
        for (const [n, r] of i)
          r.wrapped !== !0 || this._$AL.has(n) || this[n] === void 0 || this.C(n, this[n], r);
    }
    let t = !1;
    const e = this._$AL;
    try {
      t = this.shouldUpdate(e), t ? (this.willUpdate(e), (s = this._$ES) == null || s.forEach((i) => {
        var n;
        return (n = i.hostUpdate) == null ? void 0 : n.call(i);
      }), this.update(e)) : this._$ET();
    } catch (i) {
      throw t = !1, this._$ET(), i;
    }
    t && this._$AE(e);
  }
  willUpdate(t) {
  }
  _$AE(t) {
    var e;
    (e = this._$ES) == null || e.forEach((s) => {
      var i;
      return (i = s.hostUpdated) == null ? void 0 : i.call(s);
    }), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(t)), this.updated(t);
  }
  _$ET() {
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
    this._$Ej && (this._$Ej = this._$Ej.forEach((e) => this._$EO(e, this[e]))), this._$ET();
  }
  updated(t) {
  }
  firstUpdated(t) {
  }
}
A.elementStyles = [], A.shadowRootOptions = { mode: "open" }, A[b("elementProperties")] = /* @__PURE__ */ new Map(), A[b("finalized")] = /* @__PURE__ */ new Map(), L == null || L({ ReactiveElement: A }), (f.reactiveElementVersions ?? (f.reactiveElementVersions = [])).push("2.0.0");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const w = globalThis, j = w.trustedTypes, G = j ? j.createPolicy("lit-html", { createHTML: (o) => o }) : void 0, nt = "$lit$", _ = `lit$${(Math.random() + "").slice(9)}$`, ht = "?" + _, St = `<${ht}>`, m = document, P = () => m.createComment(""), x = (o) => o === null || typeof o != "object" && typeof o != "function", at = Array.isArray, vt = (o) => at(o) || typeof (o == null ? void 0 : o[Symbol.iterator]) == "function", B = `[ 	
\f\r]`, E = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Q = /-->/g, X = />/g, y = RegExp(`>|${B}(?:([^\\s"'>=/]+)(${B}*=${B}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g"), tt = /'/g, et = /"/g, ct = /^(?:script|style|textarea|title)$/i, S = Symbol.for("lit-noChange"), d = Symbol.for("lit-nothing"), st = /* @__PURE__ */ new WeakMap(), g = m.createTreeWalker(m, 129);
function lt(o, t) {
  if (!Array.isArray(o) || !o.hasOwnProperty("raw"))
    throw Error("invalid template strings array");
  return G !== void 0 ? G.createHTML(t) : t;
}
const Et = (o, t) => {
  const e = o.length - 1, s = [];
  let i, n = t === 2 ? "<svg>" : "", r = E;
  for (let a = 0; a < e; a++) {
    const h = o[a];
    let l, p, c = -1, u = 0;
    for (; u < h.length && (r.lastIndex = u, p = r.exec(h), p !== null); )
      u = r.lastIndex, r === E ? p[1] === "!--" ? r = Q : p[1] !== void 0 ? r = X : p[2] !== void 0 ? (ct.test(p[2]) && (i = RegExp("</" + p[2], "g")), r = y) : p[3] !== void 0 && (r = y) : r === y ? p[0] === ">" ? (r = i ?? E, c = -1) : p[1] === void 0 ? c = -2 : (c = r.lastIndex - p[2].length, l = p[1], r = p[3] === void 0 ? y : p[3] === '"' ? et : tt) : r === et || r === tt ? r = y : r === Q || r === X ? r = E : (r = y, i = void 0);
    const $ = r === y && o[a + 1].startsWith("/>") ? " " : "";
    n += r === E ? h + St : c >= 0 ? (s.push(l), h.slice(0, c) + nt + h.slice(c) + _ + $) : h + _ + (c === -2 ? a : $);
  }
  return [lt(o, n + (o[e] || "<?>") + (t === 2 ? "</svg>" : "")), s];
};
class O {
  constructor({ strings: t, _$litType$: e }, s) {
    let i;
    this.parts = [];
    let n = 0, r = 0;
    const a = t.length - 1, h = this.parts, [l, p] = Et(t, e);
    if (this.el = O.createElement(l, s), g.currentNode = this.el.content, e === 2) {
      const c = this.el.content.firstChild;
      c.replaceWith(...c.childNodes);
    }
    for (; (i = g.nextNode()) !== null && h.length < a; ) {
      if (i.nodeType === 1) {
        if (i.hasAttributes())
          for (const c of i.getAttributeNames())
            if (c.endsWith(nt)) {
              const u = p[r++], $ = i.getAttribute(c).split(_), U = /([.?@])?(.*)/.exec(u);
              h.push({ type: 1, index: n, name: U[2], strings: $, ctor: U[1] === "." ? wt : U[1] === "?" ? Ct : U[1] === "@" ? Pt : k }), i.removeAttribute(c);
            } else
              c.startsWith(_) && (h.push({ type: 6, index: n }), i.removeAttribute(c));
        if (ct.test(i.tagName)) {
          const c = i.textContent.split(_), u = c.length - 1;
          if (u > 0) {
            i.textContent = j ? j.emptyScript : "";
            for (let $ = 0; $ < u; $++)
              i.append(c[$], P()), g.nextNode(), h.push({ type: 2, index: ++n });
            i.append(c[u], P());
          }
        }
      } else if (i.nodeType === 8)
        if (i.data === ht)
          h.push({ type: 2, index: n });
        else {
          let c = -1;
          for (; (c = i.data.indexOf(_, c + 1)) !== -1; )
            h.push({ type: 7, index: n }), c += _.length - 1;
        }
      n++;
    }
  }
  static createElement(t, e) {
    const s = m.createElement("template");
    return s.innerHTML = t, s;
  }
}
function v(o, t, e = o, s) {
  var r, a;
  if (t === S)
    return t;
  let i = s !== void 0 ? (r = e._$Co) == null ? void 0 : r[s] : e._$Cl;
  const n = x(t) ? void 0 : t._$litDirective$;
  return (i == null ? void 0 : i.constructor) !== n && ((a = i == null ? void 0 : i._$AO) == null || a.call(i, !1), n === void 0 ? i = void 0 : (i = new n(o), i._$AT(o, e, s)), s !== void 0 ? (e._$Co ?? (e._$Co = []))[s] = i : e._$Cl = i), i !== void 0 && (t = v(o, i._$AS(o, t.values), i, s)), t;
}
let bt = class {
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
    const { el: { content: e }, parts: s } = this._$AD, i = ((t == null ? void 0 : t.creationScope) ?? m).importNode(e, !0);
    g.currentNode = i;
    let n = g.nextNode(), r = 0, a = 0, h = s[0];
    for (; h !== void 0; ) {
      if (r === h.index) {
        let l;
        h.type === 2 ? l = new R(n, n.nextSibling, this, t) : h.type === 1 ? l = new h.ctor(n, h.name, h.strings, this, t) : h.type === 6 && (l = new xt(n, this, t)), this._$AV.push(l), h = s[++a];
      }
      r !== (h == null ? void 0 : h.index) && (n = g.nextNode(), r++);
    }
    return g.currentNode = m, i;
  }
  p(t) {
    let e = 0;
    for (const s of this._$AV)
      s !== void 0 && (s.strings !== void 0 ? (s._$AI(t, s, e), e += s.strings.length - 2) : s._$AI(t[e])), e++;
  }
};
class R {
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
    t = v(this, t, e), x(t) ? t === d || t == null || t === "" ? (this._$AH !== d && this._$AR(), this._$AH = d) : t !== this._$AH && t !== S && this._(t) : t._$litType$ !== void 0 ? this.g(t) : t.nodeType !== void 0 ? this.$(t) : vt(t) ? this.T(t) : this._(t);
  }
  k(t) {
    return this._$AA.parentNode.insertBefore(t, this._$AB);
  }
  $(t) {
    this._$AH !== t && (this._$AR(), this._$AH = this.k(t));
  }
  _(t) {
    this._$AH !== d && x(this._$AH) ? this._$AA.nextSibling.data = t : this.$(m.createTextNode(t)), this._$AH = t;
  }
  g(t) {
    var n;
    const { values: e, _$litType$: s } = t, i = typeof s == "number" ? this._$AC(t) : (s.el === void 0 && (s.el = O.createElement(lt(s.h, s.h[0]), this.options)), s);
    if (((n = this._$AH) == null ? void 0 : n._$AD) === i)
      this._$AH.p(e);
    else {
      const r = new bt(i, this), a = r.u(this.options);
      r.p(e), this.$(a), this._$AH = r;
    }
  }
  _$AC(t) {
    let e = st.get(t.strings);
    return e === void 0 && st.set(t.strings, e = new O(t)), e;
  }
  T(t) {
    at(this._$AH) || (this._$AH = [], this._$AR());
    const e = this._$AH;
    let s, i = 0;
    for (const n of t)
      i === e.length ? e.push(s = new R(this.k(P()), this.k(P()), this, this.options)) : s = e[i], s._$AI(n), i++;
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
class k {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t, e, s, i, n) {
    this.type = 1, this._$AH = d, this._$AN = void 0, this.element = t, this.name = e, this._$AM = i, this.options = n, s.length > 2 || s[0] !== "" || s[1] !== "" ? (this._$AH = Array(s.length - 1).fill(new String()), this.strings = s) : this._$AH = d;
  }
  _$AI(t, e = this, s, i) {
    const n = this.strings;
    let r = !1;
    if (n === void 0)
      t = v(this, t, e, 0), r = !x(t) || t !== this._$AH && t !== S, r && (this._$AH = t);
    else {
      const a = t;
      let h, l;
      for (t = n[0], h = 0; h < n.length - 1; h++)
        l = v(this, a[s + h], e, h), l === S && (l = this._$AH[h]), r || (r = !x(l) || l !== this._$AH[h]), l === d ? t = d : t !== d && (t += (l ?? "") + n[h + 1]), this._$AH[h] = l;
    }
    r && !i && this.j(t);
  }
  j(t) {
    t === d ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t ?? "");
  }
}
class wt extends k {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t) {
    this.element[this.name] = t === d ? void 0 : t;
  }
}
class Ct extends k {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t) {
    this.element.toggleAttribute(this.name, !!t && t !== d);
  }
}
class Pt extends k {
  constructor(t, e, s, i, n) {
    super(t, e, s, i, n), this.type = 5;
  }
  _$AI(t, e = this) {
    if ((t = v(this, t, e, 0) ?? d) === S)
      return;
    const s = this._$AH, i = t === d && s !== d || t.capture !== s.capture || t.once !== s.once || t.passive !== s.passive, n = t !== d && (s === d || i);
    i && this.element.removeEventListener(this.name, this, s), n && this.element.addEventListener(this.name, this, t), this._$AH = t;
  }
  handleEvent(t) {
    var e;
    typeof this._$AH == "function" ? this._$AH.call(((e = this.options) == null ? void 0 : e.host) ?? this.element, t) : this._$AH.handleEvent(t);
  }
}
class xt {
  constructor(t, e, s) {
    this.element = t, this.type = 6, this._$AN = void 0, this._$AM = e, this.options = s;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t) {
    v(this, t);
  }
}
const D = w.litHtmlPolyfillSupport;
D == null || D(O, R), (w.litHtmlVersions ?? (w.litHtmlVersions = [])).push("3.0.0");
const Ot = (o, t, e) => {
  const s = (e == null ? void 0 : e.renderBefore) ?? t;
  let i = s._$litPart$;
  if (i === void 0) {
    const n = (e == null ? void 0 : e.renderBefore) ?? null;
    s._$litPart$ = i = new R(t.insertBefore(P(), n), n, void 0, e ?? {});
  }
  return i._$AI(o), i;
};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
class C extends A {
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
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t), this._$Do = Ot(e, this.renderRoot, this.renderOptions);
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
    return S;
  }
}
var it;
C._$litElement$ = !0, C.finalized = !0, (it = globalThis.litElementHydrateSupport) == null || it.call(globalThis, { LitElement: C });
const z = globalThis.litElementPolyfillSupport;
z == null || z({ LitElement: C });
(globalThis.litElementVersions ?? (globalThis.litElementVersions = [])).push("4.0.0");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const Rt = { attribute: !0, type: String, converter: N, reflect: !1, hasChanged: W }, Ut = (o = Rt, t, e) => {
  const { kind: s, metadata: i } = e;
  let n = globalThis.litPropertyMetadata.get(i);
  if (n === void 0 && globalThis.litPropertyMetadata.set(i, n = /* @__PURE__ */ new Map()), n.set(e.name, o), s === "accessor") {
    const { name: r } = e;
    return { set(a) {
      const h = t.get.call(this);
      t.set.call(this, a), this.requestUpdate(r, h, o);
    }, init(a) {
      return a !== void 0 && this.C(r, void 0, o), a;
    } };
  }
  if (s === "setter") {
    const { name: r } = e;
    return function(a) {
      const h = this[r];
      t.call(this, a), this.requestUpdate(r, h, o);
    };
  }
  throw Error("Unsupported decorator location: " + s);
};
function V(o) {
  return (t, e) => typeof e == "object" ? Ut(o, t, e) : ((s, i, n) => {
    const r = i.hasOwnProperty(n);
    return i.constructor.createProperty(n, r ? { ...s, wrapped: !0 } : s), r ? Object.getOwnPropertyDescriptor(i, n) : void 0;
  })(o, t, e);
}
const dt = /* @__PURE__ */ new WeakMap();
function Tt(o, t) {
  let e = t;
  for (; e; ) {
    if (dt.get(e) === o)
      return !0;
    e = Object.getPrototypeOf(e);
  }
  return !1;
}
function Mt(o) {
  return (t) => {
    if (Tt(o, t))
      return t;
    const e = o(t);
    return dt.set(e, o), e;
  };
}
/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const H = window, Ht = H.ShadowRoot && (H.ShadyCSS === void 0 || H.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, Nt = (o, t) => {
  Ht ? o.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet) : t.forEach((e) => {
    const s = document.createElement("style"), i = H.litNonce;
    i !== void 0 && s.setAttribute("nonce", i), s.textContent = e.cssText, o.appendChild(s);
  });
}, T = !!ShadowRoot.prototype.createElement, jt = (o) => (
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
        this.registry = T ? new CustomElementRegistry() : customElements;
        for (const [h, l] of Object.entries(e))
          this.defineScopedElement(h, l);
      }
      const r = {
        mode: "open",
        ...s,
        customElements: this.registry
      }, a = this.attachShadow(r);
      return T && (this.renderOptions.creationScope = a), a instanceof ShadowRoot && (Nt(a, i), this.renderOptions.renderBefore = this.renderOptions.renderBefore || a.firstChild), a;
    }
    createScopedElement(e) {
      return (T ? this.shadowRoot : document).createElement(e);
    }
    /**
     * Defines a scoped element.
     *
     * @param {string} tagName
     * @param {typeof HTMLElement} klass
     */
    defineScopedElement(e, s) {
      const i = this.registry.get(e);
      return i && T === !1 && i !== s && console.error(
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
), kt = Mt(jt);
var Lt = Object.defineProperty, Bt = Object.getOwnPropertyDescriptor, q = (o, t, e, s) => {
  for (var i = s > 1 ? void 0 : s ? Bt(t, e) : t, n = o.length - 1, r; n >= 0; n--)
    (r = o[n]) && (i = (s ? r(t, e, i) : r(i)) || i);
  return s && i && Lt(t, e, i), i;
};
class Y extends kt(C) {
  connectedCallback() {
    super.connectedCallback();
    let t = this.constructor.styles;
    t = Array.isArray(t) ? t : [t], this.shadowRoot && rt(this.shadowRoot, t), this.getAttributeNames().forEach((e) => this.setAttribute(e, this.getAttribute(e)));
  }
}
q([
  V({ type: Boolean, attribute: !0, reflect: !0 })
], Y.prototype, "printable", 2);
q([
  V({ type: Boolean, attribute: !0, reflect: !0 })
], Y.prototype, "editable", 2);
q([
  V({ type: Boolean, attribute: !0, reflect: !0 })
], Y.prototype, "analyzable", 2);
export {
  Y as LitElementWw
};
