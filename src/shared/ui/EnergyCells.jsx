import { energyColor } from '../lib/energyColors.js'

const CAP = 5
const BOLT = 'M13 2 4 14h6l-1 8 9-12h-6l1-8z' // та же молния, что в худ-бейдже

function BoltSvg({ color }) {
  return (
    <svg viewBox="0 0 24 24" fill={color} className="enBoltSvg">
      <path d={BOLT} />
    </svg>
  )
}

// Ряд из 5 ячеек энергии — переиспользуемый индикатор (карточка запуска
// урока, попап энергии в hud-баре). Заполнено value штук цветом energyColor,
// пустые — тёмные. Режимы через пропсы:
// - shape: 'cell' (скруглённый сегмент, по умолчанию) | 'bolt' (заряд-молния)
// - blinkLast — последняя заполненная ячейка мягко пульсирует (её спишут)
// - dissolving — последняя заполненная растворяется (fade+scale), one-shot
// - fillingNext + fillProgress (0..1) — следующая ПУСТАЯ ячейка заполняется
//   как прогресс-бар и мягко мигает (до следующего восстановления +1)
// - unlimited — все 5 ячеек лаймовые + значок «∞» (подписка/админ)
export default function EnergyCells({
  value = 0,
  shape = 'cell',
  unlimited = false,
  blinkLast = false,
  dissolving = false,
  fillingNext = false,
  fillProgress = 0,
}) {
  const v = Math.max(0, Math.min(CAP, value))
  const bolt = shape === 'bolt'
  const rowCls = bolt ? 'enCells enCellsBolts' : 'enCells'

  if (unlimited) {
    return (
      <div className={`${rowCls} enCellsUnlimited`}>
        {Array.from({ length: CAP }).map((_, i) => bolt
          ? <span key={i} className="enBolt"><BoltSvg color={energyColor(CAP)} /></span>
          : <div key={i} className="enCell enCellFilled" style={{ backgroundColor: energyColor(CAP) }} />)}
        <span className="enCellsInf">∞</span>
      </div>
    )
  }

  const pct = Math.round(Math.max(0, Math.min(1, fillProgress)) * 100)

  return (
    <div className={rowCls}>
      {Array.from({ length: CAP }).map((_, i) => {
        const filled = i < v
        const isLast = filled && i === v - 1
        const isNext = !filled && i === v
        const anim = (isLast && dissolving) ? ' enCellDissolve'
          : (isLast && blinkLast) ? ' enCellBlink' : ''

        if (bolt) {
          return (
            <span key={i} className={`enBolt${anim}`}>
              <BoltSvg color={filled ? energyColor(v) : '#1c2028'} />
              {/* Частичное заполнение: цветная молния поверх тёмной, обрезана по ширине */}
              {isNext && fillingNext && (
                <span className="enBoltFill enCellBlink" style={{ width: `${pct}%` }}>
                  <BoltSvg color={energyColor(Math.min(CAP, v + 1))} />
                </span>
              )}
            </span>
          )
        }

        return (
          <div
            key={i}
            className={`enCell${filled ? ' enCellFilled' : ''}${anim}`}
            style={filled ? { backgroundColor: energyColor(v) } : undefined}
          >
            {isNext && fillingNext && (
              <div
                className="enCellProgress enCellBlink"
                style={{ width: `${pct}%`, backgroundColor: energyColor(Math.min(CAP, v + 1)) }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
