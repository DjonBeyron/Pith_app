import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { flushSync } from 'react-dom'
import RotatePhoneModule from '../../player/modules/rotate-phone/RotatePhoneModule.jsx'
import { saveDebugFile, SAVE_HOW } from '../../player/modules/rotate-phone/wordLaneDebugExport.js'
import { APP_VERSION } from '../../../shared/lib/version.js'
import { FIXTURES, FIXTURE_IDS } from '../../rehearsal/rehearsalFixtures.js'
import { loadRehearsalForm, saveRehearsalForm, subscribeRehearsalForm, parsePlanJson, fixtureJson } from '../../rehearsal/rehearsalTestForm.js'
import { POLISH_ACTS, POLISH_CARDS, FULL_ID, actAvailable, planForAct } from '../../rehearsal/polish/polishActs.js'
import { listComments, clearComments, commentsFile } from '../../rehearsal/polish/rehearsalComments.js'
import PolishAudioMode from './PolishAudioMode.jsx'
import PolishVoice from './PolishVoice.jsx'
import PolishActCard from './PolishActCard.jsx'
import PolishSettings from './PolishSettings.jsx'
import PolishSeed from './PolishSeed.jsx'
import usePolishAudioRun from './usePolishAudioRun.js'
import usePolishVoice from './usePolishVoice.js'
import usePolishOpen, { SETTINGS_ID } from './usePolishOpen.js'
import { settingsSummary } from '../../rehearsal/polish/settingsSummary.js'
import '../../../styles/admin-rehearsal-polish.css'

