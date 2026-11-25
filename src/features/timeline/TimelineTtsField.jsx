import { useState } from 'react'
import { ttsProblem } from '../rehearsal/tts/ttsText.js'

// «Текст для диктора (со знаками)» в карточке реплики (TimelineLineEditor.jsx), под текстом реплики. В ElevenLabs уходит не чистый текст реплики (он без «. … !» — это подпись на экране), а этот:
// тот же текст со знаками препинания — по ним голос опускается в конце фразы (rehearsal/tts/ttsText.js). Поле пустое — диктору идёт текст из каталога игры, а если его нет — текст реплики с точкой
// (что именно уйдёт — строкой «диктору уйдёт»). Своя правка хранится в настройках реплики (поле tts) и может отличаться от текста реплики ТОЛЬКО знаками и регистром букв: иначе тайминги слов
// разошлись бы с подписью и ртом — проверка говорит, какое слово не совпало. Сохранение файл озвучки не трогает: строка «🎭 …» подскажет, что реплику стоит озвучить заново.
// st — lineVoiceState (now — текст реплики в настройках, dictor — что уйдёт диктору сейчас, toneNote), rec — запись реплики из настроек, edit — useLineEdit, off — кнопки заняты, textDirty — текст реплики не сохранён.
export default function TimelineTtsField({ id, st, rec, edit, off, textDirty }) {
  const [draft, setDraft] = useState(null) // null — в поле своя правка из настроек (или пусто)
  const own = rec?.tts ?? '', value = draft ?? own, dirty = draft != null && draft.trim() !== own.trim()
  const bad = value.trim() ? ttsProblem(st.now, value) : null
  const goes = value.trim() && !bad ? value.trim() : dirty ? null : st.dictor
  const save = async () => { if (await edit.saveTts(id, value)) setDraft(null) }
  if (st.status === 'skip') return null
  return (
    <div className="tlLeTts" data-testid="tl-le-tts">
      {st.toneNote && <p className="tlLeNote tlLeTone" data-tone={st.tone} data-testid="tl-le-tone">{st.toneNote}</p>}
      {edit.saveTts && (
        <label className="tlLeLabel">Текст для диктора (со знаками)
          <textarea className="tlLeText tlLeTtsText" rows={2} value={value} disabled={off || textDirty} placeholder={st.dictor || 'пусто — диктору уйдёт текст реплики с точкой'} onChange={e => setDraft(e.target.value)} data-testid="tl-le-tts-text" />
        </label>
      )}
      {bad ? <p className="tlLeNote tlLeErr" role="alert" data-testid="tl-le-tts-bad">Не подходит: {bad}</p>
        : <p className="tlLeNote" data-testid="tl-le-tts-goes">{goes ? <>диктору уйдёт: «{goes}»</> : 'поле пустое — диктору уйдёт текст из каталога игры или текст реплики с точкой'}{!value.trim() && !dirty ? ' (поле пустое: берётся автоматически)' : ''}</p>}
      {edit.saveTts && dirty && (
        <div className="tlLeRow">
          <button type="button" className="tlBtn tlLeGo" disabled={off || !!bad} onClick={save} data-testid="tl-le-tts-save">Сохранить текст диктора</button>
          <button type="button" className="tlBtn" disabled={off} onClick={() => setDraft(null)} data-testid="tl-le-tts-cancel">Отмена</button>
          <small className="tlLeNote">подпись на экране не меняется; сначала сохрани, потом «🎙 Озвучить заново»</small>
        </div>
      )}
    </div>
  )
}
