import { verdictOf } from './scenarioCheck.js'
import '../../../styles/timeline-check.css'

// Итог проверки реплики СРАЗУ ПОСЛЕ СОХРАНЕНИЯ в карточке (TimelineLineEditor): «✅ подходит» либо что не так — нет звука, текст и файл разошлись, длина против текста и против прежней, тишина по краям,
// риск сцены, нет разметки рта (scenarioCheck.verdictOf: те же проверки, что у «Проверки сценария»). Рядом — «↶ Вернуть прежнюю озвучку», если звук только что заменили (прежний файл остаётся в хранилище).
// edit — useLineEdit: audit, lines, was ({ id, rec } — запись реплики до последней правки), restoreVoice.
export default function TimelineCheckNote({ id, edit }) {
  const was = edit?.was?.id === id ? edit.was.rec : null
  const v = verdictOf(id, { audit: edit?.audit, lines: edit?.lines, was })
  if (!v) return null
  const now = edit.lines?.[id], back = !!edit.restoreVoice && !!was?.url && was.url !== now?.url
  return (
    <div className="tlCkNote" data-light={v.light} role="status" data-testid="tl-le-check">
      <b>{v.light === 'green' ? '✅' : v.light === 'yellow' ? '🟡' : '🔴'} Проверка после сохранения: {v.title}</b>
      {v.notes.length > 0 && <ul>{v.notes.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {back && <div className="tlLeRow"><button type="button" className="tlBtn tlLeSmall" disabled={!!edit.busy} onClick={() => edit.restoreVoice(id, was)} title="Вернуть прежний файл озвучки (текст остаётся как сейчас)" data-testid="tl-le-undo-voice">↶ Вернуть прежнюю озвучку</button></div>}
    </div>
  )
}
