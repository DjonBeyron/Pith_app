import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useBatchGenerate } from './useBatchGenerate.js'

const KIND_LABEL = { audio: 'аудио', photo: 'фото' }

function formatEta(ms) {
  if (ms == null) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `~${s} с`
  return `~${Math.floor(s / 60)} мин ${s % 60} с`
}

// Панель «⚡ Генерация» в шапке холста: разом дозаполняет озвучку и фото по
// всем нодам урока, где файла ещё нет (см. batchGenPlan.js — готовые ноды
// молча пропускаются). Показывает план ДО старта (сколько сгенерируется,
// что пропущено и почему — с номером ноды, чтобы можно было найти и
// починить руками), а во время прогона — прогресс отдельно по аудио и фото,
// оценку оставшегося времени и живой список результатов.
export default function BatchGeneratePanel({ boardApiRef, pickFile, onClose }) {
  const { plan, refreshPlan, running, results, etaMs, start, cancel } = useBatchGenerate(boardApiRef, pickFile)

  useEffect(() => { refreshPlan() }, [refreshPlan])

  const audioDone = useMemo(() => results.filter(r => r.kind === 'audio' && r.status === 'done').length, [results])
  const photoDone = useMemo(() => results.filter(r => r.kind === 'photo' && r.status === 'done').length, [results])
  const errorCount = useMemo(() => results.filter(r => r.status === 'error').length, [results])
  const total = plan?.items.length ?? 0
  const doneCount = results.length
  const finished = !running && doneCount > 0 && doneCount >= total

  function handleClose() {
    if (running) cancel()
    onClose()
  }

  return createPortal(
    <div className="bgpOverlay" onMouseDown={handleClose}>
      <div className="bgpModal" onMouseDown={e => e.stopPropagation()}>
        <div className="bgpHeader">
          <span className="bgpTitle">⚡ Массовая генерация</span>
          <button className="lioClose" onClick={handleClose}>×</button>
        </div>

        {!plan ? (
          <div className="lioHint">Считаю план…</div>
        ) : (
          <>
            <div className="bgpSummary">
              <span className="bgpSummaryItem">🔊 Аудио: {plan.audioTotal}</span>
              <span className="bgpSummaryItem">🎨 Фото: {plan.photoTotal}</span>
              {plan.skipped.length > 0 && (
                <span className="bgpSummaryItem bgpSummarySkip">⚠ Пропущено: {plan.skipped.length}</span>
              )}
            </div>

            {plan.skipped.length > 0 && (
              <ul className="lioWarn bgpSkipList">
                {plan.skipped.map((s, i) => (
                  <li key={i}>#{s.seq} {s.type} — {s.reason}</li>
                ))}
              </ul>
            )}

            {total === 0 ? (
              <div className="lioHint">Генерировать нечего — либо все файлы уже на месте, либо не хватает текста/промпта (см. предупреждения выше).</div>
            ) : (
              <>
                <div className="bgpProgressRow">
                  <div className="bgpProgressBar">
                    <div className="bgpProgressFill" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
                  </div>
                  <span className="lioMeta">{doneCount}/{total}{running && etaMs != null ? ` · осталось ${formatEta(etaMs)}` : ''}</span>
                </div>
                <div className="bgpSummary">
                  <span className="bgpSummaryItem">🔊 {audioDone}/{plan.audioTotal}</span>
                  <span className="bgpSummaryItem">🎨 {photoDone}/{plan.photoTotal}</span>
                  {errorCount > 0 && <span className="bgpSummaryItem bgpSummarySkip">✗ ошибок: {errorCount}</span>}
                </div>

                {results.length > 0 && (
                  <ul className="lioWarn bgpResultList">
                    {results.map((r, i) => (
                      <li key={i} className={r.status === 'error' ? 'bgpResultError' : 'bgpResultOk'}>
                        {r.status === 'error' ? '✗' : '✓'} #{r.seq} {KIND_LABEL[r.kind]}{r.message ? ` — ${r.message}` : ''}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="lioActions">
                  <span className="lioMeta">
                    {finished ? 'Готово' : (!running && doneCount > 0
                      ? `Остановлено на ${doneCount}/${total} — закройте и откройте окно снова, чтобы продолжить с оставшимся`
                      : '')}
                  </span>
                  {running && <button className="lioBtn" onClick={cancel}>Остановить</button>}
                  {!running && doneCount === 0 && (
                    <button className="lioBtn lioBtnPrimary" onClick={start}>Начать генерацию</button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
