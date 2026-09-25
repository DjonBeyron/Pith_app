import { useState } from 'react'
import BackButton from '../../shared/ui/BackButton.jsx'
import ProductionList from '../production/ProductionList.jsx'
import ReviewCardStrip from './ReviewCardStrip.jsx'
import ReviewNodePicker from './ReviewNodePicker.jsx'
import ReviewCardPreview from './ReviewCardPreview.jsx'
import { useReviewCards } from './useReviewCards.js'
import { isTaskNode } from './reviewCardCopy.js'

// Редактор колоды «Карточки повтора» (этап 3 системы повторения, PROJECT.md →
// «Колоды»). Третья вкладка редактора урока рядом с «Граф» и «Продакшен»:
// карточка — короткая цепочка нод той же схемы, правится тем же списком,
// что продакшен. Хранится в lessons.script.reviewCards (saveReviewCards)
export default function ReviewCardsPage({ lessonId, moduleLessons = [], onBack, onOpenCanvas, onOpenProduction }) {
  const rc = useReviewCards(lessonId)
  const [picking, setPicking] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const busy = rc.saving || rc.loading
  const current = rc.cards[rc.active]
  const { files, pickFile, removeFile } = rc.lessonFiles

  // Уход с несохранённой колодой: в соседний редактор — сохраняем (как
  // канвас/продакшен), назад — спрашиваем
  async function leaveTo(open) {
    if (rc.dirty) {
      try { await rc.save() } catch { return }
    }
    open(lessonId)
  }

  function handleBack() {
    if (rc.dirty && !window.confirm('Карточки не сохранены. Выйти без сохранения?')) return
    onBack()
  }

  function handleDraft() {
    const n = rc.addDraft()
    if (!n) window.alert('В уроке нет заданий — черновику не из чего собраться')
  }

  function handleRemove() {
    if (!window.confirm(`Удалить карточку ${rc.active + 1}?`)) return
    rc.removeActive()
  }

  return (
    <div className="productionPage">
      <div className="productionPageHeader">
        <BackButton onClick={handleBack} />
        <div className="rcTitle">Карточки повтора · {rc.title || 'урок'}</div>
        <button className="productionPageSave" onClick={() => rc.save().catch(() => {})} disabled={busy}>
          {rc.saving ? 'Сохраняю…' : rc.dirty ? 'Сохранить •' : 'Сохранить'}
        </button>
        <button className="pageTabBtn" onClick={() => leaveTo(onOpenCanvas)} disabled={busy}>Граф</button>
        <button className="pageTabBtn" onClick={() => leaveTo(onOpenProduction)} disabled={busy}>Продакшен</button>
        <button className="pageTabBtn pageTabBtnActive" disabled={busy}>Карточки</button>
      </div>

      {rc.status && <div className="productionSyncStatus">{rc.status}</div>}

      {!rc.loading && (
        <ReviewCardStrip
          cards={rc.cards}
          active={rc.active}
          onSelect={rc.setActive}
          onAdd={rc.addCard}
          onDraft={handleDraft}
          canDraft={rc.lessonNodes.some(isTaskNode)}
          onPull={() => setPicking(true)}
          onPreview={() => setPreviewing(true)}
          onRemove={handleRemove}
          disabled={busy}
        />
      )}

      {!rc.loading && !current && (
        <div className="rcEmpty">
          Карточек пока нет. Нажми «Черновик из урока» — по карточке на каждое задание,
          или «+ Карточка» и собери её сам.
        </div>
      )}

      {!rc.loading && current && (
        <ProductionList
          key={current.id}
          nodes={current.nodes ?? []}
          onNodesChange={rc.setActiveNodes}
          lessonFiles={files}
          onPickLessonFile={pickFile}
          onRemoveLessonFile={removeFile}
          moduleLessons={moduleLessons.filter(l => l.id !== lessonId)}
        />
      )}

      {previewing && current && (
        <ReviewCardPreview
          index={rc.active}
          nodes={current.nodes ?? []}
          files={files}
          onClose={() => setPreviewing(false)}
        />
      )}

      {picking && (
        <ReviewNodePicker
          nodes={rc.lessonNodes}
          onClose={() => setPicking(false)}
          onPick={ids => { rc.pullIntoActive(ids); setPicking(false) }}
        />
      )}
    </div>
  )
}
