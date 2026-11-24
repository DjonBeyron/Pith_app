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
/** Риски линейки: каждые 5 % длины, длинные — только на границах зон (верхняя и нижняя риски — как самые маленькие, v3.3.284); цвет риски — цвет её зоны → [{ p, major, zone }] */
export const TICKS = Array.from({ length: 21 }, (_, i) => { const p = i / 20; return { p, major: [0.45, 0.8].some(e => Math.abs(e - p) < 1e-9), border: [0.45, 0.8].some(e => Math.abs(e - p) < 1e-9), zone: zoneAt(Math.min(p, 0.9999)) } }) // border — граница зон (зелёная/жёлтая, жёлтая/красная): риска длиннее на 40 % и толще на 20 % (владелец, v3.3.282)

/** Следующая пилюля, когда прежняя закончена: не принята, не «не успел», ещё не ушла вниз; из таких — ближайшая к шкале (больший top). → элемент из pills или null */
export const nextPill = (pills, H) => pills.filter(p => !p.locked && !p.failed && p.top < H).sort((a, b) => b.top - a.top)[0] ?? null
/** Выцветание маркера (0 — фиолетовый, 1 — серый): от момента, когда слово закончено (from — top следующей пилюли тогда, px от верха шкалы), до момента, когда следующая пилюля видна ЦЕЛИКОМ (top ≥ 0) */
export const fadeProgress = (from, top) => (from >= 0 || top >= 0 ? 1 : Math.min(1, Math.max(0, (top - from) / -from)))

export const MARKS_MAX = 2 // маркеров слов (фиолетовые треугольники) на шкале одновременно: у каждого слова свой, старый гаснет, когда выходит третье слово
export const MARK_FADE_MS = 700 // сколько гаснущий маркер ещё держит свой узел (прозрачность уходит плавно, CSS transition 0,6 с)
export const HOLD_MS = 1800 // сколько линия остаётся на высоте ответа после принятия / «не успел»

/**
 * Какую пилюлю толкает линия (чистая логика кадра, без DOM). pills — [{ el, top, bottom, locked, failed }] (px от верха шкалы; el — любой маркер, нужен только для «та же пилюля»), H — длина шкалы,
 * tr — прежнее состояние { el, y, done, at } или null, now — часы. → новое состояние. Новая пилюля берётся, когда прежней нет или она закончена (принята / «не успел» / ушла далеко вниз): та, что ближе к верху, нижний край
 * уже коснулся верха шкалы (bottom > 0), не принята и не ушла. Тот же элемент берётся заново (пул пилюль переиспользует узлы: следующее слово едет на том же узле).
 */
let picks = 0 // номер взятой пилюли: линия, растворившаяся у низа для этой пилюли, второй раз не моргает (RaceBossScale)
export function trackStep(tr, pills, H, now) {
  let cur = tr
  if (cur && !cur.done) {
    const p = pills.find(x => x.el === cur.el)
    if (!p || p.locked || p.failed || p.top > H * 1.25) cur = { ...cur, done: true, at: now }
    else cur = { ...cur, y: p.bottom }
  }
  if (!cur || cur.done) {
    const next = pills.filter(p => !p.locked && !p.failed && p.bottom > 0 && p.top < H * 1.25).sort((a, b) => a.top - b.top)[0]
    if (next) return { id: ++picks, el: next.el, y: next.bottom, done: false, at: 0 }
  }
  return cur
}

/** Показана ли линия: идёт пилюля или после ответа не прошло HOLD_MS */
export const lineOn = (tr, now) => !!tr && (!tr.done || now - tr.at < HOLD_MS)

/** Пример при объяснении (владелец 2026-11-15): пилюля со словом плавно, но быстро (DEMO_MOVE_MS) встаёт в центр каждой зоны и стоит там, пока Мия объясняет эту зону, потом так же уходит к центру следующей, а после
 *  «красной» улетает вниз за экран. Реплики стоят в очереди подряд (look, think, green, yellow, red, five), у Мии нет пауз; положение пилюли считается по длительности реплик: к началу «зелёная» она уже в центре
 *  зелёной зоны (до этого ждёт за верхним краем, на «видите шкалу» и «чем дольше думаете»), к началу «жёлтая» — в центре жёлтой, к началу «красная» — в центре красной, к началу «пять красных» улетает. p — нижний край
 *  пилюли в долях длины шкалы (линия идёт за ним). */
