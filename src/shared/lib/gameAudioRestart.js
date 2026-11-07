// Жёсткий перезапуск звука игры по возврату из фона — ОДИН координатор на тап «Продолжить» (жест). Владелец (iPhone, iOS 18.7, Safari): «свернул игру, вернулся — игра полностью без звука»;
// пересоздание одного игрового контекста (v3.3.110/113/116) не помогло: пока жив хоть один старый контекст страницы, WebKit не переактивирует аудиосессию (gameAudioRenew.js). Путь один — тот же, что у старта после фона:
//  1. журнал «ДО»: игровой контекст, контекст звуков интерфейса, контексты захвата Vosk, дорожки микрофона, тип аудиосессии;
//  2. обрываем все источники (stopGameBuffers); голос — дорожка микрофона выключается, поток жив (closeGameMic, один поток на сеанс, v3.3.148). Тап: микрофон координатор не трогает (CONCEPT_RACE «Микрофон в „Тапаю“»);
//  3. renewAudioSession: audioSession.type = 'auto' → закрыть ВСЕ AudioContext страницы (реестр: игровой, интерфейса, захваты) и дождаться → тип (голос — gameAudioSession.begin, тап — 'auto') →
//     новый игровой контекст → беззвучный буфер + resume → 'running'. Контекст интерфейса НЕ создаётся заранее: его создаст preloadSounds в wakeGameAudio — уже после игрового;
//  3б. v3.3.147: сразу после renew, ДО getUserMedia, — короткий пробный звук (gameAudioRenewLive.js); мёртв — повтор renew до 2 раз с выдержкой 1,2 с; микрофон открывается только после живой пробы.
//      Если ожидание вывело из жеста (navigator.userActivation.isActive === false), а микрофон ещё не открыт, — итог tapAgain («Нажми „Продолжить“ ещё раз»), а не тихий провал;
//      следующий тап в течение REUSE_MS, если контекст жив, renew пропускает (вывод уже проверен) — только проба и микрофон;
//  4. start(deps) — прежний путь старта (wordLaneStart.startGameAudio) с deps.renewed (сессию второй раз не обновлять), deps.openMic (голос: openGameMic — сначала проверка старой дорожки: жива — включаем,
//     заглушена — ждём 0,5 с, оборвана — getUserMedia заново). AudioBuffer контекст-независимы — не перекачиваются;
//  5. разблокировка беззвучным буфером + resume() — ещё раз, уже после getUserMedia.
// Потом: ждём 'running' (gameAudioCheck.waitCtxRunning); не вышло — пересоздаём контекст ещё раз и ждём снова; пробный тихий звук должен доиграть за PROBE_MS (время контекста идёт).
// Пробный звук после микрофона не доиграл — «вывод умер после открытия микрофона» и ОДИН повтор всей цепочки (renew → проба → старт; поток микрофона живой и не переоткрывается).
// Итог { ok, mic, ctx, probe, steps, failed, ms, tapAgain, dead }: ok = false — вызывающий оставляет паузу с «Звук не вернулся, нажми ещё раз». Слушатель Vosk пересоздаёт перезапуск ступени (на том же потоке, если дорожка жива).
// Каждый шаг — строка «[audio] перезапуск: …»; итог — «[audio] перезапуск: ПОСЛЕ — …». Все зависимости подставляются (тесты без DOM).
import { gameCtxState, peekGameCtx, recreateGameCtx, unlockGameCtx } from './gameAudioCtx.js'
import { stopGameBuffers, startedCount } from './gameBufferPlay.js'
import { soundCtxState } from './sounds.js'
import { captureStates } from './vosk/voskCapture.js'
import { micTracksLine, closeGameMic, openGameMic } from './gameMic.js'
import { consumeRewake, markGameTap } from './gameAudioLife.js'
import { waitCtxRunning, probeCtx } from './gameAudioCheck.js'
import { renewAudioSession } from './gameAudioRenew.js'
import { renewUntilLive, probeLive } from './gameAudioRenewLive.js'
import { gameAudioSession } from './gameMicSession.js'
import { gameAudioNote } from './gameAudioSink.js'
import { pLog } from './debug.js'

