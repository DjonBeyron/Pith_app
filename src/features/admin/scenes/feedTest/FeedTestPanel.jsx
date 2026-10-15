import { useState, useEffect } from 'react'
import { loadCurricula } from '../../../../shared/lib/curriculaApi.js'
import { listScenes } from '../../../../shared/api/scenesApi.js'
import { copyText } from '../fileUtils.js'
import { openSceneInFeed } from './openInFeed.js'
import { resetSceneTaskLimits } from './resetTaskLimits.js'
import { testRows, resetMessage } from './feedTestList.js'
import FeedTestHowTo from './FeedTestHowTo.jsx'
import '../../../../styles/admin-scenes-feedtest.css'

// Админ → Сцены → «Тест в ленте»: модули ленты, к которым привязана сцена, и кнопка «Открыть в ленте с заданием» (принудительный
// показ задания без лимитов + поворот ленты к модулю). Ниже — «Сбросить лимиты показа задания на этом устройстве» и инструкция
// для проверки голосовых заданий. Привязать новую сцену к модулю: сборщик → «Проверить в ленте» или панель медиа модуля.
export default function FeedTestPanel() {
  const [state, setState] = useState({ rows: null, error: '' })
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([loadCurricula(), listScenes().catch(() => [])])
      .then(([mods, scenes]) => { if (alive) setState({ rows: testRows(mods, scenes), error: '' }) })
      .catch(e => { if (alive) setState({ rows: [], error: e?.message || 'Не удалось загрузить модули' }) })
    return () => { alive = false }
  }, [])

  const open = r => setMsg(openSceneInFeed({ moduleId: r.moduleId, sceneId: r.sceneId }) ? null : { bad: true, text: 'Не удалось выставить принудительный показ (sessionStorage недоступен)' })
  const link = async r => setMsg({ bad: false, text: (await copyText(r.link)) ? `Ссылка на «${r.title}» скопирована` : 'Не удалось скопировать ссылку' })
  const reset = () => setMsg({ bad: false, text: resetMessage(resetSceneTaskLimits()) })
  const { rows, error } = state

  return (
    <div className="scCard scFt">
      <p className="scCardTitle">Тест в ленте</p>
      <p className="scHint">Модули со сценой. Кнопка откроет ленту на нужном слайде и покажет задание сразу, не тратя лимиты.</p>
      {error && <p className="scBad" role="alert">{error}</p>}
      {rows === null && <p className="scHint">Загрузка модулей…</p>}
      {rows?.length === 0 && !error && <p className="scHint">Пока ни один модуль не привязан к сцене. Привяжите: сборщик → «Проверить в ленте».</p>}
      <ul className="scFtList">
        {(rows ?? []).map(r => (
          <li key={r.moduleId} className="scFtRow">
            <div className="scFtInfo">
              <span className="scFtTitle">{r.title}</span>
              <span className="scNote">сцена «{r.sceneTitle}» · {r.note}</span>
            </div>
            <button type="button" className="scBtn scFtBtn" onClick={() => open(r)} disabled={!r.canOpen} title={r.canOpen ? 'Лента откроется на этом модуле, задание покажется сразу' : r.note}>Открыть в ленте с заданием</button>
            <button type="button" className="scBtn" onClick={() => link(r)} title="Скопировать deep-link на модуль (для телефона)">Ссылка</button>
          </li>
        ))}
      </ul>
      <div className="scFtReset">
        <button type="button" className="scBtn" onClick={reset}>Сбросить лимиты показа задания на этом устройстве</button>
        <span className="scNote">Очищает счётчик дня, паузы «Спроси позже» и незавершённый принудительный показ.</span>
      </div>
      {msg && <p className={msg.bad ? 'scBad' : 'scNote'} role="status">{msg.text}</p>}
      <FeedTestHowTo />
    </div>
  )
}
