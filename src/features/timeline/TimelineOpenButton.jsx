import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sceneTrace } from '../../shared/lib/sceneTrace.js'
import { sendLogs } from '../../shared/lib/logUpload.js'
import { pLog } from '../../shared/lib/debug.js'
import { readTimelines, saveTimeline, saveTimelineEdits } from '../../shared/api/timelineApi.js'
import { timelineFile } from './timelineLog.js'
import { editsFile } from './montage/montageEditsText.js'
import { packRun } from './timelineStore.js'
import TimelineScreen from './TimelineScreen.jsx'

// Админ → «Голос»: блок «Таймлайн игры» с кнопкой «🎬 Таймлайн последней игры». Открывает экран таймлайна поверх админки (портал в body, на весь экран) на событиях трассы этого сеанса страницы
// (sceneTrace.runs() — снимок в момент открытия) и на прохождениях, сохранённых на сервере (SERVER: чтение — только при открытии экрана и по кнопке; запись — «☁ Сохранить на сервер»; автосохранение
// после игры — timelineAutosave.js). Отправка логов с экрана — обычная (sendLogs) плюс файл текстового отчёта таймлайна.
const SERVER = { read: () => readTimelines(), save: run => saveTimeline(packRun(run)), saveEdits: (run, draft) => saveTimelineEdits(run.savedAt ? run : packRun(run), draft) } // saveEdits — черновик правок монтажа (runs[i].edits)

export default function TimelineOpenButton() {
  const [runs, setRuns] = useState(null) // null — экран закрыт
  const send = (comment, opts, report, edits = '') => { pLog(`[timeline] отправка логов с экрана таймлайна: к журналу приложен отчёт pithy-timeline-….txt${edits ? ' и список правок монтажа pithy-timeline-edits-….txt' : ''}`); return sendLogs({ comment, ...opts, extra: [timelineFile(report), ...(edits ? [editsFile(edits)] : [])] }) }
  return (
    <section className="aspBlock" data-testid="timeline-block">
      <h3 className="aspH">🎬 Таймлайн игры — кто когда говорит и где паузы</h3>
      <p className="aspHint">Сыграй во «Встряхни память» и вернись: на таймлайне — паузы с текстом реплик перед тишиной и после, этапы, реплики Пита и Мии, слова диктора, пилюли и ответы. Доигранная игра сама сохраняется на сервер (последние 3) — сыграй на телефоне, открой здесь на ПК.</p>
      <div className="aspRow"><button type="button" className="aspChip" onClick={() => setRuns(sceneTrace.runs())} data-testid="timeline-open">🎬 Таймлайн последней игры</button></div>
      {runs && createPortal(<TimelineScreen runs={runs} onClose={() => setRuns(null)} send={send} server={SERVER} />, document.body)}
    </section>
  )
}
