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

// Ряд из 5 зарядов-молний — переиспользуемый индикатор энергии (карточка
// запуска урока, попап энергии в hud-баре). Каждый заряд — тёмная
// молния-подложка + цветная молния поверх: анимации (мигание, растворение,
// частичное заполнение) живут на цветном слое, тёмная форма всегда остаётся
// видна под ним. Режимы:
// - blinkLast — последний заполненный заряд мягко пульсирует (его спишут)
// - dissolving — последний заполненный растворяется (остаётся тёмная форма)
// - fillingNext + fillProgress (0..1) — следующий ПУСТОЙ заряд заполняется
//   слева как прогресс-бар и мигает (до следующего восстановления +1)
// - unlimited — все 5 лаймовые + значок «∞» (подписка/админ)
export default function EnergyCells({
  value = 0,
  unlimited = false,
  blinkLast = false,
  dissolving = false,
  fillingNext = false,
  fillProgress = 0,
}) {
  const v = Math.max(0, Math.min(CAP, value))
  const pct = Math.round(Math.max(0, Math.min(1, fillProgress)) * 100)

  return (
    <div className={`enCells${unlimited ? ' enCellsUnlimited' : ''}`}>
      {Array.from({ length: CAP }).map((_, i) => {
        const filled = unlimited || i < v
        const isLast = !unlimited && filled && i === v - 1
        const isNext = !unlimited && !filled && i === v && fillingNext

        // Ширина цветного слоя: полный заряд — 100%, частичный — прогресс
        const width = filled ? 100 : isNext ? pct : 0
        const cls = 'enBoltFill' + (
          isLast && dissolving ? ' enCellDissolve'
            : (isLast && blinkLast) || isNext ? ' enCellBlink' : ''
        )
        const color = unlimited ? energyColor(CAP)
          : energyColor(Math.min(CAP, filled ? v : v + 1))

        return (
          <span key={i} className="enBolt">
            <BoltSvg color="#1c2028" />
            {width > 0 && (
              <span className={cls} style={{ width: `${width}%` }}>
                <BoltSvg color={color} />
              </span>
            )}
          </span>
        )
      })}
      {unlimited && <span className="enCellsInf">∞</span>}
    </div>
  )
}
