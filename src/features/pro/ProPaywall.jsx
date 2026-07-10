import { useState } from 'react'
import { createSubscriptionPayment, PRO_PRICE_RUB } from '../../shared/api/subscriptionApi.js'

// Экран подписки Pithy Pro: преимущества + кнопка оплаты.
// heading — заголовок под контекст показа («Энергия закончилась?» /
// «Поздравляем с финалом!» / просто «Pithy Pro»).
// Оплата: create-payment возвращает url ЮKassa (redirect) или stub,
// пока касса не подключена.
export default function ProPaywall({ heading = 'Pithy Pro', onClose }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleBuy() {
    setBusy(true)
    setMsg('')
    const res = await createSubscriptionPayment()
    if (res.url) { window.location.href = res.url; return }
    setBusy(false)
    setMsg(res.stub
      ? 'Оплата откроется совсем скоро — мы уже подключаем кассу'
      : 'Не получилось создать платёж, попробуй позже')
  }

  // stopPropagation на фоне: экран может открываться поверх EnergyPaywall —
  // клик по фону закрывает только Pro, не оба экрана сразу
  return (
    <div className="ppOverlay" onClick={e => { e.stopPropagation(); onClose() }}>
      <div className="ppCard" onClick={e => e.stopPropagation()}>
        <button className="ppClose" onClick={onClose}>×</button>
        <div className="ppCrown">👑</div>
        <h1>{heading}</h1>

        <ul className="ppPerks">
          <li><span>⚡</span> Безлимит энергии — уроки без ожидания</li>
          <li><span>📚</span> Копилка слов без лимита (бесплатно — 20)</li>
          <li><span>👑</span> Значок PRO в рейтинге и супергонке</li>
          <li><span>💚</span> Поддержка развития Pithy</li>
        </ul>

        <button className="ppBtnBuy" onClick={handleBuy} disabled={busy}>
          {busy ? 'Секунду...' : `Оформить — ${PRO_PRICE_RUB} ₽/мес`}
        </button>
        {msg && <div className="ppMsg">{msg}</div>}

        <button className="ppBtnLater" onClick={onClose}>Не сейчас</button>
      </div>
    </div>
  )
}
