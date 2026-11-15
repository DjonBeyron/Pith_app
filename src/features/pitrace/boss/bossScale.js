// Шкала финала «Шкала памяти» (чистые функции без DOM). Шкала — вертикальная линейка справа от верха ленты (под кнопками) до низа с отступом под скругление экрана. Пилюля едет вниз и толкает линию:
// линия появляется в миг, когда нижний край пилюли касается верха шкалы, и идёт за этим краем. Зона определяется положением линии на шкале: чем ниже, тем дольше вспоминалось слово и тем слабее оно держится.
// Баланс зон (владелец 2026-11-15): зелёная 45 %, жёлтая 35 %, красная 20 % длины шкалы.
export const ZONES = [{ id: 'fast', to: 0.45 }, { id: 'mid', to: 0.8 }, { id: 'slow', to: 1 }]

/** Зона по положению линии, долей длины шкалы (0 — верх, 1 — низ) */
export const zoneAt = p => (ZONES.find(z => p < z.to) ?? ZONES.at(-1)).id
/** Верх каждой зоны, доли длины шкалы: [0, 0,45, 0,8] */
export const EDGES = ZONES.map((_, i) => (i === 0 ? 0 : ZONES[i - 1].to))
/** Высота зоны, доли длины */
export const spanOf = id => { const i = ZONES.findIndex(z => z.id === id); return ZONES[i].to - EDGES[i] }
/** Риски линейки: каждые 5 % длины, длинные — на границах зон и краях; цвет риски — цвет её зоны → [{ p, major, zone }] */
export const TICKS = Array.from({ length: 21 }, (_, i) => { const p = i / 20; return { p, major: [0, 0.45, 0.8, 1].some(e => Math.abs(e - p) < 1e-9), zone: zoneAt(Math.min(p, 0.9999)) } })

export const HOLD_MS = 1800 // сколько линия остаётся на высоте ответа после принятия / «не успел»

/**
 * Какую пилюлю толкает линия (чистая логика кадра, без DOM). pills — [{ el, top, bottom, locked, failed }] (px от верха шкалы; el — любой маркер, нужен только для «та же пилюля»), H — длина шкалы,
 * tr — прежнее состояние { el, y, done, at } или null, now — часы. → новое состояние. Новая пилюля берётся, когда прежней нет или она закончена (принята / «не успел» / ушла далеко вниз): та, что ближе к верху, нижний край
 * уже коснулся верха шкалы (bottom > 0), не принята и не ушла. Тот же элемент берётся заново (пул пилюль переиспользует узлы: следующее слово едет на том же узле).
 */
export function trackStep(tr, pills, H, now) {
  let cur = tr
  if (cur && !cur.done) {
    const p = pills.find(x => x.el === cur.el)
    if (!p || p.locked || p.failed || p.top > H * 1.25) cur = { ...cur, done: true, at: now }
    else cur = { ...cur, y: p.bottom }
  }
  if (!cur || cur.done) {
    const next = pills.filter(p => !p.locked && !p.failed && p.bottom > 0 && p.top < H * 1.25).sort((a, b) => a.top - b.top)[0]
    if (next) return { el: next.el, y: next.bottom, done: false, at: 0 }
  }
  return cur
}

/** Показана ли линия: идёт пилюля или после ответа не прошло HOLD_MS */
export const lineOn = (tr, now) => !!tr && (!tr.done || now - tr.at < HOLD_MS)

/** Пример при объяснении: пилюля со словом едет по шкале ОДНОЙ скоростью (линейно) от −75 % (выше экрана: из-за верхнего края выезжает уже зелёной) до низа за DEMO_MS (15,75 с), начиная с реплики «видите шкалу
 *  справа?». Реплики Мии о зонах НЕ стоят по часам: их запускает сама пилюля, в миг, когда входит в зону (DEMO_TRIGGERS → директор ставит реплику в очередь), — «зелёная» на входе в 0 %, «жёлтая» на 45 %,
 *  «красная» на 80 %, «пять красных» — когда пилюля у низа. Так слова всегда совпадают с зоной, где пилюля. До входа в зелёную успевают «видите шкалу» и «чем дольше думаете» (≈ 6 с). Пилюля остаётся внизу до конца объяснения. */
export const DEMO_START = 'boss_mia_look'
export const DEMO_FROM = -0.75
export const DEMO_MS = 15750
/** Когда (мс от старта примера) пилюля на отметке p шкалы */
export const crossAt = p => ((p - DEMO_FROM) / (1 - DEMO_FROM)) * DEMO_MS
/** Что запускает пилюля: [мс от старта, вид] — fast / mid / slow (вход в зону) и end (дошла до низа) */
export const DEMO_TRIGGERS = [[crossAt(0), 'fast'], [crossAt(0.45), 'mid'], [crossAt(0.8), 'slow'], [DEMO_MS, 'end']]
/** Реплики, которые ставит каждый запуск (кто, задержка от запуска, мс): «пять красных» и ответ Пита из коробки */
export const DEMO_CUES = {
  fast: [{ id: 'boss_mia_green', who: 'mia', delay: 0 }], mid: [{ id: 'boss_mia_yellow', who: 'mia', delay: 0 }], slow: [{ id: 'boss_mia_red', who: 'mia', delay: 0 }],
  end: [{ id: 'boss_mia_five', who: 'mia', delay: 0 }, { id: 'boss_pit_no', who: 'pit', delay: 0 }],
}
/** Скорость конвейера на объяснении (доли обычной): дорожки едут со скоростью пример-пилюли (1 длина шкалы за 9 с ≈ 8 % высоты экрана в секунду при длине шкалы 0,72 высоты) */
export const DEMO_CONVEYOR_SPEED = 0.31
/** Реплики Мии, на которых загорается зона (мигает полупрозрачной заливкой), и реплики, с которых шкалу видно на церемонии («видите шкалу справа?» и дальше) */
export const FLASH_LINES = { boss_mia_green: 'fast', boss_mia_yellow: 'mid', boss_mia_red: 'slow' }
export const REVEAL_LINES = ['boss_mia_look', 'boss_mia_think', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five']
/** talk — реплика Мии { id, key, ms } (miaSpeech.onSpeak) → { zone, key, ms } или null */
export const flashOf = talk => (talk && FLASH_LINES[talk.id] ? { zone: FLASH_LINES[talk.id], key: talk.key, ms: talk.ms } : null)
