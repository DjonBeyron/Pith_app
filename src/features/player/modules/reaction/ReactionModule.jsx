import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Реакция на сообщение — как в мессенджере: своего пузыря у неё нет, эмодзи
// встраивается ВНУТРЬ пузыря сообщения, снизу слева, и пузырь под неё
// подрастает (PlayerBubble анимирует высоту сам, через ResizeObserver).
//
// Поэтому портал, а не обычный рендер: пузырь рисует модуль сообщения-хозяина
// (их полтора десятка — text, audio, photo, AnswerBubbles с ответом ученика...),
// и передавать реакцию через все них означало бы править каждый. Портал
// доставляет её в уже отрисованный пузырь, ничего больше не трогая.
//
// Строка самой ноды в ленте остаётся пустой и нулевой высоты — место в потоке
// реакция не занимает и соседние сообщения не раздвигает.
//
// target: 'student' — реакция на ответ ученика (пузырь справа), 'teacher' — на
// свою реплику (пузырь слева).

const SPARKS = [
  { angle: -95, dist: 30, size: 10, delay: 40 },
  { angle: -50, dist: 38, size: 13, delay: 0 },
  { angle: -12, dist: 33, size: 9, delay: 90 },
  { angle: 30, dist: 40, size: 12, delay: 30 },
  { angle: 128, dist: 36, size: 11, delay: 60 },
  { angle: -140, dist: 34, size: 12, delay: 20 },
]

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

// Ответ ученика — пузыри справа (AnswerBubbles / WordChoiceModule),
// реплика учителя — все остальные
const SEL_STUDENT = '.playerMsgBubble--response'
const SEL_TEACHER = '.playerMsgBubble:not(.playerMsgBubble--response), .stickerBubble'

// Пузырь, к которому липнет реакция — последний подходящий в ленте. Своего
// узла в ленте у реакции нет (см. PlayerFeedNodes), поэтому ищем от корня:
// на момент монтирования последнее сообщение в ленте и есть то, на которое
// реакция отвечает. Пре-рендер за экраном ([data-pending]) пропускаем.
function findBubble(selector) {
  const feed = document.querySelector('.playerFeedInner')
  if (!feed) return null
  const found = [...feed.querySelectorAll(selector)]
    .filter(el => !el.closest('[data-pending]'))
  return found.length ? found[found.length - 1] : null
}

export default function ReactionModule({ node, onDone }) {
  const data = node.typeData?.reaction ?? {}
  const emoji = (data.emoji ?? '👍').trim() || '👍'
  const toStudent = (data.target ?? 'student') === 'student'

  const glyphRef = useRef(null)
  const sparkRefs = useRef([])
  const [target, setTarget] = useState(null)

  useEffect(() => { onDone?.() }, []) // eslint-disable-line

  useEffect(() => {
    // Цель ищем по готовому DOM ленты — до монтирования её знать неоткуда
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(findBubble(toStudent ? SEL_STUDENT : SEL_TEACHER))
  }, [toStudent])

  useEffect(() => {
    if (!target) return
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
  }, [target])

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
  return target ? createPortal(badge, target) : null
}
