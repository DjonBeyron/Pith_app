import { useState } from 'react'
import { sandboxState, sandboxSteps, SANDBOX_STEP_TEXT, openSceneInSandbox, lintCounts } from './feedTestSandbox.js'

// Вариант «Тест без привязки (песочница)» — по умолчанию. Берёт ТЕКУЩИЙ черновик сборщика как есть: библиотека, публикация и
// модуль не нужны, в БД ничего не пишется. Лента получит обособленный слайд «ТЕСТ» (виден только вам, на этом устройстве,
// до закрытия вкладки). Ошибки линтера блокируют запуск, предупреждения — нет.
export default function FeedTestSandbox({ draft, onClose, onLeave, setStatus }) {
  const [force, setForce] = useState(true)
  const [open, setOpen] = useState(true)
  const [error, setError] = useState('')
  const state = sandboxState({ ...lintCounts(draft.lint), hasScene: !!draft.scene })

  const run = () => {
    setError('')
    const res = openSceneInSandbox(draft.scene, { force, open, close: onLeave })
    if (res.ok) {
      setStatus({ kind: 'ok', text: open ? 'Открываю ленту на тестовом слайде' : 'Тестовый слайд готов: он первый в вашей ленте' })
      if (!open) onClose()
    } else {
      setError(`Шаг «${SANDBOX_STEP_TEXT[res.failedStep] ?? res.failedStep}» не выполнен: ${res.error}`)
    }
  }

  return (
    <>
      <p className="scbSub" role="note">
        Песочница: сцена показывается в вашей ленте первым слайдом с плашкой «ТЕСТ». Ни к чему не привязана, в базу не пишется,
        другие пользователи её не видят. Живёт до закрытия вкладки.
      </p>
      <p className={`scbSub scbFtState scbFtState-${state.kind}`} role="status">{state.text}</p>
      <label className="scbCheck"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /><span>Показать задание сразу (принудительно, лимиты не тратить)</span></label>
      <label className="scbCheck"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /><span>Открыть ленту на этом слайде (окно сборщика закроется)</span></label>
      <p className="scbSub">Шаги: {sandboxSteps({ force, open }).map((s, i) => `${i + 1}. ${SANDBOX_STEP_TEXT[s]}`).join(' → ')}</p>
      {error && <p className="fsMsg fsMsg-error" role="alert">{error}</p>}
      <div className="scbHBtns">
        <button type="button" className="fsBtn fsBtnPrimary" onClick={run} disabled={!state.canRun}>Открыть в ленте (тест)</button>
      </div>
    </>
  )
}
