import { lineFills } from './memoryLadder.js'

// Тонкая линия по нижней кромке слова в списке «Все слова»: три отрезка —
// Новые, Знакомые, Усвоенные (цвета ступеней, memory-pages.css). Пройденное
// залито ярко, незаполненное — тусклый оттенок своего цвета. Только украшение:
// где слово сейчас, читается по цвету рамки и названию ступени
export default function MemoryWordLine({ step }) {
  return (
    <span className="memLine" aria-hidden="true">
      {lineFills(step).map((f, i) => (
        <i key={i} className={`memLineSeg memLineSeg--${i + 1}`} style={{ '--f': `${f * 100}%` }} />
      ))}
    </span>
  )
}
