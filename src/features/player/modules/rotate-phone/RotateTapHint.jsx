import { createPortal } from 'react-dom'

// Подсказка «Тапни, чтобы начать» (iPhone): жест «Начать» истёк, пока открывался микрофон (диалог доступа, долгая смена аудиосессии) — звук, разбуженный вне жеста, молчит, и первая реплика Пита прозвучала бы
// тихо. Поэтому игра открывается не сразу, а после одного касания экрана: касание — свежий жест, прогрев звука (gameAudioWarm.rewarm) идёт в нём. Показывает RotatePhoneModule между «Начать» и самой игрой
// (portal в body поверх всего, как сама игра), onTap зовёт прогрев и открывает игру.
export default function RotateTapHint({ onTap }) {
  return createPortal(
    <div className="rotateTapHint" role="button" tabIndex={0} onClick={onTap} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onTap() }} data-testid="rotate-tap-hint">
      <span className="rotateTapHintText">Тапни, чтобы начать</span>
      <span className="rotateTapHintSub">Одно касание включит звук</span>
    </div>,
    document.body,
  )
}
