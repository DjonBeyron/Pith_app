import { useRef, useEffect } from 'react'

// Диалог «Назад» при несохранённых правках — внутри окна сборщика, не window.confirm()
// (браузер его может блокировать). Три исхода: «Сохранить» (в библиотеку, потом выйти),
// «Не сохранять» (выйти), «Остаться» (вернуться к правкам). Esc = «Остаться» (data-esc-own —
// Esc окна не закрывает сборщик). Фокус сперва на «Остаться» (безопасный вариант); Tab
// ходит по трём кнопкам по кругу. canSave=false (нет таблицы/занято) — «Сохранить» заблокирована
// с причиной в reason. Нет диалога (open=false) — ничего не рисуется.
export default function BackConfirm({ open, embedded = false, canSave = true, reason = '', busy = false, onChoose }) {
  const stayRef = useRef(null)
  const rootRef = useRef(null)
  useEffect(() => { if (open) stayRef.current?.focus() }, [open])
  if (!open) return null

  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onChoose('stay'); return }
    if (e.key !== 'Tab') return
    const btns = [...rootRef.current.querySelectorAll('button:not(:disabled)')]
    const i = btns.indexOf(document.activeElement)
    const next = btns[(i + (e.shiftKey ? btns.length - 1 : 1)) % btns.length]
    e.preventDefault()
    next?.focus()
  }

  return (
    <div className="scbDlgWrap" data-esc-own="1" onKeyDown={onKey} onClick={e => e.stopPropagation()}>
      <div ref={rootRef} className="scbDlg scbBackDlg" role="alertdialog" aria-modal="true" aria-labelledby="scb-back-h" aria-describedby="scb-back-d">
        <h3 id="scb-back-h" className="scbDlgTitle">Выйти из сборщика?</h3>
        <p id="scb-back-d" className="scbSub">
          В сцене есть несохранённые правки.{' '}
          {embedded ? 'Сцена не будет применена — окно закроется, правки пропадут, если их не сохранить в библиотеку.' : 'Сохраните их в библиотеку или выйдите без сохранения.'}
        </p>
        {!canSave && reason && <p className="fsMsg fsMsg-warn">{reason}</p>}
        <div className="fsBtnBox scbBackBtns">
          <button type="button" className="fsBtn fsBtnPrimary" onClick={() => onChoose('save')} disabled={!canSave || busy} title="Сохранить в библиотеку и выйти">{busy ? 'Сохраняю…' : 'Сохранить'}</button>
          <button type="button" className="fsBtn" onClick={() => onChoose('discard')} disabled={busy} title="Выйти, правки пропадут">Не сохранять</button>
          <button ref={stayRef} type="button" className="fsBtn" onClick={() => onChoose('stay')} title="Вернуться к правкам (Esc)">Остаться</button>
        </div>
      </div>
    </div>
  )
}
