import { useState, useEffect, useMemo } from 'react'
import { loadCurricula, updateCurriculumScene } from '../../../../shared/lib/curriculaApi.js'
import { sendToFeed } from '../../../feed/catch/catchForce.js'
import { setForcedSceneTask } from '../../../feed/scene/sceneTaskLimits.js'
import { feedTestState, feedTestSteps, runFeedTest, moduleNote, STEP_TEXT } from './feedTestModel.js'

// Вариант «Привязать к модулю ленты» (боевой) диалога «Проверить в ленте»: выбор модуля (поиск по названию), галки «показать
// задание сразу» и «открыть ленту на этом слайде», список шагов («сохранить и опубликовать → привязать → показать → открыть»).
// Если сцены нет в библиотеке/она черновик/есть правки — сохранение и публикация идут тем же нажатием, после подтверждения
// (чекбокс). Запуск — runFeedTest (feedTestModel). Закрывает окно сборщика после перехода: onLeave.
// draft — useBuilderDraft, save(status) — useBuilderActions.save → строка библиотеки | false.
export default function FeedTestLink({ draft, library, save, onClose, onLeave, setStatus }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(null)
  const [force, setForce] = useState(true)
  const [open, setOpen] = useState(true)
  const [okSave, setOkSave] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    loadCurricula()
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) { setRows([]); setError(e?.message || 'Не удалось загрузить модули') } })
    return () => { alive = false }
  }, [])

  const state = feedTestState({ saved: draft.saved, dirty: draft.dirty, errors: draft.errors.length, missingTable: library.missingTable })
  const savedId = draft.saved.id
  const steps = pick ? feedTestSteps({ state, module: pick, savedId, force, open }) : []
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (rows ?? []).filter(m => !needle || String(m.title ?? '').toLowerCase().includes(needle))
  }, [rows, q])
  const blocked = state.kind === 'blocked' || (state.needsSave && !okSave)
  const canRun = !!pick && !busy && !blocked && !library.busy

  const run = async () => {
    setBusy(true); setError('')
    const res = await runFeedTest({
      state, module: pick, savedId, force, open,
      deps: { save, link: updateCurriculumScene, force: setForcedSceneTask, jump: sendToFeed, close: onLeave },
    })
    setBusy(false)
    if (res.ok) {
      setStatus({ kind: 'ok', text: open ? `Открываю ленту на «${pick.title}»` : `Готово: «${pick.title}» привязан, задание покажется в ленте` })
      if (!open) onClose()
    } else {
      setError(`Шаг «${STEP_TEXT[res.failedStep] ?? res.failedStep}» не выполнен: ${res.error}`)
    }
  }

  return (
    <>
      <p className="scbSub scbFtWarn" role="note">
        Привязка = сцена показывается всем пользователям в ленте вместо видео этого модуля. Требует миграции curricula.scene_id.
        Для проверки без последствий выберите «Тест без привязки».
      </p>
      <p className={`scbSub scbFtState scbFtState-${state.kind}`} role="status">{state.text}</p>
      {state.needsSave && state.kind !== 'blocked' && (
        <label className="scbCheck"><input type="checkbox" checked={okSave} onChange={e => setOkSave(e.target.checked)} /><span>Да, сохранить и опубликовать сцену</span></label>
      )}
      <input className="fsNote" value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск модуля ленты по названию…" aria-label="Поиск модуля" />
      {rows === null && <p className="scbSub">Загрузка модулей…</p>}
      {rows !== null && !shown.length && <p className="scbSub">{q ? 'Ничего не найдено' : 'Модулей пока нет'}</p>}
      <ul className="scbDlgList scbFtList">
        {shown.map(m => (
          <li key={m.id}>
            <button type="button" className={`scbDlgRow${pick?.id === m.id ? ' scbDlgRowOn' : ''}`} onClick={() => setPick(m)} aria-pressed={pick?.id === m.id} disabled={busy}>
              <span className="scbDlgRowTitle">{m.title || 'Без названия'}</span>
              <span className="scbSub">{moduleNote(m, savedId)}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="scbCheck"><input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} /><span>Показать задание сразу (принудительно, лимиты не тратить)</span></label>
      <label className="scbCheck"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} /><span>Открыть ленту на этом слайде (окно сборщика закроется)</span></label>
      {pick && <p className="scbSub">Шаги: {steps.map((s, i) => `${i + 1}. ${STEP_TEXT[s]}`).join(' → ') || 'ничего делать не нужно'}</p>}
      {error && <p className="fsMsg fsMsg-error" role="alert">{error}</p>}
      <div className="scbHBtns">
        <button type="button" className="fsBtn fsBtnPrimary" onClick={run} disabled={!canRun}>{busy ? 'Выполняю…' : 'Привязать и проверить в ленте'}</button>
      </div>
    </>
  )
}
