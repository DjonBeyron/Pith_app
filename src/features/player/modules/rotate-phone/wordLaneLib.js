// Озвучка кусков из БИБЛИОТЕКИ озвучки слов (таблица word_audio, ключ wordKey): каждый кусок фразы («I'm», «trying», «to learn») — свой отдельный файл, один и тот же во всех уроках.
// Диктор ступеней наращивания и подсказок раунда «Порядок» складывает высказывание из этих файлов куск за куском; запись автора (фраза целиком) играет только в ФИНАЛЕ.
// Нет куска в библиотеке — голос системы, а озвучить его отдельно предложит редактор ноды (бейдж «не озвучено», collectLessonWords). Чистые функции — проверяются тестами.
import { cachedWordAudio } from '../../../../shared/lib/wordAudio/wordAudioApi.js'
import { wordKey } from '../../../../shared/lib/wordAudio/wordKey.js'
import { speechOfUrl } from './wordLaneClips.js'

/** Строка библиотеки для куска (или null: нет ключа / нет озвучки / библиотека ещё не загружена) */
export function libRow(text, cache = cachedWordAudio()) {
  const key = wordKey(text)
  const row = key ? cache?.get(key) : null
  return row?.url ? { key, row } : null
}

/**
 * lib(i) для planDictor/buildStages: { ms, lead } — длина слова в озвучке куска (мс) и тишина перед ним в файле (мс: звук включают на столько раньше слова) или null — куска в библиотеке нет.
 * Длина — без «хвоста» (тишины и затухания), если файл уже измерен в тапе «Начать» (wordLaneClips.speechOfUrl), иначе — длина файла из библиотеки (null — неизвестна).
 */
export function makeLib(chunks, cache = cachedWordAudio()) {
  const info = chunks.map(c => {
    const r = libRow(c, cache)
    if (!r) return null
    const sp = speechOfUrl(r.row.url)
    return { ms: sp?.ms ?? (Number(r.row.duration) > 0 ? Math.round(Number(r.row.duration) * 1000) : null), lead: sp?.lead ?? 0 }
  })
  return i => info[i] ?? null
}

/** Что подготовить в тапе «Начать»: уникальные куски с озвучкой в библиотеке — [{ key, url }] */
export function libItems(chunks, cache = cachedWordAudio()) {
  const seen = new Set()
  const out = []
  for (const c of chunks) {
    const r = libRow(c, cache)
    if (r && !seen.has(r.key)) { seen.add(r.key); out.push({ key: r.key, url: r.row.url }) }
  }
  return out
}

/** Какие куски без озвучки в библиотеке (для подсказки автору): тексты кусков */
export const missingChunks = (chunks, cache = cachedWordAudio()) => chunks.filter(c => !libRow(c, cache))
