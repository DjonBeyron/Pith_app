import { useEffect, useRef } from 'react'
import { fdbg } from '../../shared/lib/feedDebug.js'
import { traceEvent } from './feedScrollTrace.js'
import { keepSlideOnResize } from './feedSnapTeleport.js'

// Заморозка ленты, пока она не на экране.
//
// Вкладки оболочки не размонтируются, а прячутся (`.shellV2TabHidden` —
// visibility:hidden; то же самое у «Моих уроков» — `.feedViewHidden`). Скрытая
// вкладка остаётся в layout, и лента под ней ПРОДОЛЖАЕТ прокручиваться:
// инерция iOS доигрывает вслепую. Хуже того, scroll-snap к ней в этот момент
// не применяется — по спеке snap-области элементов с visibility:hidden
// игнорируются, так что momentum не тормозится ни на одном слайде.
//
// В логе с iPhone это выглядело так: один жест проехал 90 слайдов
// (86884 → 159964) со скоростью ~31000px/с, активный слайд менялся каждые
// 15-30мс (141→142→…→197), пул видео при этом бешено перепарковывал элементы
// (десятки recycle в секунду), и в конце сработал аварийный
// `ТЕЛЕПОРТ edge: 159964 → 82824`. Пользователь видит это как «лента летит» и
// «сходит с ума» — ровно после возврата с другой вкладки.
//
// Лечение: уходя с экрана — гасим инерцию (программная установка scrollTop
// прерывает momentum в Safari) и встаём на целый слайд; сам контейнер на это
// время получает `overflow:hidden` (класс в FeedTab), чтобы новый скролл
// вслепую вообще не начался. Возвращаясь — выравниваем позицию телепортом,
// если всё же застряли между слайдами.
export function useFeedOffscreenFreeze({ scrollRef, active, len, viewH, teleport }) {
  const prevActiveRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    const was = prevActiveRef.current
    prevActiveRef.current = active
    if (!el || !len || !viewH || was === active) return
    const target = keepSlideOnResize(el.scrollTop, viewH, viewH) // ближайший целый слайд
    if (!active) {
      fdbg('лента ушла с экрана: гашу инерцию', el.scrollTop.toFixed(0), '→', target.toFixed(0))
      traceEvent('ушла с экрана', `${el.scrollTop.toFixed(0)} → ${target.toFixed(0)} (инерция погашена)`)
      el.scrollTop = target
      return
    }
    traceEvent('вернулась на экран', `top=${el.scrollTop.toFixed(0)} остаток=${(el.scrollTop % viewH).toFixed(1)}px`)
    if (Math.abs(el.scrollTop - target) > 1) teleport(el, target, 'возврат на вкладку')
  }, [active, len, viewH]) // eslint-disable-line react-hooks/exhaustive-deps
}
