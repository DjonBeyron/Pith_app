// Жёсткий перезапуск звука игры по возврату из фона — ОДИН координатор на тап «Продолжить» (жест). Владелец (iPhone, iOS 18.7, Safari): «свернул игру, вернулся — игра полностью без звука»;
// пересоздание одного игрового контекста (v3.3.110/113/116) не помогло: пока жив хоть один старый контекст страницы, WebKit не переактивирует аудиосессию (gameAudioRenew.js). Путь один — тот же, что у старта после фона:
//  1. журнал «ДО»: игровой контекст, контекст звуков интерфейса, контексты захвата Vosk, дорожки микрофона, тип аудиосессии;
//  2. обрываем все источники (stopGameBuffers); голос — старые дорожки микрофона останавливаются (closeGameMic). Тап: микрофон координатор не трогает (CONCEPT_RACE «Микрофон в „Тапаю“»);
//  3. renewAudioSession: audioSession.type = 'auto' → закрыть ВСЕ AudioContext страницы (реестр: игровой, интерфейса, захваты) и дождаться → тип (голос — gameAudioSession.begin, тап — 'auto') →
//     новый игровой контекст → беззвучный буфер + resume → 'running'. Контекст интерфейса НЕ создаётся заранее: его создаст preloadSounds в wakeGameAudio — уже после игрового;
//  4. start(deps) — прежний путь старта (wordLaneStart.startGameAudio) с deps.renewed (сессию второй раз не обновлять), deps.openMic (голос: getUserMedia заново). AudioBuffer контекст-независимы — не перекачиваются;
//  5. разблокировка беззвучным буфером + resume() — ещё раз, уже после getUserMedia.
// Потом: ждём 'running' (gameAudioCheck.waitCtxRunning); не вышло — пересоздаём контекст ещё раз и ждём снова; пробный тихий звук должен доиграть за PROBE_MS (время контекста идёт).
// Итог { ok, mic, ctx, probe, steps, failed, ms }: ok = false — вызывающий оставляет паузу с «Звук не вернулся, нажми ещё раз». Слушатель Vosk пересоздаёт перезапуск ступени (новый поток).
// Каждый шаг — строка «[audio] перезапуск: …»; итог — «[audio] перезапуск: ПОСЛЕ — …». Все зависимости подставляются (тесты без DOM).
import { gameCtxState, peekGameCtx, recreateGameCtx, unlockGameCtx } from './gameAudioCtx.js'
import { stopGameBuffers, startedCount } from './gameBufferPlay.js'
import { soundCtxState } from './sounds.js'
import { captureStates } from './vosk/voskCapture.js'
import { micTracksLine, closeGameMic, openGameMic } from './gameMic.js'
import { consumeRewake } from './gameAudioLife.js'
import { waitCtxRunning, probeCtx } from './gameAudioCheck.js'
import { renewAudioSession } from './gameAudioRenew.js'
import { gameAudioSession } from './gameMicSession.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

export const SOUND_DEAD_TEXT = 'Звук не вернулся, нажми «Продолжить» ещё раз'

const sessionLine = (nav = globalThis.navigator) => { try { const s = nav?.audioSession; return s ? `${s.type ?? '—'}/${s.state ?? '—'}` : 'нет API' } catch { return 'недоступно' } }
const activeNow = () => { try { return globalThis.navigator?.userActivation?.isActive !== false } catch { return true } }

const DEFAULTS = {
  ctxState: gameCtxState, peekCtx: peekGameCtx, recreateCtx: recreateGameCtx, unlockCtx: unlockGameCtx, renew: renewAudioSession, voiceType: () => gameAudioSession.begin(),
  stopBuffers: stopGameBuffers, started: startedCount, uiState: soundCtxState, captures: captureStates,
  micLine: micTracksLine, closeMic: closeGameMic, openMic: openGameMic, consume: consumeRewake, session: sessionLine, active: activeNow,
  waitRunning: waitCtxRunning, probe: probeCtx, log: pLog, note: gameAudioNote, now: () => performance.now(),
}

/**
 * Вызывать СИНХРОННО в обработчике тапа. voice — голосовой режим (микрофон перезапускается), why — для журнала, start(deps) — прежний старт звука (startGameAudio с deps.renewed, deps.openMic, deps.consume).
 * → промис итога (не отклоняется). over — подмена зависимостей (тесты).
 */
