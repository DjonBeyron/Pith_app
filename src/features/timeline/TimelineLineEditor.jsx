import { useRef, useState } from 'react'
import { lineVoiceState, isSpeaker, mouthState } from './timelineLineEdit.js'
import TimelineCheckNote from './check/TimelineCheckNote.jsx'
import TimelineTtsField from './TimelineTtsField.jsx'

// Правка реплики в карточке блока (TimelineCard): «📋 Копировать текст» и «📋 id»; для реплик Пита и Мии — статус озвучки (тот же, что в таблице «Озвучка Пита»), поле с текстом ИЗ НАСТРОЕК НА СЕЙЧАС
// (если в этой игре звучал другой — показаны оба), строка «👄 …» — размечен ли рот по словам (свой файл размечается в браузере при загрузке; «🔁 Разметить рот заново» — для файла без разметки), «Сохранить» с подтверждением («текст изменится везде…», где реплика звучит), «🎙 Озвучить заново», «📁 Выбрать файл…», «↶ Вернуть прежний текст».
// Сразу после сохранения (текст, озвучка, свой файл) под сообщением «готово» — итог проверки ЭТОЙ реплики (check/TimelineCheckNote.jsx: «✅ подходит» либо что не так; «↶ Вернуть прежнюю озвучку»), рядом — «↶ Вернуть прежний текст».
// Под текстом — «Текст для диктора (со знаками)» (TimelineTtsField.jsx): что уходит в ElevenLabs вместо чистого текста, со своей кнопкой сохранения; «🎙 Озвучить заново» ждёт, пока он сохранён.
// Слова диктора — только копирование: это слова урока из библиотеки слов, они правятся не здесь. edit — useLineEdit (null — правки на экране нет: остаётся копирование).
const WHAT = { text: 'сохраняю текст…', tts: 'сохраняю текст диктора…', voice: 'озвучиваю… (ElevenLabs → файл → настройки)', file: 'загружаю файл…', restore: 'возвращаю прежний текст…', mouth: 'размечаю рот…' }
const fallbackCopy = async t => { try { await navigator.clipboard.writeText(t); return true } catch { return false } }

