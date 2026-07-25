import { GraduationCap } from 'lucide-react'
import TicketIcon from '../../shared/ui/TicketIcon.jsx'

// Интро экзамена: показывается в карточке запуска ВМЕСТО кнопки старта,
// когда запускается финальный урок модуля. Одна строка правила вместо
// двух абзацев — раньше текст был нагромождён (плашка + 2 отдельных
// абзаца). Награда — золотой билет при не больше 3 подсказок (не «без
// единой» — старый текст завышал требование, реальное правило см.
// HINT_LIMIT в useFinalHints.js).

export default function ExamIntroDialog({ canStart, onStart }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 14px', borderRadius: 999,
        background: 'rgba(139, 92, 246, 0.16)', border: '1px solid rgba(139, 92, 246, 0.4)',
        color: '#c4b5fd', fontSize: 13, fontWeight: 700,
      }}>
        <GraduationCap size={15} /> Финальный экзамен
      </div>

      <p style={{
        margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
        color: '#c9cede', fontSize: 13.5, lineHeight: 1.5,
      }}>
        Имитация диалога на английском. Уложитесь в{' '}
        <b style={{ color: '#e8ecf4' }}>3 подсказки</b> — получите золотой билет
        <TicketIcon style={{ width: 15, height: 15, flexShrink: 0 }} />
      </p>

      <button
        onClick={onStart}
        disabled={!canStart}
        style={{
          padding: '14px 0', borderRadius: 12, border: 'none',
          fontSize: 16, fontWeight: 600, cursor: canStart ? 'pointer' : 'default',
          background: canStart ? '#8b5cf6' : '#333',
          color: canStart ? '#fff' : '#666',
          transition: 'background 0.3s ease, color 0.3s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {canStart ? <><GraduationCap size={18} /> Начать экзамен</> : 'Загрузка...'}
      </button>
    </div>
  )
}
