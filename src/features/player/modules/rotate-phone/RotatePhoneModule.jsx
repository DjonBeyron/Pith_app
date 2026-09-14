import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Check } from 'lucide-react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { useLandscapeWatch } from './useLandscapeWatch.js'
import SpeechLaneOverlay from './SpeechLaneOverlay.jsx'
import { prepareSpeechLane } from '../../../../shared/lib/speechLanePrepare.js'
import { pLog } from '../../../../shared/lib/debug.js'

// На телефоне карточка крутит значок, ПОКА ученик не повернёт экран — без
// самостоятельной остановки: галочка только по факту поворота. Там, где
// поворота не бывает (десктоп, превью админа), запускаемся сами через
// AUTO_START_MS — иначе урок стоял бы в этой ноде вечно, а админ не смог бы
// проверить тренажёр
const AUTO_START_MS = 3000
// Пауза после остановки стрелки перед переходом дальше: галочка/подпись
// должны успеть прочитаться, а не мелькнуть
const DONE_AFTER_MS = 700
const FINISHED_TEXT = 'Голосовая тренировка закончена'

// Нода «Переверни телефон» — карточка в чате (по устройству как ссылка на
// урок: полоса, значок, текст) и голосовой тренажёр за ней. Значок телефона
// качается, пока ученик не повернёт телефон (useLandscapeWatch). По повороту
// пузырь заливает экран и идёт игра (SpeechLaneOverlay), по концу экран
// стягивается обратно, и в том же пузыре написано, что тренировка закончена.
// Игра есть ВСЕГДА: партитуру даёт prepareSpeechLane — из таймлайна, из
// сценария или из демо-фразы, если автор ничего не настраивал.
export default function RotatePhoneModule({ node, file, onDone }) {
  const tData = node.typeData?.rotate_phone ?? {}
  const title = tData.content || 'Поверните экран'
  const score = useMemo(() => prepareSpeechLane(tData), [tData])
  // wait → game → finished
  const [phase, setPhase] = useState('wait')
  const [by, setBy] = useState(null)          // 'rotate' | 'auto'
  const [rotation, setRotation] = useState(null)   // { source, gamma } — как повернули
  const bubbleRef = useRef(null)
  const doneRef = useRef(false)
  // Touch-устройство — значит повернуть можно, и ждём именно поворота.
  // Оговорка: Android-PWA держит портрет манифестом, там ждать бесполезно —
  // но отличить его от обычного телефона нечем, а гасить стрелку раньше
  // поворота нельзя по смыслу карточки
  const [canRotate] = useState(() => window.matchMedia('(hover: none) and (pointer: coarse)').matches)

  const start = useCallback((reason, rot) => {
    if (doneRef.current) return
    doneRef.current = true
    setRotation(rot ?? { source: 'screen', gamma: 0 })
    setBy(reason)
    pLog(`[rotate] старт тренажёра (${reason}, поворот ${rot?.source ?? 'нет'}): слоёв ${score.layers.length}`)
    setPhase('game')
  }, [score])

  useLandscapeWatch(phase === 'wait', useCallback(rot => start('rotate', rot), [start]))

  // Откуда партитура — по логу видно, настроен ли тренажёр у ноды
  useEffect(() => {
    pLog(`[rotate] партитура: ${score.source} — слоёв ${score.layers.length}, композиция ${score.timelineLen.toFixed(1)}с, озвучка ${tData.file_id ? `есть (кусков ${score.audioClips.length})` : 'нет'}`)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Вне телефона поворота не будет — стартуем по часам
  useEffect(() => {
    if (canRotate) return
    const t = setTimeout(() => {
      pLog(`[rotate] поворота не бывает — идём дальше сами через ${AUTO_START_MS}мс`)
      start('auto')
    }, AUTO_START_MS)
    return () => clearTimeout(t)
  }, [start, canRotate])

  useEffect(() => {
    if (phase !== 'finished') return
    const t = setTimeout(() => onDone?.('shown'), DONE_AFTER_MS)
    return () => clearTimeout(t)
  }, [phase, onDone])

  const stopped = phase !== 'wait'

  return (
    <div className="playerMsgRow">
      <PlayerBubble className="playerMsgBubble playerMsgBubble--lessonRef">
        <div ref={bubbleRef} className={`playerRotateCard${stopped ? ' playerRotateCard--stopped' : ''}`}>
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
            <span className="playerRotatePhone">
              <svg viewBox="0 0 24 40" width="20" height="33" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="2" width="20" height="36" rx="4" fill="#0e1013" />
                <rect x="6" y="7" width="12" height="22" rx="1.2" fill="currentColor" stroke="none" opacity="0.28" />
                <circle cx="12" cy="33.5" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </span>
            {/* Галочка — по настоящему повороту или по концу тренировки */}
            {(by === 'rotate' || phase === 'finished') && <span className="playerRotateCheck"><Check size={13} /></span>}
          </span>
          <span className="playerLessonRefBody">
            <span className="playerRotateTitle">{phase === 'finished' ? FINISHED_TEXT : title}</span>
            <span className="playerRotateCaption">
              {phase === 'finished' ? 'Можно вернуть телефон вертикально' : 'Переверните телефон горизонтально'}
            </span>
          </span>
        </div>
      </PlayerBubble>
      {phase === 'game' && (
        <SpeechLaneOverlay
          bubbleRef={bubbleRef}
          node={node}
          file={file}
          score={score}
          rotation={rotation}
          onFinished={() => setPhase('finished')}
        />
      )}
    </div>
  )
}
