// Маленький поддельный DOM для тестов снимка пилюли стенда, пузырей и копии маски (pillStandSnap.test.js, wordLaneBubbles.test.js, racePhraseMask.test.js; jsdom в проекте нет): элементы с атрибутами, style (свойства, setProperty / getPropertyValue / cssText),
// classList, детьми и текстом, cloneNode, querySelector(All) по простым селекторам из классов и тегов через пробел (".wlPillSparks i", ".racePhraseMask b"). Только для тестов.
const styleOf = () => {
  const props = new Map()
  const st = { setProperty: (k, v) => props.set(k, String(v)), getPropertyValue: k => props.get(k) ?? '', removeProperty: k => props.delete(k) }
  Object.defineProperty(st, 'cssText', { get: () => [...props].map(([k, v]) => `${k}:${v}`).join(';'), set: v => { props.clear(); String(v).split(';').filter(Boolean).forEach(x => { const i = x.indexOf(':'); props.set(x.slice(0, i).trim(), x.slice(i + 1).trim()) }) } })
  return new Proxy(st, { get: (o, k) => (k in o ? o[k] : props.get(k) ?? ''), set: (o, k, v) => { if (k === 'cssText') o.cssText = v; else props.set(k, String(v)); return true } })
}
const match = (el, part) => (part.startsWith('.') ? el.classList.contains(part.slice(1)) : part.startsWith('[') ? el.hasAttribute(part.slice(1, -1)) : el.tag === part)

export function createDoc() {
  const doc = {
    createElement: tag => el(tag, doc),
    createTextNode: text => ({ text: true, textContent: text, parentNode: null, remove() { this.parentNode?.removeChild(this) } }),
  }
  return doc
}

function el(tag, doc) {
  const attrs = new Map()
  const node = {
    tag, ownerDocument: doc, nodes: [], parentNode: null, style: styleOf(), className: '',
    get children() { return this.nodes.filter(n => !n.text) },
    get attributes() { return [...attrs].map(([name, value]) => ({ name, value })) },
    get classList() { return { contains: c => node.className.split(/\s+/).includes(c) } },
    get textContent() { return this.nodes.map(n => n.textContent).join('') },
    set textContent(v) { this.nodes = [doc.createTextNode(String(v))] },
    setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: k => (attrs.has(k) ? attrs.get(k) : null), hasAttribute: k => attrs.has(k), removeAttribute: k => attrs.delete(k),
    appendChild(c) { c.parentNode = this; this.nodes.push(c); return c },
    removeChild(c) { this.nodes = this.nodes.filter(n => n !== c); c.parentNode = null },
    remove() { this.parentNode?.removeChild(this) },
    cloneNode(deep) { const c = el(tag, doc); c.className = node.className; for (const [k, v] of attrs) c.setAttribute(k, v); c.style.cssText = node.style.cssText; if (deep) for (const n of node.nodes) c.appendChild(n.text ? doc.createTextNode(n.textContent) : n.cloneNode(true)); return c },
    all() { return this.children.flatMap(c => [c, ...c.all()]) },
    querySelectorAll(sel) {
      const parts = sel.trim().split(/\s+/)
      let set = [this]
      for (const p of parts) set = [...new Set(set.flatMap(s => s.all().filter(e => match(e, p))))]
      return set
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null },
  }
  return node
}

/** Пилюля пула как в WordLanePillEls.jsx */
export function fakePill(doc = createDoc()) {
  const mk = (tag, cls, parent) => { const e = doc.createElement(tag); e.className = cls; parent?.appendChild(e); return e }
  const p = mk('div', 'wlPill'); p.setAttribute('data-pill', ''); p.setAttribute('data-lane', '1'); p.setAttribute('data-testid', 'x')
  const clip = mk('span', 'wlPillClip', p); mk('span', 'wlGhost', clip); const fill = mk('span', 'wlPillFill', clip); mk('span', 'wlPillInkIn', mk('span', 'wlPillInk', fill)); mk('span', 'wlPace', clip)
  const sp = mk('span', 'wlPillSparks', p); const i = mk('i', '', sp); mk('b', '', i)
  return p
}
