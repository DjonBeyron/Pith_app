import HelpTip from '../../admin/signals/HelpTip.jsx'
import { levelVar, levelTitle } from '../../../shared/lib/memory/memoryLevels.js'
import { TAB_HELP } from './sceneTabHelp.js'

const VOICE_ICON = { ok: '🔊', part: '🔉', stale: '⚠', none: '🔇' }

function Dot({ level }) {
  return <span className="scTabLvl" style={{ background: levelVar(level) }} title={levelTitle(level)} aria-hidden="true" />
}

// Чипы строки: динамичная/статичная (+«?»), режим показа, один кот, реплики, озвучка, запуск
export default function SceneRowChips({ base }) {
  if (base.state === 'empty') return <div className="scTabChips"><span className="scTabChip scTabChip--warn">Сцена не выбрана</span></div>
  const dyn = base.kind === 'dynamic'
  return (
    <div className="scTabChips">
      <span className={`scTabChip ${dyn ? 'scTabChip--dyn' : 'scTabChip--stat'}`}>
        {dyn ? `Динамичная · слов: ${base.vars.length}` : 'Статичная'}
      </span>
      <HelpTip content={dyn ? TAB_HELP.dynamic : TAB_HELP.static} />
      <span className="scTabChip">{base.mode === 'circle' ? 'Кружок' : 'Пузырь'}</span>
      {base.solo && <span className="scTabChip">Пит (один кот)</span>}
      <span className="scTabChip">{base.lineCount} реплик</span>
      {base.voice && <span className={`scTabChip scTabChip--v-${base.voice.kind}`}>{VOICE_ICON[base.voice.kind]} {base.voice.text}</span>}
      <span className="scTabChip">{base.start === 'auto' ? 'авто-запуск' : 'вручную'}</span>
      {dyn && base.vars.map(v => (
        <span key={v.name} className="scTabChip scTabChip--var" title={`{${v.name}}: берём ${v.pickText}; запасное слово «${v.fallback}»`}>
          {v.levels.map(l => <Dot key={l} level={l} />)}
          {!v.levels.length && <span aria-hidden="true">⏰</span>}
          {`{${v.name}} · ${v.pickText} · запас: ${v.fallback || '—'}`}
        </span>
      ))}
    </div>
  )
}
