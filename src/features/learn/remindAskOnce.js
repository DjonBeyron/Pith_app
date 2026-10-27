import { getRemindTime } from '../../shared/api/remindApi.js'
import { remindAsked, markRemindAsked } from './remindAsk.js'

// После рассказа Пита: один раз на устройстве показать «Когда удобно учиться?» — если выбор
// ещё не сделан (в аккаунте он мог быть сделан на другом устройстве). show() открывает шторку.
export async function askRemindOnce(show) {
  if (remindAsked()) return
  const cur = await getRemindTime().catch(() => null)
  markRemindAsked()
  if (!cur) show()
}
