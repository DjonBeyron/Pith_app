import { prepareTrack, rewakeTrack } from './wordLaneVoice.js'
import { unlockNotes, releaseNotes } from './wordLaneNotes.js'
import { unlockPlate } from './wordLanePlateSound.js'
import { prepareClips, prepareWords, rewakeClips } from './wordLaneClips.js'
import { playSpan, clipsFor } from './wordLaneAudio.js'
import { libItems } from './wordLaneLib.js'
import { transItems } from '../../../pitrace/raceTrans.js'
import { linesItems, lineKey } from './wordLaneCatLines.js'
import { prefetchWords, reviveWarm } from './wordLaneFetch.js'
import { waitWarmGate, GATE_MAX_MS } from './wordLaneGate.js'
import { unlockGameCtx, gameCtxState, recreateGameCtx, ensureGameCtxRunning } from '../../../../shared/lib/gameAudioCtx.js'
import { installGameAudioLife, consumeRewake, markGameTap } from '../../../../shared/lib/gameAudioLife.js'
import { rewarmWordElements } from '../../word-audio/wordAudioPlayer.js'
import { openGameMic } from '../../../../shared/lib/gameMic.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { gameStartTrace } from '../../../../shared/lib/gameStartTrace.js'
import { primeAudio } from '../../../../shared/lib/primedAudio.js'
import { preloadSounds, unlockAudio } from '../../../../shared/lib/sounds.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { RACE_GATE_MS, RACE_SETTLE_QUIET_MS } from '../../../pitrace/raceStartTrace.js'
import { raceChron } from '../../../pitrace/raceStartChron.js'
import { SETTLE_MAX_MS } from '../../../../shared/lib/gameAudioWarm.js'
import { readTapMode } from './wordLaneHudSettings.js'
import { setGameMicWanted } from '../../../../shared/lib/gameMicWant.js'
import { renewAudioSession, renewNeed } from '../../../../shared/lib/gameAudioRenew.js'
import { renewUntilLive } from '../../../../shared/lib/gameAudioRenewLive.js'
import { armOutputCheck } from '../../../../shared/lib/gameAudioOutputCheck.js'
import { installReturnClean } from '../../../../shared/lib/gameAudioReturnClean.js'

export const FAST_CTX_WAIT_MS = 200 // быстрый старт гонки: resume контекста ждём не дольше (идёт ПАРАЛЛЕЛЬНО воротам и регистрации буферов; микрофон открывается тоже параллельно; сам playGameBuffer при необходимости дожмёт resume)
export const MIC_OFF = 'off' // «Тапаю» в «Гонке»: микрофон игре не нужен и не открывается (startGameAudio → mic: 'off')
/** Можно играть: микрофон открыт или не нужен («Тапаю») */
export const micOk = mic => mic === 'granted' || mic === MIC_OFF
/** Нужен ли игре микрофон: «Гонка» в режиме тапа («Тапаю», pithy_wl_tap_v1) — нет; остальные игры слушают голос всегда */
export const wantsMic = cfg => !(cfg?.plan?.game === 'race' && readTapMode())
export { GATE_MAX_MS } // потолок ожидания ворот с тапа (wordLaneGate.js); заменил WORDS_WAIT_MS = 2,5 с

