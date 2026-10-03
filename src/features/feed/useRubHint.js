import { useCallback, useRef, useState } from 'react'
import { MAX_IGNORED } from './slowmoHintPlan.js'
import { useFeedHint } from './useFeedHint.js'

// Подсказка «потри фразу — появится перевод» (2026-10-03): появляется, когда человек открыл (тапнул, шарики разлетелись)
// пять фраз — не обязательно подряд и не обязательно за одно посещение (счётчик в localStorage): значит, он уже
// пользуется лентой и смотрит фразы, а про перевод не знает. Дальше те же правила, что у подсказки замедления
// (useFeedHint.js): висит, пока перевод не открыли трением, и пропадает насовсем после трёх проигнорированных видео.
// Только локально — на сервер не пишем. → { showHint, markSeenNow, noteOpened } — noteOpened зовут при открытии фразы
export const RUB_ARM_AT_OPENED = 5
const OPENED_KEY = 'pithy_rub_opened_v1'
const CFG = {
  seenKey: 'pithy_rub_hint_seen_v1',
  ignoredKey: 'pithy_rub_hint_ignored_v1',
  armAt: RUB_ARM_AT_OPENED,
  maxIgnored: MAX_IGNORED,
}

function readOpened() {
  try { return Number(localStorage.getItem(OPENED_KEY)) || 0 } catch { return 0 }
}

export function useRubHint(activeIdx) {
  const [opened, setOpened] = useState(readOpened)
  const countRef = useRef(opened)
  const noteOpened = useCallback(() => {
    countRef.current += 1
    try { localStorage.setItem(OPENED_KEY, String(countRef.current)) } catch { /* нет localStorage */ }
    setOpened(countRef.current)
  }, [])
  const hint = useFeedHint(activeIdx, CFG, { units: opened })
  return { ...hint, noteOpened }
}
