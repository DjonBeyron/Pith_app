import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPool, POOL } from './wordLanePool.js'
import { missPill } from './wordLaneSnap.js'
import { createLaneFlash, LITE_MS } from './wordLaneLaneFlash.js'

// Два пожелания владельца: (1) неверный ответ и «не успел» — косые полоски на пилюле (word-lane-pill-wrong.css), (2) верный ответ вспыхивает дорожкой (word-lane-lane-flash.css, wordLaneLaneFlash.js)
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const css = name => strip(read(`../../../../styles/player/modules/${name}`))
const wrongCss = css('word-lane-pill-wrong.css')
const flashCss = css('word-lane-lane-flash.css')
const rules = text => [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2] }))
const body = (text, sel) => rules(text).find(r => r.sel === sel)?.body ?? ''
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('полоски: неверно (data-wrong) и «не успел» (data-fail)', () => {
  it('слой .wlPillClip::after: 45°, полоса 6 px, цвет дорожки и тёмный; без filter; контур клипа держит полоски внутри', () => {
    const layer = body(wrongCss, '.wlPillClip::after')
    expect(layer).toMatch(/repeating-linear-gradient\(45deg, rgba\(var\(--st1-rgb\), calc\([^;]*\)\) 0 6px, rgba\(10, 12, 16, calc\([^;]*\)\) 6px 12px\)/)
    expect(layer).toMatch(/opacity: 0;/)
    expect(layer).toMatch(/transition: opacity 0\.2s/)           // плавное появление 0,2 с
    expect(wrongCss).not.toMatch(/filter|will-change/)             // filter нет; слой не держится постоянно
    expect(strip(read('../../../../styles/player/modules/word-lane-pill.css'))).toMatch(/\.wlPillClip \{[^}]*overflow: hidden/)
    expect(body(wrongCss, '.wlPill')).toContain('--st1-rgb: var(--rgb)') // цвет дорожки
  })
  it('видны при data-wrong (пока не принята) и при data-fail; data-lock полоски убирает', () => {
    expect(body(wrongCss, ".wlPill[data-wrong]:not([data-lock]) .wlPillClip::after, .wlPill[data-fail] .wlPillClip::after")).toContain('opacity: 1')
  })
  it('«не успел» — серые полоски бледнее, чем у неверного', () => {
    const fail = body(wrongCss, '.wlPill[data-fail]')
    const base = body(wrongCss, '.wlPill')
    expect(fail).toContain('--st1-rgb: 176, 184, 198')
    expect(Number(fail.match(/--st1-a: ([\d.]+)/)[1])).toBeLessThan(Number(base.match(/--st1-a: ([\d.]+)/)[1]))
    expect(Number(fail.match(/--st2-a: ([\d.]+)/)[1])).toBeLessThan(Number(base.match(/--st2-a: ([\d.]+)/)[1]))
    expect(strip(read('../../../../styles/player/modules/word-lane-pill.css'))).toContain('.wlPill[data-fail] { opacity: 0.4;') // приглушение прежнее
  })
  it('слабое устройство — полоски сразу, без перехода (и в обычном, и в безопасном режиме)', () => {
    expect(body(wrongCss, '.wl--lite .wlPillClip::after, .weak-device .wlPillClip::after')).toContain('transition: none')
    expect(body(wrongCss, '.wlField.wl--safe.wl--lite .wlPillClip::after, .weak-device .wlField.wl--safe .wlPillClip::after')).toContain('transition: none')
  })
  it('безопасный режим: тот же слой, но без opacity-перехода — прозрачность полосок --wl-sa (зарегистрированное число), без will-change', () => {
    expect(wrongCss).toContain("@property --wl-sa { syntax: '<number>'; inherits: false; initial-value: 1; }")
    const safe = body(wrongCss, '.wlField.wl--safe .wlPillClip::after')
    expect(safe).toMatch(/opacity: 1;/)
    expect(safe).toMatch(/--wl-sa: 0;/)
    expect(safe).toMatch(/transition: --wl-sa 0\.2s/)
    expect(safe).not.toMatch(/transition: opacity/)
    expect(body(wrongCss, '.wlField.wl--safe .wlPill[data-wrong]:not([data-lock]) .wlPillClip::after, .wlField.wl--safe .wlPill[data-fail] .wlPillClip::after')).toContain('--wl-sa: 1')
  })
  it('файлы подключены в index.css после основных стилей пилюль', () => {
    const idx = read('../../../../index.css')
    expect(idx.indexOf('word-lane-pill-wrong.css')).toBeGreaterThan(idx.indexOf('word-lane-pill-safe.css'))
    expect(idx).toContain('word-lane-lane-flash.css')
  })

  it('missPill ставит data-wrong и не падает без пилюли / без setAttribute; clean (take / give) снимает', () => {
    const attrs = new Map()
    const pill = { setAttribute: (k, v) => attrs.set(k, v), animate: vi.fn(), querySelector: () => null }
    missPill(pill)
    expect(attrs.get('data-wrong')).toBe('1')
    expect(pill.animate).toHaveBeenCalled()                          // дрожь осталась
    expect(() => missPill(null)).not.toThrow()
    expect(() => missPill({ animate() {}, querySelector: () => null })).not.toThrow()   // фейковая пилюля без setAttribute
    const src = read('./wordLanePool.js')
    expect(src).toMatch(/for \(const a of \[[^\]]*'data-wrong'[^\]]*\]\) parts\[k\]\.el\.removeAttribute\(a\)/)
  })
  it('пул: data-wrong снимается при возврате и повторной выдаче пилюли', () => {
    const part = () => ({ style: {}, setAttribute() {}, removeAttribute() {} })
    const pills = Array.from({ length: POOL }, () => {
      const attrs = new Map()
      const parts = { '.wlPillFill': part(), '.wlGhost': part(), '.wlPace': part() }
      return { style: {}, dataset: {}, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, animate: () => ({ cancel() {} }), querySelector: sel => parts[sel] ?? null, querySelectorAll: () => [] }
    })
    const pool = createPool({ querySelectorAll: sel => (sel === '[data-pill]' ? pills : []) })
    const k = pool.take(0, { flight: false })
    missPill(pills[k]); pool.attr(k, 'data-fail')
    expect(pills[k].getAttribute('data-wrong')).toBe('1')
    pool.give(k)
    expect(pills[k].getAttribute('data-wrong')).toBeNull()
    expect(pills[k].getAttribute('data-fail')).toBeNull()
  })
  it('движок: miss → missPill на первом незащёлкнутом куске; принятый кусок (lock) полосок не имеет — они завязаны на :not([data-lock])', () => {
    const eng = read('./useWordLanePills.js')
    expect(eng).toContain('if (k != null) missPill(pool.el(k))')
    expect(read('./wordLaneOrderScene.js')).toContain('missPill(pool.el(k))') // «Порядок»: чужая дорожка — тоже помечается
  })
})

