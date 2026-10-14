import { useEffect, useRef } from 'react'

// Подтверждение включения взвешенного движка — свой диалог внутри окна
// (window.confirm в браузерах блокируется и в standalone-режиме не всегда виден).
// Включается только черновик: на всех лента переключится после «Сохранить».
export default function EngineConfirm({ onConfirm, onCancel }) {
  const firstRef = useRef(null)
  useEffect(() => { firstRef.current?.focus() }, [])
  return (
    <div className="fsConfirmBack" role="presentation" onClick={onCancel}>
      <div className="fsConfirm" role="alertdialog" aria-modal="true" aria-labelledby="fsConfirmTitle" aria-describedby="fsConfirmText" onClick={e => e.stopPropagation()}>
        <h2 id="fsConfirmTitle" className="fsConfirmTitle">Включить взвешенный режим?</h2>
        <p id="fsConfirmText" className="fsConfirmText">
          Порядок «Рекомендаций» будет считаться по весам сигналов из этого конфига. Это коснётся всех
          пользователей после сохранения версии — они подхватят её при следующем запуске приложения.
          Вернуться к старому порядку можно в любой момент кнопкой «Старый режим» или откатом версии.
        </p>
        <div className="fsConfirmBtns">
          <button ref={firstRef} className="fsBtn" onClick={onCancel}>Отмена</button>
          <button className="fsBtn fsBtnPrimary" onClick={onConfirm}>Включить в черновике</button>
        </div>
      </div>
    </div>
  )
}
