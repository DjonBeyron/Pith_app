import { useState } from 'react'
import { mb } from './voiceSetExport.js'

// Итог «Записи набора»: сколько записано, пропущено и помечено («без голоса», «не уместилось»); «Собрать архив» → кнопки частей («Сохранить часть 1 из 2 · 20 МБ» — «Поделиться» на iPhone
// открывается прямо из нажатия, поэтому архив собирается заранее); «Дозаписать», «Удалить набор» (вторым нажатием). Набор после выгрузки остаётся на устройстве. Состояние — useVoiceSet.
export default function VoiceSetDone({ v }) {
  const [sure, setSure] = useState(false)
  const { info, arch } = v, clips = v.saved?.clips ?? []
  const flags = [['без голоса', clips.filter(c => c.noVoice).length], ['слово не уместилось в окно', clips.filter(c => c.late).length], ['перегруз', clips.filter(c => c.clipped > 20).length]].filter(([, n]) => n)
  return (
    <div className="vsBody" data-testid="vs-done">
      <div className="vsCard">
        <b data-testid="vs-done-count">Записано {info.done} из {info.total}</b>
        <p>{mb(info.bytes)} на устройстве{info.skipped ? ` · пропущено ${info.skipped}` : ''}{flags.length ? ` · помечено: ${flags.map(([t, n]) => `${t} — ${n}`).join(', ')}` : ''}</p>
        {info.next != null && !v.stale && <button type="button" className="vsBtn" disabled={v.mic === 'asking'} onClick={() => v.begin(false)} data-testid="vs-more">▶ Дозаписать (осталось {info.total - info.done - info.skipped})</button>}
      </div>
      <button type="button" className="vsBig" disabled={arch.busy || !info.done} onClick={v.build} data-testid="vs-build">{arch.busy ? 'Собираю архив…' : '📦 Собрать архив'}</button>
      {arch.parts?.map(p => (
        <button key={p.part} type="button" className="vsBtn vsBtn--go" onClick={() => v.give(p)} data-given={arch.given?.[p.part] ?? undefined} data-testid={`vs-part-${p.part}`}>
          📤 Сохранить {p.parts > 1 ? `часть ${p.part} из ${p.parts}` : 'архив'} · {p.count} клипов · {mb(p.size)}{arch.given?.[p.part] && arch.given[p.part] !== 'cancelled' && arch.given[p.part] !== 'failed' ? ' ✓' : ''}
        </button>
      ))}
      {arch.note && <p className="vsNote" data-testid="vs-note">{arch.note}</p>}
      <p className="vsDim">На iPhone: «Сохранить в Файлы», потом отправь файл(ы) .zip. Набор остаётся на этом устройстве, пока не нажмёшь «Удалить набор».</p>
      <button type="button" className="vsBtn" onClick={v.toSetup} data-testid="vs-back">← Назад</button>
      <button type="button" className="vsBtn vsBtn--danger" onClick={() => (sure ? (setSure(false), v.remove()) : setSure(true))} data-testid="vs-remove">{sure ? 'Точно удалить набор с устройства? Нажми ещё раз' : '🗑 Удалить набор'}</button>
    </div>
  )
}
