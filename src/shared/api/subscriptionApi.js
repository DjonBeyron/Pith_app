import { supabase } from './supabase.js'

export const PRO_PRICE_RUB = 399

// Создаёт платёж за подписку через edge-функцию create-payment.
// Возвращает: { url } — редирект на страницу оплаты ЮKassa;
// { stub: true } — касса ещё не подключена (кнопка показывает «скоро»);
// { error } — не залогинен или сбой.
export async function createSubscriptionPayment() {
  const { data, error } = await supabase.functions.invoke('create-payment', { body: {} })
  if (error) {
    console.error('[PAY] create-payment:', error.message)
    return { error: error.message }
  }
  return data ?? { error: 'empty response' }
}
