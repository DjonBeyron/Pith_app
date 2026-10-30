import { gameStartTrace, TRACE_WINDOW_MS } from '../../../../shared/lib/gameStartTrace.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { catDebug } from './wordLaneCatDebug.js'
import { pLog } from '../../../../shared/lib/debug.js'

// Диагностика «в начале кот говорит без звука» (iPhone): для КАЖДОЙ реплики кота в первые TRACE_WINDOW_MS (15 с) с тапа «Начать» — одна строка в журнале плеера «[cat-voice] реплика <id>: …» и событие
// 'cat-voice' в журнале отладки игры (из него экспорт строит раздел «Почему первая реплика тихая», wordLaneSilentDiag.js). В строке: откуда звук (слот библиотеки / голос системы / нет озвучки), состояние слота
// (readyState, prepared — разбужен тишиной и звук подставлен, interrupted — iOS прерывал аудиосессию уже ПОСЛЕ пробуждения слота), исход play() (ok — принят и пришло 'playing' / rejected + имя ошибки /
// не заиграл — принят, а 'playing' нет за 700 мс), userActivation (жив / истёк), navigator.audioSession.type, мс с тапа и с settle, число прерываний с тапа и сколько реплика ждала слот.
// Снимок окружения делается В МОМЕНТ старта реплики (openCatVoice), исход play() приходит позже (≤ 700 мс) — тогда строка и пишется.
export const SOURCE_TEXT = { slot: 'слот библиотеки', buffer: 'буфер Web Audio', synth: 'голос системы', none: 'нет озвучки' }
export const NO_SYNTH_TEXT = 'нет (синтез запрещён)' // слот не успел, а голоса системы в игре нет — реплика подписью
export const PLAY_TEXT = { started: 'started (буфер стартовал)', 'ctx-stuck': 'контекст не запущен', ok: 'ok (playing пришло)', rejected: 'отклонён', 'no-playing': 'не заиграл за 700 мс (нет playing)', 'no-start': 'не начал говорить за 700 мс (нет start)', pending: 'без ответа за 700 мс', 'n/a': 'не вызывался' }

// Буферный путь (Web Audio): слот = декодированный AudioBuffer. started — источник стартовал (playMs — через сколько мс с вызова: «started at +N мс»); ctx-stuck — AudioContext не стал 'running' за 300 мс (прерван iOS / не открыт в жесте).
const yn = v => (v === true ? 'да' : v === false ? 'нет' : '—')

/** Данные события → читаемая строка журнала плеера */
export function formatCatVoice(d) {
  if (d.slot?.buffer) {
    const res = d.play === 'started' ? `start() → started at +${d.playMs ?? 0} мс` : `start() → ${PLAY_TEXT[d.play] ?? d.play}${d.error ? ` (${d.error})` : ''}${d.playMs != null && d.play !== 'n/a' ? `, ${d.playMs} мс` : ''}`
    const act = d.activation === 'alive' ? 'жив' : d.activation === 'expired' ? 'истёк' : '—'
    return `[cat-voice] реплика ${d.id}: источник=${SOURCE_TEXT.buffer}${d.why ? ` (${d.why})` : ''}; буфер: ${d.slot.ms ?? '—'} мс, ctx=${d.slot.ctx ?? '—'}; ${res}; userActivation=${act}; audioSession.type=${d.as ?? '—'}; с тапа ${d.sinceTap ?? '—'} мс; с settle ${d.sinceSettle ?? '—'} мс; прерываний с тапа ${d.interrupts ?? '—'}${d.waitedMs ? `; ждали слот ${d.waitedMs} мс` : ''}`
  }
  const slot = d.slot ? `слот: readyState=${d.slot.rs ?? '—'}, prepared=${yn(d.slot.prepared)}, interrupted=${yn(d.slot.interrupted)}${d.slot.wokeErr ? `, пробуждение отклонено (${d.slot.wokeErr})` : ''}${d.slot.wokeNote === 'aborted' ? ', пробуждение прервано (AbortError — не отказ)' : ''}` : 'слота нет'
  const play = `${d.source === 'synth' ? 'speak()' : 'play()'} → ${PLAY_TEXT[d.play] ?? d.play}${d.error ? ` (${d.error})` : ''}${d.playMs != null && d.play !== 'n/a' ? `, ${d.playMs} мс` : ''}`
  const act = d.activation === 'alive' ? 'жив' : d.activation === 'expired' ? 'истёк' : '—'
  return `[cat-voice] реплика ${d.id}: источник=${d.noSynth ? NO_SYNTH_TEXT : (SOURCE_TEXT[d.source] ?? d.source)}${d.why ? ` (${d.why})` : ''}; ${slot}; ${play}; userActivation=${act}; audioSession.type=${d.as ?? '—'}; с тапа ${d.sinceTap ?? '—'} мс; с settle ${d.sinceSettle ?? '—'} мс; прерываний с тапа ${d.interrupts ?? '—'}${d.waitedMs ? `; ждали слот ${d.waitedMs} мс` : ''}`
}

