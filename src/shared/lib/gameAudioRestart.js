// Жёсткий перезапуск звука игры по возврату из фона — ОДИН координатор на тап «Продолжить» (жест). Владелец (iPhone, iOS 18.7, Safari): «свернул игру, вернулся — игра полностью без звука»;
// пересоздание одного игрового контекста (v3.3.110/113/116) не помогло. Здесь поднимается с нуля ВСЁ, что держит звук и микрофон страницы, а потом проверяется, что звук действительно идёт.
// Синхронно в жесте (до первого await):
//  1. журнал «ДО»: игровой контекст, контекст звуков интерфейса, контексты захвата Vosk, дорожки микрофона, тип аудиосессии;
//  2. обрываем все источники (stopGameBuffers: узлы старого контекста не должны остаться висеть) и закрываем ВСЕ контексты: игровой, захвата Vosk (voskCapture), интерфейса (sounds.resetSoundCtx — сразу создаёт новый в жесте);
//  3. голос: старые дорожки микрофона останавливаются (closeGameMic), микрофон открывается заново в этом же жесте — внутри start(), после смены типа сессии (тот же порядок, что «Начать»).
//     Тап: координатор микрофон не трогает (start открывает поток как при первом старте, CONCEPT_RACE «Микрофон в „Тапаю“»);
//  4. start(deps) — прежний путь старта (wordLaneStart.startGameAudio): новый игровой контекст (deps.recreateCtx), тип сессии, микрофон (deps.openMic), буферы, ворота. AudioBuffer контекст-независимы — не перекачиваются;
//     узлы (GainNode, источники) создаются на каждый звук заново (gameBufferPlay) — ноты, взлёт, слова и реплики пойдут через новый контекст;
//  5. разблокировка беззвучным буфером + resume() — ещё раз, уже после getUserMedia.
// Потом: ждём 'running' (statechange, повтор resume — gameAudioCheck.waitCtxRunning); не вышло — пересоздаём контекст ещё раз и ждём снова; пробный тихий звук должен доиграть за PROBE_MS
// (время контекста идёт). Итог { ok, mic, ctx, probe, steps, failed, ms }: ok = false — вызывающий оставляет паузу с «Звук не вернулся, нажми ещё раз». Слушатель Vosk пересоздаёт перезапуск ступени (новый поток).
// Каждый шаг — строка «[audio] перезапуск: …»; итог — «[audio] перезапуск: ПОСЛЕ — …». Все зависимости подставляются (тесты без DOM).
import { gameCtxState, peekGameCtx, closeGameCtx, recreateGameCtx, unlockGameCtx } from './gameAudioCtx.js'
import { stopGameBuffers, startedCount } from './gameBufferPlay.js'
import { soundCtxState, resetSoundCtx } from './sounds.js'
import { captureStates, closeAllCaptures } from './vosk/voskCapture.js'
import { micTracksLine, closeGameMic, openGameMic } from './gameMic.js'
import { consumeRewake } from './gameAudioLife.js'
import { waitCtxRunning, probeCtx } from './gameAudioCheck.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

export const SOUND_DEAD_TEXT = 'Звук не вернулся, нажми «Продолжить» ещё раз'

const sessionLine = (nav = globalThis.navigator) => { try { const s = nav?.audioSession; return s ? `${s.type ?? '—'}/${s.state ?? '—'}` : 'нет API' } catch { return 'недоступно' } }
const activeNow = () => { try { return globalThis.navigator?.userActivation?.isActive !== false } catch { return true } }

const DEFAULTS = {
  ctxState: gameCtxState, peekCtx: peekGameCtx, closeCtx: closeGameCtx, recreateCtx: recreateGameCtx, unlockCtx: unlockGameCtx,
  stopBuffers: stopGameBuffers, started: startedCount, uiState: soundCtxState, resetUi: resetSoundCtx, captures: captureStates, closeCaptures: closeAllCaptures,
  micLine: micTracksLine, closeMic: closeGameMic, openMic: openGameMic, consume: consumeRewake, session: sessionLine, active: activeNow,
  waitRunning: waitCtxRunning, probe: probeCtx, log: pLog, note: gameAudioNote, now: () => performance.now(),
}

/**
 * Вызывать СИНХРОННО в обработчике тапа. voice — голосовой режим (микрофон перезапускается), why — для журнала, start(deps) — прежний старт звука (startGameAudio с подменой deps.openMic / recreateCtx / consume).
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
  const wasGame = d.ctxState()
  const caps = safe(d.closeCaptures) ?? 0
  safe(d.closeCtx)
  step('close-contexts', `игровой (был ${wasGame ?? 'нет'}) и микрофонных Vosk: ${caps}`)
  const ui = safe(() => d.resetUi(`перезапуск звука: ${why}`))
  step('ui-ctx', `контекст интерфейса: был ${ui?.was ?? 'нет'} → новый ${ui?.now ?? 'нет'}`)
  if (voice) { const before = d.micLine(); safe(d.closeMic); step('mic-stop', `старые дорожки остановлены (были ${before})`) } else step('mic-keep', 'режим тапа: микрофон координатор не трогает')

  const recreateCtx = w => { const c = d.recreateCtx(w); step('ctx-new', `${c?.state ?? 'нет Web Audio'}, rate ${c?.sampleRate ?? '—'}`); return c }
  const openMic = () => { step('mic-open', 'getUserMedia в жесте'); return Promise.resolve(d.openMic()) }
  const deps = { consume: () => d.consume() ?? `жёсткий перезапуск (${why})`, recreateCtx, ...(voice ? { openMic } : {}) }
  let run
  try { run = Promise.resolve(start(deps)) } catch (e) { run = Promise.reject(e) }
  const unlocked = safe(d.unlockCtx)
  step('unlock', `беззвучный буфер + resume в жесте, ctx=${d.ctxState() ?? 'нет'}`)
  Promise.resolve(unlocked).catch(() => {})

  return run.catch(e => { d.log(`[audio] перезапуск: старт звука упал — ${e?.message ?? e}`); return { mic: 'unavailable', error: e } }).then(async r => {
    const mic = r?.mic ?? 'unavailable'
    step('start-done', `микрофон ${mic}, дорожки ${d.micLine()}, ctx=${d.ctxState() ?? 'нет'}`)
    let w = await d.waitRunning(() => d.peekCtx())
    step('wait-running', `${w.state ?? 'нет Web Audio'} за ${w.ms} мс, resume ×${w.tries}`)
    if (w.state != null && w.state !== 'running' && (voice || d.active())) {
      recreateCtx(`не стал running за ${w.ms} мс после «${why}»`)
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
