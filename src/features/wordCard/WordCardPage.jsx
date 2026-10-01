import { useState } from 'react'
import BackButton from '../../shared/ui/BackButton.jsx'
import ReviewLessonSource from '../reviewCards/ReviewLessonSource.jsx'
import WordCardBlockList from './WordCardBlockList.jsx'
import WordCardPreview from './WordCardPreview.jsx'
import { useWordCard } from './useWordCard.js'

// Редактор «Справка» слова — четвёртая вкладка редактора урока рядом с «Граф»,
// «Продакшен» и «Карточки» (PROJECT.md → «Макет «Карточка слова»»). Слева — урок как
// чат (из него «＋ в справку» копирует текст сообщения блоком), в центре — блоки
// справки (текст / таблица / формула / случаи / пример диалога, в любом порядке),
// справа — превью «как увидит ученик». Хранится в lessons.script.wordCard
export default function WordCardPage({ lessonId, onBack, onOpenCanvas, onOpenProduction, onOpenCards }) {
  const wc = useWordCard(lessonId)
  const [lessonShown, setLessonShown] = useState(true)
  const busy = wc.saving || wc.loading

  // В соседний редактор уходим с сохранением (как канвас/продакшен/карточки)
  async function leaveTo(open) {
    if (wc.dirty) {
      try { await wc.save() } catch { return }
    }
    open(lessonId)
  }

  function handleBack() {
    if (wc.dirty && !window.confirm('Справка не сохранена. Выйти без сохранения?')) return
    onBack()
  }

  return (
    <div className="productionPage">
      <div className="productionPageHeader">
        <BackButton onClick={handleBack} />
        <div className="rcTitle">Справка слова · {wc.title || 'урок'}</div>
        <button className="productionPageSave" onClick={() => wc.save().catch(() => {})} disabled={busy}>
          {wc.saving ? 'Сохраняю…' : wc.dirty ? 'Сохранить •' : 'Сохранить'}
        </button>
        <button className="pageTabBtn" onClick={() => leaveTo(onOpenCanvas)} disabled={busy}>Граф</button>
        <button className="pageTabBtn" onClick={() => leaveTo(onOpenProduction)} disabled={busy}>Продакшен</button>
        <button className="pageTabBtn" onClick={() => leaveTo(onOpenCards)} disabled={busy}>Карточки</button>
        <button className="pageTabBtn pageTabBtnActive" disabled={busy}>Справка</button>
      </div>

      {wc.status && <div className="productionSyncStatus">{wc.status}</div>}

      {!wc.loading && (
        <div className="rcStrip">
          <div className="wcEdRow">
            <label className="wcEdSel">
              Метка карточки
              <input
                className="wcEdIn wcEdTag"
                value={wc.tag}
                maxLength={40}
                placeholder="служебное слово, глагол · форма -ing…"
                onChange={e => wc.changeTag(e.target.value)}
              />
            </label>
            <button
              className={'pageTabBtn' + (lessonShown ? ' pageTabBtnActive' : '')}
              onClick={() => setLessonShown(v => !v)}
              title="Урок слева: из него блоком в справку уходит текст сообщения"
            >{lessonShown ? 'Скрыть урок' : 'Показать урок'}</button>
          </div>
        </div>
      )}

      {!wc.loading && (
        <div className="rcBody wcEdBody3">
          {lessonShown && (
            <ReviewLessonSource
              nodes={wc.lessonNodes}
              hasCard
              onAddNode={wc.addFromLesson}
              addLabel="＋ в справку"
              addTitle="Копия текста сообщения — новым блоком «Текст» в конец справки"
            />
          )}
          <div className="rcCardPane wcEdPane">
            <WordCardBlockList
              nodes={wc.nodes}
              canAdd={wc.canAdd}
              onAdd={wc.addBlock}
              onUpdate={wc.updateBlock}
              onRemove={wc.removeBlock}
              onMove={wc.move}
              onShowLesson={() => setLessonShown(true)}
              lessonShown={lessonShown}
            />
          </div>
          <WordCardPreview title={wc.title} tag={wc.tag} nodes={wc.nodes} />
        </div>
      )}
    </div>
  )
}
