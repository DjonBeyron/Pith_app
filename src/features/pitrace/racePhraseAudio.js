// Целая озвучка фраз этапа 2 «Фразы» («Встряхни память», CONCEPT_PHRASES.md → «Озвучка фраз целиком»). Хранилище — библиотека слов word_audio (lang en), ключ phrase:<normText фразы>: её читает любой игрок (RLS select для всех),
// а app_settings.game2_phrases — только админ. Озвучивает админ (таблица «Озвучка Пита» → «Фразы целиком»: generateWordAudio — ElevenLabs тем же голосом диктора, что и слова → R2 → word_audio).
// План из памяти кладёт запись в phrase.audio (racePhrasePool.planContext: phraseAudioMap — word_audio и game2_phrases); у плана без неё (симуляция, план собран до озвучки) запись ищется на ходу в уже загруженной библиотеке (cachedWordAudio).
// Прогрев: файл фразы качается и декодируется вместе с остальной озвучкой игры (cfg.phraseAudio → wordsPlan.late, ключ слота тот же phrase:<key>), Пит играет его буфером (playWordSlot), нет буфера — элементом <audio> (playTrack). Чистые функции, зависимости подставляются.
import { PHRASE_WORD_PREFIX } from './plan/racePhraseOf.js'
import { phrasesOf } from './racePhraseData.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { cachedWordAudio } from '../../shared/lib/wordAudio/wordAudioApi.js'
import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { speechOfUrl } from '../player/modules/rotate-phone/wordLaneFetch.js'
import { playWordSlot, hasWordSlot } from '../player/modules/rotate-phone/wordLaneClips.js'
import { playTrack } from '../player/modules/rotate-phone/wordLaneVoice.js'

const keyOf = p => String(p?.key || normText(p?.text ?? ''))

/** Ключ целой фразы в word_audio (он же ключ слота прогрева): phrase:<normText>; пусто — null */
export const phraseWordKey = p => (keyOf(p) ? `${PHRASE_WORD_PREFIX}${keyOf(p)}` : null)
export const phraseSlotKey = phraseWordKey

/** Целая озвучка фразы: phrase.audio плана или запись word_audio по phraseWordKey; нет — null */
export function phraseAudioOf(p, lib = cachedWordAudio()) {
  if (p?.audio?.url) return p.audio
  const row = phraseWordKey(p) ? lib?.get?.(phraseWordKey(p)) : null
  return row?.url ? { url: row.url, duration: Number(row.duration) > 0 ? Number(row.duration) : null } : null
}

/** Файлы целых фраз плана для прогрева: [{ key, url }] без повторов (нет озвучки — фразы нет в списке) */
export function phraseAudioItems(plan, lib = cachedWordAudio()) {
  const seen = new Set()
  return phrasesOf(plan).flatMap(p => { const a = phraseAudioOf(p, lib); if (!a || seen.has(a.url)) return []; seen.add(a.url); return [{ key: phraseSlotKey(p), url: a.url }] })
}

/** Тишина в начале файла слова (мс, замер прогрева): стык слов при чтении по словам — следующее слово начинается раньше на эту тишину */
export function wordLeadMs(word, lib = cachedWordAudio(), speech = speechOfUrl) {
  const url = lib?.get?.(wordKey(word))?.url
  return url ? Math.max(0, Number(speech(url)?.lead) || 0) : 0
}

/** Сколько звучит голос слова до проигрывания (мс; как sayText с tight — без хвоста тишины файла): замер прогрева (тишина в начале + речь), нет замера — длина файла из word_audio; нет озвучки — 0 */
export function wordVoiceMs(word, rate = 1, lib = cachedWordAudio(), speech = speechOfUrl) {
  const row = lib?.get?.(wordKey(word)), sp = row?.url ? speech(row.url) : null
  const ms = sp?.ms > 0 ? (Number(sp.lead) || 0) + sp.ms : row?.url && Number(row.duration) > 0 ? Number(row.duration) * 1000 : 0
  return Math.round(ms / (rate > 0 ? rate : 1))
}

/** Сыграть целую фразу: буфер слота (прогрет) или элемент <audio> по адресу */
export function playPhraseAudio(p, audio, { has = hasWordSlot, slot = playWordSlot, track = playTrack } = {}) {
  const key = phraseSlotKey(p)
  if (has(key) && slot(key)) return 'buffer'
  track(audio.url)
  return 'track'
}
