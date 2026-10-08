import { Wand2 } from 'lucide-react'
import { useAdmin } from '../../../app/AdminContext.jsx'

// Админская кнопка «собрать верный ответ» в нижней панели ответа (выбери
// слово, собери фразу, составь предложение, напечатай слово, выбери фото, обе
// таблицы). Сидит ПОВЕРХ вёрстки панели (absolute в правом верхнем углу, см.
// styles/player/admin-solve.css): высоту панели не меняет — usePanelHeight и
// спейсер под лентой её не видят. Обычному пользователю не рендерится вовсе
// (isAdmin — эффективный статус из AdminContext: «режим пользователя» и
// «новенький» её тоже прячут).
//
// onSolve(rect) — панель сама выполняет верный ответ через СВОИ обработчики
// (те же звук/салют/XP/пузыри, что у тапа ученика); rect кнопки — точка
// старта «+N XP» (rememberTap), раз тапа по варианту не было. Панель после
// ответа размонтируется — кнопка уходит вместе с ней.
export default function SolveCorrectButton({ onSolve, label = 'Собрать верный ответ (админ)', disabled = false, side = 'right' }) {
  const { isAdmin } = useAdmin()
  if (!isAdmin) return null
  return (
    <button
      type="button"
      className={`solveCorrectBtn${side === 'left' ? ' solveCorrectBtn--left' : ''}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={e => { e.stopPropagation(); e.preventDefault() }}
      onClick={e => { e.stopPropagation(); onSolve?.(e.currentTarget.getBoundingClientRect()) }}
    >
      <Wand2 size={13} />
    </button>
  )
}
