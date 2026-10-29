import { unlockVoice, prepareTrack, rewakeTrack } from './wordLaneVoice.js'
import { unlockNotes, releaseNotes } from './wordLaneNotes.js'
import { unlockPlate } from './wordLanePlateSound.js'
import { prepareClips, prepareWords, rewakeClips } from './wordLaneClips.js'
import { playSpan, clipsFor } from './wordLaneAudio.js'
import { libItems } from './wordLaneLib.js'
import { linesItems } from './wordLaneCatLines.js'
import { rewarmWordElements } from '../../word-audio/wordAudioPlayer.js'
import { openGameMic } from '../../../../shared/lib/gameMic.js'
import { gameAudioSession } from '../../../../shared/lib/gameMicSession.js'
import { gameMicHold } from '../../../../shared/lib/gameMicHold.js'
import { gameAudioWarm } from '../../../../shared/lib/gameAudioWarm.js'
import { primeAudio } from '../../../../shared/lib/primedAudio.js'
import { preloadSounds, unlockAudio } from '../../../../shared/lib/sounds.js'
import { pLog } from '../../../../shared/lib/debug.js'

export const WORDS_WAIT_MS = 2500 // сколько максимум ждём подготовку озвучки кусков перед началом игры

// Звук тапа «Начать» игры «Повтори за диктором». ПОРЯДОК ВАЖЕН (iPhone, iOS 18): getUserMedia и смена navigator.audioSession.type переводят аудиосессию в «запись + воспроизведение», и всё, что было
// разбужено ДО этого, iOS помечает прерванным — play() таких элементов молчит. Раньше звук будился первым, микрофон открывался вторым — и первые куски диктора/кота молчали до следующего тапа
// (в журнале: «[word-audio] элементы слов сброшены… прерывание аудиосессии» сразу после старта). Теперь, всё ещё в жесте (userActivation живёт ~5 с):
//  1. тип аудиосессии (gameAudioSession.begin) и микрофон (getUserMedia) — первыми, синхронно в тапе;
//  2. ждём, пока прерывание уляжется (gameAudioWarm.settle: тишина SETTLE_QUIET_MS и контекст не 'interrupted', потолок SETTLE_MAX_MS);
//  3. будим звук (wakeGameAudio): синтезатор, слоты слов диктора и кота, запись автора, мяу/ноты, прогретый элемент приложения, слова урока, звуки интерфейса;
//  4. ждём подготовку озвучки (≤ WORDS_WAIT_MS): длины слов нужны плану диктора. Игра начинается после этого (RotatePhoneModule).
// Прерывание уже в игре (звонок, наушники, режим микрофона «close») снова запускает прогрев (rewakeGameAudio) — сразу, если жест жив, иначе на ближайшем касании (gameAudioWarm).

/** Разбудить всё, что играет в игре (только в жесте). Возвращает промис «озвучка кусков готова» */
export function wakeGameAudio({ cfg, audioSrc, lines }) {
  unlockVoice()
  // Звуки диктора: куски фразы — отдельными файлами из библиотеки озвучки слов (слоты будятся тишиной в жесте), запись автора — только финал (вся фраза; у одного слова — если слова нет в библиотеке)
  const wordsReady = prepareWords([...libItems([...cfg.chunks, ...cfg.confusers.flat()]), ...linesItems(lines)]) // куски фразы, слова-запутыватели («Различи» — только озвучка) и озвученные реплики кота; заодно измеряется, где в файле звучит голос (без «хвоста»)
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
  unlockVoice()
  rewakeClips()
  if (audioSrc) rewakeTrack()
  releaseNotes(); unlockNotes(); unlockPlate()
  primeAudio()
  rewarmWordElements()
  preloadSounds(); unlockAudio()
}

/**
 * Вызывать СИНХРОННО в обработчике тапа «Начать» (весь синхронный префикс — в жесте). Возвращает промис { mic, settled }: mic — 'granted' | 'denied' | 'unavailable', settled — итог ожидания
 * (прерываний, мс, состояние контекста). deps — подмена зависимостей в тестах.
 */
export function startGameAudio({ cfg, audioSrc, lines }, deps = {}) {
  const { warm = gameAudioWarm, session = gameAudioSession, hold = gameMicHold, openMic = openGameMic, wake = wakeGameAudio, rewake = rewakeGameAudio, wordsWaitMs = WORDS_WAIT_MS } = deps
  warm.begin() // следим за прерываниями с этой секунды
  session.begin() // 1. тип аудиосессии (настройка в Админ → «Голос»): до открытия микрофона, в том же тапе
  const micPromise = openMic() // 1. микрофон: getUserMedia вызывается синхронно в жесте (диалога нет, если доступ уже выдан); один поток на всю игру
  return (async () => {
    const mic = await micPromise
    hold.parkNow() // режим «микрофон только в фазе ученика»: доступ получен — поток закрываем, к очереди ученика откроем заново (в остальных режимах no-op)
    warm.markSelf()
    const settled = await warm.settle() // 2.
    warm.onRewarm(() => rewake({ audioSrc })) // прерывание после этого места — повторный прогрев
    let wordsReady
    try { wordsReady = wake({ cfg, audioSrc, lines }) } catch (e) { pLog(`[rotate] звук диктора не разбудился: ${e?.message ?? e}`); wordsReady = Promise.resolve(false) } // 3.
    if (settled.activation === false) warm.rewarmOnGesture('жест истёк, пока открывался микрофон (диалог доступа)') // play() вне жеста iOS не разрешит: разбудим ещё раз на ближайшем касании
    await Promise.race([wordsReady, new Promise(r => setTimeout(r, wordsWaitMs))]) // 4.
    return { mic, settled }
  })()
}
