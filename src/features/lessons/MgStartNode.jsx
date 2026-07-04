// Нод «Старт» (диагностика): шестиугольник со звездой, кнопкой запуска и
// SVG-контуром. done — зелёный «пройден» (плавное озеленение — transition в
// lessons-chain-nodes.css), pulse — вспышка «только что пройден».

// Контур старта — тот же path, что в clip-path (lessons.css). Рисуется SVG-штрихом
// поверх нода: даёт ровную обводку, чего не добиться масштабированием заливки.
const START_PATH = 'M 25.82 32.12 L 64.18 12.88 A 50 50 0 0 1 115.82 12.88 L 154.18 32.12 A 50 50 0 0 1 180 73.86 L 180 106.14 A 50 50 0 0 1 154.18 147.88 L 115.82 167.12 A 50 50 0 0 1 64.18 167.12 L 25.82 147.88 A 50 50 0 0 1 0 106.14 L 0 73.86 A 50 50 0 0 1 25.82 32.12 Z'

export default function MgStartNode({
  lesson, done = false, pulse = false,
  renaming, renameInput, btns, nodeRef, onHover, onClick, onPlay,
}) {
  return (
    <div className={`mgGlow ${done ? 'mgGlow--start--done' : 'mgGlow--start'}${pulse ? ' mgGlow--justDone' : ''}`}>
      <span className="mgIconBadge mgIconBadge--start">★</span>
      <div
        ref={nodeRef}
        className={`mgNode mgNode--start${done ? ' mgNode--start--done' : ' mgNode--start--inactive'}`}
        onMouseEnter={() => onHover(lesson.id)}
        onMouseLeave={() => onHover(null)}
        onClick={e => { e.stopPropagation(); onClick(lesson.id) }}
      >
        <div className="mgHexFill mgHexFill--start">
          {renaming ? renameInput : (
            <>
              <span className="mgNodeTitle">{lesson.title}</span>
              {done
                ? <span className="mgStartBadge">✓ Диагностика пройдена</span>
                : <span className="mgStartSub">Диагностика</span>
              }
              <button
                className={`mgStartBtn${done ? ' mgStartBtn--again' : ''}`}
                onClick={e => { e.stopPropagation(); onPlay(lesson.id) }}
              >
                {done ? 'Пройти снова' : 'Начать'}
              </button>
              {btns}
            </>
          )}
        </div>
      </div>
      <svg className="mgNodeOutline" viewBox="0 0 180 180">
        <defs>
          {/* Обводка как в референсе: яркая сверху, к низу сходит в ноль */}
          <linearGradient id="mgOutlineStart" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0"    stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="1"    stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={START_PATH} stroke="url(#mgOutlineStart)" />
      </svg>
    </div>
  )
}
