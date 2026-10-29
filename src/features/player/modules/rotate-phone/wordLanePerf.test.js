import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPool, fillTransform, POOL, WILL_PILL, WILL_FILL } from './wordLanePool.js'
import { createMouthHold, MOUTH_MIN_HOLD_MS } from './wordLaneMouthHold.js'
import WordLaneCat from './WordLaneCat.jsx'
import { buildCat, CAT_FACES } from './wordLaneCatTree.js'

// Производительность оверлея «Повтори за диктором» при трёх кусках, часть 1 (вёрстка и кот): слои только у летящих пилюль, ровная заливка пилюль без штриховки,
// выдержка рта 70 мс, лицо кота без пересборки дерева. Часть 2 (залп, XP, слушатель, конвейер) — wordLanePerfFlow.test.js.
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const readLane = () => read('../../../../styles/player/modules/word-lane.css') + read('../../../../styles/player/modules/word-lane-pill.css') // раскладка и пилюли: одна вёрстка игры в двух файлах
const cssCode = () => readLane().replace(/\/\*[\s\S]*?\*\//g, '') // вёрстка без комментариев (в них эти слова упоминаются)

// Пул на поддельном DOM: у элемента есть style, dataset, атрибуты и animate (как у настоящего)
function fakeEl(parts = {}) {
  const attrs = new Map()
  const el = {
    style: {}, dataset: {}, parts,
    setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null,
    animate: () => ({ currentTime: 0, cancel: vi.fn() }),
    querySelector: sel => parts[sel] ?? null,
    querySelectorAll: () => [],
  }
  return el
}
function fakeRoot() {
  const pills = Array.from({ length: POOL }, () => fakeEl({ '.wlPillFill': fakeEl(), '.wlGhost': fakeEl(), '.wlPace': fakeEl() }))
  return { pills, root: { querySelectorAll: sel => (sel === '[data-pill]' ? pills : []) } }
}

describe('слои: will-change только у взятых из пула пилюль', () => {
  it('take ставит will-change пилюле и её заливке, give снимает; пилюли в пуле слоёв не держат', () => {
    const { pills, root } = fakeRoot()
    const pool = createPool(root)
    expect(pills.every(p => !p.style.willChange)).toBe(true)
    const a = pool.take(0)
    const b = pool.take(1)
    expect(pills[a].style.willChange).toBe(WILL_PILL)
    expect(pills[a].parts['.wlPillFill'].style.willChange).toBe(WILL_FILL)
    expect(pills.filter(p => p.style.willChange).length).toBe(2)
    expect(pills[a].getAttribute('data-held')).toBe('1')                      // по data-held вёрстка держит слои частиц заливки всё время, пока пилюля у движка
    expect(WILL_PILL).toBe('transform, translate, scale')
    pool.give(a)
    expect(pills[a].getAttribute('data-held')).toBeNull()
    expect(pills[a].style.willChange).toBe('')
    expect(pills[a].parts['.wlPillFill'].style.willChange).toBe('')
    expect(pills[b].style.willChange).toBe(WILL_PILL)
    pool.giveAll()
    expect(pills.every(p => !p.style.willChange)).toBe(true)
  })

  it('в полёте will-change не переключается: ставится в take до старта анимации, снимается только в give; paintFill, attr и смена состояний его не трогают', () => {
    const { pills, root } = fakeRoot()
    const pool = createPool(root)
    const writes = []
    const k = pool.take(0, { atMs: 0 })
    for (const el of [pills[k], pills[k].parts['.wlPillFill']]) {
      let v = el.style.willChange
      Object.defineProperty(el.style, 'willChange', { get: () => v, set: x => { writes.push(x); v = x } })
    }
    for (const v of [0.1, 0.4, 0.8, 1]) pool.paintFill(k, v)
    for (const n of ['data-lock', 'data-fail', 'data-hint', 'data-voice']) { pool.attr(k, n); pool.attr(k, n, false) }
    pool.hint(k, '0.5', 0.3); pool.place(k, 40); pool.unplace(k)
    expect(writes).toEqual([])
    pool.give(k)
    expect(writes).toEqual(['', ''])                                           // единственная запись — снятие в give
  })

  it('в вёрстке will-change нет ни у .wlPill, ни у заливки, ни у метки темпа (кроме прогрева в фазе lanes)', () => {
    const css = cssCode()
    for (const sel of ['.wlPill', '.wlPillFill', '.wlPace']) {
      const block = css.match(new RegExp(`^\\${sel} \\{[^}]*\\}`, 'm'))?.[0] ?? ''
      expect(block).not.toBe('')
      expect(block).not.toContain('will-change')
    }
    expect(css).toMatch(/data-phase='lanes'\] \.wlPill \{[^}]*will-change/)
  })
})

