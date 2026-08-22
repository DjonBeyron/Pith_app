// Пошаговое управление прогоном — одна ровная строка в шапке правой панели.
// Иконки рисуются svg, а не символами-эмодзи: у ⏴/⏸/⏩ разная ширина и своя
// цветная отрисовка в системе, из-за чего ряд выглядел разнобоем.
const ICON = {
  back:  'M4 3.5v9M12.5 3.5L6.5 8l6 4.5z',
  pause: 'M5.2 3.5h2.1v9H5.2zM8.7 3.5h2.1v9H8.7z',
  play:  'M5.5 3.5L12 8l-6.5 4.5z',
  fwd:   'M12 3.5v9M3.5 3.5L9.5 8l-6 4.5z',
  // «К ноде»: стрелка, выходящая из рамки
  exit:  'M9 2H3.2v12H9v-1.4H4.6V3.4H9zM10.6 4.6L9.6 5.6l1.7 1.7H6.6v1.4h4.7L9.6 10.4l1 1L14 8z',
}

function Icon({ d }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

export default function PlayerStepBar({
  paused, frozen, onTogglePause, onBack, onForward, canBack,
  answerCorrect, onToggleAnswer, onExitToNode, canExit,
}) {
  return (
    <div className="playerStepBar">
      <div className="playerStepGroup">
        <button
          className="playerStepBtn"
          title="Шаг назад: снять последнее сообщение и пройти этот кусок заново"
          disabled={!canBack}
          onClick={onBack}
        ><Icon d={ICON.back} /></button>
        <button
          className={`playerStepBtn${paused ? ' playerStepBtnOn' : ''}`}
          title={frozen ? 'Продолжить прогон' : 'Пауза: цепочка и звук замирают'}
          onClick={onTogglePause}
        ><Icon d={frozen ? ICON.play : ICON.pause} /></button>
        <button
          className="playerStepBtn"
          title="Шаг вперёд: показать следующее сообщение сейчас же"
          onClick={onForward}
        ><Icon d={ICON.fwd} /></button>
      </div>

      <button
        className="playerStepBtn playerStepBtnSolo"
        title="Выйти в канвас к этой ноде: закрыть прогон и показать её на холсте"
        disabled={!canExit}
        onClick={onExitToNode}
      ><Icon d={ICON.exit} /></button>

      <button
        className={`playerStepAnswer${answerCorrect ? '' : ' playerStepAnswerBad'}`}
        title={answerCorrect
          ? 'Шаг отвечает ВЕРНО (если верных вариантов несколько — случайным из них)'
          : 'Шаг отвечает НЕВЕРНО (если неверных несколько — случайным из них)'}
        onClick={onToggleAnswer}
      >
        <span className="playerStepDot" />
        {answerCorrect ? 'верно' : 'неверно'}
      </button>
    </div>
  )
}
