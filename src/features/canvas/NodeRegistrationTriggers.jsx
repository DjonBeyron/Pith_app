import { useRef, useLayoutEffect } from 'react'

export default function NodeRegistrationTriggers({ onTriggerMeasure }) {
  const submitRef = useRef(null)
  const cancelRef = useRef(null)

  useLayoutEffect(() => {
    if (!onTriggerMeasure) return
    const offsets = [submitRef, cancelRef].map(r => {
      const el = r.current
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onTriggerMeasure(offsets)
  })

  return (
    <div className="nodeRegTriggers">
      <div ref={submitRef} className="nodeRegTriggerRow nodeRegTriggerRowSubmit">
        ✓ Зарегистрироваться
      </div>
      <div ref={cancelRef} className="nodeRegTriggerRow nodeRegTriggerRowCancel">
        ✕ Отмена
      </div>
    </div>
  )
}
