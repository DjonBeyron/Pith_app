import { SET_LABEL } from './voicePlan.js'
import VoiceAllFacts from './VoiceAllFacts.jsx'

// Диалог «Озвучить всё» внутри окна сборщика (не confirm()): до запуска — выбор наборов
// (Текст / Перевод) и расчёт (VoiceAllFacts); во время прогона — полоса и «реплика i из n»
// с набором и кнопкой «Остановить»; в конце — итог (сколько ок, какие нет и почему).
// all — состояние из useSceneVoice/useVoiceAll: { phase, plan, sets, current, progress, result }.

export default function VoiceAllDialog({ all, quota, names, onStart, onStop, onClose, onSets = () => {} }) {
  if (!all) return null
  const { phase, plan, progress, result, current } = all
  const sets = all.sets ?? ['original']
  const running = phase === 'running'
  const curItem = current && typeof current === 'object' ? current : (current !== null && current !== undefined ? { index: current, set: 'original' } : null)
  const curLine = curItem ? plan.items.find(x => x.index === curItem.index && (x.set ?? 'original') === curItem.set && x.seg === curItem.seg) : null

  return (
    <div className="scbVoiceDlgWrap" role="presentation">
      <div className="scbVoiceDlg" role="dialog" aria-modal="true" aria-labelledby="scb-voice-all-h">
        <h2 id="scb-voice-all-h" className="scbH">Озвучить всё (ElevenLabs)</h2>

        {phase === 'confirm' && (
          <>
            <VoiceAllFacts plan={plan} sets={sets} quota={quota} onSets={onSets} />
            <div className="fsBtnBox" style={{ gap: 6 }}>
              {plan.items.length > 0 && <button type="button" className="fsBtn fsBtnPrimary" onClick={onStart}>Озвучить {plan.items.length}</button>}
              <button type="button" className="fsBtn" onClick={onClose}>{plan.items.length ? 'Отмена' : 'Закрыть'}</button>
            </div>
          </>
        )}

        {(running || phase === 'done') && progress && (
          <>
            <div className="scbVoiceBar" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
              <span style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
            <p className="scbSub">
              {running
                ? <>Реплика {Math.min(progress.done + 1, progress.total)} из {progress.total}{curItem ? ` — №${curItem.index + 1}, ${names?.[curLine?.who] ?? ''}${sets.length > 1 || curItem.set === 'translation' ? ` (${SET_LABEL[curItem.set].toLowerCase()})` : ''}${curLine?.seg !== undefined ? ` — часть «${curLine.text}»` : ''}` : ''}…</>
                : <>{result?.stopped ? 'Остановлено. ' : 'Готово. '}Озвучено {progress.ok} из {progress.total}{progress.failed.length ? `, с ошибкой ${progress.failed.length}` : ''}{result?.skipped?.length ? `, пропущено ${result.skipped.length}` : ''}.</>}
            </p>
            {progress.failed.length > 0 && (
              <ul className="scbVoiceFails">
                {progress.failed.map(f => <li key={`${f.set ?? 'o'}${f.index}-${f.seg ?? ''}`}><b>№{f.index + 1}{f.set === 'translation' ? ' (перевод)' : ''}{f.seg !== undefined ? ' (часть шаблона)' : ''}</b>: {f.error}</li>)}
              </ul>
            )}
            <div className="fsBtnBox" style={{ gap: 6 }}>
              {running && <button type="button" className="fsBtn" onClick={onStop}>Остановить после текущей</button>}
              {!running && <button type="button" className="fsBtn fsBtnPrimary" onClick={onClose}>Закрыть</button>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