// Звук тапа «Начать» игры «Повтори за диктором». ПОРЯДОК ВАЖЕН (iPhone, iOS 18): getUserMedia и смена navigator.audioSession.type переводят аудиосессию в «запись + воспроизведение», и всё, что было
// разбужено ДО этого, iOS помечает прерванным — play() таких элементов молчит. Раньше звук будился первым, микрофон открывался вторым — и первые куски диктора/кота молчали до следующего тапа
// (в журнале: «[word-audio] элементы слов сброшены… прерывание аудиосессии» сразу после старта). Теперь, всё ещё в жесте (userActivation живёт ~5 с):
//  0. скачивание и измерение озвучки (prefetchWords) начинается СРАЗУ и идёт параллельно шагам 1–2: сеть и декодирование аудиосессию не трогают, а раньше стартовали только после settle;
//  1. тип аудиосессии (gameAudioSession.begin) и микрофон (getUserMedia) — первыми, синхронно в тапе;
//  2. ждём, пока прерывание уляжется (gameAudioWarm.settle: тишина SETTLE_QUIET_MS и контекст не 'interrupted', потолок SETTLE_MAX_MS);
//     В том же синхронном тапе открывается игровой AudioContext (unlockGameCtx: создание + resume() + тихий отсчёт) — через него играют буферы (реплики, куски диктора, мяу/ноты, плашка; gameBufferPlay.js);
//     после смены сессии он может уйти в 'interrupted': settle подталкивает resume(), wakeGameAudio открывает его ещё раз. <audio>-слоты нужны только запасному пути (нет Web Audio / скорость голоса не 1×);
//  3. будим звук (wakeGameAudio; синтезатор речи НЕ будим — его в игре нет, он захватывает аудиосессию): слоты слов диктора и кота, запись автора, мяу/ноты, прогретый элемент приложения, слова урока, звуки интерфейса;
//  4. ВОРОТА (wordLaneGate.js): игра ждёт, пока готовы первые N файлов озвучки (реплики первых секунд + куски первой ступени, минимум GATE_MIN = 5 или весь набор), но не дольше GATE_MAX_MS (8 с) с тапа; длины слов
//     нужны плану диктора. Файлы готовятся заранее (wordLaneWarm.js — при показе карточки, кнопка «Готовлю звук… 7/15»); «готов» = скачан и ДЕКОДИРОВАН (раньше — ещё и все 30 <audio>-слотов разбужены тишиной:
//     на iPhone это 4,5–19,7 с, поэтому отметка ready стабильно приходила как words=timeout через 2,5 с, хотя файлы были давно скачаны). Остальное докачивается фоном. Игра начинается после этого (RotatePhoneModule). Ждём только НУЖНОЕ К СТАРТУ (wordsPlan.now: слова и реплики первых стадий);
//     остальные реплики Пита (wordsPlan.late; cfg.firstLines задаёт репетиция) слоты получают в том же тапе, а файлы качаются и измеряются фоном, после нужных, — они не держат старт и не нагружают первые кадры.
// Каждый шаг помечается в gameStartTrace (тап, mic, settle, wake, ready, tap-wait) — из отметок строится временная шкала «Почему первая реплика тихая» (wordLaneSilentDiag.js); отсрочка первой реплики кота
// (wordLaneLineGate.js) ждёт отметки ready. settled.activation === false (жест истёк, пока открывался микрофон) → needsTap: RotatePhoneModule показывает «Тапни, чтобы начать» и открывает игру после касания.
// Прерывание уже в игре (звонок, наушники, режим микрофона «close») снова запускает прогрев (rewakeGameAudio) — сразу, если жест жив, иначе на ближайшем касании (gameAudioWarm).

/**
 * Что готовить в тапе: { now, late } — [{ key, url }]. now: куски фразы, слова-запутыватели («Различи» — только озвучка), слова репетиции (cfg.extraWords) и озвученные реплики кота, которые прозвучат в начале
 * (cfg.firstLines — id реплик первых стадий репетиции; нет списка — все реплики, как в обычной игре); late: остальные реплики — докачиваются фоном; firstCount — сколько файлов с начала now нужно первым
 * стадиям (реплики первых секунд + кусок первой ступени); cfg.phraseAudio — целые озвучки фраз «Встряхни память» (racePhraseAudio.js) — в late, к этапу фраз: ворота (wordLaneGate.js) открываются, когда готовы они (не меньше GATE_MIN)
 */
