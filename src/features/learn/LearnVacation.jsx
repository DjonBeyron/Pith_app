import { useState } from 'react'
import { setVacation } from '../../shared/api/memoryApi.js'

// «Отпуск» — пауза расписания повторения (бесплатно, PROJECT.md → «Деньги,
// серия, XP»). Ссылка внизу вкладки → шторка с честным объяснением → RPC
// memory_set_vacation. Вернуться — в главном действии (LearnMainAction).
// Серию отпуск не замораживает — так и говорим.
export default function LearnVacation({ onChanged }) {
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    const res = await setVacation(true)
    setBusy(false)
    setAsk(false)
    if (res?.ok) onChanged()
  }

  return (
    <>
      <button className="lrVacationLink" onClick={() => setAsk(true)}>Уезжаю в отпуск</button>
      {ask && (
        <div className="lrSheetBack" onClick={() => setAsk(false)}>
          <div className="lrSheet" role="dialog" aria-label="Отпуск" onClick={e => e.stopPropagation()}>
            <p className="lrSheetWord">Отпуск 🌴</p>
            <p className="lrSheetPhrase">
              Повторения встанут на паузу. Вернёшься — сроки сдвинутся на дни отпуска: ничего не накопится
              и не придётся догонять. Серию дней отпуск не бережёт — для неё есть заморозки.
            </p>
            <button className="lrBtn lrBtnMain" disabled={busy} onClick={go}>Поставить на паузу</button>
            <button className="lrBtn lrBtnGhost" onClick={() => setAsk(false)}>Не сейчас</button>
          </div>
        </div>
      )}
    </>
  )
}
