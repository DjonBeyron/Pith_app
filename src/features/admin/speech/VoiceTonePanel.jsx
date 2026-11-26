import { useState } from 'react'
import { toneSummary } from './voiceAudit.js'
import { toneRows, missingRows } from './raceVoiceTable.js'
import { contextOn, setContextOn } from '../../rehearsal/tts/ttsContext.js'

// Интонация озвучки Пита и Мии (Админ → «Голос» → «Встряхни память» → «Озвучка Пита», под проверкой озвучки). В ElevenLabs уходит «текст для диктора» — текст реплики со знаками препинания
// (rehearsal/tts/ttsText.js): по ним голос опускается в конце фразы. Реплики, озвученные раньше (без знаков), игре не мешают — они помечены мягко «🎭 можно переозвучить с интонацией»;
// реплики, у которых текст диктора поправили после озвучки, — «🎭 нужно переозвучить». Одна кнопка переозвучивает и те и другие (тратит символы ElevenLabs — с подтверждением)
// и ЗАОДНО озвучивает недостающие (нет файла / текст изменён) — владелец, v3.3.371: «нажал озвучить с интонацией, почему недостающие не озвучились».
// Галочка «контекст соседних реплик»: диктору вместе с репликой уходит, что сказано до и после неё по сценарию (ElevenLabs previous_text / next_text, rehearsal/tts/ttsContext.js); по умолчанию ВЫКЛЮЧЕНА (v3.3.372: с ней в начало и конец клипа попадал звук соседних реплик),
// запоминается в этом браузере. Сам текст диктора правится в карточке реплики на «Таймлайне игры» (поле «Текст для диктора (со знаками)»).
export default function VoiceTonePanel({ t, off, confirm = q => globalThis.confirm?.(q) ?? false }) {
  const [ctx, setCtx] = useState(contextOn)
  const all = [...t.groups.lines, ...t.groups.pitMia, ...t.groups.mia]
  const tone = toneRows(all), miss = missingRows(all), rows = [...miss, ...tone]
  const note = t.loaded ? toneSummary(t.audit) : null
  const redo = () => { if (confirm(`Озвучить с интонацией ${rows.length} реплик Пита и Мии: переозвучить ${tone.length}${miss.length ? `, недостающих ${miss.length}` : ''} (заменит прежнюю озвучку, тратит символы ElevenLabs)?`)) t.voice(rows) }
  return (
    <div className="rvAudit" data-testid="rv-tone">
      {note && <span className="rvNote" role="status" data-testid="rv-tone-note">{note} </span>}
      {tone.length > 0 && <button type="button" className="aspChip" disabled={off} onClick={redo} data-testid="rv-tone-voice">🎭 Переозвучить с интонацией ({tone.length}){miss.length ? ` + недостающие (${miss.length})` : ''}</button>}
      <label className="rhpHint" title="Диктору вместе с репликой уходит текст соседних реплик по сценарию: интонация конца фразы получается как в разговоре. Риск: в начало или конец файла может попасть обрывок соседней реплики — поэтому выключено">
        <input type="checkbox" checked={ctx} onChange={e => { setContextOn(e.target.checked); setCtx(e.target.checked) }} data-testid="rv-tone-context" /> контекст соседних реплик (может дать обрывок соседней реплики в файле)
      </label>
      <p className="rhpHint">Диктору уходит текст со знаками препинания (подпись на экране — без них). Поправить его для одной реплики — карточка реплики на «Таймлайне игры», поле «Текст для диктора».</p>
    </div>
  )
}
