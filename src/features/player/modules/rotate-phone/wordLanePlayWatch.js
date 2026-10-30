// Исход play() звукового элемента одним объектом — для диагностики тишины на iPhone (журнал «[cat-voice]», «[plate-sound]»). Сам play() возвращает промис, но «принят» ещё не значит «зазвучал»: iOS после
// смены аудиосессии бывает принимает play() прерванного элемента и молчит. Поэтому смотрим на оба признака: промис и событие 'playing'.
//  • play: 'ok' — промис принят И пришло 'playing'; 'rejected' (error — имя ошибки, обычно NotAllowedError: нет жеста); 'no-playing' — промис принят, а 'playing' не пришло за WATCH_MS (элемент прерван / не загружен);
//    'pending' — за WATCH_MS не ответил ни промис, ни событие.
//  • ms — через сколько мс известен исход; rs — readyState элемента в этот момент.
// Чистая функция без побочных эффектов, кроме слушателя 'playing' (он снимается). Без addEventListener (заглушки тестов) работает по промису.
export const WATCH_MS = 700

export function watchPlay(el, promise, onResult, { now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = WATCH_MS } = {}) {
  if (typeof onResult !== 'function') return
  const t0 = now()
  let done = false
  let resolved = !(promise && typeof promise.then === 'function') // play() без промиса (старые браузеры): считаем принятым
  let playing = !el?.addEventListener // нечем следить за 'playing' (заглушка в тестах): доверяем промису
  let timer = 0
  const finish = (play, error = null) => {
    if (done) return
    done = true
    clearTimer(timer)
    try { el?.removeEventListener?.('playing', onPlaying) } catch { /* элемента уже нет */ }
    let rs = null
    try { rs = el?.readyState ?? null } catch { /* без элемента */ }
    onResult({ play, ...(error ? { error } : {}), ms: Math.round(now() - t0), rs })
  }
  function onPlaying() { playing = true; if (resolved) finish('ok') }
  try { el?.addEventListener?.('playing', onPlaying) } catch { /* без событий — только промис */ }
  if (!resolved) promise.then(() => { resolved = true; if (playing) finish('ok') }, e => finish('rejected', e?.name ?? String(e ?? 'error')))
  else if (playing) finish('ok')
  timer = setTimer(() => finish(resolved ? 'no-playing' : 'pending'), timeoutMs)
}
