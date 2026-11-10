// «Здоровье микрофона» стенда пилюль (v3.3.180, замечание владельца: «ничего не воспринимает, микрофон перестал гореть жёлтым» — в трассе rms ровно 0 сорок секунд, слушатель «dead», а стенд
// поток не переоткрывал). Сигналы смерти: слушатель слов отдал status 'dead' (RMS ровно 0 дольше DEAD_MS), уровень ровно 0 дольше ZERO_MS при запущенном слушателе, дорожка игрового потока
// оборвана (readyState 'ended') или заглушена системой (muted / событие mute). Оживление — тем же путём, что игра:
//  • тишина (rms 0 / dead) — renewGameMic (gameMicRenew.js: dropGameMic + openGameMic, без жеста, как useWordLaneFlow); снова оглох за AGAIN_MS — значит, без жеста не выйдет: плашка;
//  • заглушена — ждём unmute MIC_REVIVE_MS (gameMicKeep.waitUnmute), не ожила — плашка; оборвана — сразу плашка (getUserMedia вне жеста на iOS показывает диалог доступа, v3.3.128);
//  • плашка «Микрофон отключился — нажми, чтобы включить»: reopen() зовётся СИНХРОННО в тапе (getUserMedia в жесте).
// Ожил — onRevived(how): стенд перезапускает слушатель и пилюлю той же цели. В трассу: 'mic-dead' { why, readyState, muted, attempts }, 'mic-revive' { how, attempts, ms }, 'mic-revive-fail'.
// Чистая логика: зависимости (renew, reopen, tracks, waitUnmute, now) подставляются; React-обёртка — useStandMicHealth.js.
export const ZERO_MS = 2000   // уровень ровно 0 столько — оглох (живой микрофон всегда шумит)
export const AGAIN_MS = 8000  // оглох снова так скоро после авто-оживления — дальше только тапом
export const WHY_TITLE = { dead: 'слушатель: тишина (dead)', rms0: 'rms ровно 0', ended: 'дорожка оборвана', mute: 'дорожка заглушена' }

export function createMicHealth({ trace, renew, reopen, tracks = () => ({}), waitUnmute = () => Promise.resolve(false), onRevived = () => {}, onState = () => {}, now = () => performance.now() }) {
  let state = 'ok', attempts = 0, autoAt = -Infinity, zeroSince = null, deadAt = 0, why = '', disposed = false
  const set = (s, extra = {}) => { state = s; onState({ state, why, attempts, ...extra }) }
  const revived = how => {
    if (disposed) return
    trace.push('mic-revive', { how, attempts, ms: Math.round(now() - deadAt), ...tracks() })
    zeroSince = null
    set('ok')
    onRevived(how)
  }
  const failed = (how, result) => { if (disposed) return; trace.push('mic-revive-fail', { how, result, attempts, ...tracks() }); set('tap', { result }) }
  const api = {
    state: () => state,
    /** Сигнал смерти: kind — 'dead' | 'rms0' | 'ended' | 'mute' */
    dead(kind) {
      if (disposed || state !== 'ok') return
      const tr = tracks()
      why = tr.readyState === 'ended' ? 'ended' : kind
      deadAt = now()
      trace.push('mic-dead', { why, signal: kind, attempts, ...tr })
      if (why === 'ended' || now() - autoAt < AGAIN_MS) { set('tap'); return }
      if (why === 'mute') { set('reviving'); waitUnmute().then(ok => { if (state !== 'reviving') return; if (ok) revived('unmute'); else failed('unmute', 'не ожила') }); return }
      attempts++; autoAt = now()
      set('reviving')
      Promise.resolve(renew(WHY_TITLE[why] ?? why)).then(r => { if (state !== 'reviving') return; if (r === 'granted') revived('авто'); else failed('авто', r) }, e => failed('авто', String(e?.message ?? e)))
    },
    /** Тап по плашке — СИНХРОННО из обработчика нажатия (getUserMedia в жесте) */
    tap() {
      if (disposed || state === 'ok') return Promise.resolve('ok')
      attempts++
      set('reviving')
      return Promise.resolve(reopen()).then(r => { if (r === 'granted') { autoAt = -Infinity; revived('тап') } else failed('тап', r); return r })
    },
    /** Уровень куска звука при запущенном слушателе */
    level(rms) {
      if (state !== 'ok') return
      if (rms > 0) { zeroSince = null; return }
      zeroSince ??= now()
      if (now() - zeroSince >= ZERO_MS) { zeroSince = null; api.dead('rms0') }
    },
    /** Слушатель остановлен (цель сменилась, просмотр): отсчёт тишины сначала */
    idle() { zeroSince = null },
    dispose() { disposed = true },
  }
  return api
}

/** Строка «микрофон: …» для шапки отчёта из событий трассы */
export function micHealthLine(events) {
  const dead = events.filter(e => e.k === 'mic-dead'), rev = events.filter(e => e.k === 'mic-revive'), fail = events.filter(e => e.k === 'mic-revive-fail')
  if (!dead.length && !rev.length && !fail.length) return 'без сбоев'
  const whys = [...new Set(dead.map(e => WHY_TITLE[e.why] ?? e.why))].join(' · ')
  const how = ['авто', 'тап', 'unmute'].map(h => [h, rev.filter(e => e.how === h).length]).filter(([, n]) => n).map(([h, n]) => `${h} ${n}`).join(', ')
  const last = dead.at(-1)
  const tail = last ? `; последний сбой ${(last.t / 1000).toFixed(1).replace('.', ',')} с: readyState ${last.readyState ?? '—'}, muted ${last.muted ?? '—'}` : ''
  const times = n => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'раза' : 'раз')
  return `оглох ${dead.length} ${times(dead.length)} (${whys || '—'}), ожил ${rev.length}${how ? ` (${how})` : ''}${fail.length ? `, не ожил ${fail.length}` : ''}, попыток ${Math.max(0, ...dead.map(e => e.attempts ?? 0), ...rev.map(e => e.attempts ?? 0))}${tail}`
}
