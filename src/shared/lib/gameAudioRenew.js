// Полное обновление аудиосессии страницы перед игрой после фона/блокировки (iPhone, iOS 18.7, Safari: «телефон пролежал 20 минут, вернулся, игра полностью беззвучная», хотя контекст 'running',
// источники стартуют и доигрывают). Причина (разбор той же ошибки WebKit, moku-labs/game PR #169): страница задаёт navigator.audioSession.type ('play-and-record' на время игры, gameMicSession.js);
// при уходе в фон iOS деактивирует аудиосессию, а WebKit считает её активной (AudioSession::m_active), пока жив хоть один медиа-сеанс страницы, — новый AudioContext не перезапускает вывод: «running», но тишина.
// Флаг сбрасывает только закрытие ПОСЛЕДНЕГО контекста. Рецепт, строго по порядку (renewAudioSession):
//  1. журнал «ДО»: все контексты страницы (audioContextRegistry.describe) и navigator.audioSession type/state;
//  2. audioSession.type = 'auto' — снять override;
//  3. closeAll() — закрыть ВСЕ AudioContext страницы (игровой, звуков интерфейса, захвата Vosk, уровня…) и дождаться close();
//  4. записать нужный тип: голосом — applyType (gameAudioSession.begin: 'play-and-record' по настройке), пальцами — wantType ('auto');
//  5. новый игровой контекст (recreateGameCtx) → беззвучный буфер + resume (unlockGameCtx) → ждём 'running' (waitCtxRunning);
//  6. журнал «[audio] renew (причина): ДО — …; auto; закрыто N (…); тип …; новый ctx running за X мс; ПОСЛЕ — …».
// Когда нужно (renewNeed): был фон дольше RENEW_AWAY_MS, ИЛИ живы контексты, созданные до последнего ухода в фон, ИЛИ audioSession.state ≠ 'active'. Зависимости подставляются (тесты).
import { describe as describeCtxs, liveContexts, closeAll } from './audioContextRegistry.js'
import { recreateGameCtx, unlockGameCtx, peekGameCtx } from './gameAudioCtx.js'
import { waitCtxRunning } from './gameAudioCheck.js'
import { lastAway } from './gameAudioLife.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

export const RENEW_AWAY_MS = 20000 // фон/блокировка дольше — обновляем сессию полностью

/** navigator.audioSession → { type, state } или null (нет API) */
export const sessionOf = nav => { try { const s = nav?.audioSession; return s ? { type: s.type ?? null, state: s.state ?? null } : null } catch { return null } }
export const sessionText = s => (s ? `${s.type ?? '—'}/${s.state ?? '—'}` : 'нет API')
const setType = (nav, type) => { try { if (nav?.audioSession) { nav.audioSession.type = type; return true } } catch { /* тип не записался — журнал покажет */ } return false }

/** Нужно ли полное обновление перед стартом игры? → причина (строка) или null. suspect — пометка «звук после фона» (gameAudioLife.consumeRewake) */
export function renewNeed({ suspect = null, away = lastAway(), live = liveContexts(), session = sessionOf(globalThis.navigator), awayMs = RENEW_AWAY_MS } = {}) {
  const why = []
  if (suspect && away?.awayMs != null && away.awayMs >= awayMs) why.push(`фон ${Math.round(away.awayMs / 1000)} с`)
  const old = away?.hiddenAt != null ? live.filter(r => r.createdAt < away.hiddenAt) : []
  if (old.length) why.push(`живы контексты старше ухода в фон: ${old.map(r => r.kind).join(', ')}`)
  if (session?.state && session.state !== 'active') why.push(`audioSession.state=${session.state}`)
  return why.length ? why.join('; ') : null
}

const DEFAULTS = {
  describe: () => describeCtxs(), closeAll: () => closeAll(), recreateCtx: recreateGameCtx, unlockCtx: unlockGameCtx, peekCtx: peekGameCtx,
  waitRunning: getCtx => waitCtxRunning(getCtx), log: pLog, note: gameAudioNote, now: () => performance.now(),
}

/**
 * Обновить аудиосессию: auto → закрыть все контексты → тип → новый игровой контекст → running. Звать из жеста (старт игры, «Продолжить»): закрытие занимает единицы мс, жест ещё жив.
 * wantType — тип, если applyType не задан ('auto' — оставить снятым); applyType() — записать тип своим способом (голос: gameAudioSession.begin). → { ok, state, closed, kinds, type, steps, ms } (не отклоняется)
 */
export async function renewAudioSession({ reason = 'старт', wantType = null, applyType = null } = {}, over = {}) {
  const d = { ...DEFAULTS, nav: globalThis.navigator, ...over }
  const t0 = d.now()
  const steps = []
  const safe = fn => { try { return fn() } catch (e) { d.log(`[audio] renew: шаг упал — ${e?.message ?? e}`); return null } }
  const before = `${safe(d.describe) ?? '—'}; audioSession=${sessionText(sessionOf(d.nav))}`
  d.log(`[audio] renew (${reason}): ДО — ${before}`)
  setType(d.nav, 'auto'); steps.push('auto')
  let c
  try { c = await d.closeAll() } catch { c = null }
  c ??= { closed: 0, kinds: [], timedOut: 0 }
  steps.push('close')
  if (applyType) safe(applyType)
  else if (wantType && wantType !== 'auto') setType(d.nav, wantType)
  const type = sessionOf(d.nav)?.type ?? '—'
  steps.push('type')
  const tc = d.now()
  safe(() => d.recreateCtx(`обновление аудиосессии: ${reason}`)); steps.push('create')
  safe(d.unlockCtx); steps.push('unlock')
  let w
  try { w = await d.waitRunning(() => d.peekCtx()) } catch { w = null }
  w ??= { state: d.peekCtx()?.state ?? null, tries: 0, ms: 0 }
  steps.push('running')
  const ctxMs = Math.round(d.now() - tc), ms = Math.round(d.now() - t0)
  const after = `${safe(d.describe) ?? '—'}; audioSession=${sessionText(sessionOf(d.nav))}`
  const kinds = c.kinds?.length ? ` (${c.kinds.join(', ')})` : ''
  d.log(`[audio] renew (${reason}): ДО — ${before}; auto; закрыто ${c.closed}${kinds}${c.timedOut ? `, не дождались ${c.timedOut}` : ''}; тип ${type}; новый ctx ${w.state ?? 'нет Web Audio'} за ${ctxMs} мс; ПОСЛЕ — ${after}; всего ${ms} мс`)
  const ok = w.state == null || w.state === 'running'
  try { d.note('audio-renew', { reason, closed: c.closed, kinds: c.kinds, type, state: w.state, ms }) } catch { /* журнал не мешает */ }
  return { ok, state: w.state, closed: c.closed, kinds: c.kinds ?? [], type, steps, ms }
}
