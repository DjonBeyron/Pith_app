import { useState } from 'react'
import { toneSummary } from './voiceAudit.js'
import { toneRows } from './raceVoiceTable.js'
import { contextOn, setContextOn } from '../../rehearsal/tts/ttsContext.js'

// Интонация озвучки Пита и Мии (Админ → «Голос» → «Встряхни память» → «Озвучка Пита», под проверкой озвучки). В ElevenLabs уходит «текст для диктора» — текст реплики со знаками препинания
// (rehearsal/tts/ttsText.js): по ним голос опускается в конце фразы. Реплики, озвученные раньше (без знаков), игре не мешают — они помечены мягко «🎭 можно переозвучить с интонацией»;
// реплики, у которых текст диктора поправили после озвучки, — «🎭 нужно переозвучить». Одна кнопка переозвучивает и те и другие (тратит символы ElevenLabs — с подтверждением).
// Галочка «контекст соседних реплик»: диктору вместе с репликой уходит, что сказано до и после неё по сценарию (ElevenLabs previous_text / next_text, rehearsal/tts/ttsContext.js); по умолчанию включена,
// запоминается в этом браузере. Сам текст диктора правится в карточке реплики на «Таймлайне игры» (поле «Текст для диктора (со знаками)»).
export default function VoiceTonePanel({ t, off, confirm = q => globalThis.confirm?.(q) ?? false }) {
  const [ctx, setCtx] = useState(contextOn)
  const rows = toneRows([...t.groups.lines, ...t.groups.pitMia, ...t.groups.mia])
  const note = t.loaded ? toneSummary(t.audit) : null
  const redo = () => { if (confirm(`Переозвучить ${rows.length} реплик Пита и Мии с интонацией (заменит прежнюю озвучку, тратит символы ElevenLabs)?`)) t.voice(rows) }
  return (
    <div className="rvAudit" data-testid="rv-tone">
      {note && <span className="rvNote" role="status" data-testid="rv-tone-note">{note} </span>}
      {rows.length > 0 && <button type="button" className="aspChip" disabled={off} onClick={redo} data-testid="rv-tone-voice">🎭 Переозвучить с интонацией ({rows.length})</button>}
      <label className="rhpHint" title="Диктору вместе с репликой уходит текст соседних реплик по сценарию: интонация конца фразы получается как в разговоре">
        <input type="checkbox" checked={ctx} onChange={e => { setContextOn(e.target.checked); setCtx(e.target.checked) }} data-testid="rv-tone-context" /> контекст соседних реплик
      </label>
      <p className="rhpHint">Диктору уходит текст со знаками препинания (подпись на экране — без них). Поправить его для одной реплики — карточка реплики на «Таймлайне игры», поле «Текст для диктора».</p>
    </div>
  )
}
