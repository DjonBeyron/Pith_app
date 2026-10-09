import { useState } from 'react'
import { MODE_LABEL, capsReportLines } from '../../../shared/lib/speech/speechSupport.js'
import { fmtCapture, fmtConf } from './speechCapture.js'
import { fmtAntiPredict } from './antiPredictReport.js'
import { attemptsBlock, allComparisonsText } from './speechReportAttempts.js'
import { seriesFullLines } from './controlSeries.js'
import { copyText } from './copyText.js'
import AttemptDetails from './AttemptDetails.jsx'
import { LOG_SHOW, DIALOG_LABEL, fmtMs, fmtAttempt, fmtRestart, dialogCount, logReportLines, clearLog } from './speechLog.js'

// Блок 4 пробы «Голос»: журнал попыток (localStorage этого устройства), счётчик диалогов разрешения, отчёт.
export default function SpeechLogBlock({ log, setLog, caps, perm, since, series }) {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(null) // t раскрытой попытки
  const [sure, yes] = dialogCount(log, since)
  const shown = log.slice(0, LOG_SHOW)

  async function copy() {
    const text = [...capsReportLines(caps, perm), '', `Журнал (последние ${shown.length}):`, ...logReportLines(log), '', ...attemptsBlock(log)].join('\n')
    setNote((await copyText(text)) ? 'Отчёт скопирован' : 'Не удалось скопировать — выделите текст вручную')
  }

  // Последние попытки с текстами + итог серии «длина контекста» — одним текстом ≤ ~6000 символов
  async function copyAll() {
    const head = [`ВСЕ СРАВНЕНИЯ · ${MODE_LABEL[caps.mode]} · ${caps.uaShort}`]
    const text = allComparisonsText({ log, head, seriesLines: series ? seriesFullLines(series, undefined, false) : [] })
    setNote((await copyText(text)) ? `Скопировано (${text.length} симв.)` : 'Не удалось скопировать — выделите текст вручную')
  }

  return (
    <section className="aspBlock">
      <h3 className="aspH">Журнал запросов микрофона</h3>
      <p className="aeHint">Хранится только в этом браузере (localStorage), на сервер не уходит. Звук не сохраняется; тексты распознавания (стрелка ▸ у попытки) лежат только здесь, в этом браузере.</p>
      <div className="aspCount">
        Диалог разрешения за сеанс: <b>{sure}</b>{yes > 0 && <> (+{yes} возможно)</>}
        <span className="aspHint"> · сеанс = с открытия страницы приложения</span>
      </div>
      {shown.length === 0 ? <p className="aeHint">Попыток пока нет.</p> : (
        <div className="aspTableWrap">
          <table className="aspTable">
            <thead>
              <tr><th></th><th>Время</th><th>Попытка</th><th>Режим</th><th>Разрешение до→после</th><th>start</th><th>audio</th><th>result</th><th>Уверен.</th><th>Захват</th><th>Эксперименты</th><th>Перезапуск</th><th>Ошибка</th><th>Диалог</th></tr>
            </thead>
            <tbody>
              {shown.flatMap((e, i) => [
                <tr key={`${e.t}-${i}`}>
                  <td><button className="apOpen" aria-expanded={open === e.t} aria-label="Тексты попытки" disabled={!e.tx} onClick={() => setOpen(open === e.t ? null : e.t)}>{open === e.t ? '▾' : '▸'}</button></td>
                  <td>{new Date(e.t).toLocaleTimeString('ru-RU')}</td>
                  <td>{fmtAttempt(e)}</td>
                  <td>{e.mode === 'pwa' ? 'PWA' : 'браузер'}</td>
                  <td>{e.permBefore || '?'}→{e.permAfter || '?'}</td>
                  <td>{fmtMs(e.msStart)}</td><td>{fmtMs(e.msAudio)}</td><td>{fmtMs(e.msResult)}</td>
                  <td>{fmtConf(e.conf)}</td><td>{fmtCapture(e)}</td><td>{fmtAntiPredict(e)}</td><td>{fmtRestart(e)}</td>
                  <td>{e.error || '—'}</td>
                  <td>{DIALOG_LABEL[e.dialog] || '?'}</td>
                </tr>,
                open === e.t && <tr key={`${e.t}-${i}-d`} className="apDetRow"><td colSpan={14}><AttemptDetails entry={e} /></td></tr>,
              ])}
            </tbody>
          </table>
        </div>
      )}
      <p className="aspHint">«Попытка» — №нажатия «Сказать» · номер записи из 3 (автоповторы при слабой связи/тишине); «итог» — последняя запись нажатия. Времена — миллисекунды от старта этой записи до первого события start / audiostart / result. «Диалог» — догадка: если разрешение было prompt и звук потом пошёл, диалог показывали; без Permissions API (часто iPhone) — «возможно», когда audiostart пришёл заметно позже start. «Захват» — режим эксперимента A/B/C и пик уровня звука (B/C), «Уверен.» — confidence итога, «Эксперименты» — включённые способы против домысливания, число альтернатив, «исправил» (движок поменял слово между interim и итогом) и «литерально» (ошибочная форма встретилась где-либо). «Перезапуск» — стратегия S1…S5 (M — модуль), пауза от закрытия прошлого экземпляра до этого запуска, время первого звука, «ГЛУХАЯ?» (audiostart быстрее 120 мс и звука нет) и deaf_retry (попытка запущена авто-восстановлением). Режим текущей страницы: {MODE_LABEL[caps.mode]}.</p>
      <div className="aspHow">
        <b>Как читать.</b> Нажмите «Сказать» и разрешите микрофон. Закройте приложение полностью, откройте снова, нажмите «Сказать»:
        если разрешение (permissions: <code>granted→granted</code>) помнится и диалога нет — хорошо; если снова «да» в колонке «Диалог» —
        браузер спрашивает при каждом запуске.
      </div>
      <div className="aspRow">
        <button className="aeRefresh" onClick={copy}>Скопировать отчёт</button>
        <button className="aeRefresh" onClick={copyAll}>Скопировать все сравнения</button>
        <button className="aeRefresh" onClick={() => { setLog(clearLog()); setNote('Журнал очищен') }}>Очистить журнал</button>
      </div>
      {note && <p className="aeHint">{note}</p>}
    </section>
  )
}
