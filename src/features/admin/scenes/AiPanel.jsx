import { useState, useMemo } from 'react'
import { sceneLegendText } from '../../scene/v2/sceneLegend.js'
import { parseSceneV2 } from '../../scene/v2/sceneSchemaV2.js'
import { lintScene } from '../../scene/v2/sceneLint.js'
import { copyText } from './fileUtils.js'
import { buildPrompt, stripCodeFence } from './aiPrompt.js'
import ScTip from './ScTip.jsx'

// Вкладка «Для нейросети»: легенда формата (sceneLegendText) + промпт-заготовка с темой,
// кнопки копирования; вставка JSON-ответа нейросети → проверка (валидатор + линтер) →
// «Загрузить в сборщик». Загрузить можно и с предупреждениями, но не с ошибками.
export default function AiPanel({ draft, setStatus }) {
  const [topic, setTopic] = useState('')
  const [withTask, setWithTask] = useState(false) // просить заодно задание «О чём диалог» (translation + task)
  const [answer, setAnswer] = useState('')
  const [report, setReport] = useState(null) // { errors, lint, scene }
  const [note, setNote] = useState('')
  const legend = useMemo(() => sceneLegendText(), [])
  const prompt = buildPrompt(topic, { withTask })

  const copy = async (text, label) => setNote((await copyText(text)) ? `${label} — скопировано` : 'Не удалось скопировать')
  const check = () => {
    const r = parseSceneV2(stripCodeFence(answer))
    setReport({ errors: r.errors, lint: r.scene ? lintScene(r.scene) : [], scene: r.scene })
  }
  const load = () => {
    if (!report?.scene) return
    draft.actions.load(report.scene)
    setStatus({ kind: 'ok', text: 'Сцена нейросети загружена в сборщик (не в библиотеке — нажмите «Сохранить»)' })
  }
  const lintErrors = report?.lint.filter(x => x.level === 'error') ?? []

  return (
    <div className="scbAi">
      <p className="scbSub">Шаг 1 — скопируйте легенду <ScTip help="legend" /> и промпт в чат с нейросетью. Шаг 2 — вставьте её JSON сюда, проверьте и загрузите.</p>
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnSmall" onClick={() => copy(legend, 'Легенда')}>Скопировать легенду</button>
        <button type="button" className="fsBtn fsBtnSmall" onClick={() => copy(`${legend}\n\n${prompt}`, 'Легенда + промпт')}>Легенда + промпт</button>
        <span className="scbSub">{legend.split('\n').length} строк</span>
      </div>
      <label className="scbField">
        <span className="scbFieldLabel">Тема сцены</span>
        <input className="fsNote" value={topic} onChange={e => setTopic(e.target.value)} placeholder="например: понедельник и кофе" />
      </label>
      <label className="scCheck"><input type="checkbox" checked={withTask} onChange={e => setWithTask(e.target.checked)} /> с заданием «О чём диалог» (translation у реплик + task) <ScTip help="task" /></label>
      <textarea className="fsNote scbCode scbCodeSmall" value={prompt} readOnly aria-label="Промпт-заготовка" rows={6} />
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnSmall" onClick={() => copy(prompt, 'Промпт')}>Скопировать промпт</button>
        {note && <span className="scbNote" role="status">{note}</span>}
      </div>
      <label className="scbField">
        <span className="scbFieldLabel">Ответ нейросети (JSON)</span>
        <textarea className="fsNote scbCode" value={answer} onChange={e => { setAnswer(e.target.value); setReport(null) }} spellCheck={false} rows={10} placeholder='{ "version": 2, … }' />
      </label>
      <div className="scbCtlRow">
        <button type="button" className="fsBtn" onClick={check} disabled={!answer.trim()}>Проверить</button>
        <button type="button" className="fsBtn fsBtnPrimary" onClick={load} disabled={!report?.scene || lintErrors.length > 0}>Загрузить в сборщик</button>
      </div>
      {report && (
        <div className="scbReport" role="status">
          {report.errors.length > 0 && <><p className="scBad">Валидатор: {report.errors.length} ошибок</p><ul className="scbErrors">{report.errors.map(e => <li key={e}>{e}</li>)}</ul></>}
          {report.scene && (
            <>
              <p className={lintErrors.length ? 'scBad' : 'scOk'}>
                {lintErrors.length ? `Линтер: ${lintErrors.length} ошибок — исправьте перед загрузкой` : `Сцена годная: ${report.lint.length} предупреждений`}
              </p>
              {report.lint.length > 0 && <ul className="scbErrors scbWarns">{report.lint.map((x, i) => <li key={i} className={`scbLint-${x.level}`}>{x.text}</li>)}</ul>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
