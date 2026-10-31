// «Дубль и зеркало»: громкость диктора для заметки «тише, чем нужно». Диктор экрана — makeMirrorDictor (rehearsalMirror.js: куски библиотеки слов теми же слотами, что в игре, голоса системы нет — он захватывает аудиосессию iPhone);
// здесь только средний RMS голоса по файлам кусков библиотеки — с ним сравнивается громкость дубля (mirrorMeasure.loud).
import { cachedWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { libItems } from '../../player/modules/rotate-phone/wordLaneLib.js'
import { analyzeBlob } from './mirrorRms.js'

/** Средний RMS голоса по файлам кусков библиотеки (для сравнения громкости дубля): число 0..1 или null, если не удалось (нет файлов / нет WebAudio / сеть) */
export async function libraryRms(chunks, { cache = cachedWordAudio(), load = async url => (await fetch(url)).blob(), analyze = analyzeBlob } = {}) {
  try {
    const vals = []
    for (const it of libItems(chunks, cache)) { const r = await analyze(await load(it.url)); if (r?.rms > 0) vals.push(r.rms) }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  } catch { return null }
}
