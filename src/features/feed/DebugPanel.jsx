import { useState } from 'react'
import { X } from 'lucide-react'
import { collectEnv, fdbgLog } from '../../shared/lib/feedDebug.js'
import { getPlayerLines } from '../../shared/lib/debug.js'
import { swipeTraceReport } from './feedSwipeReport.js'
import { videoCanvasReport } from '../../shared/lib/videoCanvasMode.js'
import { PERF_FLAG_DEFS, perfFlags, togglePerfFlag, perfFlagsSummary } from '../../shared/lib/perfFlags.js'

// Панель дебага ленты: собирает отчёт (окружение + метрики ленты + трассировка
// скролла + датчик производительности + лог событий), умеет Поделиться (share
// sheet на iPhone), Скопировать, Скачать.
// Про «дёрганье»/«полёт» листания смотреть секцию «лента (Swiper)»
// (feedSwipeReport.js) и отчёт «обезьяны» — автотеста ленты (feedMonkey.js).

// Отчёт последнего прогона обезьяны живёт между открытиями панели: панель
// закрывается на время прогона, иначе перекрывала бы ленту
let monkeyReport = ''

export default function DebugPanel({ getFeedInfo, onClose }) {
  const [report, setReport] = useState(build)
  const [msg, setMsg] = useState('')

  // Датчик производительности (shared/lib/appPerfProbe.js): последние ~5 минут
  // посекундных строк + сканы композитора + моменты сворачивания
  function perfLog() {
    const lines = getPlayerLines().filter(l => /\[(perf|vis|suspects)\]/.test(l))
    return lines.slice(-320).join('\n') || '(датчик выключен — нужен админ или флаг «лог и версия в шапке»)'
  }

  // Трассировка ленты на Swiper: касания, смены слайда, аномалии (полёт,
  // проскок, перекос, зависание, скрытая поехала)
  function scrollSection() {
    const monkey = monkeyReport ? `

--- обезьяна ---
${monkeyReport}` : ''
    return `

--- лента (Swiper) ---
${swipeTraceReport()}${monkey}`
  }

  // Автотест ленты на этом же устройстве: панель закрывается, обезьяна минуту
  // листает/тапает/переключает вкладки, потом открой DBG снова — отчёт внутри
  async function runMonkey() {
    onClose()
    const m = await import('../debugTools/feedMonkey.js')
    monkeyReport = await m.runFeedMonkey({ ms: 60000 })
  }

  function build() {
    return `${collectEnv()}\nperfFlags: ${perfFlagsSummary()}\n${videoCanvasReport()}\n\n--- лента ---\n${getFeedInfo()}${scrollSection()}\n\n--- perf (датчик, 1 строка = 1 секунда) ---\n${perfLog()}\n\n--- лог ---\n${fdbgLog()}`
  }

  function share() {
    if (navigator.share) {
      navigator.share({ title: 'HETA debug', text: report }).catch(() => {})
    } else {
      setMsg('share недоступен — копируй')
    }
  }

  function copy() {
    navigator.clipboard?.writeText(report)
      .then(() => setMsg('Скопировано'))
      .catch(() => setMsg('Не удалось скопировать'))
  }

  function download() {
    const url = URL.createObjectURL(new Blob([report], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'pithy-debug.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fdbgOverlay">
      <div className="fdbgCard">
        <div className="fdbgHead">
          <b>Дебаг ленты</b>
          <button className="fdbgClose" onClick={onClose}><X size={16} /></button>
        </div>
        <textarea className="fdbgText" readOnly value={report} />
        {/* Бисекция лага сворачивания: каждая кнопка переключает флаг и
            перезагружает страницу (shared/lib/perfFlags.js) */}
        <div className="fdbgBtns">
          {PERF_FLAG_DEFS.map(d => (
            <button key={d.key} onClick={() => togglePerfFlag(d.key)}>
              {perfFlags[d.key] ? '✓ ' : ''}{d.label}
            </button>
          ))}
        </div>
        <div className="fdbgBtns">
          <button onClick={share}>Поделиться</button>
          <button onClick={copy}>Скопировать</button>
          <button onClick={download}>Скачать</button>
          <button onClick={() => { setReport(build()); setMsg('Обновлено') }}>Обновить</button>
          <button onClick={runMonkey}>🐒 Обезьяна 60с</button>
        </div>
        {msg && <div className="fdbgMsg">{msg}</div>}
      </div>
    </div>
  )
}
