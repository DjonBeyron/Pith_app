import { prepareTrack, rewakeTrack } from './wordLaneVoice.js'
import { unlockNotes, releaseNotes } from './wordLaneNotes.js'
import { unlockPlate } from './wordLanePlateSound.js'
import { prepareClips, prepareWords, rewakeClips } from './wordLaneClips.js'
import { playSpan, clipsFor } from './wordLaneAudio.js'
import { libItems } from './wordLaneLib.js'
import { linesItems, lineKey } from './wordLaneCatLines.js'
import { prefetchWords } from './wordLaneFetch.js'
import { waitWarmGate, GATE_MAX_MS } from './wordLaneGate.js'
import { unlockGameCtx, gameCtxState } from '../../../../shared/lib/gameAudioCtx.js'
import { rewarmWordElements } from '../../word-audio/wordAudioPlayer.js'
import { openGameMic } from '../../../../shared/lib/gameMic.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { gameStartTrace } from '../../../../shared/lib/gameStartTrace.js'
import { primeAudio } from '../../../../shared/lib/primedAudio.js'
import { preloadSounds, unlockAudio } from '../../../../shared/lib/sounds.js'
import { pLog } from '../../../../shared/lib/debug.js'

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
 * стадиям (реплики первых секунд + кусок первой ступени): ворота (wordLaneGate.js) открываются, когда готовы они (не меньше GATE_MIN)
 */
export function wordsPlan({ cfg, lines }) {
  const all = linesItems(lines)
  const first = cfg.firstLines ? new Set(cfg.firstLines.map(lineKey)) : null
  const words = libItems([...cfg.chunks, ...cfg.confusers.flat(), ...(cfg.extraWords ?? [])])
  const lineNow = all.filter(x => !first || first.has(x.key))
  const one = libItems(cfg.chunks.slice(0, 1)).length // кусок первой ступени
  return first ? { now: [...lineNow, ...words], late: all.filter(x => !first.has(x.key)), firstCount: lineNow.length + one } : { now: [...words, ...lineNow], late: [], firstCount: one } // у репетиции реплики первых стадий качаются и декодируются ПЕРВЫМИ: заговорит Пит, а куски диктора понадобятся через секунды
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
 * Вызывать СИНХРОННО в обработчике тапа «Начать» (весь синхронный префикс — в жесте). Возвращает промис { mic, settled, needsTap }: mic — 'granted' | 'denied' | 'unavailable', settled — итог ожидания
 * (прерываний, мс, состояние контекста), needsTap — жест истёк и прогрев ждёт касания (игру открывать после тапа). deps — подмена зависимостей в тестах.
 */
export function startGameAudio({ cfg, audioSrc, lines }, deps = {}) {
  const { warm = gameAudioWarm, session = gameAudioSession, hold = gameMicHold, openMic = openGameMic, wake = wakeGameAudio, rewake = rewakeGameAudio, gateMaxMs = GATE_MAX_MS, trace = gameStartTrace, prefetch = prefetchWords, unlockCtx = unlockGameCtx, gate = waitWarmGate } = deps
  trace.begin() // хронология старта: отсчёт от тапа
  warm.begin() // следим за прерываниями с этой секунды
  session.begin() // 1. тип аудиосессии (настройка в Админ → «Голос»): до открытия микрофона, в том же тапе
  const micPromise = openMic() // 1. микрофон: getUserMedia вызывается синхронно в жесте (диалога нет, если доступ уже выдан); один поток на всю игру
  unlockCtx() // 1. игровой AudioContext (Web Audio) — создать и resume() в этом же жесте, пока он жив
  const plan = wordsPlan({ cfg, lines })
  prefetch(warmItems(plan)) // 0. озвучка качается и декодируется ВСЯ сразу (нужное к старту — первым в списке), пока открывается микрофон и улягается сессия (слотов ещё нет — аудиосессию это не трогает)
  return (async () => {
    const mic = await micPromise
    trace.mark('mic', { mic })
    hold.parkNow() // режим «микрофон только в фазе ученика»: доступ получен — поток закрываем, к очереди ученика откроем заново (в остальных режимах no-op)
    warm.markSelf()
    const settled = await warm.settle() // 2.
    trace.mark('settle', { waitedMs: settled.waitedMs, interrupts: settled.interrupts, ctx: settled.ctx ?? null, activation: settled.activation ?? null })
    warm.onRewarm(() => rewake({ audioSrc })) // прерывание после этого места — повторный прогрев
    try { wake({ cfg, audioSrc, lines }); trace.mark('wake', { ok: true, ctx: gameCtxState() }) } catch (e) { pLog(`[rotate] звук диктора не разбудился: ${e?.message ?? e}`); trace.mark('wake', { ok: false, error: e?.message ?? String(e) }) } // 3.
    const needsTap = settled.activation === false
    if (needsTap) {
      warm.rewarmOnGesture('жест истёк, пока открывался микрофон (диалог доступа)') // play() вне жеста iOS не разрешит: разбудим ещё раз на ближайшем касании
      trace.setNeedsTap(true); trace.mark('tap-wait', { why: 'жест истёк до прогрева' })
    }
    const g = await gate({ items: warmItems(plan), firstCount: plan.firstCount, maxMs: gateMaxMs, sinceTapMs: trace.sinceTap?.() ?? 0 }) // 4. ворота: первые N готовы / все / таймаут (8 с с тапа)
    trace.mark('ready', { words: g.by === 'timeout' ? 'timeout' : 'ready', gate: g.by, done: g.ok, total: g.total, firstN: g.firstN, ms: g.ms, ...(g.missing?.length ? { missing: g.missing.slice(0, 12) } : {}), ctx: gameCtxState() })
    return { mic, settled, needsTap }
  })()
}
