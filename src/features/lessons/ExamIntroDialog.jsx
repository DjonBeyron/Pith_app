// Интро экзамена: показывается в карточке запуска ВМЕСТО кнопки старта,
// когда запускается финальный урок модуля. Объясняет правила: имитация
// настоящего диалога на английском, всего 3 подсказки, прохождение без
// единой подсказки даёт уникальный ключ.

export default function ExamIntroDialog({ canStart, onStart }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        alignSelf: 'center', padding: '5px 14px', borderRadius: 999,
        background: 'rgba(139, 92, 246, 0.16)', border: '1px solid rgba(139, 92, 246, 0.4)',
        color: '#c4b5fd', fontSize: 13, fontWeight: 700,
      }}>
        🎓 Экзамен
      </div>

      <p style={{ margin: 0, color: '#c9cede', fontSize: 13.5, lineHeight: 1.5 }}>
        Сейчас вы пройдёте экзамен — имитацию настоящего диалога на английском.
      </p>
      <p style={{ margin: 0, color: '#c9cede', fontSize: 13.5, lineHeight: 1.5 }}>
        На экзамене можно воспользоваться лишь{' '}
        <b style={{ color: '#e8ecf4' }}>тремя подсказками</b>.
      </p>
      <p style={{ margin: 0, color: '#c9cede', fontSize: 13.5, lineHeight: 1.5 }}>
        Пройдёте без единой подсказки — получите{' '}
        <b style={{ color: '#a78bfa' }}>уникальный ключ</b> 🗝, который откроет
        вам доступ к новым модулям.
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
        }}
      >
        {canStart ? '🎓 Начать экзамен' : 'Загрузка...'}
      </button>
    </div>
  )
}
