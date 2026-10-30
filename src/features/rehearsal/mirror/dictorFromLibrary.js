// «Дубль и зеркало»: диктор для экрана сравнения из кусков БИБЛИОТЕКИ слов (первая версия озвучки; целая фраза с таймингами — phrase_audio — появится позже и подставится в тот же интерфейс dictor).
// Файлы кусков уже скачаны в слоты звука (wordLaneClips.prepareWords, в тапе «Начать» — жест): играем слот по ключу слова; куска нет в слотах — тишина (голоса системы нет: он захватывает аудиосессию iPhone). Длины кусков — wordLaneLib.makeLib.
import { cachedWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'
import { makeLib, libItems } from '../../player/modules/rotate-phone/wordLaneLib.js'
import { playWordSlot } from '../../player/modules/rotate-phone/wordLaneClips.js'
import { dictorPlan } from './mirrorDictor.js'
import { analyzeBlob } from './mirrorRms.js'
import { pLog } from '../../../shared/lib/debug.js'

const TAIL_MS = 250 // после последнего куска ждём затухания, потом play() считается законченным

const silent = text => pLog(`[mirror] кусок «${text}» без озвучки — синтез речи запрещён, диктор молчит`)

/**
 * Диктор: { words (мс, от начала голоса), durationMs, leadMs, play(): Promise<void> } — как ждёт WordLaneMirror. play() включает файлы кусков по плану dictorPlan (каждый — так, чтобы его голос начался
 * вовремя) и резолвится, когда прозвучал последний. Зависимости (cache, play, say, setTimer) подставляются в тестах.
 */
export function dictorFromLibrary(chunks, { cache = cachedWordAudio(), play = playWordSlot, say = silent, setTimer = setTimeout, gapMs } = {}) {
  const lib = makeLib(chunks, cache)
  const plan = dictorPlan(chunks, chunks.map((_, i) => lib(i)), gapMs)
  return {
    words: plan.words,
    durationMs: plan.durationMs,
    leadMs: plan.leadMs,
    play: () => new Promise(resolve => {
      for (const p of plan.plays) setTimer(() => { const key = wordKey(p.chunk); if (!(key && play(key))) say(p.chunk) }, p.at)
      setTimer(resolve, plan.leadMs + plan.durationMs + TAIL_MS)
    }),
  }
}

/** Средний RMS голоса по файлам кусков библиотеки (для сравнения громкости дубля): число 0..1 или null, если не удалось (нет файлов / нет WebAudio / сеть) */
export async function libraryRms(chunks, { cache = cachedWordAudio(), load = async url => (await fetch(url)).blob(), analyze = analyzeBlob } = {}) {
  try {
    const vals = []
    for (const it of libItems(chunks, cache)) { const r = await analyze(await load(it.url)); if (r?.rms > 0) vals.push(r.rms) }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  } catch { return null }
}
