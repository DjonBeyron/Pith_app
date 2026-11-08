// Отладочная полоска под пилюлей «Скажи» (замечание владельца 7: снять видео / скрин, где видно, почему заливка стоит): одна мелкая строка
// «p: nice to | g 0.50 s 0.31 | gate ▮ | +1240» — черновик Vosk, цель заливки, что на экране, затвор тишины (▮ — звук идёт в Vosk, ▯ — тишина отрезана, ? — ещё не было), мс от выезда пилюли.
// Только в режиме отладки игры — тот же флаг, что у журнала отладки: тумблер админки «Отладочный интерфейс» (app_settings.player_debug_ui) ИЛИ localStorage pithy_wl_debug_v1 = '1'
// (wordLaneDebug.debugEnabled). Без флага сцена полоску не создаёт — ни узла. Узел — внутри пилюли (едет с ней), стиль инлайн: CSS пилюль не трогаем; пишется только изменившийся текст.
import { debugEnabled } from '../player/modules/rotate-phone/wordLaneDebug.js'
import { getPlayerDebugUiValue } from '../../shared/lib/usePlayerDebugUi.js'

/** Включена ли полоска (режим отладки игры) */
export function debugBarOn() {
  try { return debugEnabled({ toggle: getPlayerDebugUiValue() }) } catch { return false }
}

/** Текст полоски: partial — черновик, goal / shown — цель и экран 0…1, gate — true / false / null, ms — от выезда пилюли */
export const barText = ({ partial = '', goal = 0, shown = 0, gate = null, ms = 0 }) =>
  `p: ${partial || '—'} | g ${goal.toFixed(2)} s ${shown.toFixed(2)} | gate ${gate == null ? '?' : gate ? '▮' : '▯'} | +${Math.max(0, Math.round(ms))}`

const STYLE = 'position:absolute;left:50%;top:100%;transform:translate(-50%,6px);max-width:92vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  + 'font:600 11px/1.3 ui-monospace,Menlo,monospace;color:#ffe9a8;background:rgba(0,0,0,0.62);padding:2px 6px;border-radius:4px;pointer-events:none;z-index:7'

/** Полоска внутри пилюли el: { set(text), remove() }; без документа (тесты на поддельном пуле) — null */
export function mountDebugBar(el) {
  const doc = el?.ownerDocument
  const bar = doc?.createElement?.('div')
  if (!bar) return null
  bar.setAttribute('data-testid', 'race-phrase-debug'); bar.setAttribute('aria-hidden', 'true'); bar.style.cssText = STYLE
  el.appendChild(bar)
  let last = null
  return {
    set(text) { if (text !== last) { last = text; bar.textContent = text } },
    remove() { bar.remove() },
  }
}
