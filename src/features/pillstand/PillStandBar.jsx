import { X } from 'lucide-react'
import { MODES, LANGS, LENS, mixList } from './pillStandPick.js'
import { AUTO_MS, PRESETS, presetOn } from './pillStandPrefs.js'
import { STAND_PHRASES } from './pillStandData.js'

// Панель стенда пилюль сверху (safe-area): выход, язык Vosk «EN | RU», запись / стоп, просмотр записи; режим пилюли и «🎙 Запись набора» (экран voiceset/); длина, «Следующая», «Сброс»; сид, авто-следующая и её пауза, состояние модели.
const MODE_SHORT = { word: 'Слово', words: 'По словам', fast: 'Быстро' }
const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

function Seg({ value, list, title, onPick, testid, disabled = false }) {
  return (
    <span className="psSeg" role="group" data-testid={testid}>
      {list.map(v => <button key={v} type="button" className="psSegBtn" data-on={v === value ? '1' : undefined} aria-pressed={v === value} disabled={disabled} onClick={() => onPick(v)} data-testid={`${testid}-${v}`}>{title[v] ?? v}</button>)}
    </span>
  )
}

export default function PillStandBar({ s, r, viewing, onClose, onView, onVoiceSet, armed = false, onArm = () => {} }) {
  const { prefs, setPrefs, model } = s
  const rec = r.state
  return (
    <div className="psBar" data-testid="ps-bar">
      <div className="psRow">
        <button type="button" className="psBtn psExit" onClick={onClose} data-testid="ps-exit"><X size={16} /> выход</button>
        <Seg value={prefs.lang} list={LANGS} title={{ en: 'EN', ru: 'RU' }} onPick={v => setPrefs({ lang: v })} testid="ps-lang" disabled={viewing || model.switching} />
        {rec.on
          ? <button type="button" className="psBtn psRec" data-on="1" data-warn={rec.warn ? '1' : undefined} onClick={() => r.stop()} data-testid="ps-rec">■ {mmss(rec.ms)} · {rec.fps} к/с</button>
          : s.mic === 'on'
            ? <button type="button" className="psBtn psRec" onClick={r.start} disabled={viewing} data-testid="ps-rec">● Запись</button>
            : <button type="button" className="psBtn psRec" data-armed={armed ? '1' : undefined} data-on={armed ? '1' : undefined} aria-pressed={armed} onClick={onArm} disabled={viewing} data-testid="ps-rec">{armed ? '● ждёт «Старт» (тап — отмена)' : '● Запись до «Старт»'}</button>}
        <button type="button" className="psBtn" onClick={onView} disabled={!r.rec || rec.on || viewing} data-testid="ps-view">▶ Просмотр</button>
      </div>
      <div className="psRow">
        <Seg value={prefs.mode} list={MODES} title={MODE_SHORT} onPick={v => setPrefs({ mode: v })} testid="ps-mode" disabled={viewing} />
        {onVoiceSet && <button type="button" className="psBtn" onClick={onVoiceSet} disabled={viewing || rec.on} data-testid="ps-voiceset">🎙 Запись набора</button>}
      </div>
      <div className="psRow">
        <Seg value={prefs.len} list={LENS} title={{ short: 'короткие', long: 'длинные', any: 'любые' }} onPick={v => setPrefs({ len: v })} testid="ps-len" disabled={viewing} />
        <button type="button" className="psBtn" onClick={s.next} disabled={viewing} data-testid="ps-next">Следующая</button>
        <button type="button" className="psBtn" onClick={s.reset} disabled={viewing} data-testid="ps-reset">Сброс</button>
      </div>
      <div className="psRow" data-testid="ps-presets">
        {PRESETS.map(p => <button key={p.id} type="button" className="psBtn psBtn--tiny psPreset" data-kind={p.kind} data-on={presetOn(p, prefs) ? '1' : undefined} aria-pressed={presetOn(p, prefs)} onClick={() => setPrefs(p.set)} disabled={viewing || rec.on} data-testid={`ps-preset-${p.id}`}>{p.label}</button>)}
        {prefs.mode !== 'word' && <select className="psSel" value={prefs.pin} onChange={e => setPrefs({ pin: e.target.value })} aria-label="Закрепить фразу" disabled={viewing} data-testid="ps-pin"><option value="">фраза: по сиду</option>{STAND_PHRASES.map(p => <option key={p.en} value={p.en}>{p.en}</option>)}</select>}
      </div>
      <div className="psRow psRow--small">
        <label className="psSeed">сид <input value={s.seed} onChange={e => s.setSeed(e.target.value)} spellCheck={false} autoCapitalize="off" data-testid="ps-seed" /></label>
        <label className="psAuto"><input type="checkbox" checked={prefs.mix} onChange={e => setPrefs({ mix: e.target.checked, pin: '' })} data-testid="ps-mix" /> подборка{prefs.mix ? ` ${(s.target.n % Math.max(1, mixList(prefs.mode, prefs.lang).length)) + 1}/${mixList(prefs.mode, prefs.lang).length}` : ''}</label>
        <label className="psAuto"><input type="checkbox" checked={prefs.auto} onChange={e => setPrefs({ auto: e.target.checked })} data-testid="ps-auto" /> авто</label>
        <select className="psSel" value={prefs.autoMs} onChange={e => setPrefs({ autoMs: Number(e.target.value) })} aria-label="Пауза до следующей" data-testid="ps-auto-ms">{AUTO_MS.map(v => <option key={v} value={v}>{String(v / 1000).replace('.', ',')} с</option>)}</select>
        <span className="psModel" data-ready={model.ready ? '1' : undefined} data-testid="ps-model">{model.switching ? 'переключаю слух…' : model.ready ? `${prefs.lang.toUpperCase()} готов` : `${prefs.lang.toUpperCase()}: ${model.failed || model.stage}`}</span>
        {!model.ready && !model.switching && !model.loading && <button type="button" className="psBtn psBtn--tiny" onClick={model.warm} data-testid="ps-warm">загрузить</button>}
      </div>
    </div>
  )
}
