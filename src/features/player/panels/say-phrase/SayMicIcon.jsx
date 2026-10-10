// Значок микрофона круглой кнопки (39px в круге 85: прежние 46 в круге 100 × 0,85) «Сказать фразу» — как на образце владельца: сплошная капсула-тело, под ней U-образная дужка-держатель и короткая
// ножка; линии толстые, концы скруглённые. Цвет — только currentColor кнопки (say-phrase-mic.css), в разметке цветов нет.
// Наклонная черта «нет доступа» (sayMicSlash) лежит в разметке ВСЕГДА: CSS по состоянию круга (.sayMicBox--locked / --off) плавно прочерчивает её или убирает.
export default function SayMicIcon({ size = 39, ...rest }) {
  return (
    <svg className="sayMicIcon" width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" {...rest}>
      <rect className="sayMicBody" x="17" y="4" width="14" height="24" rx="7" />
      <path className="sayMicStroke" d="M9.5 22.5v1.5a14.5 14.5 0 0 0 29 0v-1.5M24 38.5v5" />
      <path className="sayMicStroke sayMicSlash" d="M7 7l34 34" />
    </svg>
  )
}
