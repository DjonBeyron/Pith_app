// «Хроника режима запуска звука» в журнале игры (v3.3.336). Владелец на iPhone: при старте игры всплывает системный ползунок громкости и сам идёт вверх; он по очереди пробует режимы запуска
// (Админ → «Голос» → «Режим запуска звука на iPhone», gameAudioSettings.js) и шлёт журнал в GitHub. Чтобы по журналу было видно влияние режима, на каждом шаге старта пишется строка одного вида:
//   «[start-mode] <метка>: режим=direct, тип сессии игры=playback; audioSession=playback/active; ctx игры=running 48000 Гц задержка 5/21 мс; ctx звуков=running 48000 Гц; другие ctx=нет;
//    микрофон=live muted=нет enabled=да (эхо нет, шум нет, AGC да, 48000 Гц); вкладка=visible; +N мс с тапа; изменилось: audioSession, ctx игры»
// Метки: тап → после begin → getUserMedia вызван → getUserMedia ответил → после afterMic → settle → первая реплика → серия по таймеру (SERIES_MS после ответа микрофона: тип и задержка «догоняют» позже).
// Пишется ВСЕГДА, и в режиме default — чтобы было с чем сравнивать (~12 строк на старт).
// ТОЛЬКО ЧТЕНИЕ: модуль ничего не пишет в navigator.audioSession, не создаёт и не будит контексты, не открывает микрофон, ни на что не подписывается. Смена типа сессии уже идёт в журнал строкой
// «[note] audio-session {…}» (gameMicSession.js → gameAudioSink.js), события — строками «[page] audioSession: смена состояния», «[page] devicechange…», «[page] дорожка микрофона…» (gameJournalPage.js),
// «[game-audio] AudioContext игры → …» (gameAudioCtx.js), «[mic] глух N мс» (gameMic.js) — здесь не дублируются.
// Системный уровень громкости iOS и сам факт показа ползунка из страницы прочитать НЕЛЬЗЯ (такого API нет): косвенные признаки — тип/состояние аудиосессии, задержка вывода и частота контекста (меняются при смене маршрута).
import { peekGameCtx } from './gameAudioCtx.js'
import { liveContexts } from './audioContextRegistry.js'
import { readStartMode, readAudioSessionMode } from './gameAudioSettings.js'
import { pLog } from './debug.js'

// Игровой поток микрофона отдаёт gameMic.js (setStartModeMic(peekGameMic)): этот модуль его не импортирует — без кольца импортов (gameMic зовёт хронику из openGameMic). Контекст звуков интерфейса и прочие
// берём из реестра контекстов (audioContextRegistry.js), а не из sounds.js — у того побочные эффекты при загрузке.
let micGetter = () => null
export function setStartModeMic(fn) { micGetter = typeof fn === 'function' ? fn : () => null }
const otherContexts = () => liveContexts().filter(r => r.kind !== 'game').map(r => ({ kind: r.kind, state: r.state, rate: r.ctx?.sampleRate ?? null }))

export const SERIES_MS = [250, 500, 1000, 2000, 4000] // снимки по таймеру после ответа микрофона

const yn = v => (v == null ? '—' : v ? 'да' : 'нет')
const lat = s => (typeof s === 'number' && Number.isFinite(s) ? Math.round(s * 1000) : '—')

/** Снимок состояния звука (только чтение). Всё внешнее подставляется (тесты); чего нет — null */
export function startSnapshot({ nav = globalThis.navigator, doc = globalThis.document, store = globalThis.localStorage, ctx = peekGameCtx, others = otherContexts, mic = () => micGetter() } = {}) {
  const safe = (fn, fb = null) => { try { return fn() ?? fb } catch { return fb } }
  const as = safe(() => nav?.audioSession)
  const c = safe(ctx)
  const tracks = safe(() => { const s = mic(); return s?.getAudioTracks?.() ?? s?.getTracks?.() ?? [] }, [])
  return {
    mode: safe(() => readStartMode(store), '—'),
    sessionMode: safe(() => readAudioSessionMode(store), '—'),
    session: as ? { type: safe(() => as.type, '—'), state: safe(() => as.state, '—') } : null,
    ctx: c ? { state: safe(() => c.state, '—'), rate: safe(() => c.sampleRate), base: safe(() => c.baseLatency), out: safe(() => c.outputLatency) } : null,
    others: safe(others, []), // остальные живые AudioContext страницы: sounds — звуки интерфейса, capture — захват распознавания и т. п.
    tracks: tracks.map(t => {
      const st = safe(() => t.getSettings?.(), {})
      return { readyState: safe(() => t.readyState, '—'), muted: safe(() => t.muted), enabled: safe(() => t.enabled), echo: st.echoCancellation ?? null, noise: st.noiseSuppression ?? null, agc: st.autoGainControl ?? null, rate: st.sampleRate ?? null }
    }),
    vis: safe(() => doc?.visibilityState, '—'),
  }
}

