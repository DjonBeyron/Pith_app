import { sec } from './lineCheck.js'

// Низ «Проверки сценария» (TimelineScenario.jsx): раскрывающиеся списки — «Риски сцены от длины реплик» (sceneRisks.js: что проверено, итог, откуда число), «Не звучат в игре» (запас каталога с причиной)
// и «Лишние записи озвучки» (в настройках лежит звук реплики, которой в игре больше нет). res — scenarioCheck.checkScenario.
const MARK = { ok: '✅', edge: '🟡', bad: '🔴' }

export default function ScenarioExtras({ res }) {
  const hot = res.risks.filter(r => r.status !== 'ok')
  return (
    <div className="tlCkExtras">
      <details className="tlCkMore" open={hot.length > 0} data-testid="tl-ck-risks">
        <summary>⚠ Риски сцены от длины реплик: проверок {res.risks.length}, {hot.length ? `требуют внимания ${hot.length}` : 'все в порядке'}</summary>
        <p className="tlMuted">Места, где длина звука влияет на сцену: если заменить реплику более длинной или короткой — здесь будет видно, помещается ли она.</p>
        <ul className="tlCkRisks">
          {[...hot, ...res.risks.filter(r => r.status === 'ok')].map(r => (
            <li key={r.key} data-status={r.status}><b>{MARK[r.status]} {r.title}</b> <small className="tlMuted">{r.ids.join(', ')}</small><br />{r.text} <small className="tlMuted">· число: {r.source}</small></li>
          ))}
        </ul>
      </details>
      <details className="tlCkMore" data-testid="tl-ck-unused">
        <summary>Не звучат в игре (запас): {res.unused.length}</summary>
        <p className="tlMuted">Эти реплики есть в каталоге, но в сегодняшней игре не звучат — озвучивать их не обязательно, в счёт «нужно озвучить» они не идут.</p>
        <ul className="tlCkRisks">{res.unused.map(u => <li key={u.id}><b>{u.check.text || u.id}</b> <small className="tlMuted">{u.id}{u.check.dur ? ` · ${sec(u.check.dur)}` : u.check.level === 'todo' ? ' · без актуальной озвучки' : ''}</small><br />{u.why || 'причина не записана'}</li>)}</ul>
      </details>
      {res.orphans.length > 0 && (
        <details className="tlCkMore" data-testid="tl-ck-orphans">
          <summary>Лишние записи озвучки: {res.orphans.length}</summary>
          <p className="tlMuted">В настройках лежит звук реплик, которых в игре больше нет (их удалили или склеили). На игру не влияет; убрать может программист.</p>
          <ul className="tlCkRisks">{res.orphans.map(id => <li key={id}>{id}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
