import { TOPICS, TOPIC_TITLE } from './pillStandPacks.js'
import { SPANS, LAST_SECONDS } from './pillStandSpan.js'
import { SPAN_TITLE, toggleTopic, setSpan, setComment, setSound, canSend } from './pillStandSendForm.js'

// Окно «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме») — лист снизу на 375 px: о чём замечание (темы галочками), отрезок, комментарий, «◆ Отметить кадр» (метки — в файл),
// звук записи, «Отправить файлом» / «Скопировать текстом», «📎 Звук» вторым нажатием (iPhone). Без хуков: состояние и действия — у useStandSend (окно можно проверить вызовом функции в тесте).
const sec = ms => (ms / 1000).toFixed(3).replace('.', ',')
const SHORT = { honesty: 'Честность', ear: 'Распознавание (Vosk)' }

export default function PillStandSend({ ctx, form, onForm, ab = null, hasAudio = false, marks = [], onMark, onUnmark, onSend, onCopy, onSendAudio, later = null, note = '', busy = false, onClose }) {
  const abOk = !!(ab && ab[1] > ab[0])
  const here = ctx?.frame != null ? `кадр ${ctx.frame + 1}` : `${sec(ctx?.at ?? 0)} с`
  return (
    <div className="psSend" role="dialog" aria-label="Отправить замечание" data-testid="ps-send">
      <div className="psSendHead">
        <b>📤 Отправить замечание</b>
        <button type="button" className="psBtn psBtn--tiny" onClick={onClose} aria-label="Закрыть" data-testid="ps-send-close">✕</button>
      </div>
      <p className="psSendLabel">О чём замечание</p>
      <div className="psChips" role="group" data-testid="ps-send-topics">
        {TOPICS.map(t => {
          const on = form.topics.includes(t)
          return <button key={t} type="button" role="checkbox" aria-checked={on} className="psChip" data-on={on ? '1' : undefined} onClick={() => onForm(toggleTopic(form, t))} data-testid={`ps-send-topic-${t}`}>{on ? '☑' : '☐'} {SHORT[t] ?? TOPIC_TITLE[t]}</button>
        })}
      </div>
      <p className="psSendLabel">Отрезок</p>
      <div className="psChips" role="radiogroup" data-testid="ps-send-spans">
        {SPANS.map(s => {
          const on = form.span === s, off = s === 'ab' && !abOk
          return <button key={s} type="button" role="radio" aria-checked={on} className="psChip" data-on={on ? '1' : undefined} disabled={off} onClick={() => onForm(setSpan(form, s))} data-testid={`ps-send-span-${s}`}>{SPAN_TITLE[s]}{s === 'ab' && abOk ? ` ${sec(ab[0])}–${sec(ab[1])} с` : s === 'ab' ? ' (не отмечен)' : ''}</button>
        })}
        {form.span === 'last' && <span className="psSeg">{LAST_SECONDS.map(n => <button key={n} type="button" className="psSegBtn" data-on={form.sec === n ? '1' : undefined} onClick={() => onForm(setSpan(form, 'last', n))} data-testid={`ps-send-sec-${n}`}>{n} с</button>)}</span>}
      </div>
      <p className="psSendLabel">Комментарий — что не так, своими словами</p>
      <textarea className="psSendText" rows={3} value={form.comment} onChange={e => onForm(setComment(form, e.target.value))} placeholder="например: на «meet» заливка дёрнулась раньше голоса" data-testid="ps-send-comment" />
      <div className="psRow">
        <button type="button" className="psBtn" onClick={onMark} data-testid="ps-send-mark">◆ Отметить {here}</button>
        {marks.map((m, i) => <button key={`${m.t}-${i}`} type="button" className="psChip psMark" onClick={() => onUnmark(i)} aria-label={`Убрать метку ${i + 1}`} data-testid={`ps-send-mark-${i + 1}`}>◆{i + 1} {sec(m.t)} с{m.i != null ? ` · к.${m.i + 1}` : ''} ✕</button>)}
      </div>
      <label className="psSendSound" data-off={hasAudio ? undefined : '1'}>
        <input type="checkbox" checked={hasAudio && form.sound} disabled={!hasAudio} onChange={e => onForm(setSound(form, e.target.checked))} data-testid="ps-send-sound" /> звук записи отдельным файлом{hasAudio ? '' : ' — записи со звуком нет'}
      </label>
      <div className="psRow">
        <button type="button" className="psBtn psSendGo" onClick={onSend} disabled={!canSend(form) || busy} data-testid="ps-send-go">{canSend(form) ? 'Отправить файлом' : 'Выберите тему'}</button>
        <button type="button" className="psBtn" onClick={onCopy} disabled={!canSend(form) || busy} data-testid="ps-send-copy">Скопировать текстом</button>
        {later && <button type="button" className="psBtn" onClick={onSendAudio} data-testid="ps-send-audio">📎 Звук ({later.name.split('.').pop()})</button>}
      </div>
      {note && <p className="psNote" data-testid="ps-send-note">{note}</p>}
    </div>
  )
}
