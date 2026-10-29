// Оверлей паузы игры «Повтори за диктором» (свернули приложение): сообщение в стиле .wlFail и две кнопки. «Продолжить» — тап-жест: в нём (useWordLanePause) открывается микрофон.
const PAUSE_TEXT = {
  title: 'Игра на паузе',
  sub: 'Ты свернул приложение. Продолжим с начала этой ступени',
  subIntro: 'Ты свернул приложение. Продолжим с начала',
}

export default function WordLanePause({ pause, onExit }) {
  return (
    <div className="wlFail wlPause" role="alertdialog" aria-label={PAUSE_TEXT.title} data-testid="wl-pause">
      <p className="wlFailTitle">{PAUSE_TEXT.title}</p>
      <p className="wlFailSub">{pause.pausedIntro ? PAUSE_TEXT.subIntro : PAUSE_TEXT.sub}</p>
      {pause.problem && <p className="wlFailSub wlPauseProblem" role="alert" data-testid="wl-pause-problem">{pause.problem}</p>}
      <div className="wlFailBtns">
        <button type="button" className="wlFailBtn wlFailBtn--main" onClick={pause.resume} disabled={pause.busy} data-testid="wl-pause-resume">{pause.busy ? '…' : 'Продолжить'}</button>
        <button type="button" className="wlFailBtn" onClick={onExit} data-testid="wl-pause-exit">Выйти</button>
      </div>
    </div>
  )
}
