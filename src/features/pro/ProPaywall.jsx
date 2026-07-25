import { useState } from 'react'
import { Crown, Zap, Library, Heart } from 'lucide-react'
import {
  createSubscriptionPayment, PRO_PRICE_MONTH_RUB, PRO_PRICE_YEAR_RUB,
} from '../../shared/api/subscriptionApi.js'

// «Экономия» и цена в пересчёте на месяц — для вкладки «Год»
const YEAR_AS_MONTH_RUB = Math.round(PRO_PRICE_YEAR_RUB / 12)
const YEAR_SAVE_PCT = Math.round((1 - PRO_PRICE_YEAR_RUB / (PRO_PRICE_MONTH_RUB * 12)) * 100)

// Экран подписки Pithy Pro: преимущества + выбор периода (месяц/год, как на
// сайте Anthropic — год дешевле в пересчёте на месяц) + кнопка оплаты.
// heading — заголовок под контекст показа («Энергия закончилась?» /
// «Поздравляем с финалом!» / просто «Pithy Pro»).
// Оплата: create-payment возвращает url ЮKassa (redirect) или stub,
// пока касса не подключена — сам выбор периода уже готов, ждёт подключения кассы.
export default function ProPaywall({ heading = 'Pithy Pro', onClose }) {
  const [period, setPeriod] = useState('month') // 'month' | 'year'
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleBuy() {
    setBusy(true)
    setMsg('')
    const res = await createSubscriptionPayment(period)
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
        <div className="ppCrown"><Crown /></div>
        <h1>{heading}</h1>

        <ul className="ppPerks">
          <li><span><Zap size={18} /></span> Безлимит энергии — уроки без ожидания</li>
          <li><span><Library size={18} /></span> Копилка слов без лимита (бесплатно — 20)</li>
          <li><span><Crown size={18} /></span> Значок PRO в рейтинге и супергонке</li>
          <li><span><Heart size={18} /></span> Поддержка развития Pithy</li>
        </ul>

        <div className="ppPeriodTabs">
          <button
            className={period === 'month' ? 'ppPeriodTab ppPeriodTabActive' : 'ppPeriodTab'}
            onClick={() => setPeriod('month')}>
            Месяц
          </button>
          <button
            className={period === 'year' ? 'ppPeriodTab ppPeriodTabActive' : 'ppPeriodTab'}
            onClick={() => setPeriod('year')}>
            Год
            <span className="ppPeriodBadge">−{YEAR_SAVE_PCT}%</span>
          </button>
        </div>

        <div className="ppPrice">
          {period === 'month' ? (
            <span className="ppPriceMain">{PRO_PRICE_MONTH_RUB} ₽<span className="ppPriceUnit">/мес</span></span>
          ) : (
            <>
              <span className="ppPriceMain">{YEAR_AS_MONTH_RUB} ₽<span className="ppPriceUnit">/мес</span></span>
              <span className="ppPriceSub">{PRO_PRICE_YEAR_RUB} ₽ за год</span>
            </>
          )}
        </div>

        <button className="ppBtnBuy" onClick={handleBuy} disabled={busy}>
          {busy ? 'Секунду...' : period === 'month'
            ? `Оформить — ${PRO_PRICE_MONTH_RUB} ₽/мес`
            : `Оформить — ${PRO_PRICE_YEAR_RUB} ₽/год`}
        </button>
        {msg && <div className="ppMsg">{msg}</div>}

        <button className="ppBtnLater" onClick={onClose}>Не сейчас</button>
      </div>
    </div>
  )
}
