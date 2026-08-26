import { linkDebugSummary } from './canvasLinkDebug.js'

// Отладочный слой связей: поверх всего рисует ПРЯМЫЕ отрезки от выходного
// порта к входу целевой ноды и пишет сводку. Обычные линии идут в слое под
// нодами, обходят препятствия и красятся по типу перехода — если их не видно,
// этот слой отвечает на вопрос «связи вообще строятся или нет».
export default function CanvasLinkDebug({ segments }) {
  return (
    <g className="canvasLinkDebugLayer">
        {segments.map(s => (
          <g key={s.key}>
            <line
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={s.ok ? '#ff3b3b' : '#ffd93b'}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={s.x1} cy={s.y1} r={4} fill="#ff3b3b" />
            <circle cx={s.x2} cy={s.y2} r={4} fill="#ffb03b" />
          </g>
      ))}
    </g>
  )
}

// Те же точки, но обычным HTML поверх холста, мимо SVG. Если эти квадраты
// видно, а кружков портов и линий нет — значит не рисуется сам SVG-слой, и
// дело не в координатах и не в данных.
export function CanvasLinkDebugHtml({ segments, scale, offset }) {
  return (
    <div className="canvasLinkDebugHtml">
      {segments.slice(0, 80).map(s => (
        <span
          key={`h:${s.key}`}
          className="canvasLinkDebugMark"
          style={{ left: s.x1 * scale + offset.x, top: s.y1 * scale + offset.y }}
        />
      ))}
    </div>
  )
}

// Проба SVG: три одинаковые линии, нарисованные по-разному. HTML-метки выше
// уже показали, что слой поверх холста рисуется — значит вопрос в том, что
// именно ломает SVG. Каждая линия проверяет свою гипотезу:
//   1 красная  — простой SVG без всяких трансформаций;
//   2 жёлтая   — то же внутри <g transform="translate(...)">;
//   3 голубая  — внутри <g> со сдвигом И масштабом, как настоящий слой связей;
//   4 розовая  — как настоящие связи: с vector-effect.
export function CanvasSvgProbe() {
  return (
    <svg className="canvasSvgProbe">
      <line x1="20" y1="20" x2="320" y2="20" stroke="#ff3b3b" strokeWidth="4" />
      <g transform="translate(0,20)">
        <line x1="20" y1="20" x2="320" y2="20" stroke="#ffd93b" strokeWidth="4" />
      </g>
      <g transform="translate(0,40) scale(0.53)">
        <line x1="38" y1="38" x2="604" y2="38" stroke="#3bd7ff" strokeWidth="8" />
      </g>
      <g transform="translate(0,60) scale(0.53)">
        <line x1="38" y1="38" x2="604" y2="38" stroke="#ff7bd5" strokeWidth="8"
          style={{ vectorEffect: 'non-scaling-stroke' }} />
      </g>
    </svg>
  )
}

// Весь отладочный оверлей одним куском: HTML-метки поверх холста, проба SVG и
// сводка. Собран здесь, чтобы CanvasBoard.jsx не рос из-за диагностики.
export function CanvasDebugOverlay({ debug, scale, offset }) {
  return (
    <>
      <CanvasLinkDebugHtml segments={debug.segments} scale={scale} offset={offset} />
      <CanvasSvgProbe />
      <div className="canvasLinkDebugBadge">{linkDebugSummary(debug, scale)}</div>
    </>
  )
}