export const SOUND_DEAD_TEXT = 'Звук не вернулся, нажми «Продолжить» ещё раз. Не помогло — попробуй заблокировать и разблокировать экран'
export const TAP_AGAIN_TEXT = 'Нажми «Продолжить» ещё раз'
export const REUSE_MS = 15000 // после tapAgain столько живой проверенный контекст не обновляем заново

const sessionLine = (nav = globalThis.navigator) => { try { const s = nav?.audioSession; return s ? `${s.type ?? '—'}/${s.state ?? '—'}` : 'нет API' } catch { return 'недоступно' } }
const activeNow = () => { try { return globalThis.navigator?.userActivation?.isActive !== false } catch { return true } }
const liveLine = line => String(line ?? '').split(',').some(i => { const p = i.trim().split(' ')[0].split('/'); return p[0] === 'live' && !p.includes('muted') }) // живая не заглушённая (выключенная /off — тоже: её включат без getUserMedia)
const lastTapAgain = { at: null } // когда прошлый тап кончился tapAgain (вывод был живой)

const DEFAULTS = {
  ctxState: gameCtxState, peekCtx: peekGameCtx, recreateCtx: recreateGameCtx, unlockCtx: unlockGameCtx, renew: renewAudioSession, renewLive: renewUntilLive, voiceType: () => gameAudioSession.begin(),
  stopBuffers: stopGameBuffers, started: startedCount, uiState: soundCtxState, captures: captureStates, markTap: () => markGameTap(),
  micLine: micTracksLine, closeMic: closeGameMic, openMic: openGameMic, consume: consumeRewake, session: sessionLine, active: activeNow,
  waitRunning: waitCtxRunning, probe: probeCtx, log: pLog, note: gameAudioNote, now: () => performance.now(), memo: lastTapAgain,
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
  const renewOpts = n => ({ reason: `«${why}»${n > 1 ? ', повтор цепочки' : ''}`, wantType: voice ? null : 'auto', applyType: voice ? d.voiceType : null })
  const reuseAt = d.memo?.at
  if (d.memo) d.memo.at = null

  safe(d.markTap) // уборка после возврата (gameAudioReturnClean.js) не трогает контексты, пока идёт перезапуск
  d.log(`[audio] перезапуск (${why}, режим ${voice ? 'голос' : 'тап'}): ДО — ${states()}`)
  safe(d.stopBuffers); step('stop-buffers', 'источники старого контекста оборваны')
  if (voice) { const before = d.micLine(); safe(d.closeMic); step('mic-off', `дорожка выключена, поток жив (была ${before}) — после проверки включится без нового запроса`) } else step('mic-keep', 'режим тапа: микрофон координатор не трогает')
  return attempt(1).catch(e => { d.log(`[audio] перезапуск упал — ${e?.message ?? e}`); return done({ ok: false, mic: 'unavailable', failed: `ошибка: ${e?.message ?? e}` }) })

  async function liveOutput(n) {
    if (n === 1 && reuseAt != null && d.now() - reuseAt < REUSE_MS && d.ctxState() === 'running') { // прошлый тап проверил вывод, но жест истёк: renew не повторяем
      const pr = await probeLive(d)
      step('probe-live', pr.ok ? `renew пропущен: контекст с прошлого тапа жив, пробный звук ${pr.ms} мс` : `контекст с прошлого тапа не играет (${pr.why}) — полный renew`)
      if (pr.ok) return { ok: true, probe: pr, tries: 0 }
    }
    const lv = await d.renewLive(renewOpts(n), { renew: d.renew, probe: d.probe, peekCtx: d.peekCtx, log: d.log, active: d.active })
    const rn = lv?.rn
    step('renew', `auto → закрыто ${rn?.closed ?? 0}${rn?.kinds?.length ? ` (${rn.kinds.join(', ')})` : ''} → тип ${rn?.type ?? '—'} → новый ctx ${rn?.state ?? 'нет'} за ${rn?.ms ?? '—'} мс`)
    step('probe-live', lv?.ok ? `вывод живой, пробный звук ${lv.probe?.ms ?? '—'} мс${lv.tries ? ` (после повторов: ${lv.tries})` : ''}` : `вывод мёртв: ${lv?.probe?.why ?? '—'} (повторов renew: ${lv?.tries ?? 0})`)
    return lv ?? { ok: false, probe: { why: 'renew не ответил' }, tries: 0 }
  }

  async function attempt(n) {
    const lv = await liveOutput(n)
    if (!lv.ok && lv.tapAgain) return tapAgain('новый контекст без касания не запускается')
    if (!lv.ok) return done({ ok: false, dead: true, mic: 'skipped', ctx: d.ctxState(), probe: lv.probe, failed: `вывод мёртв после renew (${(lv.tries ?? 0) + 1} попыток): ${lv.probe?.why ?? '—'}` })
    if (voice && !liveLine(d.micLine()) && !d.active()) { if (d.memo) d.memo.at = d.now(); return tapAgain('жест истёк, пока проверялся вывод — getUserMedia вне жеста не зову') }
    const openMic = () => { step('mic-open', 'проверка старой дорожки / getUserMedia в жесте, после живого пробного звука'); return Promise.resolve(d.openMic()) }
    const deps = { consume: () => d.consume() ?? `жёсткий перезапуск (${why})`, renewed: true, ...(voice ? { openMic } : {}) }
    let run
    try { run = Promise.resolve(start(deps)) } catch (e) { run = Promise.reject(e) }
    const unlocked = safe(d.unlockCtx)
    step('unlock', `беззвучный буфер + resume в жесте, ctx=${d.ctxState() ?? 'нет'}`)
    Promise.resolve(unlocked).catch(() => {})
    return finish(run, n)
  }

  function tapAgain(text) {
    step('gesture', `${text} → «${TAP_AGAIN_TEXT}»`)
    return done({ ok: false, tapAgain: true, mic: 'skipped', ctx: d.ctxState(), failed: 'жест истёк' })
  }

  async function finish(run, n) {
    const r = await run.catch(e => { d.log(`[audio] перезапуск: старт звука упал — ${e?.message ?? e}`); return { mic: 'unavailable', error: e } })
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
    if (!ok && voice && mic === 'granted' && n === 1) { // вывод был живой до getUserMedia — его сломало открытие микрофона (смена сессии на запись)
      step('chain-again', `вывод умер после открытия микрофона (${!ctxOk ? `контекст ${w.state}` : pr.why}) — один повтор всей цепочки, поток микрофона остаётся`)
      return attempt(2)
    }
    const failed = ok ? null : !ctxOk ? `контекст ${w.state}` : `пробный звук: ${pr.why}`
    if (voice && ok) step('listener', 'слушатель Vosk пересоздаётся при перезапуске ступени на потоке сеанса')
    return done({ ok, mic, needsTap: !!r?.needsTap, ctx: w.state, probe: pr, failed, chain: n })
  }

  function done(r) {
    const ms = Math.round(d.now() - t0)
    d.log(`[audio] перезапуск: ПОСЛЕ — ${states()}; источников стартовало ${d.started() - started0}; итог ${r.ok ? 'звук жив' : `ЗВУК НЕ ВЕРНУЛСЯ (${r.failed})`}, ${ms} мс с тапа`)
    d.note('audio-restart', { step: 'done', ok: r.ok, failed: r.failed ?? null, mic: r.mic, ctx: r.ctx ?? null, ms })
    return { needsTap: false, tapAgain: false, dead: false, probe: null, chain: 1, ...r, steps, ms }
  }
}
