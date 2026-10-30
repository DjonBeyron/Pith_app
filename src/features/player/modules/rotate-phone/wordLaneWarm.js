// Озвучка игры «Повтори за диктором» готовится ДО тапа «Начать». По журналам iPhone (3.3.75) озвучка кусков и реплик Пита не успевала за WORDS_WAIT_MS (2,5 с) в тапе — слот реплики оставался пустым, и первую реплику
// Пита ничего не озвучивало. Куски фразы и реплики Пита известны заранее (wordsPlan: cfg + реплики), поэтому файлы качаются (и измеряются) при показе карточки игры — к тапу остаётся только разбудить слоты тишиной.
//  • warmGameSounds({ cfg, lines }) — карточка игры показана (RotatePhoneModule; то же для «Шлифовки репетиции» и «Теста игры»): библиотека слов → скачать и измерить нужное к старту, затем остальные реплики;
//  • warmLessonRotate(nodes) — начало урока (useLessonWarmups, в простое): только скачать (measure: false) файлы нод rotate_phone урока — декодирование и замеры подождут показа карточки.
// Слоты <audio> здесь НЕ создаются (play() тишины — только в жесте, wordLaneClips.prepareWords): аудиосессию прогрев не трогает. Результат живёт в wordLaneFetch (fetchBlob/speechCache/AudioBuffer) до releaseClips.
// При Web Audio прогрев ДЕКОДИРУЕТ озвучку в AudioBuffer (3 файла одновременно, без передышек; реплики первых секунд — первыми, см. wordsPlan) и заодно готовит буферы мяу/нот и плашки: к тапу «Начать» всё
// «подготовлено» уже сейчас, тап ничего не качает и не будит, отметка ready приходит сразу (раньше — words=timeout из-за пробуждения 30 слотов <audio>).
import { wordsPlan, warmItems } from './wordLaneStart.js'
import { prefetchWords } from './wordLaneFetch.js'
import { readWordLane } from './wordLaneConfig.js'
import { warmRewardBuffers } from './wordLaneNotes.js'
import { warmPlateBuffer } from './wordLanePlateSound.js'
import { normalizeLines } from './wordLaneCatLines.js'
import { listWordAudio } from '../../../../shared/lib/wordAudio/wordAudioApi.js'
import { getCatLines } from '../../../../shared/api/catLinesApi.js'

/** Подпись набора озвучки (куски, слова, первые реплики, адреса реплик): изменилась — готовить заново («Готовлю звук…» на карточке) */
export const warmSig = (cfg, lines) => JSON.stringify([cfg.chunks, cfg.confusers, cfg.extraWords ?? null, cfg.firstLines ?? null, Object.values(lines ?? {}).map(l => l?.url ?? null)])

/** Карточка показана: качаем и декодируем ВСЮ озвучку сразу (нужное к старту — первым в списке). → промис «готово» (не отклоняется); deps подставляются в тестах */
export function warmGameSounds({ cfg, lines }, { prefetch = prefetchWords, list = listWordAudio, measure = true, onListed = null, warmOwn = () => { warmRewardBuffers(); warmPlateBuffer() } } = {}) {
  if (measure) { try { warmOwn() } catch { /* прогрев только ускоряет */ } } // мяу/ноты и плашка: небольшие буферы, декодируются без жеста (только при Web Audio)
  return Promise.resolve().then(list).catch(() => null).then(() => {
    try { onListed?.() } catch { /* подпись карточки не должна ломать прогрев */ }
    return prefetch(warmItems(wordsPlan({ cfg, lines })), { measure }) // ВСЁ сразу: сеть параллельна, декодирование по 3 файла; нужное к старту стоит в списке первым
  }).catch(() => undefined)
}

/** Начало урока: ноды rotate_phone урока → скачать их озвучку (без замеров). → промис (не отклоняется) */
export async function warmLessonRotate(nodes, deps = {}) {
  try {
    const { readLines = () => getCatLines().then(normalizeLines) } = deps
    const lines = await readLines()
    for (const n of nodes) await warmGameSounds({ cfg: readWordLane(n.typeData?.rotate_phone), lines }, { ...deps, measure: false })
  } catch { /* прогрев только ускоряет: тап «Начать» сам всё скачает */ }
}
