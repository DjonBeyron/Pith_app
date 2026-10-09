// Тестовый стенд для inline-скрипта журнала старта (index.html, первый <script> в <head>): достаёт его текст и
// гоняет в vm-песочнице с поддельными window/document/performance и ручными часами. Нужен только тестам.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const INDEX = resolve(import.meta.dirname, '../../../../index.html')

// Текст index.html и позиция/текст первого <script> внутри <head>
export function readIndex() { return readFileSync(INDEX, 'utf8') }
export function firstHeadScript(html = readIndex()) {
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))
  const m = /<script([^>]*)>([\s\S]*?)<\/script>/.exec(head)
  return m ? { attrs: m[1], body: m[2], index: html.indexOf(m[0]) } : null
}

function makeTarget() {
  const map = {}
  return {
    map,
    addEventListener(name, fn) { (map[name] ||= []).push(fn) },
    fire(name, ev = {}) { for (const fn of map[name] || []) fn({ type: name, ...ev }) },
  }
}

// opts: storage (общее хранилище между «запусками»), session, startEpoch, ua, resources, navEntry, throwOnSet
export function makeEnv(opts = {}) {
  let clock = 0
  const timers = [], rafs = []
  const store = opts.storage || {}
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { if (opts.throwOnSet) throw new Error('quota'); store[k] = String(v) },
  }
  const sess = opts.session || {}
  const sessionStorage = { getItem: k => sess[k] ?? null, setItem: (k, v) => { sess[k] = String(v) } }
  const entries = { navigation: [opts.navEntry || { type: 'navigate', redirectCount: 0, transferSize: 1234, responseStart: 40 }], resource: opts.resources || [] }
  const observers = []
  class PerformanceObserver {
    constructor(cb) { this.cb = cb }
    observe({ type }) { this.type = type; observers.push(this) }
  }
  const win = makeTarget(), doc = makeTarget(), swTarget = makeTarget()
  // стили элементов меняет тест: el.st.opacity = '0.5'
  const el = (id, st = {}, kids = [], nodeName = 'DIV') => ({ id, nodeName, className: '', st: { opacity: '1', display: 'block', backgroundColor: 'rgb(0, 0, 0)', ...st }, firstElementChild: kids[0] || null, childElementCount: 0, rect: { x: 0, y: 0, width: 0, height: 0 }, querySelector() { return kids[1] || null }, getBoundingClientRect() { return this.rect }, contains(n) { return n === this || kids.includes(n) } })
  const logo = el('logo'); logo.rect = { x: 163, y: 376, width: 92, height: 92 }
  const fade = el('fade'), splash = el('splash', {}, [fade, logo]), root = el('root')
  const elements = { splash, root }
  // safe-area и «зонд» (высота fixed-области): env.pad.b = '0px' → потом '34px' имитирует позднее появление inset на iOS
  const pad = { t: '59px', r: '0px', b: '34px', l: '0px', fh: 814 }
  // элементы, которые находят querySelector (нижняя панель, лента...): env.q['nav.shellV2Nav'] = el(...)
  const q = {}
  const html = { nodeName: 'HTML', st: { backgroundColor: 'rgb(0, 0, 0)' }, clientHeight: 814, scrollTop: 0, style: { setProperty(k, v) { this[k] = v }, removeProperty(k) { delete this[k] } }, probes: 0, appendChild() { this.probes++ }, removeChild() { this.probes-- } }
  const body = { nodeName: 'BODY', st: { backgroundColor: 'rgb(0, 0, 0)' }, scrollTop: 0 }
  const baseEpoch = opts.startEpoch ?? Date.parse('2026-10-09T10:00:00.000Z')
  const RealDate = Date
  function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(baseEpoch + clock) }
  FakeDate.parse = RealDate.parse
  const calls = []
  function History() {}
  for (const m of ['pushState', 'replaceState', 'back', 'forward', 'go']) History.prototype[m] = function () { calls.push(m) }
  const history = new History()
  history.calls = calls
  const net = []
  const location = { pathname: '/', search: '' }
  // как в браузерах: location.reload — несбрасываемое (unforgeable) свойство экземпляра
  Object.defineProperty(location, 'reload', { value() {}, configurable: !!opts.reloadConfigurable, writable: false })
  const sandbox = Object.assign(win, {
    Date: FakeDate,
    PerformanceObserver, History,
    performance: { now: () => clock, timeOrigin: baseEpoch, getEntriesByType: t => entries[t] || [] },
    navigator: { standalone: opts.standalone ?? true, userAgent: opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', serviceWorker: opts.noSw ? undefined : Object.assign(swTarget, { controller: opts.controller === false ? null : { state: 'activated' }, getRegistration: () => Promise.resolve({ active: { state: 'activated' }, waiting: null, installing: null }) }) },
    screen: { width: 402, height: 874, orientation: { type: 'portrait-primary' } },
    innerWidth: 402, innerHeight: 814, devicePixelRatio: 3,
    visualViewport: { width: 402, height: 814, offsetTop: 0, scale: 1 },
    location,
    localStorage, sessionStorage, history,
    matchMedia: q => ({ matches: /standalone|dark/.test(q) }),
    getComputedStyle: e => ({ backgroundImage: 'none', position: 'static', ...(e.st || {}), paddingTop: pad.t, paddingRight: pad.r, paddingBottom: pad.b, paddingLeft: pad.l }),
    pageYOffset: 0,
    setTimeout: (fn, ms = 0) => { timers.push({ fn, at: clock + ms }); return timers.length },
    requestAnimationFrame: fn => { rafs.push(fn) },
    fetch: () => { net.push('fetch') }, XMLHttpRequest: function () { net.push('xhr') },
    document: Object.assign(doc, {
      readyState: 'loading', visibilityState: 'visible', hidden: false, referrer: '', fonts: { status: 'loaded' },
      documentElement: html, body, createElement: () => ({ nodeName: 'DIV', style: {}, getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: pad.fh }) }),
      getElementById: id => elements[id] || null,
      querySelector: s => q[s] || null,
      // слои под точкой экрана сверху вниз: сплэш (пока он в DOM), затем #root, затем html; тест может подменить env.stack
      elementsFromPoint: () => (env.stack ? env.stack : [elements.splash, root, html].filter(Boolean)),
      elementFromPoint: () => (env.stack ? env.stack[0] : elements.splash || root),
    }),
    __splashLog: opts.splashLog,
  })
  sandbox.window = sandbox
  vm.createContext(sandbox)

  // Один «кадр»: часы идут на step мс, срабатывают таймеры, затем rAF
  function frame(step = 16) {
    clock += step
    for (const t of timers.filter(t => t.at <= clock).sort((a, b) => a.at - b.at)) { timers.splice(timers.indexOf(t), 1); t.fn() }
    const cbs = rafs.splice(0)
    cbs.forEach(fn => fn(clock))
  }
  const env = {
    pad, q, stack: null, win, doc, swTarget, observers, store, entries, elements, splash, fade, logo, root, html, body, history, net, PerformanceObserver,
    now: () => clock,
    run(code) { vm.runInContext(code, sandbox) },
    frame,
    advance(ms, step = 16) { const end = clock + ms; while (clock < end) frame(Math.min(step, end - clock)) },
    emit(type, entry) { observers.filter(o => o.type === type).forEach(o => o.cb({ getEntries: () => [entry] })) },
    log: () => sandbox.__startLog,
    saved: () => JSON.parse(store.pithy_start_logs_v1 || 'null'),
  }
  env.el = el
  return env
}

// Новое окружение с уже выполненным скриптом журнала
export function boot(opts = {}) {
  const env = makeEnv(opts)
  env.run(firstHeadScript().body)
  return env
}
export const evTypes = env => env.log().ev.map(e => e[1])
export const evOf = (env, type) => env.log().ev.filter(e => e[1] === type)