describe('заливка пилюль: ровная, край едет', () => {
  it('заливка — translateY((1 − p)·100 %), а не scaleY; 0 → вся ниже пилюли, 1 → на месте; значения зажаты в 0…1', () => {
    expect(fillTransform(0)).toBe('translateY(100.0%)')
    expect(fillTransform(1)).toBe('translateY(0.0%)')
    expect(fillTransform(0.25)).toBe('translateY(75.0%)')
    expect(fillTransform(-3)).toBe('translateY(100.0%)')
    expect(fillTransform(9)).toBe('translateY(0.0%)')
    const { pills, root } = fakeRoot()
    const pool = createPool(root)
    const k = pool.take(0)
    pool.paintFill(k, 0.5)
    expect(pills[k].parts['.wlPillFill'].style.transform).toBe('translateY(50.0%)')
    expect(read('./wordLanePool.js')).not.toContain('scaleY(')
  })

  it('«в процессе» — ровный бледный тон (яркая кромка вместо мягкого края), «принято» — сплошной цвет дорожки; штриховки нет; серый data-fail остаётся', () => {
    const css = cssCode()
    expect(css).not.toContain('repeating-linear-gradient')
    expect(css).not.toContain('scaleY')
    expect(css).toMatch(/\.wlPill:not\(\[data-lock\]\):not\(\[data-fail\]\) \.wlPillFill \{ --edge: [^;]+; background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, rgba\(var\(--rgb\), 0\.35\); \}/) // бледный тон — альфа в самом цвете, не opacity слоя (кромка и частицы остаются яркими); кромка — первый слой фона
    expect(css).toMatch(/\.wlPill\[data-lock\]:not\(\[data-fail\]\) \.wlPillFill \{ background: var\(--edge\) 0 0 \/ 100% 14px no-repeat, var\(--c\); \}/)
    expect(css).toContain('.wlPill[data-fail] .wlPillFill { background: #7b8494; }')
    expect(css).not.toMatch(/\.wlPillFill[^{]*\{[^}]*rgba\(255, 93, 115/) // красного фона у заливки нет: красное — только вспышка промаха
  })
})

describe('рот кота: выдержка 70 мс и ни одной лишней записи в DOM', () => {
  function rig() {
    let t = 1000
    const timers = []
    const applied = []
    const hold = createMouthHold({ apply: k => applied.push(k), now: () => t, setTimer: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length }, clearTimer: id => { if (timers[id - 1]) timers[id - 1].dead = true } })
    const advance = ms => { t += ms; timers.filter(x => !x.dead && x.at <= t).forEach(x => { x.dead = true; x.fn() }) }
    return { hold, applied, advance, at: () => t }
  }

  it('минимальная выдержка — 70 мс, как MIN_HOLD в mouthVisemes', () => {
    expect(MOUTH_MIN_HOLD_MS).toBe(70)
  })

  it('та же форма, что показана, DOM не трогает; смена после выдержки рисуется сразу', () => {
    const { hold, applied, advance } = rig()
    hold.set('closed'); hold.set('closed')
    expect(applied).toEqual([])
    hold.set('open')
    expect(applied).toEqual(['open'])
    advance(20); hold.set('open'); advance(20); hold.set('open')
    expect(applied).toEqual(['open'])
    advance(100)
    hold.set('half')
    expect(applied).toEqual(['open', 'half'])
  })

  it('слишком ранняя смена ждёт конца выдержки и рисуется по таймеру, даже если просьб больше нет', () => {
    const { hold, applied, advance } = rig()
    hold.set('open')
    advance(30)
    hold.set('closed')
    expect(applied).toEqual(['open'])      // 30 мс < 70 — рано
    advance(39)
    expect(applied).toEqual(['open'])
    advance(1)
    expect(applied).toEqual(['open', 'closed'])
  })

  it('дребезг у порога (open ↔ half каждые 16 мс) даёт не больше одной записи на 70 мс; просьба вернуться к показанной отменяет ждущую', () => {
    const { hold, applied, advance } = rig()
    hold.set('open')
    for (let i = 0; i < 12; i++) { advance(16); hold.set(i % 2 ? 'open' : 'half') }
    expect(applied.length).toBeLessThanOrEqual(1 + Math.ceil((12 * 16) / 70))
    const r = rig()
    r.hold.set('open'); r.advance(10)
    r.hold.set('half'); r.hold.set('open') // успели передумать
    r.advance(200)
    expect(r.applied).toEqual(['open'])
  })

  it('redraw рисует показанное заново (смена головы), WordLaneCat не хранит состояние в React', () => {
    const { hold, applied } = rig()
    hold.set('D'); hold.redraw()
    expect(applied).toEqual(['D', 'D'])
    expect(read('./WordLaneCat.jsx')).not.toContain('useState')
    expect(read('./WordLaneCat.jsx')).toContain('export default memo(WordLaneCat)')
  })
})

describe('кот: лица собраны один раз, смена лица — атрибут', () => {
  it('в дереве по одной голове на лицо, тело и хвост — один раз, рот пишется в голову по её data-skin / data-face', () => {
    const tree = buildCat('kit')
    const parts = tree.children.map(c => c.attrs['data-part'])
    expect(parts.filter(p => p === 'tail')).toHaveLength(1)
    expect(parts.filter(p => p === 'body')).toHaveLength(1)
    const heads = tree.children.filter(c => c.attrs['data-part'] === 'head')
    expect(heads.map(h => h.attrs['data-face'])).toEqual(CAT_FACES)
    heads.forEach(h => { expect(h.attrs['data-skin']).toBe('kit'); expect(h.attrs['data-mouth']).toBe('closed') })
  })

  it('разметка: хост с data-face="base", три головы; css показывает одну', () => {
    const html = renderToStaticMarkup(createElement(WordLaneCat, { apiRef: { current: null } }))
    expect(html).toContain('data-face="base"')
    expect(html.match(/data-part="head"/g)).toHaveLength(3)
    const css = readLane()
    expect(css).toContain(".wlCat [data-part='head'] { display: none; }")
    expect(css).toContain(".wlCat[data-face='love'] [data-part='head'][data-face='love']")
  })
})