// Админ → «Голос» → «Шлифовка репетиции» (самый верх вкладки): карточки с номерами — «1. Полная игра», «2. Заставка», «3. Разминка», … «9. Итог». По умолчанию всё свёрнуто: у карточки только название и «Запустить»;
// тап по названию разворачивает (подсказка, реплики с «Послушать», комментарии, экспорт). Режим звука, озвучка, фикстура, семя и «Фраза» живут в сворачиваемом разделе «Настройки» (PolishSettings.jsx). Что развёрнуто — usePolishOpen.js.
// «Запустить» — игра с ЭТИМ этапом (план: фикстура и JSON из «Тест игры → Репетиция» — форма общая, rehearsalTestForm.js; в план кладётся only, рецепт оставляет акты этапа, rehearsalOnly.js). В игре справа под ⚙ есть
// кнопка 💬: игра встаёт на паузу без HUD, пишешь комментарий (с быстрыми переключателями режимов), «Сохранить и продолжить». Комментарии лежат в браузере по этапам; «Экспорт комментариев» отдаёт JSON этапа тем же путём,
// что «Скачать отладку» (iPhone — «Поделиться»), «Очистить» стирает (второй тап подтверждает). «Полная игра» — вся репетиция (launch(null)).
// «Режим звука» над карточками (пресеты A…H, polish/audioPresets.js): применяется перед запуском этапа в том же тапе и пишется в журнал; «Прогон по режимам» проходит выбранный этап по всем режимам, журналы запусков копятся
// в браузере («Экспорт прогонов»). «Реплики Пита» и «куски фразы» озвучиваются прямо здесь (ElevenLabs), у каждой карточки — свои реплики с кнопкой «Послушать» (PolishVoice.jsx, PolishCardLines.jsx).
// Один модуль игры на блок: этап выбирается нодой (only), тап по «Запустить» — жест (микрофон, звук, полный экран), start() модуля вызывается в нём же через startRef после синхронного обновления ноды.
export default function RehearsalPolishBlock({ save = saveDebugFile }) {
  const [rform, setRform] = useState(loadRehearsalForm)
  useEffect(() => subscribeRehearsalForm(setRform), []) // форму правят и в «Тест игры» ниже — здесь та же
  const [only, setOnly] = useState(null)                // с каким этапом собрана нода игры (null — вся репетиция)
  const [, setRev] = useState(0)                        // растёт после игры, экспорта и очистки: счётчики комментариев читаются заново
  const [status, setStatus] = useState({ phase: 'wait', busy: false, ready: false, problem: '' })
  const [notes, setNotes] = useState({})                // этап → что получилось при экспорте
  const [armed, setArmed] = useState('')                // этап, у которого «Очистить» нажато один раз
  const [runNote, setRunNote] = useState('')             // что получилось при экспорте прогонов
  const startRef = useRef(null)
  const refresh = useCallback(() => setRev(n => n + 1), [])

  const { plan, error } = useMemo(() => parsePlanJson(rform.json), [rform.json])
  const node = useMemo(() => ({ id: 'rh-polish', type: 'rotate_phone', isHistory: false, typeData: { rotate_phone: { plan: planForAct(plan, only) } } }), [plan, only])
  const playing = status.phase === 'game'
  const idle = !playing && !status.busy && status.ready
  const audio = usePolishAudioRun({ status })
  const voice = usePolishVoice({ plan })
  const { isOpen, toggle } = usePolishOpen()
  const settingsOpen = isOpen(SETTINGS_ID) || !!audio.run // идёт прогон по режимам — раздел открыт: кнопки прогона не должны прятаться
  const summary = settingsSummary({ preset: audio.selected, pit: voice.lines ? voice.pit : null, fixture: FIXTURES[rform.fixture]?.title, busy: voice.busy, error: voice.error, run: audio.run })

  // Режим звука применяется ДО start() модуля (игра читает три настройки при старте); нода обновляется синхронно, чтобы start() взял план этапа; всё в одном тапе — жест сохраняется
  const launch = id => { audio.beforeLaunch(id); flushSync(() => setOnly(id)); startRef.current?.() }
  const runModes = act => { audio.startRun(act); launch(act) }
  const pickFixture = fixture => { const next = { ...rform, fixture, json: fixtureJson(fixture) }; setRform(next); saveRehearsalForm(next) }
  const pickJson = json => { const next = { ...rform, json }; setRform(next); saveRehearsalForm(next) }
  async function exportAct(id) {
    const how = await save(commentsFile(id, listComments(id), { version: APP_VERSION })) // файл собирается до await: iOS даёт «Поделиться» только сразу после касания
    setNotes(n => ({ ...n, [id]: SAVE_HOW[how] ?? SAVE_HOW.failed }))
  }
  async function exportRuns() {
    const how = await save(audio.runsFile())
    setRunNote(SAVE_HOW[how] ?? SAVE_HOW.failed)
  }
  function clearAct(id) {
    if (armed !== id) { setArmed(id); return }
    clearComments(id); setArmed(''); setNotes(n => ({ ...n, [id]: 'Комментарии стёрты' })); refresh()
  }

  return (
    <section className="aspBlock rhpBlock" data-testid="rh-polish">
      <h3 className="aspH">Шлифовка репетиции</h3>
      <p className="rhpHint">Запусти игру целиком или любой этап отдельно. В игре кнопка 💬 — комментарий.</p>
      <PolishSettings open={settingsOpen} onToggle={() => toggle(SETTINGS_ID)} summary={summary}>
        <PolishAudioMode a={audio} acts={POLISH_ACTS.map(a => ({ id: a.id, title: a.title, ok: actAvailable(plan, a.id) }))} disabled={!idle} locked={playing} onRun={runModes} onContinue={() => launch(audio.run?.act ?? null)} onExport={exportRuns} note={runNote} />
        <PolishVoice v={voice} disabled={playing} plan={!!plan} />
        <label className="aspLabel">Фикстура плана (JSON плана правится в «Тест игры» ниже, режим «Репетиция»)
          <select className="aspInput" value={rform.fixture} disabled={playing} onChange={e => pickFixture(e.target.value)} data-testid="rh-polish-fixture">
            {FIXTURE_IDS.map(id => <option key={id} value={id}>{FIXTURES[id].title}</option>)}
          </select>
        </label>
        <PolishSeed json={rform.json} plan={plan} disabled={playing} onJson={pickJson} />
        {!error && <p className="rhpHint" data-testid="rh-polish-plan">Фраза: «{plan.chunks.join(' | ')}» — {plan.translation || 'без перевода'}</p>}
      </PolishSettings>
      {error && <p className="aspErr" role="alert" data-testid="rh-polish-error">{error}</p>}
      <ul className="rhpList" data-testid="rh-polish-list">
        {POLISH_CARDS.map((a, i) => (
          <PolishActCard key={a.id} act={a} num={i + 1} open={isOpen(a.id)} ok={actAvailable(plan, a.id)} idle={idle} lines={voice.lines}
            onToggle={() => toggle(a.id)} onRun={() => launch(a.id === FULL_ID ? null : a.id)}
            comments={a.id === FULL_ID ? 0 : listComments(a.id).length} armed={armed === a.id} note={notes[a.id]} onExport={() => exportAct(a.id)} onClear={() => clearAct(a.id)} />
        ))}
      </ul>
      {plan && <RotatePhoneModule key={voice.rev} node={node} bare forceDebug startRef={startRef} onStatus={setStatus} onDone={refresh} />}
    </section>
  )
}
