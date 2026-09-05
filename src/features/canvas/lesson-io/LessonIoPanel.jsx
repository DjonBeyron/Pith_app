import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { exportLessonText } from './exportLesson.js'
import { importLesson } from './importLesson.js'

// Окно «Поделиться / Импорт»: урок целиком в JSON и обратно — экспорт и
// импорт видны ОДНОВРЕМЕННО, двумя колонками, а не по вкладкам (раньше
// нужно было переключаться, чтобы например скопировать текущий урок и сразу
// же вставить обратно поправленный вариант).
//
// Экспорт отдаёт логику сценария вместе с легендой формата — такой файл можно
// показать кому угодно (или модели), чтобы получить разбор и готовый шаблон
// следующего урока. Медиа в файл не попадает: у нод стоит пометка needs.
export default function LessonIoPanel({ nodes, title, lessonId, onImport, onClose }) {
  const [withLegend, setWithLegend] = useState(true)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [report, setReport] = useState(null)
  const [copied, setCopied] = useState(false)
  const [overFile, setOverFile] = useState(false)
  const fileRef = useRef(null)

  const shareText = exportLessonText(nodes, { title, lessonId, includeLegend: withLegend })

  // Сводка по тому, что РЕАЛЬНО лежит на холсте сейчас. Нужна, когда урок
  // выглядит «россыпью»: сразу видно, есть ли у нод триггеры и связи, или
  // проблема только в том, как они нарисованы
  const stats = (() => {
    const triggers = nodes.reduce((sum, n) => sum + (n.triggers?.length ?? 0), 0)
    const links = nodes.reduce((sum, n) => sum + (n.triggers ?? []).filter(t => t.then).length, 0)
    const sizes = [...new Set(nodes.map(n => n.size ?? 'max'))].join(', ')
    return `${nodes.length} нод · ${triggers} триггеров · ${links} связей · размеры: ${sizes || '—'}`
  })()

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { setError('Буфер обмена недоступен — скопируйте текст вручную') }
  }

  function download() {
    const blob = new Blob([shareText], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(title || 'lesson').replace(/[^\w\-.]+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Файл с диска: и кнопкой, и перетаскиванием в окно — JSON урока обычно
  // приходит именно файлом, вставлять его текстом в поле неудобно
  function readFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? ''))
      setError(null)
      setWarnings([])
      setReport(null)
    }
    reader.onerror = () => setError('Не смог прочитать файл')
    reader.readAsText(file)
  }

  // Разбор без применения: сразу видно, сколько нод и СВЯЗЕЙ приедет
  function check() {
    setError(null)
    setWarnings([])
    setReport(null)
    try {
      const r = importLesson(text)
      setWarnings(r.warnings)
      setReport(`Разобрано: ${r.nodes.length} нод, ${r.links} связей`)
      return r
    } catch (e) {
      setError(e.message ?? 'Не разобрал JSON')
      return null
    }
  }

  function runImport(mode) {
    const result = check()
    if (!result) return
    const what = mode === 'replace'
      ? `Заменить весь урок на ${result.nodes.length} нод (${result.links} связей)? Текущие ноды пропадут.`
      : `Добавить ${result.nodes.length} нод (${result.links} связей) к текущему уроку?`
    if (!window.confirm(what)) return
    onImport(result.nodes, mode, result.links)
    setReport(`Готово: ${result.nodes.length} нод, ${result.links} связей на холсте`)
  }

  return createPortal(
    <div className="lioOverlay" onMouseDown={onClose}>
      <div
        className={`lioModal${overFile ? ' lioModalDrop' : ''}`}
        onMouseDown={e => e.stopPropagation()}
        onDragOver={e => { e.preventDefault(); setOverFile(true) }}
        onDragLeave={() => setOverFile(false)}
        onDrop={e => {
          e.preventDefault()
          setOverFile(false)
          readFile(e.dataTransfer.files?.[0])
        }}
      >
        <div className="lioHeader">
          <span className="lioTitle">Поделиться / Импорт</span>
          <button className="lioClose" onClick={onClose}>×</button>
        </div>

        <div className="lioCols">
          <div className="lioCol">
            <div className="lioColHead">Экспорт</div>
            <div className="lioHint">
              Весь сценарий: ноды, их настройки и переходы. Файлы не выгружаются —
              у нод, которым нужна озвучка или картинка, стоит пометка <code>needs</code>.
            </div>
            <label className="lioCheck">
              <input type="checkbox" checked={withLegend}
                onChange={e => setWithLegend(e.target.checked)} />
              Приложить легенду формата (нужна для разбора со стороны)
            </label>
            <textarea className="lioText" readOnly value={shareText} onFocus={e => e.target.select()} />
            <div className="lioActions">
              <span className="lioMeta">{stats} · {Math.round(shareText.length / 1024)} КБ</span>
              <button className="lioBtn" onClick={download}>Скачать .json</button>
              <button className="lioBtn lioBtnPrimary" onClick={copyShare}>
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          <div className="lioDivider" />

          <div className="lioCol">
            <div className="lioColHead">Импорт</div>
            <div className="lioHint">
              Выберите файл, перетащите его сюда или вставьте JSON текстом — соберётся
              готовый сценарий с нодами, настройками и переходами.
            </div>
            <div className="lioActions">
              <button className="lioBtn" onClick={() => fileRef.current?.click()}>Выбрать файл…</button>
              <button className="lioBtn" onClick={check} disabled={!text.trim()}>Проверить</button>
              <span className="lioMeta">{report ?? 'или перетащите .json в это окно'}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={e => { readFile(e.target.files?.[0]); e.target.value = '' }}
              />
            </div>
            <textarea
              className="lioText"
              placeholder='{ "format": "pithy-lesson", "nodes": [ … ] }'
              value={text}
              onChange={e => setText(e.target.value)}
            />
            {error && <div className="lioError">{error}</div>}
            {warnings.length > 0 && (
              <ul className="lioWarn">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
            <div className="lioActions">
              <span className="lioMeta">Ноды получат новые id, номера пересчитаются</span>
              <button className="lioBtn" disabled={!text.trim()}
                onClick={() => runImport('append')}>Добавить к уроку</button>
              <button className="lioBtn lioBtnPrimary" disabled={!text.trim()}
                onClick={() => runImport('replace')}>Заменить урок</button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
