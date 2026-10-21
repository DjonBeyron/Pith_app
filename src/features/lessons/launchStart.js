import { startLesson } from '../../shared/api/profileApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'
import { traceLaunch } from '../../shared/lib/launchTrace.js'

// Старт урока без ожидания сервера. Раньше тап «Начать» ждал ответа start_lesson (на мобильной сети 0,3–1 с, таймаут 8 с) и только
// потом монтировал плеер — хотя отказ бывает в одном случае (энергия на нуле), а карточка его уже показала ячейками энергии.
// Теперь: open() — плеер сразу; start_lesson идёт параллельно; ответ ok → ok() (профиль с молниями обновляется, «начал модуль»);
// отказ → deny(res): плеер закрывается, пейволл «Энергия закончилась» — так же, как раньше, только на секунду позже.
// Ошибка/таймаут RPC — урок продолжается (как и было: startLesson сам отдаёт ok:true). Все шаги — в трассе [launch]
export function startLessonOptimistic(lessonId, { open, ok, deny, api = startLesson, refresh = refreshProfile }) {
  const t0 = Date.now()
  traceLaunch('старт без ожидания start_lesson: плеер открывается сразу')
  open()
  let p
  try { p = Promise.resolve(api(lessonId)) } catch (e) { p = Promise.reject(e) } // запрос уходит сразу, в том же тике
  return p
    .then(res => {
      if (res?.ok === false) { traceLaunch(`start_lesson: ОТКАЗ через ${Date.now() - t0} мс — закрываем плеер, пейволл`); deny(res); return res }
      refresh()
      ok?.(res)
      return res
    }, e => { traceLaunch(`start_lesson: ошибка ${e?.message ?? e} — урок продолжается`); return { ok: true } })
}
