import { useState } from 'react'
import { sceneVarNames, VAR_LIMITS } from '../../../scene/v2/sceneVars.js'
import { PICK_LABEL, PICK_LEVELS } from '../varsOps.js'
import ScTip from '../ScTip.jsx'
import LevelDot from '../LevelDot.jsx'
import SandboxVarsMemory from './SandboxVarsMemory.jsx'
import SandboxVarsResult from './SandboxVarsResult.jsx'
import SandboxVarsHow from './SandboxVarsHow.jsx'
import { MODES, buildAsUser, modeOf } from './sandboxVarsModel.js'
import { loadSandboxVars, saveSandboxVars } from './sandboxVarsStore.js'
import '../../../../styles/admin-scenes-vars-sandbox.css'

// Панель «Слова пользователя (проверка)» песочницы «Проверить в ленте» для сцены с vars. Админ задаёт ИМИТАЦИЮ памяти
// пользователя и режим каждого слова (запасное / из памяти / вручную), жмёт «Прогнать как пользователь» — подстановка идёт
// по правилам pick (sceneVarsPick.js), результат (сцена со словами) уходит родителю через onApply и показывается в таблице.
// Диалог модальный: черновик за время открытия не меняется, поэтому прогон сам не устаревает. Сеть не нужна, в базу ничего не пишется. Имитация и режимы помнятся в sessionStorage (sandboxVarsStore.js).
export default function SandboxVarsPanel({ scene, onApply }) {
  const [cfg, setCfg] = useState(loadSandboxVars)
  const [rows, setRows] = useState(null)
  const names = sceneVarNames(scene)

  const update = next => { setCfg(next); saveSandboxVars(next); setRows(null); onApply?.(null) }
  const setMode = (name, patch) => update({ ...cfg, modes: { ...cfg.modes, [name]: { ...modeOf(cfg, name), ...patch } } })
  const run = () => { const r = buildAsUser(scene, cfg); setRows(r.rows); onApply?.(r.scene) }
  const reset = () => { setRows(null); onApply?.(null) }

  if (!names.length) return null
  return (
    <section className="scbSb" aria-label="Слова пользователя (проверка)">
      <p className="scCardTitle">Слова пользователя (проверка) <ScTip help="vars_sandbox" /></p>
      <p className="scbSub">Имитация памяти пользователя: только для теста, в базу не пишется. Настоящая память подключится на следующем шаге.</p>
      <ul className="scbSbVars">
        {names.map(name => {
          const m = modeOf(cfg, name)
          return (
            <li key={name} className="scbSbVar">
              <code>{`{${name}}`}</code>
              <span className="scbSub">{PICK_LABEL[scene.vars[name].pick]} {PICK_LEVELS[scene.vars[name].pick]?.map(l => <LevelDot key={l} level={l} />)}</span>
              <select className="fsNote" value={m.mode} onChange={e => setMode(name, { mode: e.target.value })} aria-label={`Режим слова ${name}`}>
                {Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {m.mode === 'manual' && (
                <span className="scbSbManual">
                  <input className="fsNote" value={m.text} maxLength={VAR_LIMITS.maxWord} placeholder="слово" onChange={e => setMode(name, { text: e.target.value })} aria-label={`Слово вручную для ${name}`} />
                  <input className="fsNote" value={m.translation} maxLength={VAR_LIMITS.maxWord} placeholder="перевод" onChange={e => setMode(name, { translation: e.target.value })} aria-label={`Перевод вручную для ${name}`} />
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {names.some(n => modeOf(cfg, n).mode === 'memory') && <SandboxVarsMemory memory={cfg.memory} onChange={memory => update({ ...cfg, memory })} />}
      <div className="scbCtlRow">
        <button type="button" className="fsBtn fsBtnSmall" onClick={run}>Прогнать как пользователь</button>
        {rows && <button type="button" className="fsBtn fsBtnSmall" onClick={reset}>Сбросить (запасные слова)</button>}
      </div>
      <p className="scbSub" role="status">{rows ? 'В ленту уйдёт сцена с этими словами — как её увидит пользователь.' : 'Пока не прогнано: в ленту уйдёт сцена с запасными словами.'}</p>
      <SandboxVarsResult rows={rows} />
      <SandboxVarsHow />
    </section>
  )
}
