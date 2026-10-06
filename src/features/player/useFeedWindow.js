import { useState } from 'react'
import { pLog } from '../../shared/lib/debug.js'
import { ANCHOR_ALL, FEED_WINDOW, entryKey, olderAnchor, windowStart } from './feedWindow.js'

// Окно ленты (см. feedWindow.js): какие записи mergeFeedOrder реально рендерить.
//
// entries — полный список (ноды + сигналы) в порядке ленты.
// hasMoreHistory/onLoadMoreHistory — страницы истории чекпойнта
// (useGraphPlayer.requestMoreHistory): зовутся, когда окно уже раскрыто до
// начала живой сессии.
//
// Возвращает:
//   entries  — срез для рендера. Всё старше естественного хвоста (раскрыто
//              кнопкой) помечается isHistory — тот же приём, что у
//              восстановленной истории: без въезда снизу, без звука «новое
//              сообщение», без автозапуска видео/кружка
//   hasOlder — есть что раскрыть (кнопка сверху)
//   showOlder — клик по кнопке
const BOTTOM_PX = 80

export function useFeedWindow(entries, { hasMoreHistory = false, onLoadMoreHistory } = {}) {
  const [anchorKey, setAnchorKey] = useState(null)

  // Пришло новое сообщение, а ученик стоит внизу ленты — раскрытое окно
  // схлопывается обратно до хвоста (лента перевёрнута: scrollTop≈0 — низ).
  // Подстройка состояния при смене входа — прямо в рендере, как советует
  // React (не в эффекте: лишний рендер с уже раскрытым окном)
  const count = entries.length
  const [prevCount, setPrevCount] = useState(count)
  let anchor = anchorKey
  if (count !== prevCount) {
    setPrevCount(count)
    if (anchorKey != null && count > prevCount && typeof document !== 'undefined') {
      const feed = document.querySelector('.playerFeed')
      if (feed && feed.scrollTop < BOTTOM_PX) {
        pLog('[window] новое сообщение внизу — окно схлопнуто до хвоста')
        setAnchorKey(null)
        anchor = null
      }
    }
  }

  let start = windowStart(entries, anchor)

  // Нельзя размонтировать строку, в которой сейчас играет звук/видео: окно
  // сдвигается новым сообщением, а ученик слушает старое голосовое выше.
  // Чтение DOM в рендере — только чтение, без побочных эффектов
  if (start > 0 && typeof document !== 'undefined') {
    const rows = document.querySelectorAll('.playerFeedInner [data-entry-key]')
    for (const row of rows) {
      const media = row.querySelector('audio, video')
      if (!media || media.paused || media.muted) continue
      const i = entries.findIndex(e => entryKey(e) === row.dataset.entryKey)
      if (i >= 0 && i < start) start = i
    }
  }

  const tailStart = Math.max(0, count - FEED_WINDOW)
  const slice = entries.slice(start).map((entry, i) => {
    const old = start + i < tailStart && entry.kind === 'node' && !entry.node.isHistory
    return old ? { ...entry, node: { ...entry.node, isHistory: true } } : entry
  })

  const hasOlder = start > 0 || hasMoreHistory

  const showOlder = () => {
    if (start > 0) {
      const next = olderAnchor(entries, start)
      pLog(`[window] раскрыть раньше: start ${start} → якорь ${next === ANCHOR_ALL ? 'всё' : next.slice(0, 8)}`)
      setAnchorKey(next)
      return
    }
    // Живая сессия раскрыта целиком — дальше страницы истории чекпойнта; они
    // встают в начало массива, якорь «всё» их не спрячет
    setAnchorKey(ANCHOR_ALL)
    onLoadMoreHistory?.()
  }

  return { entries: slice, hasOlder, showOlder, windowStart: start }
}
