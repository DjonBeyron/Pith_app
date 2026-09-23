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
// Первая версия (3.2.1706) ставила scrollTop при ВКЛЮЧЁННОМ snap — и на iOS
// это само запускало «доснэпливание» с улётом (лента ехала ровно по слайду за
// кадр до края круга). Теперь всё делает телепортер (feedSnapTeleport.js):
// freeze — snap выключить, потом позиция, и держать выключенным до возврата;
// unfreeze — полноценный телепорт (разбудить виртуализатор, включить snap
// только по отрисованным слайдам, 300мс сторожить позицию). А пока лента
// скрыта, onScroll хука возвращает любое её смещение (holdFrozen) и не меняет
// активный слайд — иначе пул видео перепарковывал элементы десятками в секунду.
// overflow:hidden на контейнере (класс в FeedTab) не даёт скроллу начаться.
export function useFeedOffscreenFreeze({ scrollRef, active, len, viewH, freeze, unfreeze }) {
  const prevActiveRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    // Пока лента не измерена — не запоминаем состояние: иначе при старте на
    // скрытой вкладке заморозка так и не случилась бы
    if (!el || !len || !viewH || prevActiveRef.current === active) return
    prevActiveRef.current = active
    if (!active) {
      const target = keepSlideOnResize(el.scrollTop, viewH, viewH) // ближайший целый слайд
      fdbg('лента ушла с экрана: замораживаю', el.scrollTop.toFixed(0), '→', target.toFixed(0))
      traceEvent('ушла с экрана', `${el.scrollTop.toFixed(0)} → ${target.toFixed(0)} (snap выключен, позиция заморожена)`)
      freeze(el, target)
      return
    }
    traceEvent('вернулась на экран', `top=${el.scrollTop.toFixed(0)} остаток=${(el.scrollTop % viewH).toFixed(1)}px`)
    unfreeze(el, 'возврат на вкладку')
  }, [active, len, viewH]) // eslint-disable-line react-hooks/exhaustive-deps
}
