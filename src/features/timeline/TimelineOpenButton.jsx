import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sceneTrace } from '../../shared/lib/sceneTrace.js'
import { sendLogs } from '../../shared/lib/logUpload.js'
import { pLog } from '../../shared/lib/debug.js'
import { readTimelines, saveTimeline, saveTimelineEdits } from '../../shared/api/timelineApi.js'
import { getCatLines } from '../../shared/api/catLinesApi.js'
import { listWordAudio } from '../../shared/lib/wordAudio/wordAudioApi.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { timelineFile } from './timelineLog.js'
import { editsFile } from './montage/montageEditsText.js'
import { packRun } from './timelineStore.js'
import { statusLine, readServerCount } from './timelineServerNote.js'
import { LINE_API } from './timelineLineApi.js'
import { readScenePauses, saveScenePauses } from '../../shared/api/scenePausesApi.js'
import { readDevicePauses, saveDevicePauses } from '../../shared/lib/scenePauses.js'
import TimelineScreen from './TimelineScreen.jsx'

// Админ → «Голос»: блок «Таймлайн игры» ОДНОЙ СТРОКОЙ под «Встряхни память» — заголовок, кнопка «🎬 Таймлайн игры» и короткий статус («последняя игра: 12:41, 2:49 · на сервере 3»; число игр на сервере —
// запомненное с прошлого открытия экрана, отдельного запроса нет). Открывает экран таймлайна поверх админки (портал в body, на весь экран) на событиях трассы этого сеанса страницы
// (sceneTrace.runs() — снимок в момент открытия) и на прохождениях, сохранённых на сервере (SERVER: чтение — только при открытии экрана и по кнопке; запись — «☁ Сохранить на сервер»; автосохранение
// после игры — timelineAutosave.js). Отправка логов с экрана — обычная (sendLogs) плюс файл текстового отчёта таймлайна, список правок и файлы блока (pinned — комментарий к блоку).
// LINE_API — правка реплики из карточки (текст, озвучка, свой файл): те же функции, что у таблицы «Озвучка Пита» (timelineLineApi.js).
// VOICES — озвучка для «▶ Слушать» на клипах: реплики Пита и Мии из настроек (rotate_cat_lines) и библиотека слов (диктор) — читаются один раз при открытии экрана.
const SERVER = { read: () => readTimelines(), save: run => saveTimeline(packRun(run)), saveEdits: (run, draft) => saveTimelineEdits(run.savedAt ? run : packRun(run), draft) } // saveEdits — черновик правок монтажа (runs[i].edits)
const PAUSE_API = { readServer: () => readScenePauses({ fresh: true }), saveServer: pauses => saveScenePauses(pauses, { by: 'таймлайн' }), readDevice: () => readDevicePauses(), saveDevice: obj => saveDevicePauses(obj) } // настройки пауз: сервер (всем игрокам) и это устройство
const VOICES = { load: async () => { const [raw, lib] = await Promise.all([getCatLines(), listWordAudio()]); return { lines: normalizeLines(raw), lib } } }

export default function TimelineOpenButton() {
  const [runs, setRuns] = useState(null) // null — экран закрыт
  const send = (comment, opts, report, edits = '', pinned = []) => { pLog(`[timeline] отправка логов с экрана таймлайна: к журналу приложен отчёт pithy-timeline-….txt${edits ? ' и список правок монтажа pithy-timeline-edits-….txt' : ''}${pinned.length ? `; комментарий к блоку: ${pinned.map(f => f.name).join(', ')}` : ''}`); return sendLogs({ comment, ...opts, extra: [timelineFile(report), ...(edits ? [editsFile(edits)] : [])], pinned }) }
  return (
    <section className="aspBlock aspTlRow" data-testid="timeline-block">
      <h3 className="aspH">🎬 Таймлайн</h3>
      <button type="button" className="aspChip" onClick={() => setRuns(sceneTrace.runs())} title="Кто когда говорит и где паузы: монтажный стол последней игры «Встряхни память» (и игр, сохранённых на сервере)" data-testid="timeline-open">🎬 Таймлайн игры</button>
      <span className="aspTlStatus" data-testid="timeline-status">{statusLine(sceneTrace.runs(), readServerCount())}</span>
      {runs && createPortal(<TimelineScreen runs={runs} onClose={() => setRuns(null)} send={send} server={SERVER} voices={VOICES} lineApi={LINE_API} pauseApi={PAUSE_API} />, document.body)}
    </section>
  )
}