/** Окружение звука сейчас: userActivation ('alive' | 'expired' | null), audioSession.type, мс с тапа и с settle, прерываний с тапа, когда было последнее прерывание (performance.now) */
export function audioEnv({ trace = gameStartTrace, warm = gameAudioWarm, nav = globalThis.navigator } = {}) {
  let activation = null
  let as = null
  try { activation = nav?.userActivation ? (nav.userActivation.isActive ? 'alive' : 'expired') : null; as = nav?.audioSession?.type ?? null } catch { /* без API */ }
  const st = warm.status?.() ?? {}
  return { activation, as, sinceTap: trace.sinceTap(), sinceSettle: trace.since('settle'), interrupts: st.interrupts ?? null, lastInterruptAt: st.lastInterruptAt ?? 0 }
}

/**
 * Начало реплики: снимок окружения сейчас → функция done(res), которую зовут с исходом play() ({ play, error?, ms }) или без аргумента (звука не было). Вне первых 15 с игры — пустая функция.
 * source: 'slot' | 'buffer' | 'none' (noSynth — слот не успел, голоса системы нет; 'synth' — только в старых журналах); slot — wordSlotInfo (до play()); waitedMs — сколько реплика ждала слот; why — почему такой источник (например «слот не успел за 1500 мс»).
 */
export function openCatVoice({ id, source, slot = null, waitedMs = 0, why = null, noSynth = false }, { trace = gameStartTrace, warm = gameAudioWarm, nav = globalThis.navigator, log = pLog, emit = catDebug, windowMs = TRACE_WINDOW_MS } = {}) {
  if (!trace.inWindow(windowMs)) return () => {}
  const { activation, as, sinceTap, sinceSettle, interrupts, lastInterruptAt } = audioEnv({ trace, warm, nav })
  const st = { lastInterruptAt }
  const interrupted = slot && slot.wokeAt > 0 ? st.lastInterruptAt > slot.wokeAt : null
  const base = {
    id, source, ...(noSynth ? { noSynth: true } : {}), ...(why ? { why } : {}), waitedMs: Math.round(waitedMs),
    slot: slot ? { rs: slot.rs, prepared: !!slot.prepared, interrupted, paused: slot.paused, hasUrl: !!slot.hasUrl, ...(slot.buffer ? { buffer: true, ms: slot.ms ?? null, ctx: slot.ctx ?? null } : {}), ...(slot.wokeErr ? { wokeErr: slot.wokeErr } : {}), ...(slot.wokeNote ? { wokeNote: slot.wokeNote } : {}) } : null,
    activation, as, sinceTap, sinceSettle, interrupts,
  }
  let sent = false
  return res => {
    if (sent) return
    sent = true
    const d = { ...base, play: res?.play ?? 'n/a', ...(res?.error ? { error: res.error } : {}), ...(res?.ms != null ? { playMs: res.ms } : {}) }
    try { log(formatCatVoice(d)) } catch { /* журнал не мешает игре */ }
    try { emit('cat-voice', d, { quiet: true }) } catch { /* отладка не мешает игре */ }
  }
}