export function restartGameAudio({ voice = true, why = 'Продолжить', start }, over = {}) {
  const d = { ...DEFAULTS, ...over }
  const t0 = d.now()
  const steps = []
  const safe = fn => { try { return fn() } catch (e) { d.log(`[audio] перезапуск: шаг упал — ${e?.message ?? e}`); return null } }
  const step = (name, extra = '') => { steps.push(name); d.log(`[audio] перезапуск: ${name}${extra ? ` — ${extra}` : ''}`); d.note('audio-restart', { step: name, extra, ms: Math.round(d.now() - t0) }) }
  const states = () => `игровой ctx=${d.ctxState() ?? 'нет'}, ctx интерфейса=${d.uiState() ?? 'нет'}, ctx микрофона=[${(d.captures() ?? []).join(',') || 'нет'}], дорожки=${d.micLine()}, audioSession=${d.session()}`
  const started0 = d.started()

  d.log(`[audio] перезапуск (${why}, режим ${voice ? 'голос' : 'тап'}): ДО — ${states()}`)
  safe(d.stopBuffers); step('stop-buffers', 'источники старого контекста оборваны')
  if (voice) { const before = d.micLine(); safe(d.closeMic); step('mic-stop', `старые дорожки остановлены (были ${before})`) } else step('mic-keep', 'режим тапа: микрофон координатор не трогает')

  const renewing = (async () => d.renew({ reason: `«${why}»`, wantType: voice ? null : 'auto', applyType: voice ? d.voiceType : null }))().catch(e => { d.log(`[audio] перезапуск: обновление сессии упало — ${e?.message ?? e}`); return null })
  return renewing.then(rn => {
    step('renew', `auto → закрыто ${rn?.closed ?? 0}${rn?.kinds?.length ? ` (${rn.kinds.join(', ')})` : ''} → тип ${rn?.type ?? '—'} → новый ctx ${rn?.state ?? 'нет'} за ${rn?.ms ?? '—'} мс`)
    const openMic = () => { step('mic-open', 'getUserMedia в жесте'); return Promise.resolve(d.openMic()) }
    const deps = { consume: () => d.consume() ?? `жёсткий перезапуск (${why})`, renewed: true, ...(voice ? { openMic } : {}) }
    let run
    try { run = Promise.resolve(start(deps)) } catch (e) { run = Promise.reject(e) }
    const unlocked = safe(d.unlockCtx)
    step('unlock', `беззвучный буфер + resume в жесте, ctx=${d.ctxState() ?? 'нет'}`)
    Promise.resolve(unlocked).catch(() => {})
    return finish(run)
  })

  function finish(run) {
    return run.catch(e => { d.log(`[audio] перезапуск: старт звука упал — ${e?.message ?? e}`); return { mic: 'unavailable', error: e } }).then(async r => {
      const mic = r?.mic ?? 'unavailable'
      step('start-done', `микрофон ${mic}, дорожки ${d.micLine()}, ctx=${d.ctxState() ?? 'нет'}`)
      let w = await d.waitRunning(() => d.peekCtx())
      step('wait-running', `${w.state ?? 'нет Web Audio'} за ${w.ms} мс, resume ×${w.tries}`)
      if (w.state != null && w.state !== 'running' && (voice || d.active())) {
        d.recreateCtx(`не стал running за ${w.ms} мс после «${why}»`)
        safe(d.unlockCtx)
        w = await d.waitRunning(() => d.peekCtx())
        step('wait-running-2', `${w.state ?? 'нет'} за ${w.ms} мс, resume ×${w.tries}`)
      }
      const pr = await d.probe(d.peekCtx())
      step('probe', pr.ok ? `пробный звук доиграл за ${pr.ms} мс` : `НЕ доиграл: ${pr.why}`)
      const ctxOk = w.state == null || w.state === 'running'
      const ok = ctxOk && pr.ok
      const failed = ok ? null : !ctxOk ? `контекст ${w.state}` : `пробный звук: ${pr.why}`
      if (voice && ok) step('listener', 'слушатель Vosk пересоздаётся с новым потоком при перезапуске ступени')
      const ms = Math.round(d.now() - t0)
      d.log(`[audio] перезапуск: ПОСЛЕ — ${states()}; источников стартовало ${d.started() - started0}; итог ${ok ? 'звук жив' : `ЗВУК НЕ ВЕРНУЛСЯ (${failed})`}, ${ms} мс с тапа`)
      d.note('audio-restart', { step: 'done', ok, failed, mic, ctx: w.state, ms })
      return { ok, mic, needsTap: !!r?.needsTap, ctx: w.state, probe: pr, steps, failed, ms }
    })
  }
}
