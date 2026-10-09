// «Занятость сети» приложения: общий сигнал для фоновых скачиваний (сейчас — тихая предзагрузка модели Vosk, shared/lib/vosk/).
// Всё, что качает файлы, нужные ПРЯМО СЕЙЧАС (медиа урока, озвучка слов), берёт begin() на время загрузки; фон ждёт, пока isBusy() = false.
//  - begin() → end(): счётчик активных загрузок, несколько владельцев не мешают друг другу (повторный end() безопасен);
//  - setFeedActive(on): лента с видео на экране (FeedSwiper) — там видео качает сам браузер, счётчик его не видит;
//  - isVideoActive(): в документе есть играющее или буферизующееся видео (урок, круг, лента);
//  - subscribe(fn): сигнал «что-то изменилось» — фоновая загрузка по нему бросает текущий кусок и ждёт тишины.
// Без React и без импортов: безопасно для любого слоя.
const subs = new Set()
let count = 0
let feedOn = false
const emit = () => subs.forEach(fn => { try { fn() } catch { /* подписчик не должен ломать загрузку */ } })

/** Началась загрузка, нужная пользователю сейчас. Возвращает end() — вызвать, когда загрузка закончилась (в finally) */
export function begin() {
  count++
  emit()
  let done = false
  return () => {
    if (done) return
    done = true
    count = Math.max(0, count - 1)
    emit()
  }
}

export const isBusy = () => count > 0
export const busyCount = () => count

/** Лента (видео) на экране: вкладка «Лента» открыта, выбраны «Рекомендации», нет схемы модуля и слоя урока поверх */
export function setFeedActive(on) {
  const v = !!on
  if (v === feedOn) return
  feedOn = v
  emit()
}
export const isFeedActive = () => feedOn

export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** Видео играет, либо грузится и ещё не может играть (readyState < 3, networkState LOADING) */
export function isVideoActive(doc = globalThis.document) {
  try {
    for (const v of doc?.querySelectorAll?.('video') ?? []) {
      if (!v.paused && !v.ended) return true
      if (v.networkState === 2 && v.readyState < 3) return true
    }
  } catch { /* нет DOM — значит, и видео нет */ }
  return false
}
