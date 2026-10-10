// Значок «Я не могу говорить»: минималистичный речевой пузырь с косой чертой (речь перечёркнута). Тонкая линия, скруглённые концы, без заливок, цвет — только currentColor.
// Не повторяет перечёркнутый микрофон основной кнопки: здесь пузырь-«реплика», а не микрофон. Общий для кнопки в углу панели (SayActions, 22px) и мини-вида в строке попапа (SayMicPopup, ≈16px:
// там линия потолще, чтобы читалась). Размер/толщину задают пропсы; viewBox 24, пузырь с хвостиком слева снизу, черта от левого верха к правому низу выступает за контур.
export default function SayCantIcon({ size = 22, strokeWidth = 1.85, ...rest }) {
  return (
    <svg
      className="sayCantIcon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}
    >
      <path d="M7 4.5h10a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5h-5.5L7.5 20v-3.5H7A3.5 3.5 0 0 1 3.5 13V8A3.5 3.5 0 0 1 7 4.5z" />
      <path d="M3.5 3.5l17 17" />
    </svg>
  )
}
