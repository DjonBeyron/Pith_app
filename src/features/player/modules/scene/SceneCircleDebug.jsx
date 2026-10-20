import { useMemo, useState, useSyncExternalStore } from 'react'
import { useAdmin } from '../../../../app/AdminContext.jsx'
import { sceneTraceLines, sceneTraceSeq, subscribeSceneTrace, resetSceneTrace, audioState } from '../../../scene/v2/sceneTrace.js'
import { getSceneAudioElement, sceneAudioUnlocked } from '../../../scene/v2/sceneAudioUnlock.js'

// Админское окно отладки под кружком-сценой (только isAdmin, не в истории): живая строка состояния (статус/реплика/чем звучит/звук/
// раскрыт/кадр/кольцо/общий <audio>) и последние строки трассы сцены (sceneTrace.js) — свои (по метке «#n») и общие (файл, синтез,
// режиссёр). Свёрнуто в <details>, чтобы не менять раскладку ленты; перерисовывается только на новую строку трассы (подписка).
// «Копировать» — вся трасса в буфер (на телефоне проще, чем «⬇ лог»), «Очистить» — буфер с нуля перед повтором.
const LAST = 40
const box = { flex: '1 1 100%', margin: '4px 0 0 8px', fontSize: 10, lineHeight: 1.35, color: '#9aa', fontFamily: 'ui-monospace, Menlo, monospace', maxWidth: 'calc(100% - 16px)' }
const pre = { margin: '4px 0 0', padding: '6px 8px', background: '#111', borderRadius: 8, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#bbb' }
const btn = { padding: '3px 8px', borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#aaa', fontSize: 10, cursor: 'pointer', marginRight: 6 }

const mine = (l, tag) => l.includes(` ${tag} `) || !/\] #\d+ /.test(l)

function ringPct(el, C) {
  if (!el || !C || typeof getComputedStyle !== 'function') return '—'
  const v = parseFloat(getComputedStyle(el).strokeDashoffset)
  return Number.isFinite(v) ? `${Math.round((1 - v / C) * 1000) / 10}%` : '—'
}

// Кольцо читается из DOM (дуга в той же строке ленты, что и окно) в момент новой строки трассы — в подписке, не в рендере и без ref
// (правила react-hooks/refs и компилятора); снимок отдаётся как внешний стор
function ringEl(tag) {
  return document.querySelector(`[data-scene-debug="${tag}"]`)?.closest('.playerMsgRow')?.querySelector('.playerSceneRingArc') ?? null
}
function makeRingStore(tag, C) {
  let v = '—'
  return { subscribe: cb => subscribeSceneTrace(() => { v = ringPct(ringEl(tag), C); cb() }), get: () => v }
}
function useRingPct(tag, C) {
  const store = useMemo(() => makeRingStore(tag, C), [tag, C])
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

function Panel({ tag, status, index, total, mode, sound, soundChip, ended, frozen, expanded, grown, circumference }) {
  useSyncExternalStore(subscribeSceneTrace, sceneTraceSeq, sceneTraceSeq)
  const ring = useRingPct(tag, circumference)
  const [copied, setCopied] = useState('')
  const lines = sceneTraceLines().filter(l => mine(l, tag)).slice(-LAST)
  const summary = `${tag} ${status} ${Math.min(index + 1, total || index + 1)}/${total || '?'} ${mode}`
    + ` · звук ${sound ? 'вкл' : 'ВЫКЛ'}${soundChip ? ' (чип)' : ''} · ${expanded ? `раскрыт${grown ? '+дорос' : ''}` : 'свёрнут'}`
    + ` · ${frozen ? 'статичный кадр' : 'живой'}${ended ? ' · ended-защёлка' : ''} · кольцо ${ring}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(sceneTraceLines().join('\n')); setCopied('✓') } catch { setCopied('✗') }
    setTimeout(() => setCopied(''), 1500)
  }
  return (
    <details style={box} onClick={e => e.stopPropagation()} data-scene-debug={tag}>
      <summary style={{ cursor: 'pointer', color: status === 'playing' ? '#b6fe3b' : '#9aa' }}>🐞 {summary}</summary>
      <div style={{ marginTop: 4, color: '#777' }}>
        audio: {audioState(getSceneAudioElement())} · unlocked={String(sceneAudioUnlocked())}
      </div>
      <div style={{ marginTop: 4 }}>
        <button type="button" style={btn} onClick={copy}>Копировать трассу {copied}</button>
        <button type="button" style={btn} onClick={() => resetSceneTrace()}>Очистить</button>
      </div>
      <pre style={pre}>{lines.join('\n') || '(пока пусто)'}</pre>
    </details>
  )
}

export default function SceneCircleDebug(props) {
  const { isAdmin } = useAdmin()
  if (!isAdmin || !props.tag) return null
  return <Panel {...props} />
}
