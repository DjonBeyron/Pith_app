import { useState } from 'react'
import { createPortal } from 'react-dom'
import LessonRulesPanel from './LessonRulesPanel.jsx'
import LessonIoExport from './LessonIoExport.jsx'
import LessonIoImport from './LessonIoImport.jsx'
import { useDeckIo } from '../../reviewCards/useDeckIo.js'
import { useWordCardIo } from '../../wordCard/useWordCardIo.js'

// Окно «Поделиться / Импорт»: урок в JSON и обратно — экспорт и импорт видны ОДНОВРЕМЕННО,
// двумя колонками, а не по вкладкам (раньше нужно было переключаться, чтобы например
// скопировать текущий урок и сразу же вставить обратно поправленный вариант).
//
// Файл состоит из трёх независимых частей — скрипт урока, карточки повтора, справка слова
// (lessonParts.js): в обе стороны они едут одним файлом или по отдельности, галочками.
// Экспорт отдаёт логику вместе с легендой формата — такой файл можно показать кому угодно
// (или модели), чтобы получить разбор или готовую часть следующего урока (LessonIoExport).
// Импорт — LessonIoImport. Здесь — общая оболочка: колода и справка (экспортируются с
// сервера, из файла пишутся на сервер), перетаскивание файла в окно, ошибка, правила
export default function LessonIoPanel({ nodes, zones = [], title, lessonId, onImport, onClose }) {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [overFile, setOverFile] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const deck = useDeckIo(lessonId)
  const wordCard = useWordCardIo(lessonId)

  // Файл с диска: и кнопкой, и перетаскиванием в окно — JSON урока обычно
  // приходит именно файлом, вставлять его текстом в поле неудобно
  function readFile(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setText(String(reader.result ?? '')); setError(null) }
    reader.onerror = () => setError('Не смог прочитать файл')
    reader.readAsText(file)
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
          <LessonIoExport
            nodes={nodes} zones={zones} title={title} lessonId={lessonId}
            deck={deck} wordCard={wordCard}
            onOpenRules={() => setRulesOpen(true)} onError={setError}
          />
          <div className="lioDivider" />
          <LessonIoImport
            text={text} onText={setText} readFile={readFile}
            title={title} lessonId={lessonId} deck={deck} wordCard={wordCard}
            onImport={onImport} onError={setError}
          />
        </div>
        {error && <div className="lioError">{error}</div>}
      </div>
      {rulesOpen && <LessonRulesPanel onClose={() => setRulesOpen(false)} />}
    </div>,
    document.body,
  )
}
