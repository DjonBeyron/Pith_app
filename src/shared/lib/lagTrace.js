// Трассер лагов игры (просьба владельца 2026-11-26: «трассер, который отследит лаги в будущем в логи»). Датчик «[perf]» раз в секунду говорит, ЧТО был длинный кадр, но не говорит, что в этот момент шло
// в игре. Трассер на каждый кадр длиннее порога пишет в журнал одну строку:
//   [lag] кадр 83 мс · стадия boss · что шло: ответ верный (за 12 мс до кадра), реплика mia_ok_2 старт (+3 мс), Мия: уход с коробкой (идёт 240 мс) · браузер: скрипт 41 мс (flush), стили и раскладка 22 мс
//   [lag] ×5 кадров за 0,6 с, худший 120 мс, лишних 310 мс · стадия sprint3-ann · что шло: цвет дорожек → Мия (идёт 400 мс), реплика mia_push старт
// и в конце игры сводку: [lag] итог: 14 длинных кадров (от 32 мс) в 9 местах за 3:20 игры; худший 120 мс, всего лишних 610 мс; чаще всего: ответ верный ×6, Мия: уход с коробкой ×3, …
// «Что шло» собирается ТОЛЬКО в момент лага из готового: события трассы сцены (sceneTrace.events — смена стадии, реплики, пилюли, ответы), метки названных анимаций (lagMark — прыжки Мии, перекраска
// дорожек, вылет «+XP»; у метки длительность: лаг посреди анимации тоже её назовёт) и строки журнала вокруг кадра (итог Vosk, смена модели, счёт экзамена, уворот Пита — lagTraceLabels.js).
// Цена: на обычном кадре — одно вычитание и сравнение (frame), без DOM, без getComputedStyle, без строк; сборка строки — раз на серию длинных кадров (серия = длинные кадры с промежутком до LAG_QUIET_MS,
// не длиннее LAG_BURST_MS: не больше ~2 строк в секунду). Подряд идущие длинные кадры сворачиваются в одну строку. Работает только при отладочном интерфейсе (useLagTrace.js); у ученика не включается.
// Порог: 24 мс — «кадр в полтора раза длиннее обычного» (при 60 кадрах в секунду кадр опоздал). Не 50 мс: в журнале владельца после первого цикла оптимизации (iPhone, 2026-11-26) кадров от 50 мс вне пауз
// почти нет (1 секунда из 229), а рывок, который он видит глазом на уходе Мии с коробкой, — это секунды с fps 58–59 и худшим кадром 24–25 мс. При пороге 24 мс у него вышло бы около 10 строк в минуту
// (серии сворачиваются). На слабом устройстве порог 50 мс: там 33 мс — обычное дело, строк было бы слишком много.
// Где доступно, браузер добавляет виновника: PerformanceObserver 'long-animation-frame' (Chromium: сколько шёл скрипт и какой, сколько стили с раскладкой) или 'longtask'; в Safari их нет — остаются метки.
import { pLog } from './debug.js'
import { sceneTrace } from './sceneTrace.js'
import { gameJournal } from './gameJournal.js'
import { sceneLabel, journalLabel, journalLine, lagSummaryLine } from './lagTraceLabels.js'

export const LAG_MS = 24, LAG_WEAK_MS = 50
export const LAG_QUIET_MS = 500   // столько без длинных кадров — серия кончилась, строка пишется
export const LAG_BURST_MS = 2000  // серия длиннее — пишется, не дожидаясь конца (долгий затык виден по ходу)
export const LAG_SKIP_MS = 3000   // кадр длиннее — вкладка была в фоне / система заняла экран: не лаг игры
export const LAG_LEAD_MS = 60     // событие за столько до начала длинного кадра — ещё его причина (работа уходит в следующий кадр)
export const LAG_ITEMS = 8        // столько подписей в строке, остальное — «…ещё N»
const FRAME_MS = 16.7, MARKS = 48, LONGS = 12, SCAN = 600

/** Кольцо меток анимаций: add(подпись, длительность мс), list() */
export function createLagMarks({ now = () => globalThis.performance?.now?.() ?? Date.now(), size = MARKS } = {}) {
  const ring = []
  let at = 0
  return {
    add(label, ms = 0) { ring[at] = { t: now(), label: String(label), ms }; at = (at + 1) % size },
    list: () => ring.filter(Boolean),
    clear() { ring.length = 0; at = 0 },
  }
}
/** Общие метки страницы */
export const lagMarks = createLagMarks()
/** Началась названная анимация длиной ms: запись в кольцо и строка журнала «[lag-mark] …». Не бросает */
export function lagMark(label, ms = 0) { try { lagMarks.add(label, ms); pLog(`[lag-mark] ${label}${ms ? ` (${Math.round(ms)} мс)` : ''}`) } catch { /* трассер не мешает игре */ } }