export const DEMO_START = 'boss_mia_look'
export const DEMO_IDS = ['boss_mia_look', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five'] // правка владельца 2026-11-24: think склеена с look
export const DEMO_FROM = -0.75               // где пилюля ждёт (над шкалой, за верхним краем экрана)
export const DEMO_OUT = 1.25                 // куда улетает (за нижний край экрана)
export const DEMO_GAP_MS = 350               // пауза очереди речи между репликами по умолчанию (miaSpeech.GAP_MS); игра передаёт действующую настройку mia.gap (useExamSpeech)
export const DEMO_MOVE_MS = 650              // сколько занимает переход к центру следующей зоны: плавно (smoothstep), но быстро
export const DEMO_CENTERS = ZONES.map((z, i) => (EDGES[i] + z.to) / 2) // центры зон: 0,225 / 0,625 / 0,9
const smooth = x => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u) }
/** План примера по длительностям реплик ms = { look, green, yellow, red, five } (мс) → { total, pos(t), starts } — t в мс от начала реплики «видите шкалу справа?» */
/** Сверка часов примера с РЕАЛЬНЫМ началом реплики k (green / yellow / red / five): t — часы примера сейчас → часы, как будто реплика началась по плану. Реплика началась позже плана — пилюля уже стоит в центре
 *  зоны и ждёт (назад не едет); раньше — догоняет. На «условии» (five) пилюля уже улетает — назад её не возвращаем */
export const demoSync = (plan, k, t) => { const s = plan?.starts?.[k]; return s == null ? t : k === 'five' ? Math.max(t, s) : s }
export function demoPlan(ms, gap = DEMO_GAP_MS) {
  const starts = {}; let t = 0
  for (const k of ['look', 'green', 'yellow', 'red', 'five']) { starts[k] = t; t += ms[k] + gap }
  const [cg, cy, cr] = DEMO_CENTERS, M = DEMO_MOVE_MS
  const steps = [[starts.green - M, starts.green, DEMO_FROM, cg], [starts.yellow - M, starts.yellow, cg, cy], [starts.red - M, starts.red, cy, cr], [starts.five - M, starts.five + 250, cr, DEMO_OUT]]
  const pos = u => { let p = DEMO_FROM; for (const [t0, t1, a, b] of steps) { if (u < t0) return p; p = u >= t1 ? b : a + (b - a) * smooth((u - t0) / (t1 - t0)); if (u < t1) return p } return p }
  return { total: t, pos, starts }
}
/** Подпись в пилюле-примере (владелец 2026-11-23: «когда она говорит пример и показывает зону с пилюлей, в ней нужно писать логически коротко о том, что она говорит»): короткий смысл реплики Мии о зоне,
 *  в которой сейчас стоит пилюля — «Зелёная зона, знаете» → «Знаю», «Жёлтая зона, вспоминаете» → «Вспоминаю», «Красная зона, не помните» → «Не помню». t — мс от начала примера; до зелёной зоны — пусто. */
