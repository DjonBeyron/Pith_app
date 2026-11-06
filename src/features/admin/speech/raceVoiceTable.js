import { transKey, transTexts } from '../../pitrace/raceTrans.js'
import { meaningRows } from './racePhraseMeaning.js'

// Таблица «Озвучка Пита» (Админ → «Голос» → «Встряхни память», RaceVoiceTable.jsx): чистая сборка строк и статусов без React.
// Три группы: реплики игры (каталог raceLines.js, текст и озвучка — из настроек rotate_cat_lines), смыслы фраз плана (plan.phrases[].ru, app_settings.race_phrase_ru, озвучка в word_audio ключом ru:смысл)
// и переводы слов (transTexts, только чтение: текст и есть ключ озвучки). Статус: ok — озвучено, none — нет озвучки, changed — текст изменён после озвучки (said ≠ text).
export const STATUS_LABEL = { ok: 'озвучено', none: 'нет озвучки', changed: 'текст изменён после озвучки' }

/** Статус реплики из настроек (normalizeLines): нет файла — none; файл говорит другой текст — changed; иначе ok */
export function lineStatus(line) {
  if (!line?.url) return 'none'
  return line.said != null && line.said !== line.text ? 'changed' : 'ok'
}

/** Строки реплик: [{ id, group: 'line', text, when, status, duration, editable }]; lines ещё не загрузились (null) — тексты каталога, статус none */
export const lineRows = (list, lines) => (list ?? []).map(d => {
  const l = lines?.[d.id]
  return { id: d.id, group: 'line', text: l?.text ?? d.text, when: d.when, status: lineStatus(l), duration: l?.duration ?? null, editable: true }
})

const libStatus = (text, lib) => {
  const row = text ? lib?.get(transKey(text)) : null
  return { status: row?.url ? 'ok' : 'none', duration: row?.duration ?? null }
}

/** Смыслы фраз плана: id — ключ фразы, label — английская фраза, text — смысл (сохранённый важнее плана) */
export const meaningVoiceRows = (plan, saved, lib) => (plan ? meaningRows(plan, saved) : []).map(r => ({ id: r.key, group: 'meaning', label: r.text, text: r.ru, ...libStatus(r.ru, lib), editable: true }))

/** Переводы слов плана без тех, что уже есть смыслами: id — ключ озвучки ru:…, текст не правится */
export function transVoiceRows(plan, meanings, lib) {
  if (!plan) return []
  const taken = new Set(meanings.map(r => transKey(r.text)).filter(Boolean))
  return transTexts(plan).filter(t => !taken.has(transKey(t))).map(t => ({ id: transKey(t), group: 'trans', text: t, ...libStatus(t, lib), editable: false }))
}

/** Строку можно озвучить: есть текст и в нём нет {word} */
export const voiceable = r => !!String(r.text ?? '').trim() && !r.text.includes('{')

/** «озвучено N из M» по озвучиваемым строкам */
export function voiceCount(rows) {
  const can = rows.filter(voiceable)
  return { done: can.filter(r => r.status === 'ok').length, total: can.length }
}

/** Кому не хватает озвучки (нет файла или текст изменён после озвучки) */
export const missingRows = rows => rows.filter(r => voiceable(r) && r.status !== 'ok')

/** Длительность для колонки: 1.234 → «1,2 с»; нет — пусто */
export const durLabel = s => (s > 0 ? `${(Math.round(s * 10) / 10).toString().replace('.', ',')} с` : '')
