// «Дубль и зеркало»: какую общую реплику говорит Пит по заметке (mirrorNotes.noteFor → { key, kind?, text }). Ключи — каталог реплик репетиции (rehearsalLines.js, rh_note_*): Пит озвучивает вердикт
// коротко и без конкретики, а точный текст (какие слова, перед чем пауза) стоит на плашке между горизонтальными пилюлями. Нет озвучки — остаётся одна плашка. Чистая функция.

/** Ключ заметки (с kind у missing и tempo) → ключ реплики каталога */
export const NOTE_LINES = {
  fail: 'rh_note_fail',
  'missing:one': 'rh_note_missing_one',
  'missing:few': 'rh_note_missing_few',
  'missing:all': 'rh_note_missing_all',
  order: 'rh_note_order',
  'tempo:fast': 'rh_note_fast',
  'tempo:slow': 'rh_note_slow',
  pause: 'rh_note_pause',
  loud: 'rh_note_loud',
  extra: 'rh_note_extra',
  clean: 'rh_note_clean',
}

/** Реплика Пита по заметке { key, kind? } или null (нет заметки / неизвестный ключ, например 'error' — запись не воспроизвелась) */
export const noteLine = note => (note?.key ? NOTE_LINES[note.kind ? `${note.key}:${note.kind}` : note.key] ?? null : null)
