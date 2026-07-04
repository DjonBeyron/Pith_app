// Выбор режима пересдачи (SKILL_ANALYSIS.md §2, план — этап 6): если урок уже
// пройден и в его сценарии есть привязки «→ Урок» (hasStatBindings из
// useAnswerStats.js), перед стартом пользователь решает, писать ли новую
// диагностику поверх старой. Рендерится внутри карточки запуска урока ВМЕСТО
// кнопки «Начать урок» — предзагрузка идёт своим чередом.
// Первое прохождение и уроки без привязок этот выбор не видят.

const modeBtn = (ready) => ({
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
  padding: '11px 14px', borderRadius: 12, border: '1px solid #3a3e4a',
  background: '#22252d', textAlign: 'left',
  cursor: ready ? 'pointer' : 'default', opacity: ready ? 1 : 0.45,
})

export default function RetakeDialog({ canStart, onPick, onCancel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ color: '#aaa', fontSize: 13 }}>
        Урок уже пройден. Как повторить?
      </span>

      <button disabled={!canStart} style={modeBtn(canStart)} onClick={() => onPick('update')}>
        <span style={{ color: '#b6fe3b', fontSize: 14, fontWeight: 600 }}>
          🔄 Пройти с обновлением анализа
        </span>
        <span style={{ color: '#888', fontSize: 12, lineHeight: 1.35 }}>
          Ответы перезапишут карту знаний, статусы уроков пересчитаются
        </span>
      </button>

      <button disabled={!canStart} style={modeBtn(canStart)} onClick={() => onPick('silent')}>
        <span style={{ color: '#e8ecf4', fontSize: 14, fontWeight: 600 }}>
          👁 Пройти без записи
        </span>
        <span style={{ color: '#888', fontSize: 12, lineHeight: 1.35 }}>
          Просто повторить, анализ не изменится
        </span>
      </button>

      <button
        onClick={onCancel}
        style={{
          padding: '9px 0', borderRadius: 10, border: 'none',
          background: 'transparent', color: '#777', fontSize: 13, cursor: 'pointer',
        }}
      >
        Отмена
      </button>
    </div>
  )
}
