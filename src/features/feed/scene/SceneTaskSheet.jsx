import { memo } from 'react'
import { Volume2 } from 'lucide-react'
import TypeWordKeyboard from '../../player/panels/type-word/TypeWordKeyboard.jsx'
import { TASK_KEYBOARD } from './sceneTaskKeyboard.js'
import { MAX_ATTEMPTS } from './sceneTaskState.js'
import { useFrozenPhase } from './useFrozenPhase.js'

// Панель задания «О чём диалог» (внутри SceneTaskCover, стили — классы шторки «Ловли» feed-catch-sheet.css + свои в
// feed-scene-task.css). Сверху вопрос и «Послушать ещё раз» (целевая реплика проигрывается ещё раз), строка набранного
// с курсором, строка-заметка постоянной высоты (пусто / «✗ Не совсем» + подсказка после первой ошибки), затем тело:
// клавиатура (все буквы живые, TASK_KEYBOARD) + «Проверить» + текстовые «Не знаю» / «Спроси позже». Финал (phase 'checked'):
// тело складывается (.catchSheetFold), раскрывается вердикт — «Верно!» или верный перевод — с самой репликой и «Готово».
// Все действия — стабильные обёртки useSceneTask, поэтому memo: клавиша перерисовывает только строку набранного.
function SceneTaskSheet({
  phase: rawPhase, typed = '', wrong = false, attempt = 0, ok = false, gaveUp = false, result = null,
  prompt, lineText = '', hint = '', answer = '',
  onKey, onBackspace, onCheck, onGiveUp, onLater, onFinish, onReplay,
}) {
  const phase = useFrozenPhase(rawPhase) // «Готово» → closed: панель уезжает с тем же видом (useFrozenPhase.js)
  const done = phase === 'checked'
  const canCheck = phase === 'answering' && typed.trim().length > 0
  const shown = result?.matchedAnswer || answer
  const note = wrong && !done
    ? `Не совсем.${hint ? ` Подсказка: ${hint}.` : ''} Осталась ещё ${MAX_ATTEMPTS - attempt === 1 ? 'одна попытка' : `${MAX_ATTEMPTS - attempt} попытки`}`
    : ''
  return (
    <div className="catchSheet stSheet" role="group" aria-label="О чём диалог">
      <div className="stHead">
        <div className="stPrompt">{prompt}</div>
        <button type="button" className="stReplay" onClick={onReplay} aria-label="Послушать реплику ещё раз">
          <Volume2 size={16} strokeWidth={2} /> Ещё раз
        </button>
      </div>
      {!done && (
        <div className="stTyped" aria-live="polite">
          {typed ? <span className="stTypedText">{typed}</span> : <span className="stPlaceholder">Напиши по-русски, что было сказано…</span>}
          <i className="stCaret" aria-hidden="true" />
        </div>
      )}
      {!done && <p className={`stNote${note ? ' stNoteBad' : ''}`} role="status">{note}</p>}
      <div className={done ? 'catchSheetFold' : 'catchSheetFold catchSheetFoldOpen'} inert={done || undefined}>
        <div className="catchSheetFoldIn">
          <div className="catchSheetInner stInner">
            <TypeWordKeyboard model={TASK_KEYBOARD} shift={typed === ''} onKey={onKey} onBackspace={onBackspace} />
            <div className="catchMainRow">
              <button type="button" className="phraseCheckBtn catchMainBtn" disabled={!canCheck} onClick={onCheck}>Проверить</button>
            </div>
            <div className="catchTextBtns">
              <button type="button" className="catchTextBtn" onClick={onGiveUp}>Не знаю</button>
              <button type="button" className="catchTextBtn" onClick={onLater}>Спроси позже</button>
            </div>
          </div>
        </div>
      </div>
      <div className={done ? 'catchSheetFold catchSheetFoldOpen catchDoneFold' : 'catchSheetFold catchDoneFold'} inert={!done || undefined}>
        <div className="catchSheetFoldIn">
          <div className="stVerdict">
            <p className={ok ? 'stVerdictTitle stVerdictOk' : 'stVerdictTitle stVerdictBad'}>
              {ok ? '✓ Верно!' : gaveUp ? 'Правильный перевод:' : '✗ Не вышло. Правильный перевод:'}
            </p>
            {typed && !ok && <p className="stVerdictMine">Твой ответ: «{typed}»</p>}
            <p className="stVerdictAnswer">{shown}</p>
            {lineText && <p className="stVerdictLine">{lineText}</p>}
            <div className="catchDoneRow stDoneRow">
              <button type="button" className="phraseCheckBtn catchMainBtn" onClick={onFinish}>Готово</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(SceneTaskSheet)
