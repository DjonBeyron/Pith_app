import { MessageSquare } from 'lucide-react'
import { APP_VERSION } from '../../../../shared/lib/version.js'
import { snapshotScreen } from '../../../rehearsal/polish/commentSnapshot.js'
import { snapshotSettings } from '../../../rehearsal/polish/commentSettings.js'

// Кнопка комментария к этапу репетиции («Шлифовка репетиции», Админ → «Голос»): маленькая 💬 в правом верхнем углу ПОД кнопкой ⚙ HUD, видна только при отладочном интерфейсе в репетиции (условие — в WordLaneGame).
// Тап: сначала снимок «что на экране» и настроек (пока пилюли, стадия, аудиосессия и микрофон такие, какими владелец их увидел), потом игра встаёт на паузу тем же путём, что при сворачивании приложения (f.pause: таймеры, голос, слушатель, микрофон, кот),
// HUD не открывается; оверлей комментария (WordLaneComment) открывает игра. Журнал отладки получает событие comment-open — в «Скачать отладку» видно, где был тап.
export default function WordLaneCommentButton({ f, cfg, rootRef, onOpen }) {
  const press = () => {
    const at = Date.now() // момент тапа: от него считается t (мс от старта игры) в комментарии
    const snap = snapshotScreen({ f, root: rootRef?.current, chunks: cfg.chunks, phrase: cfg.plan?.phrase ?? cfg.word, version: APP_VERSION, fallbackAct: cfg.plan?.only ?? 'intro' })
    const settings = snapshotSettings() // настройки и живое состояние (тип аудиосессии, дорожка микрофона, Vosk) — тоже до паузы: пауза всё закрывает
    f.pause('comment')
    f.dbg.event('comment-open', { act: snap.stage.act, stage: snap.stage.sid || snap.stage.name })
    onOpen({ snap, at, settings })
  }
  return <button type="button" className="wlCmtBtn" onClick={press} aria-label="Комментарий к этапу" data-no-unlock="" data-testid="wl-cmt-open"><MessageSquare size={18} /></button>
}
