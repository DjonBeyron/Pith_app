// Запись журнала одной попытки распознавания (speechController → onEntry): тайминги событий, исход, стратегия перезапуска, метки «глухой» сессии.
// deaf — подозрение на «глухую» сессию (speechDeaf.js); deaf_retry — эта попытка запущена авто-восстановлением; reused — переиспользован экземпляр (S2/S5);
// gapMs — сколько прошло от закрытия прошлого экземпляра до этого запуска; msSound — первый soundstart/speechstart/результат (мс от старта попытки).
// Аудиосессия (диагностика iOS, soundLog.js / speechAudioSession.js): audioBefore — какие звуки играла страница за 6 с до start() («unlock-wav×2, audio-play»),
// audioAgo — мс от последнего из них до start(), audioDuring — что играло во время записи, audioSession — тип navigator.audioSession («auto→play-and-record»).
import { segmentsConfidence } from './speechSegments.js'

export function buildEntry(a, { error, last, outcome, runNo, mode, conf, extra, audioDuring }) {
  return {
    t: a.startedAt, mode, permBefore: a.permBefore, permAfter: 'unavailable',
    msStart: a.msStart, msAudio: a.msAudio, msResult: a.msResult, error,
    retry: a.retry, run: runNo, last, outcome, strategy: a.strat.id, gapMs: a.gapMs, msSound: a.msSound,
    ...(a.reused ? { reused: true } : {}), ...(a.deaf ? { deaf: true } : {}), ...(a.deafRetry ? { deaf_retry: true } : {}),
    ...(a.audioBefore != null ? { audioBefore: a.audioBefore, audioAgo: a.audioAgo, audioDuring: audioDuring ?? '' } : {}),
    ...(a.sessionInfo ? { audioSession: a.sessionInfo } : {}),
    conf, ...extra,
  }
}

/**
 * Исход попытки по коду завершения (null — end без ошибки): { outcome: ok|stopped|error, error, alt }. alt — промежуточный текст, принятый как итог
 * (iOS иногда заканчивает без final; в режиме continuous — склейка сегментов), иначе null
 */
export function resolveOutcome(a, code) {
  const stopped = a.userStop && (code == null || code === 'aborted' || code === 'no-speech')
  const partial = a.continuous ? a.segText : a.lastInterim
  if (a.gotFinal) return { outcome: 'ok', error: null, alt: null }
  if (partial && (code == null || stopped)) return { outcome: 'ok', error: null, alt: { text: partial.trim(), confidence: a.continuous ? segmentsConfidence(a.segs) : null } }
  if (stopped) return { outcome: 'stopped', error: null, alt: null }
  return { outcome: 'error', error: code ?? 'no-speech', alt: null } // end без результата и без ошибки — для нас то же, что no-speech
}

/** Начальное состояние попытки (одного экземпляра recognition) для speechController */
export const newAttempt = (id, retry, { startedAt, t0, strat, reused, deafRetry, gapMs, capMode }) => ({
  id, retry, rec: null, startedAt, t0, permBefore: 'unavailable', strat, reused, deafRetry, gapMs, capMode, capInfo: null, capClosed: false,
  ended: false, deaf: false, msStart: null, msAudio: null, msResult: null, msSound: null, done: false, gotFinal: false, userStop: false, audio: false,
  lastInterim: '', permTimer: null, silenceTimer: null, forceTimer: null, deafTimer: null, history: [], continuous: false, segs: [], segText: '', segTimer: null,
  audioBefore: null, audioAgo: null, sessionInfo: '', sessionHeld: false, sessionTimer: null,
})
