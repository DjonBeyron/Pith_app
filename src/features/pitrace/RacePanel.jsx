import { Pause, Play } from 'lucide-react'
import BackButton from '../../shared/ui/BackButton.jsx'

// Верхняя панель «Гонки с Питом» (CONCEPT_RACE.md, «Верхняя панель»; стили — race-panel.css): слева «назад» (общая кнопка приложения BackButton: стрелка на круглой подложке, выход из игры вместо крестика), справа «пауза» / «плей» (ставит игру на паузу
// тем же путём, что сворачивание приложения: f.pause → оверлей «Игра на паузе»; на паузе кнопка — «плей», снимает её тем же «Продолжить», который открывает микрофон из тапа), а между ними по центру короткий прогресс-бар (RaceBar.jsx).
// Кнопки админа (⚙ HUD и 💬 комментарий) живут строкой НИЖЕ панели, справа, мельче (race-panel.css, .wl[data-race]). Только у гонки: у репетиции и обычной ноды остаётся крестик .wlClose.
export default function RacePanel({ onBack, onPause, onResume, paused = false }) {
  return (
    <>
      <BackButton className="raceBack" onClick={onBack} label="Выйти из игры" data-testid="wl-close" />
      <button type="button" className="racePause" onClick={paused ? onResume : onPause} aria-label={paused ? 'Продолжить' : 'Пауза'} data-no-unlock="" data-testid="race-pause">
        {paused ? <Play size={18} /> : <Pause size={18} />}
      </button>
    </>
  )
}
