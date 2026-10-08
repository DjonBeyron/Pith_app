import { useState, memo } from 'react'
import TypeWordKeyboard from '../../player/panels/type-word/TypeWordKeyboard.jsx'
import CatchConfirmPopup from './CatchConfirmPopup.jsx'
import { shouldConfirm, noteConfirmShown } from './catchConfirm.js'

// Шторка «Напечатать» «Ловли слов» — внизу слайда над навигацией (feed-catch-sheet.css). Пока печатаем
// (phase 'type'): клавиатура с запутывателями (TypeWordKeyboard, model = catchKeyboard(слово, уровень), helped гасит
// запутыватели, shift — подписи клавиш заглавные, когда следующая буква будет заглавной), главная кнопка «Следующее
// слово» (на последнем слове — «Проверить»), под ней две текстовые: «Раскрыть» и «Подсказать» (скрыта на уровне 0 и
// после использования на этом слове). Обе — через попап подтверждения (CatchConfirmPopup) первые разы (catchConfirm.js:
// shouldConfirm/noteConfirmShown), потом сразу. Высота шторки постоянная для всех слов (три ряда клавиш всегда,
// ряд текстовых кнопок min-height, даже когда «Подсказать» скрыта) — ничего не прыгает между словами.
// Слева от главной — «Предыдущее слово» (вернуться и поправить): на первом слове (!hasPrev) схлопнута, главная во всю
// ширину; на остальных плавно раскрывается (flex-basis, feed-catch-sheet.css). Без onPrev кнопки в DOM нет.
// Попап подтверждения — абсолютный слой поверх шторки (.catchConfirmLayer), высоту шторки не меняет.
// Финал (phase 'result'): тело шторки (клавиатура и кнопки) сворачивается высотой ~260мс (.catchSheetFold — единственный
// момент, когда шторке можно менять высоту), вместо него раскрывается ряд с одной кнопкой «Готово».
// cur — активное слово { text, level, ... } или null; isLast — активное слово последнее во фразе;
// hasPrev — активное слово не первое; shift — следующая буква будет заглавной (первое слово фразы, пока пусто)
function CatchSheet({
  phase = 'type', cur, helped = false, model, isLast = false, hasPrev = false, shift = false,
  onKey, onBackspace, onNext, onPrev, onCheck, onHelp, onReveal, onFinish,
}) {
  const [confirm, setConfirm] = useState(null) // 'reveal' | 'hint' | null — попап открыт
  const act = kind => (kind === 'reveal' ? onReveal : onHelp)

  function ask(kind) {
    if (shouldConfirm(kind)) { setConfirm(kind); return }
    act(kind)()
  }
  function confirmOk() {
    const kind = confirm
    setConfirm(null)
    if (!kind) return
    noteConfirmShown(kind)
    act(kind)()
  }

  const result = phase === 'result'
  return (
    <div className="catchSheet" role="group" aria-label={result ? 'Результат' : 'Напечатай, что услышал'}>
      <div className={result ? 'catchSheetFold' : 'catchSheetFold catchSheetFoldOpen'} inert={result || undefined}>
        <div className="catchSheetFoldIn">
          <div className="catchSheetInner">
            {cur && model && (
              <TypeWordKeyboard model={model} helped={helped} shift={shift} onKey={onKey} onBackspace={onBackspace} />
            )}
            <div className="catchMainRow">
              {onPrev && (
                <button
                  type="button"
                  className={`catchPrevBtn${hasPrev ? ' catchPrevShown' : ''}`}
                  disabled={!hasPrev || !cur}
                  tabIndex={hasPrev ? 0 : -1}
                  aria-hidden={!hasPrev}
                  onClick={onPrev}
                >
                  Предыдущее слово
                </button>
              )}
              <button type="button" className="phraseCheckBtn catchMainBtn" disabled={!cur} onClick={isLast ? onCheck : onNext}>
                {isLast ? 'Проверить' : 'Следующее слово'}
              </button>
            </div>
            <div className="catchTextBtns">
              <button type="button" className="catchTextBtn" disabled={!!confirm} onClick={() => ask('reveal')}>Раскрыть</button>
              {cur && cur.level > 0 && !helped && (
                <button type="button" className="catchTextBtn" disabled={!!confirm} onClick={() => ask('hint')}>Подсказать</button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className={result ? 'catchSheetFold catchSheetFoldOpen catchDoneFold' : 'catchSheetFold catchDoneFold'} inert={!result || undefined}>
        <div className="catchSheetFoldIn">
          <div className="catchDoneRow">
            <button type="button" className="phraseCheckBtn catchMainBtn" onClick={onFinish}>Готово</button>
          </div>
        </div>
      </div>
      {confirm && !result && (
        <CatchConfirmPopup
          kind={confirm}
          memory={(cur?.level ?? 0) >= 2}
          onConfirm={confirmOk}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}

// memo: клавиатура не зависит от набранного (typedBy ей не передаётся), действия хука стабильны — клавиша перерисовывает только строку набранного
export default memo(CatchSheet)