export const DEMO_CAPS = { green: 'Знаю', yellow: 'Вспоминаю', red: 'Не помню' }
export const demoCaption = (plan, t) => (t >= plan.starts.five ? '' : t >= plan.starts.red - DEMO_MOVE_MS / 2 ? DEMO_CAPS.red : t >= plan.starts.yellow - DEMO_MOVE_MS / 2 ? DEMO_CAPS.yellow : t >= plan.starts.green - DEMO_MOVE_MS ? DEMO_CAPS.green : '')
/** Цвет примера (r, g, b) по положению p: зелёный → жёлтый → красный, переход плавный около границ зон (±0,05 длины шкалы) */
const RGB = { fast: [120, 230, 150], mid: [255, 200, 70], slow: [255, 96, 80] }
export function zoneRgb(p) {
  const sm = x => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u) }
  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return mix(mix(RGB.fast, RGB.mid, sm((p - 0.45 + 0.05) / 0.1)), RGB.slow, sm((p - 0.8 + 0.05) / 0.1))
}
/** Реплики Мии, на которых загорается зона (мигает полупрозрачной заливкой), и реплики, с которых шкалу видно на церемонии («видите шкалу справа?» и дальше) */
export const FLASH_LINES = { boss_mia_green: 'fast', boss_mia_yellow: 'mid', boss_mia_red: 'slow' }
export const REVEAL_AT = 0.55 // запасная доля длины реплики «…шкала покажет…», на которой шкала начинает мигать: только когда слова «шкала» в тексте реплики нет (обычный путь — revealAtMs ниже)
export const REVEAL_WORD = 'шкал' // слово реплики, на котором шкала появляется («…шкала покажет…»)
/** Когда на реплике «…шкала покажет…» показать шкалу, мс от РЕАЛЬНОГО начала её звука. line — запись реплики { text, words: [{ w, t, e }] (секунды в файле), duration }, ms — длина звука (по буферу).
 *  Есть тайминги слов записи — момент слова «шкала» в файле; нет — доля по месту слова в тексте; слова в тексте нет — REVEAL_AT. Заменили озвучку — срок берётся из новой записи, числа под старый файл нет */
export function revealAtMs(line, ms) {
  const text = String(line?.text ?? '').toLowerCase(), w = (Array.isArray(line?.words) ? line.words : []).find(x => String(x?.w ?? '').toLowerCase().startsWith(REVEAL_WORD))
  if (w && Number.isFinite(w.t) && line.duration > 0) return Math.round(ms * Math.min(1, Math.max(0, w.t / line.duration)))
  const at = text.indexOf(REVEAL_WORD)
  return Math.round(ms * (at >= 0 ? at / text.length : REVEAL_AT))
}
export const REVEAL_LINES = ['boss_mia_look', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five']
/** talk — реплика Мии { id, key, ms } (miaSpeech.onSpeak) → { zone, key, ms } или null */
export const flashOf = talk => (talk && FLASH_LINES[talk.id] ? { zone: FLASH_LINES[talk.id], key: talk.key, ms: talk.ms } : null)

/**
 * Маркеры слов (фиолетовые треугольники): по одному на слово, живых не больше MARKS_MAX. slots — [{ id, k (номер узла 0…2), y (доля длины шкалы), dying (мс смерти или 0) }], id — пилюля, которую толкает линия
 * (null — никакой), y — положение её линии (доля длины), now — часы. Новое слово создаёт маркер сверху; если живых уже MARKS_MAX, самый старый плавно гаснет; маркер идёт за линией своего слова вниз (не вверх)
 * и замирает на месте ответа; погасшие освобождают узел через MARK_FADE_MS. Возвращает новый список. set — слово принято, y — место ОТВЕТА (bossAnswer.lockAtAnswer: где линия была, когда ученик начал говорить):
 * маркер встаёт ровно туда (один раз поднимается от места зачёта). drop — слово кончилось БЕЗ верного ответа («не успел» / ушло вниз): его маркер доехал до низа и гаснет (владелец 2026-11-22: «если ответа нет, то в самом
 * низу треугольник исчезает»; на шкале остаются прежний верный ответ и текущее слово), нового для этого слова не создаём.
 */
export function marksStep(slots, { id, y, now, set = false, drop = false }) {
  const out = slots.filter(s => !s.dying || now - s.dying <= MARK_FADE_MS).map(s => ({ ...s }))
  if (drop) { const m = out.find(s => s.id === id && !s.dying); if (m) m.dying = now; return out }
  if (id != null && !out.some(s => s.id === id)) {
    const k = [0, 1, 2].find(i => !out.some(s => s.k === i))
    const alive = out.filter(s => !s.dying)
    if (alive.length >= MARKS_MAX) alive[0].dying = now
    if (k != null) out.push({ id, k, y: 0, dying: 0 })
  }
  if (id != null) { const m = out.find(s => s.id === id && !s.dying); if (m) m.y = Math.min(1, set ? Math.max(0, y) : Math.max(m.y, y)) }
  return out
}
