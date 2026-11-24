// Откуда взять звук клипа таймлайна (нажатие на клип речи проигрывает его — useClipAudio.js). В событиях трассы у реплики есть только id и текст, поэтому файл берётся из НАСТРОЕК НА МОМЕНТ ПРОСМОТРА
// (может отличаться от того, что звучало в игре — карточка честно пишет «озвучка из текущих настроек»):
//  • реплики Пита и Мии — app_settings.rotate_cat_lines (shared/api/catLinesApi.js → wordLaneCatLines.normalizeLines): у строки url (файл в R2) и duration — тот же источник, что кнопка ▶ в таблице «Озвучка Пита»;
//  • диктор (слово, перевод, фраза голосом Пита) — библиотека слов word_audio (wordAudioApi.listWordAudio): запись ищется по тексту — перевод «ru:текст» (raceTrans.transKey), английское слово (wordKey),
//    фраза целиком «phrase:<normText>» (racePlan: PHRASE_WORD_PREFIX).
// Чистые функции: src — { status: 'loading' | 'ready' | 'error', lines, lib, error } (null — озвучка на этом экране не подключена).
import { transKey } from '../pitrace/raceTrans.js'
import { PHRASE_WORD_PREFIX } from '../pitrace/plan/racePhraseOf.js'
import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const NO_VOICE = 'нет озвучки (подпись)'
export const FROM_NOW = 'озвучка из текущих настроек — в игре могла звучать другая'

/** Ключ проигрывания клипа: реплика в конкретный момент игры (одна и та же реплика звучит в игре много раз) */
export const voiceKey = l => (l ? `${l.who}:${l.id}@${Math.round(l.t)}` : '')

/** Ключи библиотеки слов, под которыми может лежать текст диктора (по порядку поиска) */
export function dictorKeys(text) {
  const norm = normText(text ?? '')
  return [transKey(text), wordKey(text), norm ? `${PHRASE_WORD_PREFIX}${norm}` : null].filter(Boolean)
}

/** Реплика модели + загруженная озвучка → { url, from, duration, key } либо { url: null, why } (почему проиграть нечего) */
export function voiceOf(line, src) {
  if (!line) return { url: null, why: '' }
  if (!src) return { url: null, why: 'озвучка на этом экране не подключена' }
  if (src.status === 'loading') return { url: null, why: 'загружаю озвучку…' }
  if (src.status === 'error') return { url: null, why: `озвучка не загрузилась: ${src.error || 'нет ответа'}` }
  if (line.who === 'dictor') {
    const text = line.text || line.id
    for (const key of dictorKeys(text)) { const row = src.lib?.get?.(key); if (row?.url) return { url: row.url, from: 'библиотека слов', duration: Number(row.duration) > 0 ? Number(row.duration) : null, key } }
    return { url: null, why: 'в библиотеке слов нет записи для этого текста — звук диктора здесь не проигрывается' }
  }
  const l = src.lines?.[line.id]
  if (l?.url) return { url: l.url, from: 'настройки реплик', duration: l.duration ?? null, key: line.id, changed: !!(l.said ?? l.text) && !!line.text && (l.said ?? l.text) !== line.text } // said — что говорит файл (записывается при озвучке)
  return { url: null, why: NO_VOICE }
}
