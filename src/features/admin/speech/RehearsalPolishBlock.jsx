import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import RotatePhoneModule from '../../player/modules/rotate-phone/RotatePhoneModule.jsx'
import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { FIXTURES, FIXTURE_IDS } from '../../rehearsal/rehearsalFixtures.js'
import { loadRehearsalForm, saveRehearsalForm, subscribeRehearsalForm, parsePlanJson, fixtureJson } from '../../rehearsal/rehearsalTestForm.js'
import { POLISH_ACTS, actAvailable, planForAct } from '../../rehearsal/polish/polishActs.js'
import { listComments, clearComments, commentsFile } from '../../rehearsal/polish/rehearsalComments.js'

// Админ → «Голос» → «Шлифовка репетиции» (самый верх вкладки): по карточке на каждый этап репетиции — Заставка, Разминка, Читка, Сборка с конца, Без текста, Различи, Дубль и зеркало, Итог.
// «Запустить» — игра с ЭТИМ этапом (план: фикстура и JSON из «Тест игры → Репетиция» — форма общая, rehearsalTestForm.js; в план кладётся only, рецепт оставляет акты этапа, rehearsalOnly.js). В игре справа под ⚙ есть
// кнопка 💬: игра встаёт на паузу без HUD, пишешь комментарий (с быстрыми переключателями режимов), «Сохранить и продолжить». Комментарии лежат в браузере по этапам; «Экспорт комментариев» отдаёт JSON этапа тем же путём,
// что «Скачать отладку» (iPhone — «Поделиться»), «Очистить» стирает (второй тап подтверждает). «Готовый шаблон (все этапы)» пока запускает полную репетицию — соберём в конце.
// Один модуль игры на блок: этап выбирается нодой (only), тап по «Запустить» — жест (микрофон, звук, полный экран), start() модуля вызывается в нём же через startRef после синхронного обновления ноды.
export default function RehearsalPolishBlock({ save = saveDebugFile }) {
  const [rform, setRform] = useState(loadRehearsalForm)
  useEffect(() => subscribeRehearsalForm(setRform), []) // форму правят и в «Тест игры» ниже — здесь та же
  const [only, setOnly] = useState(null)                // с каким этапом собрана нода игры (null — вся репетиция)
  const [, setRev] = useState(0)                        // растёт после игры, экспорта и очистки: счётчики комментариев читаются заново
  const [status, setStatus] = useState({ phase: 'wait', busy: false, ready: false, problem: '' })
  const [notes, setNotes] = useState({})                // этап → что получилось при экспорте
  const [armed, setArmed] = useState('')                // этап, у которого «Очистить» нажато один раз
  const startRef = useRef(null)
  const refresh = useCallback(() => setRev(n => n + 1), [])

  const { plan, error } = useMemo(() => parsePlanJson(rform.json), [rform.json])
  const node = useMemo(() => ({ id: 'rh-polish', type: 'rotate_phone', isHistory: false, typeData: { rotate_phone: { plan: planForAct(plan, only) } } }), [plan, only])
  const playing = status.phase === 'game'
  const idle = !playing && !status.busy && status.ready

  const launch = id => { flushSync(() => setOnly(id)); startRef.current?.() } // нода обновляется синхронно, чтобы start() модуля взял план этапа; всё в одном тапе — жест сохраняется
  const pickFixture = fixture => { const next = { ...rform, fixture, json: fixtureJson(fixture) }; setRform(next); saveRehearsalForm(next) }
  async function exportAct(id) {
    const how = await save(commentsFile(id, listComments(id), { version: APP_VERSION })) // файл собирается до await: iOS даёт «Поделиться» только сразу после касания
    setNotes(n => ({ ...n, [id]: SAVE_HOW[how] ?? SAVE_HOW.failed }))
  }
  function clearAct(id) {
    if (armed !== id) { setArmed(id); return }
    clearComments(id); setArmed(''); setNotes(n => ({ ...n, [id]: 'Комментарии стёрты' })); refresh()
  }

  return (
    <section className="aspBlock" data-testid="rh-polish">
      <h3 className="aspH">Шлифовка репетиции</h3>
      <p className="aspHint">Запусти любой этап отдельно. В игре справа под ⚙ — кнопка 💬: игра встанет на паузу, напиши комментарий, при необходимости переключи режимы звука, «Сохранить и продолжить». Потом «Экспорт комментариев» этапа — файл пришли в чат.</p>
      <label className="aspLabel">Фикстура плана (JSON плана правится в «Тест игры» ниже, режим «Репетиция»)
        <select className="aspInput" value={rform.fixture} disabled={playing} onChange={e => pickFixture(e.target.value)} data-testid="rh-polish-fixture">
          {FIXTURE_IDS.map(id => <option key={id} value={id}>{FIXTURES[id].title}</option>)}
        </select>
      </label>
      {error ? <p className="aspErr" role="alert" data-testid="rh-polish-error">{error}</p> : <p className="aspHint" data-testid="rh-polish-plan">Фраза: «{plan.chunks.join(' | ')}» — {plan.translation || 'без перевода'}</p>}
      <ul className="rhpList" data-testid="rh-polish-list">
        {POLISH_ACTS.map(a => {
          const list = listComments(a.id)
          const ok = actAvailable(plan, a.id)
          return (
            <li key={a.id} className="rhpCard" data-testid={`rh-polish-${a.id}`}>
              <div className="rhpHead"><strong>{a.title}</strong><span className="rhpCount" data-testid={`rh-polish-count-${a.id}`}>комментариев: {list.length}</span></div>
              <div className="aspHint">{ok ? a.hint : 'В этом плане такого этапа нет — выбери другую фикстуру.'}</div>
              <div className="aspRow">
                <button type="button" className="aspSay" onClick={() => launch(a.id)} disabled={!ok || !idle} data-testid={`rh-polish-run-${a.id}`}>Запустить</button>
                <button type="button" className="aspChip" onClick={() => exportAct(a.id)} disabled={!list.length} data-testid={`rh-polish-export-${a.id}`}>Экспорт комментариев</button>
                <button type="button" className="aspChip" onClick={() => clearAct(a.id)} disabled={!list.length && armed !== a.id} data-testid={`rh-polish-clear-${a.id}`}>{armed === a.id ? 'Стереть точно?' : 'Очистить'}</button>
              </div>
              {notes[a.id] && <div className="aspHint" role="status" data-testid={`rh-polish-note-${a.id}`}>{notes[a.id]}</div>}
            </li>
          )
        })}
      </ul>
      <button type="button" className="aspSay" onClick={() => launch(null)} disabled={!plan || !idle} data-testid="rh-polish-template">Готовый шаблон (все этапы)</button>
      <p className="aspHint">Пока просто запускает полную репетицию, как «Запустить репетицию» ниже; настоящий шаблон соберём в конце, когда отшлифуем все этапы. Для проверки без голоса включи в ⚙ «Тап вместо речи». Результаты не сохраняются, XP не начисляется.</p>
      {plan && <RotatePhoneModule node={node} bare forceDebug startRef={startRef} onStatus={setStatus} onDone={refresh} />}
    </section>
  )
}
