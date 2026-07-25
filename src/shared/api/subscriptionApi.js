import { supabase } from './supabase.js'

// Год — 2 месяца в подарок (399×10) вместо 399×12: та же логика скидки,
// что и на сайте Anthropic при переходе на годовую оплату
export const PRO_PRICE_MONTH_RUB = 399
export const PRO_PRICE_YEAR_RUB = 3990

// Создаёт платёж за подписку через edge-функцию create-payment.
// period: 'month' | 'year' — пока касса не подключена (see stub ниже),
// на сам ответ не влияет, но уже прокидывается на будущее подключение ЮKassa.
// Возвращает: { url } — редирект на страницу оплаты ЮKassa;
// { stub: true } — касса ещё не подключена (кнопка показывает «скоро»);
// { error } — не залогинен или сбой.
export async function createSubscriptionPayment(period = 'month') {
  const { data, error } = await supabase.functions.invoke('create-payment', { body: { period } })
  if (error) {
    console.error('[PAY] create-payment:', error.message)
    return { error: error.message }
  }
  return data ?? { error: 'empty response' }
}
