import { useState, useEffect, useRef, useCallback } from 'react'
import { Check } from 'lucide-react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { useLandscapeWatch } from './useLandscapeWatch.js'
import { pLog } from '../../../../shared/lib/debug.js'

// На телефоне карточка крутит значок, ПОКА ученик не повернёт экран — без
// самостоятельной остановки: галочка только по факту поворота. Лимит показов
// нужен там, где поворота не бывает, — на десктопе и в превью админа, иначе
// урок стоял бы в этой ноде вечно. Один цикл = одна CSS-анимация
// (rotate-phone.css); JS считает циклы по animationiteration, а не по своим
// часам — так число показов не разъедется с тем, что видно на экране
const MAX_SHOWS = 3
// Длина одного цикла — та же, что в CSS (rotate-phone.css, playerRotateAsk).
// Нужна только страховке ниже: при prefers-reduced-motion анимации нет, и
// animationiteration не придёт никогда — без часов нода не отпустила бы
// цепочку. Сторож в тестах следит, чтобы числа не разъехались
const CYCLE_MS = 1800
// Пауза после остановки стрелки перед переходом дальше: галочка должна
// успеть прочитаться, а не мелькнуть
const DONE_AFTER_MS = 700

// Уведомление «переверни телефон» — карточка в чате, по устройству как ссылка
// на урок (LessonRefModule): полоса слева, значок, текст. Значок телефона
// качается в альбомное положение и обратно, пока ученик не повернёт телефон
// (датчик — useLandscapeWatch) или пока стрелка не отыграет MAX_SHOWS раз.
// Потом качание останавливается, значок замирает горизонтально с галочкой,
// и нода отпускает цепочку дальше — onDone('shown').
//
// Что делать в альбомном положении, нода пока не решает: здесь только само
// уведомление и его остановка. Мини-режим по повороту — следующий шаг.
export default function RotatePhoneModule({ node, onDone }) {
  // Заголовок карточки редактируется в канвасе; подпись под ним постоянная
  const title = node.typeData?.rotate_phone?.content || 'Поверните экран'
  const [stopped, setStopped] = useState(false)
  const [by, setBy] = useState(null) // 'rotate' | 'limit'
  const showsRef = useRef(0)
  const doneRef  = useRef(false)
  // Touch-устройство — значит повернуть можно, и ждём именно поворота.
  // Оговорка: Android-PWA держит портрет манифестом, там ждать бесполезно —
  // но отличить его от обычного телефона нечем, а гасить стрелку раньше
  // поворота нельзя по смыслу карточки
  const [canRotate] = useState(() => window.matchMedia('(hover: none) and (pointer: coarse)').matches)

  const stop = useCallback(reason => {
    if (doneRef.current) return
    doneRef.current = true
    setStopped(true)
    setBy(reason)
  }, [])

  useLandscapeWatch(!stopped, useCallback(() => stop('rotate'), [stop]))

  // Каждый полный цикл качания — один показ; после MAX_SHOWS замираем.
  // Только там, где поворота не бывает: на телефоне циклы не считаем вовсе
  function onIteration() {
    if (canRotate) return
    showsRef.current += 1
    if (showsRef.current >= MAX_SHOWS) {
      pLog(`[rotate] стрелка показана ${MAX_SHOWS} раза — поворота не было, идём дальше`)
      stop('limit')
    }
  }

  // Страховка на случай, когда анимация не идёт (скрытая вкладка): по часам
  // это ровно MAX_SHOWS циклов плюс запас. Тоже только вне телефона
  useEffect(() => {
    if (canRotate) return
    const t = setTimeout(() => {
      if (doneRef.current) return
      pLog('[rotate] циклы не дошли по animationiteration — останавливаем по часам')
      stop('limit')
    }, MAX_SHOWS * CYCLE_MS + 600)
    return () => clearTimeout(t)
  }, [stop, canRotate])

  useEffect(() => {
    if (!stopped) return
    const t = setTimeout(() => onDone?.('shown'), DONE_AFTER_MS)
    return () => clearTimeout(t)
  }, [stopped, onDone])

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--lessonRef">
        <div className={`playerRotateCard${stopped ? ' playerRotateCard--stopped' : ''}`}>
          <span className="playerLessonRefBar" />
          {/* Стрелки — свой SVG, стоят на месте. Телефон — отдельный SVG внутри
              обычного span, и крутится именно span: CSS-поворот SVG-группы
              Safari проигрывает ненадёжно (transform-origin у <g> считается
              иначе), а HTML-элемент крутится везде одинаково */}
          <span className="playerRotateIconWrap" aria-hidden="true">
            <svg className="playerRotateArrows" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 52 A28 28 0 0 1 28 14" />
              <path d="M23 12 L29 13 L28 19" />
              <path d="M67 28 A28 28 0 0 1 52 66" />
              <path d="M57 68 L51 67 L52 61" />
            </svg>
            <span className="playerRotatePhone" onAnimationIteration={onIteration}>
              <svg viewBox="0 0 24 40" width="20" height="33" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="2" width="20" height="36" rx="4" fill="#0e1013" />
                <rect x="6" y="7" width="12" height="22" rx="1.2" fill="currentColor" stroke="none" opacity="0.28" />
                <circle cx="12" cy="33.5" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </span>
            {/* Галочка — только по настоящему повороту. Остановка по лимиту
                (десктоп) её не даёт: там телефон просто замирает */}
            {by === 'rotate' && <span className="playerRotateCheck"><Check size={13} /></span>}
          </span>
          <span className="playerLessonRefBody">
            <span className="playerRotateTitle">{title}</span>
            <span className="playerRotateCaption">Переверните телефон горизонтально</span>
            {/* Пока для проверки: видно, что датчик сработал именно на поворот */}
            {by === 'rotate' && <span className="playerRotateHit">Телефон повёрнут ✓</span>}
          </span>
        </div>
      </PlayerBubble>
    </div>
  )
}
