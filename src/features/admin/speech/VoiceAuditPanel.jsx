import { auditSummary } from './voiceAudit.js'
import { missingRows } from './raceVoiceTable.js'

// Проверка озвучки реплик Пита и Мии (v3.3.300): сверяет код с сохранёнными настройками (voiceAudit.js) и показывает, ЧТО именно изменилось — новая реплика, текст в коде другой («было → стало»), нет файла, нет длительности.
// Одна кнопка озвучивает недостающее у Пита и у Мии сразу (Мия — голосом второго аккаунта, это решает voicePitLines по id). После озвучки таблица перечитывает настройки с сервера, и проверка пересчитывается сама: что не озвучилось — останется в списке.
const WHO = { pit: 'Пит', 'pit-mia': 'Пит · эпизод Мии', mia: 'Мия' }

export default function VoiceAuditPanel({ t, off }) {
  const a = t.audit
  const rows = missingRows([...t.groups.lines, ...t.groups.pitMia, ...t.groups.mia]) // то же, что видят строки таблицы: нормализованные реплики + аудит
  const total = a.entries.filter(e => e.status !== 'skip').length
  const note = auditSummary(a)
  return (
    <div className="rvAudit" data-testid="rv-audit">
      {!t.loaded ? <span className="rhpHint">проверяю озвучку…</span>
        : !rows.length && !note ? <span className="rhpHint" data-testid="rv-audit-ok">Проверка: код и настройки совпадают, озвучено все {total} реплик Пита и Мии</span>
        : (
          <>
            <button type="button" className="aspChip" disabled={off || !rows.length} onClick={() => t.voice(rows)} data-testid="rv-voice-all-missing">Озвучить недостающее: Пит и Мия ({rows.length})</button>
            {note && <span className="aspErr" role="status" data-testid="rv-audit-note"> {note}</span>}
            <details open={a.missing.length <= 12}>
              <summary>Что изменилось ({a.missing.length})</summary>
              <ul data-testid="rv-audit-list">{a.missing.map(e => <li key={e.id}><code>{e.id}</code> · {WHO[e.who]} — {e.reason}</li>)}</ul>
            </details>
          </>
        )}
      {a.orphans.length > 0 && <p className="rhpHint" data-testid="rv-audit-orphans">В настройках есть озвучка реплик, которых нет в коде: {a.orphans.join(', ')} (игре не мешают)</p>}
    </div>
  )
}
