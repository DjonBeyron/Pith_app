import { haptic } from '../lib/haptics.js'

// Единая кнопка «назад»/«закрыть» для всего приложения: стрелка на круглой
// подложке, без текстовой подписи (используется в шапках экранов и попапов).
// Нажатие «продавливается» (back-button.css) и даёт тактильный импакт
export default function BackButton({ onClick, label = 'Назад', className = '' }) {
  return (
    <button
      type="button"
      className={className ? `backBtn ${className}` : 'backBtn'}
      onClick={e => { haptic(); onClick?.(e) }}
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5 8 12l7 7" />
      </svg>
    </button>
  )
}
