// Награды на экране итогов урока: золотой билет (Финал) и звёзды (обычный
// урок). Оба блока опциональны — LessonSummary рендерит их между XP-баром
// и блоком нового уровня.

// ── Билет: итог по золотому билету за Финал модуля ─────────────────────────
// ticket — ответ award_module_ticket ({ ok, clean, reason?, hints }), null вне Финала
export function TicketBlock({ ticket, hintLimit }) {
  if (!ticket) return null
  const clean = ticket.clean
    && <span className="summaryTicketClean">✨ Идеально — без подсказок! Достижение «Чистый финал»</span>
  if (ticket.ok) {
    return (
      <div className="summaryTicketBlock summaryTicketWon">
        🎟 Золотой билет получен!{clean}
      </div>
    )
  }
  if (ticket.reason === 'hints') {
    return (
      <div className="summaryTicketBlock summaryTicketLost">
        Билет не получен — подсказок больше {hintLimit}.
        Пересдай Финал чище: билет с этого модуля всё ещё ждёт тебя
      </div>
    )
  }
  if (ticket.reason === 'already') {
    return (
      <div className="summaryTicketBlock summaryTicketLost">
        Билет за этот модуль уже был получен раньше{clean}
      </div>
    )
  }
  return null
}

// ── Звёзды: результат обычного урока (между Стартом и Финалом) ────────────
// stars — { earned: 1..3, best: лучший на сервере (0 = не знаем) }, null вне
// обычного урока. Показываем заработанные сейчас; если раньше было лучше —
// подпись, что рекорд не побит.
export function StarsBlock({ stars }) {
  if (!stars?.earned) return null
  return (
    <div className="summaryStarsBlock">
      <div className="summaryStarsRow">
        {[1, 2, 3].map(i => (
          <svg key={i} viewBox="0 0 24 24"
            className={`summaryStar${i <= stars.earned ? ' summaryStarOn' : ''}`}>
            <path d="M12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.5 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6Z" />
          </svg>
        ))}
      </div>
      <div className="summaryStarsLabel">
        {stars.earned === 3 ? 'Идеально — без ошибок!'
          : stars.earned === 2 ? 'Хорошо! 3 звезды — за урок без ошибок'
          : 'Урок пройден. Меньше ошибок — больше звёзд'}
        {stars.best > stars.earned && (
          <span className="summaryStarsBest">Твой рекорд {stars.best}★ сохранён</span>
        )}
      </div>
    </div>
  )
}
