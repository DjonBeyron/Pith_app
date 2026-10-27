import { NEED_TITLE } from '../lib/vosk/voskReadyView.js'
import '../../styles/vosk-notice.css'

// Уведомление «Нужно скачать распознавание речи (≈39 МБ)» — общее для всех мест, где нужен Vosk (мини-игра «Скажи вслух», дальше «Сказать фразу»; решение 20 плана нового пользователя).
// Получает результат useVoskReady (status + download/retry) и рисует нужное состояние: готовим / нужно скачать (кнопка) / качается (прогресс) / ждём сеть / ошибка загрузки / не включилось.
// Системное распознавание не предлагается и не подставляется. Готово (ready) — ничего не рисует: экран показывает свой контент.
export default function VoskReadyNotice({ vosk }) {
  const { status } = vosk
  if (status === 'ready') return null
  if (status === 'preparing') return <p className="voskNotice voskNotice--plain" role="status" data-testid="vosk-notice">Готовлю распознавание речи…</p>

  const pct = Number.isFinite(vosk.pct) ? Math.max(0, Math.min(100, vosk.pct)) : null
  return (
    <div className="voskNotice" role="status" data-status={status} data-testid="vosk-notice">
      {status === 'need' && (
        <>
          <p className="voskNoticeTitle">{NEED_TITLE}</p>
          <p className="voskNoticeSub">Оно работает прямо на телефоне. Скачать нужно один раз</p>
          <button type="button" className="voskNoticeBtn" onClick={vosk.download} data-testid="vosk-download">Скачать</button>
        </>
      )}
      {status === 'downloading' && (
        <>
          <p className="voskNoticeTitle">Скачиваем распознавание речи…</p>
          <div className="voskNoticeBar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
            <i style={{ width: `${pct ?? 4}%` }} />
          </div>
          <p className="voskNoticeSub">{pct != null ? `${pct}%` : ''}{vosk.detail ? ` · ${vosk.detail}` : ''}</p>
        </>
      )}
      {status === 'waiting' && (
        <>
          <p className="voskNoticeTitle">Ждём, чтобы скачать</p>
          <p className="voskNoticeSub">{vosk.text}</p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="voskNoticeTitle">Не получилось скачать</p>
          <p className="voskNoticeSub">{vosk.text || 'Проверь интернет и попробуй ещё раз'}</p>
          <button type="button" className="voskNoticeBtn" onClick={vosk.download}>Ещё раз</button>
        </>
      )}
      {status === 'failed' && (
        <>
          <p className="voskNoticeTitle">Распознавание речи не включилось</p>
          <p className="voskNoticeSub">{vosk.text || 'Попробуй ещё раз чуть позже'}</p>
          <button type="button" className="voskNoticeBtn" onClick={vosk.retry}>Ещё раз</button>
        </>
      )}
    </div>
  )
}
