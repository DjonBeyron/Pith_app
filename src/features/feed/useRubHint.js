import { MAX_IGNORED } from './slowmoHintPlan.js'
import { useFeedHint } from './useFeedHint.js'

// Подсказка «потри фразу — появится перевод» (2026-10-03): новичку — на 5-м видео ленты (вдвое позже подсказки
// замедления, чтобы не показывать две сразу), дальше те же правила (useFeedHint.js): висит, пока перевод не открыли
// трением, и пропадает насовсем после трёх проигнорированных видео. Только локально — на сервер не пишем
export const RUB_ARM_AT_VIDEO = 5
const CFG = {
  seenKey: 'pithy_rub_hint_seen_v1',
  ignoredKey: 'pithy_rub_hint_ignored_v1',
  armAt: RUB_ARM_AT_VIDEO,
  maxIgnored: MAX_IGNORED,
}

export const useRubHint = activeIdx => useFeedHint(activeIdx, CFG)