export default function TimelineLineEditor({ line, edit = null }) {
  const [draft, setDraft] = useState(null) // null — в поле текст из настроек
  const [ask, setAsk] = useState(false)
  const [copied, setCopied] = useState('')
  const file = useRef(null)
  const st = lineVoiceState(line, edit?.audit), id = line.id
  const mouth = mouthState(edit?.lines?.[id])
  const cur = st.now || line.text || '', text = draft ?? cur, dirty = draft != null && draft.trim() !== cur.trim()
  const busy = edit?.busy?.id === id ? edit.busy.what : null, off = !!edit?.busy
  const copy = async (what, t) => { const ok = await (edit?.copy ?? fallbackCopy)(t); setCopied(ok ? `✓ ${what} скопирован` : '✗ буфер обмена недоступен — выдели текст вручную') }
  const save = async () => { setAsk(false); if (await edit.saveText(id, text)) setDraft(null) }
  const copyRow = (
    <div className="tlLeRow">
      <button type="button" className="tlBtn" onClick={() => copy('текст', line.who === 'dictor' ? line.text || id : text)} data-testid="tl-le-copy">📋 Копировать текст</button>
      {line.who !== 'dictor' && <button type="button" className="tlBtn tlLeSmall" onClick={() => copy('id', id)} title={id} data-testid="tl-le-copy-id">📋 id</button>}
      {copied && <small className="tlLeNote" data-testid="tl-le-copied">{copied}</small>}
    </div>
  )
  if (!isSpeaker(line)) return <section className="tlLe" data-testid="tl-le" data-who={line.who}>{copyRow}<p className="tlLeNote" data-testid="tl-le-dictor">Слово диктора — из библиотеки слов урока: его текст и озвучка правятся там, здесь только копирование и прослушивание.</p></section>
  if (!edit) return <section className="tlLe" data-testid="tl-le" data-who={line.who}>{copyRow}</section>
  if (!st.known) return <section className="tlLe" data-testid="tl-le" data-who={line.who}>{copyRow}<p className="tlLeNote" data-testid="tl-le-unknown">{edit.status === 'loading' ? 'Загружаю настройки реплик…' : edit.status === 'error' ? `Настройки реплик не загрузились: ${edit.loadError}` : 'Этой реплики нет в каталоге реплик игры — править её здесь нельзя.'}</p></section>
  return (
    <section className="tlLe" data-testid="tl-le" data-who={line.who} data-status={st.status}>
      <p className="tlLeStatus" data-mark={st.mark} data-testid="tl-le-status">{st.label}{st.status === 'stale' && st.was ? <small> — файл говорит «{st.was}»</small> : null}</p>
      {mouth && <p className="tlLeNote" data-kind={mouth.kind} data-testid="tl-le-mouth">{mouth.text}</p>}
      {st.differs && <p className="tlLeNote" data-testid="tl-le-differs">в этой игре звучало: «{line.text}» · сейчас в настройках: «{st.now}»</p>}
      <label className="tlLeLabel">Текст реплики (сейчас в настройках)
        <textarea className="tlLeText" rows={3} value={text} disabled={off} onChange={e => { setDraft(e.target.value); setAsk(false) }} data-testid="tl-le-text" />
      </label>
      {copyRow}
      <TimelineTtsField key={`${id}|${edit.lines?.[id]?.tts ?? ''}`} id={id} st={st} rec={edit.lines?.[id]} edit={edit} off={off} textDirty={dirty} />
      {dirty && !ask && (
        <div className="tlLeRow">
          <button type="button" className="tlBtn tlLeGo" disabled={off || !text.trim()} onClick={() => setAsk(true)} data-testid="tl-le-save">Сохранить</button>
          <button type="button" className="tlBtn" disabled={off} onClick={() => { setDraft(null); setAsk(false) }} data-testid="tl-le-cancel">Отмена</button>
          {!text.trim() && <small className="tlLeNote tlLeErr">пустой текст не сохраняется</small>}
        </div>
      )}
      {dirty && ask && (
        <div className="tlLeAsk" data-testid="tl-le-ask">
          <p><b>Текст изменится везде и сразу у всех игроков.</b> Эта реплика звучит: {st.when || 'в игре «Встряхни память»'}. Прежняя озвучка играть перестанет (будет подпись), пока не озвучишь заново.</p>
          <div className="tlLeRow">
            <button type="button" className="tlBtn tlLeGo" disabled={off} onClick={save} data-testid="tl-le-confirm">Да, сохранить</button>
            <button type="button" className="tlBtn" disabled={off} onClick={() => setAsk(false)}>Отмена</button>
          </div>
        </div>
      )}
      <div className="tlLeRow">
        <button type="button" className="tlBtn" disabled={off || dirty || st.status === 'skip'} onClick={() => edit.voice(id)} title={dirty ? 'Сначала сохрани текст' : 'Озвучить текущий текст заново (ElevenLabs)'} data-testid="tl-le-voice">🎙 Озвучить заново</button>
        <button type="button" className="tlBtn" disabled={off || dirty} onClick={() => file.current?.click()} title={dirty ? 'Сначала сохрани текст' : 'Загрузить свой аудиофайл для этой реплики'} data-testid="tl-le-file">📁 Выбрать файл…</button>
        {mouth?.redo && edit.realign && <button type="button" className="tlBtn" disabled={off || dirty || st.status !== 'ok'} onClick={() => edit.realign(id)} title="Скачать файл озвучки и расставить слова по звуку заново (Vosk в браузере)" data-testid="tl-le-realign">🔁 Разметить рот заново</button>}
        <input ref={file} type="file" accept="audio/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) edit.setFile(id, f) }} data-testid="tl-le-file-input" />
      </div>
      {busy && <p className="tlLeNote tlLeBusy" role="status" data-testid="tl-le-busy">{WHAT[busy] ?? busy}</p>}
      {edit.error?.id === id && <p className="tlLeNote tlLeErr" role="alert" data-testid="tl-le-error">{edit.error.text}</p>}
      {!busy && edit.done?.id === id && <p className="tlLeNote tlLeOk" data-testid="tl-le-done">{edit.done.text}</p>}
      {!busy && edit.done?.id === id && <TimelineCheckNote id={id} edit={edit} />}
      {edit.undo?.id === id && <button type="button" className="tlBtn tlLeSmall" disabled={off} onClick={() => edit.restore(edit.undo)} title={`Вернуть «${edit.undo.prev.text}» и прежнюю озвучку (если её не перезаписали)`} data-testid="tl-le-undo">↶ Вернуть прежний текст</button>}
    </section>
  )
}
