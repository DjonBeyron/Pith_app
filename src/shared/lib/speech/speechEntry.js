// Запись журнала одной попытки распознавания (speechController → onEntry): тайминги событий, исход, стратегия перезапуска, метки «глухой» сессии.
// deaf — подозрение на «глухую» сессию (speechDeaf.js); deaf_retry — эта попытка запущена авто-восстановлением; reused — переиспользован экземпляр (S2/S5);
// gapMs — сколько прошло от закрытия прошлого экземпляра до этого запуска; msSound — первый soundstart/speechstart/результат (мс от старта попытки).
export function buildEntry(a, { error, last, outcome, runNo, mode, conf, extra }) {
  return {
    t: a.startedAt, mode, permBefore: a.permBefore, permAfter: 'unavailable',
    msStart: a.msStart, msAudio: a.msAudio, msResult: a.msResult, error,
    retry: a.retry, run: runNo, last, outcome, strategy: a.strat.id, gapMs: a.gapMs, msSound: a.msSound,
    ...(a.reused ? { reused: true } : {}), ...(a.deaf ? { deaf: true } : {}), ...(a.deafRetry ? { deaf_retry: true } : {}),
    conf, ...extra,
  }
}

/** Начальное состояние попытки (одного экземпляра recognition) для speechController */
export const newAttempt = (id, retry, { startedAt, t0, strat, reused, deafRetry, gapMs, capMode }) => ({
  id, retry, rec: null, startedAt, t0, permBefore: 'unavailable', strat, reused, deafRetry, gapMs, capMode, capInfo: null, capClosed: false,
  ended: false, deaf: false, msStart: null, msAudio: null, msResult: null, msSound: null, done: false, gotFinal: false, userStop: false, audio: false,
  lastInterim: '', permTimer: null, silenceTimer: null, forceTimer: null, deafTimer: null, history: [], continuous: false, segs: [], segText: '', segTimer: null,
})
