import { useEffect, useState } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'
import { reloadVideo } from './videoPool.js'

// Сторож загрузки видео: отличает «данные реально не едут» (интернет отвалился,
// запрос завис, Safari выбросил уже загруженное видео из памяти) от нормального
// воспроизведения — показывает кружок загрузки и сам чинит, переустанавливая src.
//
// Почему не navigator.onLine: он врёт (на iPhone остаётся true при мёртвом
// Wi-Fi/лифте). Судим по фактам самого элемента:
//   readyState < 3 (данных на продолжение нет) И при этом дольше STALL_MS не
//   растёт ни currentTime, ни хвост buffered.
// Растёт хоть что-то → идёт загрузка, кружок не нужен. readyState >= 3, а кадры
// стоят → это не сеть, а зависшая поверхность iOS: ею занят watchdog в SlideVideo
// (пинок seek → пересборка), кружок там был бы враньём.
//
// navigator.onLine используем только для подписи: если браузер САМ признался,
// что сети нет — пишем «Нет соединения» вместо просто кружка.

const CHECK_MS = 250 // как часто щупаем прогресс
const STALL_MS = 700 // столько молчим: обычная быстрая догрузка не должна мигать кружком
const RETRY_FIRST_MS = 2500 // первый перезапуск загрузки после начала зависания
const RETRY_MAX_MS = 15000 // потолок паузы между перезапусками

function bufferedEnd(v) {
  try { return v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0 } catch { return 0 }
}

// enabled = слайд активный, вкладка видима, пользователь НЕ ставил паузу.
// Возвращает null | 'loading' | 'offline'.
export function useVideoStall(rootRef, enabled) {
  const [stall, setStall] = useState(null)

  useEffect(() => {
    if (!enabled) return
    let since = 0 // когда началось зависание (0 = всё хорошо)
    let lastMove = performance.now()
    let lastPos = -1
    let lastBuf = -1
    let retries = 0
    let nextRetryAt = 0

    const ok = () => { since = 0; retries = 0; setStall(null) }

    const retry = (v, why) => {
      retries++
      nextRetryAt = performance.now() + Math.min(RETRY_FIRST_MS * 2 ** retries, RETRY_MAX_MS)
      fdbg(`vid ${(v.dataset.url || '—').slice(-8)} загрузка встала (${why}) → перезапуск №${retries} rs=${v.readyState} online=${navigator.onLine}`)
      reloadVideo(v)
      lastBuf = -1
      lastPos = -1
      lastMove = performance.now()
    }

    const timer = setInterval(() => {
      const v = rootRef.current?.querySelector('video.poolVideo')
      // На v.paused НЕ выходим: при обрыве сети play() отвергается (данных нет),
      // элемент остаётся на паузе — а это и есть тот самый случай, ради которого
      // сторож нужен. Ручная пауза пользователя сюда не доходит: она гасит
      // enabled и весь эффект целиком.
      if (!v || document.hidden) { if (since) ok(); return }

      const now = performance.now()
      const pos = v.currentTime
      const buf = bufferedEnd(v)
      // Прогресс — только рост. Откат позиции (перезапуск/зацикливание) и
      // обнуление буфера после load() прогрессом не считаем
      if (pos > lastPos + 0.01 || buf > lastBuf + 0.01) lastMove = now
      lastPos = pos
      lastBuf = buf

      if (v.readyState >= 3) { if (since) ok(); return }
      if (now - lastMove < STALL_MS) { if (since) setStall(null); return }

      if (!since) {
        since = now
        // Элемент уже отвалился с ошибкой — ждать нечего, перезапускаем сразу.
        // Дальше всё равно по нарастающей: иначе мгновенная ошибка (сети нет
        // совсем, запрос падает за миллисекунды) превращалась бы в долбёж
        // запросами каждый тик — это видно в логе теста
        nextRetryAt = v.error ? now : now + RETRY_FIRST_MS
        fdbg(`vid ${(v.dataset.url || '—').slice(-8)} нет данных: rs=${v.readyState} ct=${pos.toFixed(2)} buf=${buf.toFixed(2)} err=${v.error?.code ?? '—'} online=${navigator.onLine}`)
      }
      setStall(navigator.onLine ? 'loading' : 'offline')
      if (now >= nextRetryAt) retry(v, `${((now - since) / 1000).toFixed(1)}с без данных`)
    }, CHECK_MS)

    // Сеть вернулась — не ждём своей очереди по таймеру, пробуем немедленно
    const onOnline = () => {
      const v = rootRef.current?.querySelector('video.poolVideo')
      if (v && since) retry(v, 'сеть вернулась')
    }
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      setStall(null)
    }
  }, [rootRef, enabled])

  // Пока сторож выключен (слайд не активный, ручная пауза, вкладка скрыта),
  // кружка нет — даже если состояние осталось с прошлого включения
  return enabled ? stall : null
}
