import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { pLog } from '../../../../shared/lib/debug.js'

// Реакция на сообщение — как в мессенджере: своего пузыря у неё нет, эмодзи
// садится в ЛЕВЫЙ НИЖНИЙ угол пузыря и наполовину выходит наружу. Пузырь при
// этом не растёт: элемент абсолютный, из потока выключен (см. reaction.css).
//
// Поэтому портал, а не обычный рендер: пузырь рисует модуль сообщения-хозяина
// (их полтора десятка — text, audio, photo, AnswerBubbles с ответом ученика...),
// и передавать реакцию через все них означало бы править каждый. Портал
// доставляет её в уже отрисованный пузырь, ничего больше не трогая.
//
// Своей строки в ленте у реакции тоже нет: модуль возвращает только портал
// (PlayerFeedNodes рендерит его без слота-обёртки).
//
// target: 'student' — реакция на ответ ученика (пузырь справа), 'teacher' — на
// свою реплику (пузырь слева).

// Искры мельче самого эмодзи — иначе разлёт выглядит тяжелее реакции
const SPARKS = [
  { angle: -95, dist: 22, size: 7, delay: 40 },
  { angle: -50, dist: 28, size: 9, delay: 0 },
  { angle: -12, dist: 24, size: 6, delay: 90 },
  { angle: 30, dist: 29, size: 8, delay: 30 },
  { angle: 128, dist: 26, size: 7, delay: 60 },
  { angle: -140, dist: 25, size: 8, delay: 20 },
]

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

// Ответ ученика — пузыри справа (AnswerBubbles / WordChoiceModule),
// реплика учителя — все остальные, включая стикеры (нужны в селекторе,
// чтобы правильно найти «последнее сообщение», см. findBubble ниже)
const SEL_STUDENT = '.playerMsgBubble--response'
const SEL_TEACHER = '.playerMsgBubble:not(.playerMsgBubble--response), .stickerBubble'

// Пузырь, к которому липнет реакция — последний подходящий в ленте. Своего
// узла в ленте у реакции нет (см. PlayerFeedNodes), поэтому ищем от корня:
// на момент монтирования последнее сообщение в ленте и есть то, на которое
// реакция отвечает. Пре-рендер за экраном ([data-pending]) пропускаем.
//
// Стикер — не цель: у него overflow:hidden (sticker.css) обрезает эмодзи,
// которая наполовину высовывается за нижний край пузыря (странно срезанный
// значок вместо аккуратной реакции). Если самое свежее сообщение — стикер,
// реакция просто не рисуется вовсе (а не переезжает на более старый пузырь,
// который ей на самом деле не адресован).
function findBubble(selector) {
  const feed = document.querySelector('.playerFeedInner')
  if (!feed) return null
  const found = [...feed.querySelectorAll(selector)]
    .filter(el => !el.closest('[data-pending]'))
  if (!found.length) return null
  const last = found[found.length - 1]
  return last.classList.contains('stickerBubble') ? null : last
}

// Для лога: какой пузырь выбран (класс-модификатор + начало текста)
function describe(el) {
  if (!el) return 'нет'
  const mod = [...el.classList].find(c => c.startsWith('playerMsgBubble--')) ?? el.className
  return `${mod} «${(el.textContent ?? '').trim().slice(0, 30)}»`
}

// Сколько ещё присматриваться к ленте после монтирования. Ответ ученика
// прилетает в чат не обязательно раньше, чем стартует нода реакции: у выбора
// слова результат приходит через 700 мс после тапа, у сборщика фразы пузырь
// добавляется своим состоянием панели. Если в этот зазор реакция уже выбрала
// цель, она липла к ПРЕДЫДУЩЕЙ попытке — и на неверной фразе оказывалась
// реакция, предназначенная верной.
const RETARGET_MS = 1000

