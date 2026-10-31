// Журнал отладки игры «Повтори за диктором»: что реально слышал распознаватель, как отреагировал интерфейс. Чистый модуль без React и DOM — собирает события в кольцевой буфер
// (MAX_EVENTS, старое вытесняется пачкой), по концу игры dump() отдаёт один объект для файла (wordLaneDebugExport.js) и скрипта scripts/dictor-debug-report.mjs.
// Выключен по умолчанию: createWordLaneDebug({ enabled: false }) отдаёт общий объект NO_DEBUG с пустыми функциями — ни буфера, ни замеров. Включают отладочный интерфейс из админки
// (usePlayerDebugUi) или localStorage pithy_wl_debug_v1 = '1' (см. debugEnabled). Время событий t — мс от старта игры (создания журнала).
//
// Запись события: { t, type, kind?, ... }. type: stage | level | partial | final | pill | note | mute | gate | event | grammar.
export const WL_DEBUG_KEY = 'pithy_wl_debug_v1'
export const DEBUG_VERSION = 1
export const MAX_EVENTS = 20000   // потолок журнала; дальше вытесняются самые старые
export const EVICT_BATCH = 500    // вытесняем пачкой, чтобы не делать shift() на каждую запись
export const LEVEL_EVERY_MS = 50  // уровень голоса пишется ≈ 20 раз в секунду (кусок звука приходит чаще); в записи — пик за окно

const noop = () => {}

/** Включена ли отладка: тумблер админки («Отладочный интерфейс») ИЛИ localStorage pithy_wl_debug_v1 = '1' */
export function debugEnabled({ toggle = false, store = globalThis.localStorage } = {}) {
  if (toggle) return true
  try { return store?.getItem(WL_DEBUG_KEY) === '1' } catch { return false }
}

/** Выключенный журнал: все методы пустые, dump() → null. Один общий объект — выключенная отладка ничего не выделяет */
export const NO_DEBUG = Object.freeze({
  enabled: false, event: noop, level: noop, partial: noop, final: noop, pill: noop, stage: noop, note: noop, mute: noop, gate: noop, meta: noop, grammar: noop, listen: noop, ext: noop, dump: () => null,
})

/** Что за устройство: для сопоставления «странных реакций» с телефоном. weak — решение isWeakDevice (подставляет вызывающий) */
export function collectDevice({ weak = null, nav = globalThis.navigator, scr = globalThis.screen, win = globalThis.window } = {}) {
  return {
    ua: String(nav?.userAgent ?? ''), platform: String(nav?.platform ?? ''), weak,
    screen: { w: scr?.width ?? null, h: scr?.height ?? null, innerW: win?.innerWidth ?? null, innerH: win?.innerHeight ?? null, dpr: win?.devicePixelRatio ?? null },
  }
}

const round = (v, k = 1) => Math.round(v * k) / k
const plain = data => (data && typeof data === 'object' ? data : data == null ? {} : { value: data })

/**
 * now — часы, мс (в тестах подставляются); describeMic() → описание микрофонного потока (зовётся из dump через try); device — результат collectDevice.
 * extras() — дополнительные поля для dump (журнал плеера, журнал звуков и т. п.; зовётся через try). ext(at, type, kind, data) — событие извне с абсолютным временем at (эпоха, мс): t может быть < 0 (было до старта игры).
 * Методы: event(kind, data), level(v), partial(text, analysis), final(text, analysis), pill(kind, data), stage(name, data), note(kind), mute(ms), gate(on), meta(obj), grammar(targets, json),
 * listen(kind, data) — единый вход от слушателя (wordLaneListen: onDebug), dump().
 */
export function createWordLaneDebug({ enabled = false, now = () => Date.now(), describeMic = null, device = null, extras = null } = {}) {
  if (!enabled) return NO_DEBUG
  const t0 = now()
  const events = []
  const grammars = new Map()      // json → { targets, phrases } (словарь ступени один и тот же при каждом перезапуске слушателя)
  let metaObj = {}
  let dropped = 0
  let lastLevelAt = -Infinity
  let peak = 0
  let gateOn = null

  const push = (type, kind, data, at = null) => {
    const rec = { t: Math.round((at ?? now()) - t0), type }
    if (kind != null) rec.kind = kind
    events.push(Object.assign(rec, plain(data)))
    if (events.length > MAX_EVENTS) { const cut = events.length - MAX_EVENTS + EVICT_BATCH; events.splice(0, cut); dropped += cut }
  }

  const log = {
    enabled: true,
    event: (kind, data) => push('event', kind, data),
    stage: (name, data) => push('stage', name, data),
    pill: (kind, data) => push('pill', kind, data),
    note: kind => push('note', kind),
    ext: (at, type, kind, data) => push(type, kind, data, at),
    mute: ms => push('mute', null, { ms: Math.round(ms) }),
    /** Ворота голоса (после них голос двигает пилюли): пишется только смена состояния */
    gate(on) { if (gateOn === on) return; gateOn = on; push('gate', null, { on: !!on }) },
    /** Уровень голоса 0…1 (сырой RMS куска звука): не чаще LEVEL_EVERY_MS, в записи — пик за окно */
    level(v) {
      const tt = now() - t0
      if (v > peak) peak = v
      if (tt - lastLevelAt < LEVEL_EVERY_MS) return
      lastLevelAt = tt
      push('level', null, { v: round(peak, 10000) })
      peak = 0
    },
    partial: (text, analysis) => push('partial', null, { text: String(text ?? ''), ...plain(analysis) }),
    final: (text, analysis) => push('final', null, { text: String(text ?? ''), ...plain(analysis) }),
    meta(obj) { metaObj = { ...metaObj, ...plain(obj) } },
    /** Закрытый словарь ступени (раз на уникальный): какие фразы вообще мог выдать распознаватель */
    grammar(targets, json) {
      const key = String(json)
      if (grammars.has(key)) return
      let phrases = []
      try { phrases = JSON.parse(key) } catch { /* не JSON — оставим пусто */ }
      grammars.set(key, { targets, phrases })
      push('grammar', null, { targets, phrases: phrases.length })
    },
    /** Единый вход слушателя: kind = partial | final | mute | level | grammar | status | stop | ... (остальное — просто событие) */
    listen(kind, d) {
      if (kind === 'level') { log.level(d); return }
      const { raw, ...rest } = plain(d)
      if (kind === 'partial') log.partial(raw, rest)
      else if (kind === 'final') log.final(raw, rest)
      else if (kind === 'mute') log.mute(rest.ms)
      else if (kind === 'grammar') log.grammar(rest.targets, rest.grammar)
      else log.event(kind, raw === undefined ? rest : { raw, ...rest })
    },
    dump() {
      let mic = null
      try { mic = describeMic?.() ?? null } catch { mic = null }
      const { phrase = '', chunks = [], ...rest } = metaObj
      let more = null
      try { more = extras?.() ?? null } catch { more = null }
      const sorted = events.slice().sort((a, b) => a.t - b.t) // ext-события приходят с прошлым временем (до старта игры)
      return { version: DEBUG_VERSION, startedAt: new Date(t0).toISOString(), startedAtMs: t0, device, mic, phrase, chunks, ...rest, ...(more ?? {}), grammar: [...grammars.values()], dropped, events: sorted }
    },
  }
  return log
}