export function wordsPlan({ cfg, lines }) {
  const all = linesItems(lines)
  const first = cfg.firstLines ? new Set(cfg.firstLines.map(lineKey)) : null
  const trans = transItems(cfg.translations) // «Гонка»: озвучка русских переводов «Разгона» — первыми среди слов: первая пилюля выезжает после перевода
  const words = [...trans, ...libItems([...cfg.chunks, ...cfg.confusers.flat(), ...(cfg.extraWords ?? [])])]
  const lineNow = all.filter(x => !first || first.has(x.key))
  const one = libItems(cfg.chunks.slice(0, 1)).length // кусок первой ступени
  if (cfg.plan?.game === 'race' && first) { // «Гонка» (v3.3.117): ворота ждут ТОЛЬКО race_start (один файл, он первый в списке и качается первым); реплика первого этапа, куски и переводы догреваются фоном к первой пилюле, Пит не ждёт сеть
    const isStart = x => x.key === lineKey('race_start') || x.key === lineKey('race_start_tap') // стартовая фраза режима («Голосом» / «Пальцами»)
    const start = lineNow.filter(isStart), rest = lineNow.filter(x => !isStart(x))
    return { now: [...start, ...rest, ...words], late: [...all.filter(x => !first.has(x.key)), ...(cfg.phraseAudio ?? [])], firstCount: start.length || lineNow.length, gateMin: 0 } // нет озвучки race_start (или один раунд без вступления) — ждём первую реплику, какая есть
  }
  return first ? { now: [...lineNow, ...words], late: [...all.filter(x => !first.has(x.key)), ...(cfg.phraseAudio ?? [])], firstCount: lineNow.length + one + Math.min(2, trans.length) } : { now: [...words, ...lineNow], late: [], firstCount: one + Math.min(2, trans.length) } // у репетиции реплики первых стадий качаются и декодируются ПЕРВЫМИ: заговорит Пит, а куски диктора понадобятся через секунды
}

/** Все файлы озвучки игры по важности: [{ key, url }] (нужное к старту, затем фон) — для ворот и счётчика прогрева */
export const warmItems = plan => [...plan.now, ...plan.late]

/** Разбудить всё, что играет в игре (только в жесте). Возвращает промис «озвучка кусков готова» */
export function wakeGameAudio({ cfg, audioSrc, lines }) {
  // Звуки диктора: куски фразы — отдельными файлами из библиотеки озвучки слов (слоты будятся тишиной в жесте), запись автора — только финал (вся фраза; у одного слова — если слова нет в библиотеке)
  const { now, late } = wordsPlan({ cfg, lines })
  unlockGameCtx() // контекст Web Audio ещё раз: после смены сессии/микрофона он мог уйти в 'interrupted'; если жест жив — resume() пройдёт
  const wordsReady = prepareWords(now) // заодно измеряется, где в файле звучит голос (без «хвоста»)
  if (late.length) prepareWords(late, { after: wordsReady }).catch(() => {}) // фоном, после нужных к старту
  if (cfg.hasAudio && audioSrc) {
    prepareTrack(audioSrc) // запасной путь: общий файл с перемоткой (элемент будится в жесте)
    const n = cfg.chunks.length
    const rows = n > 1 ? [clipsFor(cfg.clips, n, cfg.chunks.map((_, i) => i), 0)].filter(Boolean) : (cfg.clips ?? [])
    if (rows.length) prepareClips(audioSrc, rows.map(playSpan)) // файл режется на клипы-высказывания (iPhone не подгружает аудио заранее и плохо перематывает)
  }
  unlockNotes() // ноты-награды: элементы просыпаются в жесте, иначе iOS не даст им зазвучать по таймеру
  unlockPlate() // и звук плашки «Теперь твоя очередь» (свой слот, от варианта награды не зависит — в том числе при «без звука»)
  primeAudio()
  rewarmWordElements() // слова урока, прогретые до открытия микрофона: их элементы после смены сессии мертвы
  preloadSounds(); unlockAudio() // звуки интерфейса: кэш выбрасывается при прерывании, контекст надо резюмить
  return wordsReady
}

/** Повторный прогрев после прерывания аудиосессии (в жесте или на ближайшем касании): те же элементы, но заново; сеть не трогаем — звуки уже в памяти */
export function rewakeGameAudio({ audioSrc }) {
  unlockGameCtx() // буферы переживают прерывание, а контекст надо resume() — именно в жесте
  rewakeClips()
  if (audioSrc) rewakeTrack()
  releaseNotes(); unlockNotes(); unlockPlate()
  primeAudio()
  rewarmWordElements()
  preloadSounds(); unlockAudio()
}