export function createLagTrace({ limit = LAG_MS, log = pLog, events = () => sceneTrace.events(), lines = () => gameJournal.lines(), marks = lagMarks } = {}) {
  let last = 0, burst = null, paused = false
  const longs = [] // длинные кадры по данным браузера: { start, dur, text }
  const fresh = () => ({ frames: 0, bursts: 0, worst: 0, extra: 0, playMs: 0, keys: new Map(), blank: 0 })
  let stats = fresh()

  function collect(b) {
    const from = b.start - LAG_LEAD_MS, to = b.end, found = []
    let stage = null
    const ev = events()
    for (let i = ev.length - 1, n = 0; i >= 0 && n < SCAN; i--, n++) { // с конца: до первой смены стадии раньше окна
      const e = ev[i]
      if (e.t > to) continue
      if (e.k === 'stage-in' && stage == null) stage = e.sid ?? e.idx ?? null
      if (e.t < from) { if (stage != null) break; continue }
      const l = sceneLabel(e); if (l) found.push({ t: e.t, ...l, at: true })
    }
    for (const m of marks.list()) if (m.t <= to && m.t + m.ms >= from) found.push({ t: m.t, key: m.label, text: m.t < from ? `${m.label} (идёт ${Math.round(b.start - m.t)} мс)` : m.label, at: m.t >= from })
    const jl = lines()
    for (let i = jl.length - 1, n = 0; i >= 0 && n < SCAN; i--, n++) {
      const p = journalLine(jl[i]); if (!p) continue
      if (p[0] > to) continue
      if (p[0] < from) break
      const label = journalLabel(p[1]); if (label && !found.some(f => f.key === label)) found.push({ t: p[0], key: label, text: label, at: true })
    }
    return { stage, found: found.sort((x, y) => x.t - y.t) }
  }

  function emit() {
    const b = burst; burst = null
    if (!b) return null
    try {
      const { stage, found } = collect(b), seen = new Set(), items = []
      for (const f of found) {
        if (!seen.has(f.key)) { seen.add(f.key); stats.keys.set(f.key, (stats.keys.get(f.key) ?? 0) + 1) }
        const d = Math.round(f.t - b.start)
        items.push(b.n === 1 && f.at ? `${f.text} (${d < 0 ? `за ${-d} мс до кадра` : `+${d} мс`})` : f.text)
      }
      const uniq = [...new Set(items)]
      if (!uniq.length) stats.blank++
      stats.bursts++
      const head = b.n === 1 ? `кадр ${Math.round(b.worst)} мс` : `×${b.n} кадров за ${((b.end - b.start) / 1000).toFixed(1).replace('.', ',')} с, худший ${Math.round(b.worst)} мс, лишних ${Math.round(b.extra)} мс`
      const long = longs.filter(l => l.start < b.end + 20 && l.start + l.dur > b.start - 20).sort((x, y) => y.dur - x.dur)[0]
      const line = `[lag] ${head} · стадия ${stage ?? '—'} · что шло: ${uniq.slice(0, LAG_ITEMS).join(', ') || 'меток нет'}${uniq.length > LAG_ITEMS ? `, …ещё ${uniq.length - LAG_ITEMS}` : ''}${long ? ` · браузер: ${long.text}` : ''}`
      log(line)
      return line
    } catch { return null }
  }

  return {
    /** Кадр игры: ts — метка времени кадра (requestAnimationFrame). Единственное, что зовётся каждый кадр */
    frame(ts) {
      const gap = last ? ts - last : 0
      last = ts
      if (burst && ts - burst.end > LAG_QUIET_MS) emit()
      if (paused || gap <= 0 || gap > LAG_SKIP_MS) return
      stats.playMs += gap
      if (gap < limit) return
      if (!burst) burst = { start: ts - gap, end: ts, n: 0, worst: 0, extra: 0 }
      burst.n++; burst.end = ts; burst.extra += gap - FRAME_MS
      if (gap > burst.worst) burst.worst = gap
      stats.frames++; stats.extra += gap - FRAME_MS
      if (gap > stats.worst) stats.worst = gap
      if (ts - burst.start > LAG_BURST_MS) emit()
    },
    /** Пауза игры (окно паузы, попап комментария, шестерёнка): кадры не считаются; первый кадр после паузы — тоже */
    pause(on) { if (paused === !!on) return; if (on) emit(); paused = !!on; last = 0 },
    /** Длинный кадр по данным браузера: { start, dur, text } (useLagTrace.js: long-animation-frame / longtask) */
    long(entry) { longs.push(entry); if (longs.length > LONGS) longs.shift() },
    /** Дописать начатую серию сейчас → строка или null */
    flush: emit,
    /** Итог игры: строка «[lag] итог: …» в журнал (если игра шла хотя бы 2 с) и сброс счёта → строка или null */
    summary() {
      emit()
      const s = stats; stats = fresh()
      if (s.playMs < 2000) return null
      const line = lagSummaryLine(s, limit)
      try { log(line) } catch { /* журнал недоступен */ }
      return line
    },
    stats: () => ({ ...stats, keys: new Map(stats.keys) }),
  }
}
