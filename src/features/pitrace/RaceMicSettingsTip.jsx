import { micTip, MIC_TIP_LABELS } from './raceMicHelp.js'
import { writeTipDone, writeTipLater } from './raceMicSettingsTip.js'

// Компактная карточка «Чтобы iPhone не спрашивал микрофон каждый раз»: шаги для Safari или короткий текст для приложения с «Домой» (raceMicHelp.micTip). Показывается в попапе гонки (RaceAskPlate) и по пункту
// шестерёнки игры (WordLaneHud). «Понятно» — больше не показывать в попапе, «Напомнить позже» — молчать 24 часа; обе кнопки сами пишут флаг и зовут onClose.
export default function RaceMicSettingsTip({ standalone = false, onClose = null }) {
  const t = micTip(standalone)
  const done = () => { writeTipDone(); onClose?.() }
  const later = () => { writeTipLater(); onClose?.() }
  return (
    <div className="raceMicTip" data-testid="race-mic-tip" data-mode={t.mode}>
      <p className="raceMicTipTitle">{t.title}</p>
      <p className="raceMicTipText" data-testid="race-mic-tip-intro">{t.intro}</p>
      {t.steps.length > 0 && <ol className="raceMicTipSteps" data-testid="race-mic-tip-steps">{t.steps.map(s => <li key={s}>{s}</li>)}</ol>}
      {t.fallback && <p className="raceMicTipText" data-testid="race-mic-tip-fallback">{t.fallback}</p>}
      <div className="raceMicTipBtns">
        <button type="button" className="raceMicTipBtn" data-no-unlock="" onClick={done} data-testid="race-mic-tip-done">{MIC_TIP_LABELS.done}</button>
        <button type="button" className="raceMicTipBtn" data-no-unlock="" onClick={later} data-testid="race-mic-tip-later">{MIC_TIP_LABELS.later}</button>
      </div>
    </div>
  )
}
