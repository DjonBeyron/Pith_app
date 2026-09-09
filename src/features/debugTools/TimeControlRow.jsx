import { Pause, Play, Rewind, FastForward } from 'lucide-react'

// Ряд управления временем: шаг назад/вперёд и пауза. Вынесен из
// DebugToolbar.jsx отдельным файлом — тот перерос ориентир в 250 строк, а
// здесь своя законченная ответственность: только время, без комментариев,
// записи и отчётов.
//
// Подписи на кнопках обязательны: без них две пары стрелок разного размера
// неразличимы, и непонятно, какая из них мельче.
// Возвращает фрагмент, а не свой ряд: кнопки комментария и записи живут в том
// же ряду тулбара, и лишняя обёртка развалила бы его на две строки.
export default function TimeControlRow({ frameMs, jumpMs, paused, onStep, onTogglePause }) {
  return (
    <>
      <button onClick={() => onStep(-jumpMs)} title={`Назад на ${jumpMs}мс (крупный шаг — три кадра разом)`}>
        <Rewind size={13} /><span className="dbgToolbarStepLabel">{jumpMs}</span>
      </button>
      <button onClick={() => onStep(-frameMs)} title={`Назад на 1 кадр (${frameMs}мс — самый мелкий шаг)`}>
        <Rewind size={13} /><span className="dbgToolbarStepLabel">1к</span>
      </button>
      <button
        className="dbgToolbarPauseBtn"
        onClick={onTogglePause}
        title={paused ? 'Продолжить (и видео, и сценарий урока)' : 'Пауза (и видео, и сценарий урока — держит и новые анимации тоже)'}
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
      </button>
      <button onClick={() => onStep(frameMs)} title={`Вперёд на 1 кадр (${frameMs}мс — самый мелкий шаг)`}>
        <span className="dbgToolbarStepLabel">1к</span><FastForward size={13} />
      </button>
      <button onClick={() => onStep(jumpMs)} title={`Вперёд на ${jumpMs}мс (крупный шаг — три кадра разом)`}>
        <span className="dbgToolbarStepLabel">{jumpMs}</span><FastForward size={13} />
      </button>
    </>
  )
}