// pending — нода пре-рендерится ДО показа (useGraphPlayer.scheduleReveal ставит
// pendingNode за REACTION_DELAY_MS до reveal). Обычные модули в этой фазе
// стоят за экраном ([data-pending]), а реакция — портал в ЖИВОЙ пузырь: без
// этого флага эмодзи влетал в пузырь ещё в pending-фазе, а на reveal нода
// переезжала из хвоста списка в основной (другой слот у React → ремаунт) и
// влетал второй раз — то самое «анимация играет несколько раз».
export default function ReactionModule({ node, onDone, pending = false }) {
  const data = node.typeData?.reaction ?? {}
  const emoji = (data.emoji ?? '👍').trim() || '👍'
  const toStudent = (data.target ?? 'student') === 'student'

  const glyphRef = useRef(null)
  const sparkRefs = useRef([])
  const [target, setTarget] = useState(null)
  // Ретаргет (ниже) может сменить target несколько раз за первую секунду —
  // без этого флага эффект анимации перезапускался бы на КАЖДУЮ смену цели,
  // и появление эмодзи читалось как двойное/дёрганое срабатывание. Пружинный
  // «влёт» должен сыграть РОВНО один раз за жизнь ноды; поздний ретаргет
  // просто переносит уже отыгравший эмодзи на новый пузырь без повтора анимации
  const hasAnimatedRef = useRef(false)

  const tag = `[reaction ${String(node.id).slice(0, 6)} ${emoji}]`
  useEffect(() => {
    pLog(`${tag} mount pending=${pending}`)
    return () => pLog(`${tag} unmount`)
  }, []) // eslint-disable-line

  // onDone — только у настоящей (не pending) ноды; заглушка в pending-фазе
  // и так пустая, но эффект должен сработать и на переходе pending → показ
  useEffect(() => { if (!pending) onDone?.() }, [pending]) // eslint-disable-line

  useEffect(() => {
    if (pending) return
    const sel = toStudent ? SEL_STUDENT : SEL_TEACHER
    // Цель берём сразу — в обычном случае нужный пузырь уже в ленте, и ждать
    // нечего. Но следующую секунду продолжаем присматривать: если появится
    // более поздний подходящий пузырь (тот самый запоздавший ответ), реакция
    // переезжает на него. Ждать «стабилизации» ленты тут нельзя — пока ответ
    // едет, количество пузырей как раз стабильно, и любое ожидание истекло бы
    // впустую, задержав реакцию там, где она и так на месте.
    const first = findBubble(sel)
    pLog(`${tag} цель: ${describe(first)}`)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(first)
    const t0 = performance.now()
    let raf = 0
    const watch = () => {
      const now = findBubble(sel)
      setTarget(prev => {
        if (now && now !== prev) pLog(`${tag} ретаргет через ${Math.round(performance.now() - t0)}мс: ${describe(now)}`)
        return now && now !== prev ? now : prev
      })
      if (performance.now() - t0 < RETARGET_MS) raf = requestAnimationFrame(watch)
    }
    raf = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(raf)
  }, [toStudent, pending]) // eslint-disable-line react-hooks/exhaustive-deps

  // Класс на пузыре: он якорь для абсолютного эмодзи и включает растушёвку
  // низа — фон и обводка тают книзу, чтобы кромка не резала угол под реакцией
  useEffect(() => {
    if (!target) return
    target.classList.add('playerMsgBubbleReacted')
    return () => target.classList.remove('playerMsgBubbleReacted')
  }, [target])

  useEffect(() => {
    if (!target || hasAnimatedRef.current) return
    hasAnimatedRef.current = true
    pLog(`${tag} анимация влёта → ${describe(target)}${node.isHistory ? ' (история, без анимации)' : ''}`)
    // Восстановленная история («Продолжить урок») — эмодзи сразу в конечном
    // виде, без анимации появления (искры не нужны вовсе — opacity:0 по
    // умолчанию в reaction.css, без .animate() их и не видно)
    if (node.isHistory) return
    glyphRef.current?.animate(
      [
        { transform: 'translateY(10px) scale(0) rotate(-30deg)', opacity: 0, offset: 0 },
        { transform: 'translateY(-3px) scale(1.4) rotate(10deg)', opacity: 1, offset: 0.42 },
        { transform: 'translateY(0) scale(0.9) rotate(-6deg)', offset: 0.66 },
        { transform: 'translateY(0) scale(1.07) rotate(2deg)', offset: 0.84 },
        { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1, offset: 1 },
      ],
      { duration: 760, easing: SPRING, fill: 'forwards' }
    )
    sparkRefs.current.forEach((el, i) => {
      if (!el) return
      const { angle, dist, delay } = SPARKS[i]
      const rad = (angle * Math.PI) / 180
      const tx = Math.cos(rad) * dist
      const ty = Math.sin(rad) * dist
      const spin = (i % 2 ? 1 : -1) * (90 + i * 20)
      el.animate(
        [
          { transform: 'translate(0,0) scale(0) rotate(0deg)', opacity: 0, offset: 0 },
          { transform: `translate(${tx * 0.45}px,${ty * 0.45}px) scale(1.05) rotate(${spin * 0.4}deg)`, opacity: 0.95, offset: 0.32 },
          { transform: `translate(${tx}px,${ty}px) scale(0.3) rotate(${spin}deg)`, opacity: 0, offset: 1 },
        ],
        { duration: 900, delay: 140 + delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' }
      )
    })
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const badge = (
    <span className="reactionInBubble">
      <span className="reactionGlyph" ref={glyphRef}>
        {emoji}
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="reactionSpark"
            style={{ fontSize: s.size, marginTop: -s.size / 2, marginLeft: -s.size / 2 }}
            ref={el => { sparkRefs.current[i] = el }}
            aria-hidden="true"
          >
            {emoji}
          </span>
        ))}
      </span>
    </span>
  )

  // Возвращаем только портал: собственного места в ленте реакция не занимает
  return target && !pending ? createPortal(badge, target) : null
}
