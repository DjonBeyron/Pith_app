import { useState } from 'react'
import { exportLessonText } from './exportLesson.js'
import { useLessonRules } from './useLessonRules.js'
import { ALL_PARTS, exportFileName } from './lessonParts.js'
import LessonIoParts from './LessonIoParts.jsx'
import { plural } from '../../../shared/lib/plural.js'

// Левая колонка окна «Поделиться / Импорт» — экспорт. Три части урока-слова выгружаются
// галочками: скрипт урока, карточки повтора и справка слова — все вместе одним файлом или
// любая отдельно (lessonParts.js). Легенда несёт описание только выбранных частей.
// Файлы не выгружаются — у нод стоит пометка needs
export default function LessonIoExport({ nodes, zones, title, lessonId, deck, wordCard, onOpenRules, onError }) {
  const [withLegend, setWithLegend] = useState(true)
  const [parts, setParts] = useState(ALL_PARTS)
  const [copied, setCopied] = useState(false)

  // Активные правила из Supabase (useLessonRules.js) идут в легенду вместо
  // зашитого в код списка — правки в LessonRulesPanel видны сразу в этом же
  // экспорте, без пересборки приложения. Пока правила ещё грузятся (busy,
  // rules == []), exportLesson тихо падает на встроенный дефолт в buildLegend.
  const { principles, checklist } = useLessonRules()
  const activePrinciples = principles.filter(r => r.active).map(r => r.text)
  const activeChecklist  = checklist.filter(r => r.active).map(r => r.text)
  // Колода и справка приходят с сервера — пока их нет, копировать рано: файл вышел бы без них
  const ready = deck.loaded && wordCard.loaded
  const chosen = Object.values(parts).some(Boolean)

  const shareText = exportLessonText(nodes, {
    title, lessonId, includeLegend: withLegend, zones, parts,
    reviewCards: deck.cards, wordCard: wordCard.card,
    principles: activePrinciples.length ? activePrinciples : undefined,
    checklist: activeChecklist.length ? activeChecklist : undefined,
  })

  // Сводка по тому, что РЕАЛЬНО лежит на холсте сейчас. Нужна, когда урок
  // выглядит «россыпью»: сразу видно, есть ли у нод триггеры и связи, или
  // проблема только в том, как они нарисованы
  const triggers = nodes.reduce((sum, n) => sum + (n.triggers?.length ?? 0), 0)
  const links = nodes.reduce((sum, n) => sum + (n.triggers ?? []).filter(t => t.then).length, 0)
  const sizes = [...new Set(nodes.map(n => n.size ?? 'max'))].join(', ')
  const stats = `${nodes.length} нод · ${triggers} триггеров · ${links} связей · размеры: ${sizes || '—'}` +
    (zones.length ? ` · зон: ${zones.length}` : '')

  const cardsN = deck.cards.filter(c => c?.nodes?.length).length
  const blocksN = wordCard.card?.nodes.length ?? 0
  const info = {
    lesson: `${nodes.length} ${plural(nodes.length, 'нода', 'ноды', 'нод')}`,
    reviewCards: !deck.loaded ? 'загрузка…' : cardsN ? `${cardsN} ${plural(cardsN, 'карточка', 'карточки', 'карточек')}` : 'пока нет',
    wordCard: !wordCard.loaded ? 'загрузка…' : blocksN ? `${blocksN} ${plural(blocksN, 'блок', 'блока', 'блоков')}` : 'пока нет',
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { onError('Буфер обмена недоступен — скопируйте текст вручную') }
  }

  function download() {
    const blob = new Blob([shareText], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = exportFileName(title, parts)
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="lioCol">
      <div className="lioColHead">Экспорт</div>
      <div className="lioHint">
        Выбери, что выгрузить: всё одним файлом или что-то одно — например, только справку.
        Пустую часть тоже можно отметить: в легенде будет её описание, и модель сможет её написать.
        Файлы не выгружаются — у нод, которым нужна озвучка или картинка, стоит пометка <code>needs</code>.
      </div>
      <LessonIoParts title="Что выгрузить" value={parts} onChange={setParts} info={info} />
      <label className="lioCheck">
        <input type="checkbox" checked={withLegend} onChange={e => setWithLegend(e.target.checked)} />
        Приложить легенду формата (нужна для разбора со стороны)
      </label>
      {withLegend && (
        <button className="lioRulesLink" onClick={onOpenRules}>
          Править правила ({activePrinciples.length} + {activeChecklist.length} в чек-листе)
        </button>
      )}
      <textarea className="lioText" readOnly value={shareText} onFocus={e => e.target.select()} />
      <div className="lioActions">
        <span className="lioMeta">{!chosen ? 'Отметь хотя бы одну часть' : !ready ? 'Загружаю карточки и справку…' : `${parts.lesson ? stats + ' · ' : ''}${Math.round(shareText.length / 1024)} КБ`}</span>
        <button className="lioBtn" onClick={download} disabled={!chosen || !ready}>Скачать .json</button>
        <button className="lioBtn lioBtnPrimary" onClick={copyShare} disabled={!chosen || !ready}>
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
    </div>
  )
}
