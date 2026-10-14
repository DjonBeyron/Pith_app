import { quotaVerdict } from './voicePlan.js'

// Диалог «Озвучить всё» внутри окна сборщика (не confirm()): до запуска — сколько реплик
// и вызовов, сколько символов уйдёт, остаток квоты ElevenLabs и предупреждение, если не
// хватает; во время прогона — полоса и список по репликам с кнопкой «Остановить»; в
// конце — итог (сколько ок, какие нет и почему). all — состояние из useSceneVoice.

const plural = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many)
const fmt = n => Number(n ?? 0).toLocaleString('ru-RU')

export default function VoiceAllDialog({ all, quota, names, onStart, onStop, onClose }) {
  if (!all) return null
  const { phase, plan, progress, result, current } = all
  const q = quotaVerdict(plan, quota)
  const reuse = plan.items.length - plan.generate
  const running = phase === 'running'

  return (
    <div className="scbVoiceDlgWrap" role="presentation">
      <div className="scbVoiceDlg" role="dialog" aria-modal="true" aria-labelledby="scb-voice-all-h">
        <h2 id="scb-voice-all-h" className="scbH">Озвучить всё (ElevenLabs)</h2>

        {phase === 'confirm' && (
          <>
            {plan.items.length === 0 ? (
              <p className="scbSub">Все {plan.total} {plural(plan.total, 'реплика', 'реплики', 'реплик')} уже озвучены актуальными файлами — генерировать нечего.</p>
            ) : (
              <ul className="scbVoiceFacts">
                <li>Озвучить: <b>{plan.items.length}</b> из {plan.total} реплик (актуальных уже {plan.ready}){reuse > 0 && <>, из них <b>{reuse}</b> — из кэша без вызова API (та же фраза тем же голосом)</>}</li>
                <li>Вызовов ElevenLabs: <b>{plan.generate}</b>, символов в квоту: <b>{fmt(plan.chars)}</b></li>
                <li>
                  Остаток квоты: {q.known ? <b className={q.enough ? 'scOk' : 'scBad'}>{fmt(q.remaining)} симв.</b> : <span className="scbSub">неизвестен (функция квоты недоступна)</span>}
                  {q.known && !q.enough && <span className="scbVoiceErr"> — не хватит: часть реплик вернётся с ошибкой</span>}
                </li>
                <li className="scbSub">Реплики озвучиваются по одной; ошибка одной не останавливает остальные. Пока идёт озвучка, окно не закрывайте.</li>
              </ul>
            )}
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
                ? <>Реплика {Math.min(progress.done + 1, progress.total)} из {progress.total}{current !== null && current !== undefined ? ` — №${current + 1}, ${names?.[plan.items.find(x => x.index === current)?.who] ?? ''}` : ''}…</>
                : <>{result?.stopped ? 'Остановлено. ' : 'Готово. '}Озвучено {progress.ok} из {progress.total}{progress.failed.length ? `, с ошибкой ${progress.failed.length}` : ''}{result?.skipped?.length ? `, пропущено ${result.skipped.length}` : ''}.</>}
            </p>
            {progress.failed.length > 0 && (
              <ul className="scbVoiceFails">
                {progress.failed.map(f => <li key={f.index}><b>№{f.index + 1}</b>: {f.error}</li>)}
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