describe('вспышка дорожки на верный ответ', () => {
  it('CSS: 0,6 с, opacity 0 → 0,25 → 0 у колонки цвета дорожки; кромка 0 → 0,35; слои только при data-win; без filter', () => {
    expect(flashCss).toMatch(/@keyframes wlLaneFlashA \{ 0% \{ opacity: 0; \} 40% \{ opacity: var\(--pk\); \} 100% \{ opacity: 0; \} \}/)
    expect(flashCss).toMatch(/@keyframes wlLaneFlashB \{[^}]*\{ opacity: 0; \}[^}]*var\(--pk\)/)
    expect(body(flashCss, '.wlLanes i[data-win]::after')).toMatch(/--pk: 0\.25;/)
    expect(body(flashCss, '.wlLaneEdge[data-win]::after')).toMatch(/--pk: 0\.35;/)
    expect(body(flashCss, ".wlLanes [data-win='a']::after")).toMatch(/animation: wlLaneFlashA 0\.6s ease-out 1 both/)
    expect(body(flashCss, ".wlLanes [data-win='b']::after")).toMatch(/animation: wlLaneFlashB 0\.6s ease-out 1 both/)
    expect(flashCss).not.toMatch(/filter|will-change|box-shadow/)
    expect(body(flashCss, '.wlLanes i[data-win]::after')).toMatch(/inset: 0;.*rgba\(var\(--rgb\)/)
    expect(flashCss).not.toMatch(/\.wlLanes i::after|\.wlLanes i::before/) // без data-win слоёв у колонок нет
  })
  it('цвета колонок — ступени «Моей памяти» (--lvl1..3-rgb)', () => {
    expect(body(flashCss, '.wlLanes i:nth-child(1)')).toContain('--lvl1-rgb')
    expect(body(flashCss, '.wlLanes i:nth-child(2)')).toContain('--lvl2-rgb')
    expect(body(flashCss, '.wlLanes i:nth-child(3)')).toContain('--lvl3-rgb')
  })
  it('слабое устройство: статичная подсветка (data-win = s), без анимации', () => {
    expect(body(flashCss, ".wlLanes i[data-win='s']::after")).toMatch(/opacity: 0\.16/)
    expect(flashCss).not.toMatch(/data-win='s'\][^{]*\{[^}]*animation/)
  })

  // Поддельное поле: .wlLanes с тремя колонками и двумя кромками; атрибуты и слушатель animationend
  function fakeField(lite = false) {
    const mk = () => { const a = new Map(); return { a, setAttribute: (k, v) => a.set(k, v), removeAttribute: k => a.delete(k), getAttribute: k => a.get(k) ?? null } }
    const cols = [mk(), mk(), mk()], edges = [mk(), mk()]
    let onEnd = null
    const lanes = { addEventListener: (t, f) => { if (t === 'animationend') onEnd = f }, querySelectorAll: sel => (sel === 'i' ? cols : sel === '.wlLaneEdge' ? edges : []) }
    const root = { querySelector: sel => (sel === '.wlLanes' ? lanes : null), classList: { contains: c => lite && c === 'wl--lite' } }
    return { root, cols, edges, end: (el, name) => onEnd({ target: el, animationName: name }), lanes }
  }
  it('flash(lane): data-win на колонке и её кромках (лайн 0 — одна кромка, 1 — обе, 2 — одна)', () => {
    const f = fakeField(); const fl = createLaneFlash(f.root)
    fl.flash(0)
    expect(f.cols.map(c => c.getAttribute('data-win'))).toEqual(['a', null, null])
    expect(f.edges.map(c => c.getAttribute('data-win'))).toEqual(['a', null])
    fl.flash(1)
    expect(f.cols[1].getAttribute('data-win')).toBe('a')
    expect(f.edges.map(c => c.getAttribute('data-win'))).toEqual(['b', 'a'])  // кромка 0 уже была в a — вторая вспышка чередует букву и перезапускает анимацию
    fl.flash(2)
    expect(f.cols[2].getAttribute('data-win')).toBe('a')
    expect(f.edges[1].getAttribute('data-win')).toBe('b')
  })
  it('повторная вспышка той же дорожки подряд чередует a / b (перезапуск без пересчёта вёрстки)', () => {
    const f = fakeField(); const fl = createLaneFlash(f.root)
    fl.flash(1); fl.flash(1); expect(f.cols[1].getAttribute('data-win')).toBe('b')
    fl.flash(1); expect(f.cols[1].getAttribute('data-win')).toBe('a')
  })
  it('animationend своей вспышки снимает data-win; конец чужой (устаревшей) вспышки — нет', () => {
    const f = fakeField(); const fl = createLaneFlash(f.root)
    fl.flash(0); fl.flash(0)                                  // сейчас b
    f.end(f.cols[0], 'wlLaneFlashA')                          // запоздавший конец прежней a
    expect(f.cols[0].getAttribute('data-win')).toBe('b')
    f.end(f.cols[0], 'wlLaneFlashB')
    expect(f.cols[0].getAttribute('data-win')).toBeNull()
    f.end(f.cols[0], 'wlSparkA')                              // чужая анимация
    f.end(f.lanes, 'wlLaneFlashA')                            // и сам контейнер — не трогаем
  })
  it('слабое устройство: data-win = s без анимации, таймер LITE_MS снимает; следующая вспышка продлевает', () => {
    vi.useFakeTimers()
    const f = fakeField(true); const fl = createLaneFlash(f.root)
    fl.flash(2)
    expect(f.cols[2].getAttribute('data-win')).toBe('s')
    vi.advanceTimersByTime(LITE_MS - 50); fl.flash(2)
    vi.advanceTimersByTime(LITE_MS - 50)
    expect(f.cols[2].getAttribute('data-win')).toBe('s')      // продлена
    vi.advanceTimersByTime(60)
    expect(f.cols[2].getAttribute('data-win')).toBeNull()
  })
  it('.weak-device на <html> тоже считается слабым устройством; без поля .wlLanes и в поддельных корнях пула — не падает', () => {
    vi.stubGlobal('document', { documentElement: { classList: { contains: c => c === 'weak-device' } } })
    const f = fakeField(false); createLaneFlash(f.root).flash(0)
    expect(f.cols[0].getAttribute('data-win')).toBe('s')
    expect(() => createLaneFlash({ querySelector: () => null }).flash(1)).not.toThrow()
    expect(() => createLaneFlash({}).flash(1)).not.toThrow()
  })
  it('пул отдаёт flashLane; движок зовёт его на win (дорожка принятой пилюли), «Порядок» — на верный тап', () => {
    const pool = createPool({ querySelectorAll: () => [] })
    expect(typeof pool.flashLane).toBe('function')
    expect(() => pool.flashLane(1)).not.toThrow()
    expect(read('./useWordLanePills.js')).toContain("else if (e.type === 'win') { gate.mute(performance.now()); const k = held.get(e.pill.id); pool.flashLane(e.pill.lane);")
    expect(read('./wordLaneOrderScene.js')).toContain('pool.flashLane?.(e.lane)')
  })
  it('React колонкам и кромкам data-win не пишет (атрибут живёт только в DOM)', () => {
    expect(read('./WordLanePills.jsx')).not.toContain('data-win')
  })
})
