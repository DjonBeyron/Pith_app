import { probe } from './wordLaneDebugProbe.js'
import { debugEnabled } from './wordLaneDebug.js'
import { getPlayerDebugUiValue } from '../../../../shared/lib/usePlayerDebugUi.js'
import { describeGameMic } from '../../../../shared/lib/gameMic.js'

// Старт пробника доступов и звука (wordLaneDebugProbe) вместе с приложением: запрос микрофона при старте урока и тап «Начать» случаются ДО запуска игры, и без раннего старта их в журнале не было бы.
// Зовётся из ShellV2 один раз: сразу (зеркало настройки в localStorage уже есть) и ещё раз, когда пришёл ответ сервера про «Отладочный интерфейс». Выключено — ничего не ставится.
export function bootWordLaneProbe(pending = null) {
  const go = () => { try { probe.setDescribeMic(describeGameMic); if (debugEnabled({ toggle: getPlayerDebugUiValue() })) probe.install() } catch { /* отладка не должна мешать запуску */ } }
  go()
  Promise.resolve(pending).then(go, () => {})
}