/**
 * Вызывать СИНХРОННО в обработчике тапа «Начать» (весь синхронный префикс — в жесте). Возвращает промис { mic, settled, needsTap }: mic — 'granted' | 'denied' | 'unavailable' | 'off' (микрофон не нужен), settled — итог ожидания
 * (прерываний, мс, состояние контекста), needsTap — жест истёк и прогрев ждёт касания (игру открывать после тапа). mic: false («Тапаю», по умолчанию wantsMic(cfg)) — ни типа сессии записи, ни getUserMedia. onMic(mic) — ответ
 * системы о микрофоне пришёл (попап гонки меняет «Разрешите микрофон…» на «Готовлю звук…»). deps — подмена зависимостей в тестах.
 * После фона (renewNeed) старт сначала ждёт полного обновления аудиосессии (renewAudioSession: единицы-десятки мс, жест ещё жив) с пробным звуком и до 2 повторов при мёртвом выводе (renewUntilLive, v3.3.147),
 * потом идёт как обычно (микрофон — после живой пробы) и проверяет вывод первой реплики (armOutputCheck).
 */
const installAudioLife = () => { installGameAudioLife(); installReturnClean() }

export function startGameAudio({ cfg, audioSrc, lines, onLineReady = null, onMic = null, mic: useMic = wantsMic(cfg) }, deps = {}) {
  const { warm = gameAudioWarm, session = gameAudioSession, hold = gameMicHold, openMic = openGameMic, wake = wakeGameAudio, rewake = rewakeGameAudio, gateMaxMs = GATE_MAX_MS, trace = gameStartTrace, prefetch = prefetchWords, unlockCtx = unlockGameCtx, gate = waitWarmGate, install = installAudioLife, consume = consumeRewake, recreateCtx = recreateGameCtx, ensureCtx = ensureGameCtxRunning, raceGateMs = RACE_GATE_MS, ctxState = gameCtxState, chron = raceChron,
    renew = renewAudioSession, renewLive = renewUntilLive, needRenew = renewNeed, armCheck = armOutputCheck, markTap = markGameTap, renewed = false } = deps
  trace.begin() // хронология старта: отсчёт от тапа
  markTap() // уборка после возврата (gameAudioReturnClean.js) не трогает контексты, пока идёт старт
  install() // слушатели фона/возврата (gameAudioLife.js) и закрытие контекстов при возврате без игры (gameAudioReturnClean.js): идемпотентно
  const suspect = consume() // звук возвращался из фона/блокировки с прошлого старта → полный путь: старый контекст не доверен
  // Полное обновление аудиосессии (gameAudioRenew.js): auto → закрыть ВСЕ контексты страницы → тип → новый игровой контекст → running. renewed — «Продолжить» уже обновил (gameAudioRestart.js)
  const why = renewed ? null : needRenew({ suspect })
  if (!why && suspect && !renewed) recreateCtx(`повторный старт после фона (${suspect})`) // короткий фон, старых контекстов нет — достаточно свежего игрового
  if (!why) return startBody()
  const again = () => renew({ reason: `звук не пошёл: ${why}`, wantType: useMic ? null : 'auto', applyType: useMic ? () => session.begin() : null })
  return renewLive({ reason: why, wantType: useMic ? null : 'auto', applyType: useMic ? () => session.begin() : null }, { renew })
    .catch(e => { pLog(`[audio] renew упал: ${e?.message ?? e}`); return null })
    .then(lv => {
      if (lv && !lv.ok) pLog(`[audio] старт после фона: вывод не ожил и после повторов (${lv.probe?.why ?? '—'}) — играем, проверка первой реплики повторит renew`)
      try { armCheck({ renew: again }) } catch { /* проверка — не условие старта */ }
      return startBody()
    })

  function startBody() {
    warm.begin() // следим за прерываниями с этой секунды
    setGameMicWanted(useMic)
    if (useMic) session.begin() // 1. тип аудиосессии (настройка в Админ → «Голос»): до открытия микрофона, в том же тапе. «Тапаю» — сессию записи не ставим вовсе
    const fast = cfg?.plan?.game === 'race' // «Гонка»: реплика race_start НЕ ждёт микрофон (iOS открывает его 0,5–1,5 с) — звук поднимается сразу после resume контекста, микрофон открывается параллельно (нужен только к первой пилюле)
    const step = (name, label) => (fast ? chron.step(name, label) : null) // хронология «[start]» (raceStartChron.js) — только у гонки
    const micPromise = useMic ? openMic() : Promise.resolve(MIC_OFF) // 1. микрофон: getUserMedia вызывается синхронно в жесте (диалога нет, если доступ уже выдан); один поток на всю игру
    unlockCtx() // 1. игровой AudioContext (Web Audio) — создать и resume() в этом же жесте, пока он жив
    const plan = wordsPlan({ cfg, lines })
    const revived = reviveWarm(warmItems(plan)) // страховка второго запуска: реестр «обработан» не доверен — отметки без буфера в памяти и оборванные докачки сбрасываются, файлы качаются заново, ворота ждут настоящий результат
    if (revived.failed || revived.noBuffer || revived.stuck) pLog(`[warm] страховка: ${revived.noBuffer} файлов отмечены готовыми, но буфера в памяти нет; ${revived.failed} — с оборванной докачкой; ${revived.stuck} — запрос завис: качаю и декодирую заново`)
    prefetch(warmItems(plan)) // 0. озвучка качается и декодируется ВСЯ сразу (нужное к старту — первым в списке), пока открывается микрофон и улягается сессия (слотов ещё нет — аудиосессию это не трогает)
    if (useMic) step('gum', 'getUserMedia вызван (в жесте, после типа сессии)')
    // Быстрый путь (v3.3.115): resume (≤ FAST_CTX_WAIT_MS, без пересоздания — контекст может быть 'interrupted', пока идёт смена сессии) → регистрация буферов (wake) → ворота первых реплик → отметка ready: реплика играет,
    // пока микрофон ещё открывается. Весь обычный путь (mic → settle → ctx → wake) идёт следом и повторно будит звук после смены сессии — как раньше.
    const openLines = async () => {
      const ctxWait = ensureCtx({ why: 'быстрый старт гонки', waitMs: FAST_CTX_WAIT_MS, recreate: false }).then(r => { trace.mark('ctx', { state: r?.state ?? null, recreated: false, afterBg: suspect ?? null, ms: r?.ms ?? null, early: true }); return r }) // resume идёт параллельно регистрации буферов и воротам (раньше — друг за другом: сумма ожиданий)
      try { wake({ cfg, audioSrc, lines }); trace.mark('wake', { ok: true, ctx: gameCtxState(), early: true }) } catch (e) { pLog(`[rotate] звук диктора не разбудился: ${e?.message ?? e}`) }
      const [g] = await Promise.all([gate({ items: warmItems(plan), firstCount: plan.firstCount, min: plan.gateMin, maxMs: raceGateMs, sinceTapMs: trace.sinceTap?.() ?? 0 }), ctxWait.catch(() => null)])
      trace.mark('ready', { words: g.by === 'timeout' ? 'timeout' : 'ready', gate: g.by, done: g.ok, total: g.total, firstN: g.firstN, ms: g.ms, ctx: gameCtxState(), early: true })
      pLog(`[race] старт: звук реплик готов через ${trace.sinceTap?.() ?? '—'} мс с тапа, микрофон ещё открывается, ctx=${gameCtxState() ?? 'нет'}`)
      step('gate', `звук реплик готов (ворота: ${g.by}, ${g.ok}/${g.total}), ctx=${gameCtxState() ?? 'нет'}`)
      try { onLineReady?.() } catch { /* игра не зависит от колбэка */ }
    }
    return (async () => {
      const early = fast ? openLines().catch(e => pLog(`[race] быстрый старт звука не вышел (${e?.message ?? e}) — обычный путь`)) : null
      const mic = await micPromise
      trace.mark('mic', { mic })
      if (useMic) step('mic', `getUserMedia ответил: ${mic}${mic === 'granted' ? ' — попап «Готовлю звук…»' : ''}`)
      try { onMic?.(mic) } catch { /* попап не мешает старту */ }
      if (useMic) hold.parkNow() // режим «микрофон только в фазе ученика»: доступ получен — поток закрываем, к очереди ученика откроем заново (в остальных режимах no-op)
      warm.markSelf()
      const quietMs = fast ? RACE_SETTLE_QUIET_MS : undefined // гонка: короче (буферам Web Audio нужен только 'running' контекст; прерванный settle ждёт и так)
      if (useMic) step('settle0', `«Готовлю звук»: жду, пока аудиосессия уляжется после смены на запись (iOS может прервать AudioContext): тишина ${quietMs ?? 250} мс без прерываний, потолок ${SETTLE_MAX_MS} мс`)
      const settled = await warm.settle(quietMs ? { quietMs } : undefined) // 2.
      if (useMic) step('settle', `аудиосессия улеглась за ${settled.waitedMs} мс: прерываний ${settled.interrupts}, ctx=${settled.ctx ?? '—'}${settled.timedOut ? ' (не дождались — потолок)' : ''}`)
      trace.mark('settle', { waitedMs: settled.waitedMs, interrupts: settled.interrupts, ctx: settled.ctx ?? null, activation: settled.activation ?? null })
      const ctxRes = fast && gameCtxState() === 'running' ? { state: 'running', recreated: false, ms: 0 } : await ensureCtx({ why: suspect ? 'повторный старт после фона' : 'старт игры' }) // быстрый путь: уже running — не трогаем (пересоздание оборвало бы идущую реплику) // 2б. контекст ДОЛЖЕН быть 'running': resume() не завершился за 300 мс («мёртвый» после фона) → пересоздаём в этом же жесте
      trace.mark('ctx', { state: ctxRes?.state ?? null, recreated: !!ctxRes?.recreated, afterBg: suspect ?? null, ms: ctxRes?.ms ?? null })
      warm.onRewarm(() => rewake({ audioSrc })) // прерывание после этого места — повторный прогрев
      try { wake({ cfg, audioSrc, lines }); trace.mark('wake', { ok: true, ctx: gameCtxState() }) } catch (e) { pLog(`[rotate] звук диктора не разбудился: ${e?.message ?? e}`); trace.mark('wake', { ok: false, error: e?.message ?? String(e) }) } // 3.
      const needsTap = settled.activation === false && !(fast && ctxState() === 'running') // «Гонка»: реплики и ноты играют буферами Web Audio — запущенному контексту жест уже не нужен (после диалога микрофона жест истёк, но звук жив)
      if (settled.activation === false) {
        warm.rewarmOnGesture('жест истёк, пока открывался микрофон (диалог доступа)') // play() вне жеста iOS не разрешит: разбудим ещё раз на ближайшем касании
        if (needsTap) { trace.setNeedsTap(true); trace.mark('tap-wait', { why: 'жест истёк до прогрева' }) }
      }
      await early // быстрый путь: ворота и отметка ready уже были (openLines), второй раз не ждём
      if (fast) return { mic, settled, needsTap }
      const g = await gate({ items: warmItems(plan), firstCount: plan.firstCount, min: plan.gateMin, maxMs: gateMaxMs, sinceTapMs: trace.sinceTap?.() ?? 0 }) // 4. ворота: первые N готовы / все / таймаут (8 с с тапа)
      trace.mark('ready', { words: g.by === 'timeout' ? 'timeout' : 'ready', gate: g.by, done: g.ok, total: g.total, firstN: g.firstN, ms: g.ms, ...(g.missing?.length ? { missing: g.missing.slice(0, 12) } : {}), ctx: gameCtxState() })
      pLog(`[audio] состояние ctx=${gameCtxState() ?? 'нет'} перед первой репликой${gameCtxState() === 'running' ? '' : ' — НЕ running: реплики Пита могут не зазвучать до касания'}`)
      return { mic, settled, needsTap }
    })()
  }
}