/** Части строки по именам (по ним же считается «изменилось») */
export function snapshotParts(s) {
  const micOf = t => `${t.readyState} muted=${yn(t.muted)} enabled=${yn(t.enabled)} (эхо ${yn(t.echo)}, шум ${yn(t.noise)}, AGC ${yn(t.agc)}, ${t.rate ?? '—'} Гц)`
  const ctxOf = kind => s.others.filter(o => o.kind === kind).map(o => `${o.state ?? '—'} ${o.rate ?? '—'} Гц`).join(', ') || 'нет'
  return {
    audioSession: s.session ? `${s.session.type}/${s.session.state}` : 'нет API',
    'ctx игры': s.ctx ? `${s.ctx.state} ${s.ctx.rate ?? '—'} Гц задержка ${lat(s.ctx.base)}/${lat(s.ctx.out)} мс` : 'нет',
    'ctx звуков': ctxOf('sounds'),
    'другие ctx': s.others.filter(o => o.kind !== 'sounds').map(o => `${o.kind} ${o.state ?? '—'} ${o.rate ?? '—'} Гц`).join(', ') || 'нет',
    микрофон: s.tracks.length ? s.tracks.map(micOf).join(' | ') : 'нет потока',
    вкладка: s.vis,
  }
}

/** Строка журнала: «[start-mode] метка: режим=…, тип сессии игры=…; audioSession=…; …; +N мс с тапа[; изменилось: …]» */
export function snapshotLine(label, s, { sinceMs = null, changed = [] } = {}) {
  const p = snapshotParts(s)
  const body = Object.entries(p).map(([k, v]) => `${k}=${v}`).join('; ')
  return `[start-mode] ${label}: режим=${s.mode}, тип сессии игры=${s.sessionMode}; ${body}; +${sinceMs == null ? '—' : Math.round(sinceMs)} мс с тапа${changed.length ? `; изменилось: ${changed.join(', ')}` : ''}`
}

export function createStartModeLog({ log = pLog, snap = startSnapshot, now = () => globalThis.performance?.now?.() ?? Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) } = {}) {
  let t0 = null, armed = false, prev = null, timers = [], last = null, micAns = null
  const stop = () => { const n = timers.length; for (const id of timers) { try { clearTimer(id) } catch { /* уже сработал */ } } timers = []; return n }
  /** Снимок с меткой → строка (или null); журнал никогда не мешает старту */
  function mark(label) {
    try {
      const s = snap(), parts = snapshotParts(s)
      const changed = prev ? Object.keys(parts).filter(k => parts[k] !== prev[k]) : []
      prev = parts
      const line = snapshotLine(label, s, { sinceMs: t0 == null ? null : now() - t0, changed })
      last = { mode: s.mode, sessionMode: s.sessionMode, type: s.session ? s.session.type : 'нет API', mic: micAns ?? '—', tracks: parts.микрофон, label }
      log(line)
      return line
    } catch { return null }
  }
  return {
    /** Тап «Начать» (до любой смены типа): отсчёт времени, прежняя серия снимается */
    begin() { stop(); try { t0 = now() } catch { t0 = null } armed = true; prev = null; micAns = null; return mark('тап (до смены типа)') },
    mark,
    /** Ответ getUserMedia ДО afterMic (gameMic.openGameMic). Вне старта (повторное открытие в игре) — молчит */
    micAnswer(r) { if (!armed) return null; armed = false; micAns = r; return mark(`getUserMedia ответил: ${r} (до afterMic)`) },
    /** После ответа микрофона и afterMic (startGameAudio): снимок и серия по таймеру. mic — 'granted' | 'denied' | 'unavailable' | 'off' */
    afterMic(mic) {
      if (armed) { armed = false; micAns = mic; mark(`getUserMedia ответил: ${mic}`) } // микрофон не нужен («Тапаю») или подставлен в тесте — отдельной отметки «до afterMic» не было
      mark(`после afterMic (микрофон: ${mic})`)
      stop()
      for (const ms of SERIES_MS) {
        try { const id = setTimer(() => { timers = timers.filter(x => x !== id); mark(`через ${ms} мс после ответа микрофона`) }, ms); timers.push(id) } catch { /* без таймера — без снимка */ }
      }
    },
    /** Конец звука игры / размонтирование: оставшиеся снимки серии не нужны. → сколько снято */
    cancel(why = 'конец игры') {
      armed = false
      const n = stop()
      if (n) { try { log(`[start-mode] серия снимков остановлена (${why}): не снято ${n}`) } catch { /* журнал не мешает */ } }
      return n
    },
    pending: () => timers.length,
    /** Итог последнего старта (последний снимок хроники) или null — живёт в памяти страницы, не в localStorage */
    last: () => last,
  }
}

/** Общий экземпляр игры */
export const gameStartModeLog = createStartModeLog()

/** Для блока админки: «Последний старт: режим X, тип после старта Y, микрофон Z» */
export function lastStartLine(l = gameStartModeLog.last()) {
  if (!l) return 'Последний старт: ещё не было (с загрузки страницы)'
  return `Последний старт: режим ${l.mode}${l.sessionMode === 'playback' ? '' : ` (не действует: тип сессии игры ${l.sessionMode})`}, тип после старта ${l.type}, микрофон ${l.mic}${l.tracks && l.tracks !== 'нет потока' ? ` — ${l.tracks}` : ''} (снимок «${l.label}»)`
}

/** Одна строка для шапки отправляемого журнала: какой режим проверялся */
export function startModeHeadline({ snap = startSnapshot, last = gameStartModeLog.last() } = {}) {
  try {
    const s = snap()
    return `режим запуска звука: ${s.mode}, тип сессии игры: ${s.sessionMode}; audioSession сейчас: ${snapshotParts(s).audioSession}; ${lastStartLine(last)}`
  } catch { return 'режим запуска звука: —' }
}
