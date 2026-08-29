import { useRef, useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'

let bubbleSeq = 0

// Рост пузыря = сдвиг всей переписки: лента прижата к низу, поэтому когда в
// голосовом появляется новая строка расшифровки, история едет вверх ровно по
// этой кривой. Поэтому кривая тут важнее длительности.
//
// Было cubic-bezier(.16,1,.3,1) — expo-out: ~80% пути за первую четверть
// времени. Формально «плавно», на глаз — щелчок и долгое доползание. Взята
// та же кривая, что у превращения таблицы в сообщение: разгон и торможение
// симметричны, движение читается спокойно.
const GROW_MS   = 340
const GROW_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'
// Уборка инлайновой высоты — строго ПОСЛЕ конца перехода. Раньше 250 и 280
// жили в разных концах файла и молча разъезжались; теперь связаны формулой
const CLEANUP_MS = GROW_MS + 40

// Animated-height bubble wrapper. Smoothly grows as content is added (e.g. typing text).
// Ported directly from MsgBubble in the old project (BlockEditorChat.jsx).
// follow=true — режим «просто следуй»: свои анимации высоты выключены, пузырь
// с авто-высотой едет за контентом. Включается на время CSS-переходов контента
// (grid-анимация секции перевода) — два аниматора высоты иначе дерутся:
// RO видел scrollHeight >= зафиксированной высоты как «рост», ставил высоту
// мгновенно и уходил в циклы RE-ANIMATE (дёрганое закрытие перевода).
export default function PlayerBubble({ className, children, follow = false }) {
  const ref       = useRef(null)
  const stRef     = useRef({ prevH: null, tid: null, target: null })
  const readyRef  = useRef(false)
  const reactedRef = useRef(false) // реакцию в этот пузырь уже вставляли
  const idRef     = useRef(0) // номер пузыря для дебаг-лога
  const followRef = useRef(false)

  useEffect(() => {
    followRef.current = !!follow
    if (!follow) return
    // Вход в follow: срубить свою анимацию и вернуть авто-высоту
    const st = stRef.current
    clearTimeout(st.tid)
    st.tid = null
    st.target = null
    const el = ref.current
    if (el) {
      el.style.height = el.style.overflow = el.style.transition = ''
      st.prevH = el.getBoundingClientRect().height
      pLog(`[bubble#${idRef.current}] follow ON (h=${Math.round(st.prevH)})`)
    }
  }, [follow])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const st = stRef.current

    function scheduleCleanup(target) {
      clearTimeout(st.tid)
      st.target = target
      st.tid = setTimeout(() => {
        st.tid = null
        const t = st.target; st.target = null
        el.style.height = el.style.overflow = el.style.transition = ''
        const actualH = el.scrollHeight
        pLog(`[bubble#${idRef.current}] cleanup: target=${t} actual=${actualH}${Math.abs(actualH - t) > 2 ? ' → RE-ANIMATE (вот возможный дёрг)' : ' ok'}`)
        if (Math.abs(actualH - t) > 2) animateTo(t, actualH)
        else st.prevH = el.getBoundingClientRect().height
      }, CLEANUP_MS)
    }

    function animateTo(from, to) {
      pLog(`[bubble#${idRef.current}] animateTo ${Math.round(from)}→${Math.round(to)} (${to < from ? 'сжатие' : 'рост'})`)
      el.style.transition = 'none'
      // Пока высота едет, коробка КОРОЧЕ своего содержимого — и у аудио-пузыря
      // (.playerMsgBubble--audio, overflow: hidden) новая строка расшифровки
      // всё это время была срезана нижним краем. Чем плавнее рост, тем дольше
      // виден обрезок, так что замедление анимации проблему только обнажило.
      //
      // При РОСТЕ снимаем обрезку: строка сразу читается целиком, просто первые
      // мгновения лежит ниже фона, а фон догоняет её. Фону это не мешает — он
      // рисуется отдельным слоем ::before с inset: 0 и своим скруглением, в
      // overflow не нуждается. При СЖАТИИ обрезка наоборот обязательна: там
      // содержимое должно уезжать под край, а не торчать из него.
      el.style.overflow = to < from ? 'hidden' : 'visible'
      el.style.height = from + 'px'
      void el.offsetWidth
      el.style.transition = `height ${GROW_MS}ms ${GROW_EASE}`
      el.style.height = to + 'px'
      st.prevH = to
      scheduleCleanup(to)
    }

    const id = ++bubbleSeq
    idRef.current = id
    pLog(`[bubble#${id}] mount — className="${className}"`)

    st.prevH = el.getBoundingClientRect().height
    const unlock = setTimeout(() => {
      readyRef.current = true
      st.prevH = el.getBoundingClientRect().height
    }, 620)

    const ro = new ResizeObserver(() => {
      const nextH = el.scrollHeight
      const prevH = st.prevH ?? nextH
      if (!readyRef.current) { st.prevH = nextH; return }
      // Реакция садится в угол пузыря абсолютом и наполовину торчит наружу
      // (ReactionModule): в поток она не входит, но scrollHeight из-за выступа
      // подрастает. Расти пузырю при этом не нужно — просто принимаем факт,
      // ничего не анимируя. Раньше анимация здесь ещё и ломала ленту: высота
      // ехала своим переходом, и следующее сообщение считало FLIP по плавающей
      // высоте.
      if (!reactedRef.current && el.querySelector('.reactionInBubble')) {
        reactedRef.current = true
        clearTimeout(st.tid)
        st.tid = null
        st.target = null
        el.style.height = el.style.overflow = el.style.transition = ''
        // Именно фактическая высота, а не scrollHeight: тот включает выступ
        // эмодзи наружу, и следующее измерение считало бы от завышенного
        st.prevH = el.getBoundingClientRect().height
        pLog(`[bubble#${id}] реакция вставлена — высота пузыря не меняется (${Math.round(st.prevH)})`)
        return
      }
      // follow: плавность даёт CSS-переход контента, пузырь только запоминает
      if (followRef.current) { st.prevH = nextH; return }
      if (Math.abs(nextH - prevH) < 2) return
      pLog(`[bubble#${id}] RO ${Math.round(prevH)}→${nextH}${st.tid !== null ? ` (анимация активна, target=${st.target})` : ''}`)
      if (st.tid !== null) {
        if (nextH <= (st.target ?? 0)) { st.prevH = nextH; return }
        // Рост во время активной анимации: высота ставится МГНОВЕННО (без
        // transition) — если это случается при закрытии, будет виден дёрг
        pLog(`[bubble#${id}] мгновенный height=${nextH} (рост поверх анимации)`)
        el.style.height = nextH + 'px'
        st.prevH = nextH
        scheduleCleanup(nextH)
      } else {
        animateTo(st.prevH ?? 0, nextH)
      }
    })
    ro.observe(el)
    return () => { ro.disconnect(); clearTimeout(unlock); clearTimeout(st.tid) }
  }, [])

  return <div ref={ref} className={className}>{children}</div>
}
