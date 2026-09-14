import { useState, useCallback } from 'react'
import { FLIGHT_S, freeLane, layerShots, isTranslation } from '../../../shared/lib/speechLaneTiming.js'

function uid() { return crypto.randomUUID() }
const ROLES = new Set(['coach', 'user', 'translation'])

// Слои таймлайна тренажёра (speechLaneTiming.js): слово + роль (диктор /
// ученик / перевод) + дорожка + вылеты (clips[0] и repeats). Аналог
// useTableTimelineEdit без ячеек: слои заводит автор сам, дефолтных нет.
// Перевод — отдельная независимая дорожка: клип = сколько он висит поверх
// круга; дорожка экрана у него не используется.
function restoreLayers(saved) {
  return (saved ?? []).map(l => ({
    id: l.id ?? uid(),
    text: l.text ?? '',
    translation: l.translation ?? '',
    role: ROLES.has(l.role) ? l.role : 'coach',
    lane: Math.min(2, Math.max(0, l.lane ?? 0)),
    visible: l.visible !== false,
    clips: l.clips?.length ? [l.clips[0]] : [],
    repeats: l.repeats ?? [],
  }))
}

export function useSpeechLaneEdit(initialTimeline) {
  const [layers, setLayers] = useState(() => restoreLayers(initialTimeline?.layers))

  const patch = useCallback((id, fn) => {
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...fn(l) } : l)))
  }, [])

  // Новая дорожка: первый вылет — у плейхеда, дорожка экрана — первая свободная
  const addLayer = useCallback(({ text, role = 'coach' }, at, timelineLen) => {
    const t = (text ?? '').trim()
    if (!t) return null
    const start = Math.max(0, Math.min(at ?? 0, timelineLen - FLIGHT_S))
    const shot = { start, end: Math.min(timelineLen, start + FLIGHT_S) }
    const id = uid()
    setLayers(prev => [...prev, {
      id, text: t, translation: '', role: ROLES.has(role) ? role : 'coach', visible: true,
      lane: role === 'translation' ? 0 : freeLane(prev, shot), clips: [shot], repeats: [],
    }])
    return id
  }, [])

  // Копия дорожки сразу под оригиналом: те же вылеты, сдвинутые вслед за
  // последним вылетом оригинала (иначе копия легла бы ровно на него и была бы
  // невидима), дорожка экрана — первая свободная
  const duplicateLayer = useCallback((id, timelineLen) => setLayers(prev => {
    const i = prev.findIndex(l => l.id === id)
    if (i === -1) return prev
    const src = prev[i]
    const shots = layerShots(src)
    const first = shots[0]?.start ?? 0
    const last = shots.reduce((m, s) => Math.max(m, s.end), 0)
    const shift = shots.length ? Math.min(last - first + 0.2, Math.max(0, timelineLen - last)) : 0
    const moved = shots.map(s => ({ start: Math.min(timelineLen, s.start + shift), end: Math.min(timelineLen, s.end + shift) }))
      .filter(s => s.end - s.start > 0.2)
    const copy = { ...src, id: uid(), clips: moved.slice(0, 1), repeats: moved.slice(1) }
    if (!isTranslation(copy) && moved.length) copy.lane = freeLane(prev, moved[0])
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]
  }), [])

  const updateLayer = useCallback((id, fields) => patch(id, () => fields), [patch])

  // Диктор ↔ ученик; у перевода роль не переключается
  const toggleRole = useCallback(id => patch(id, l => (isTranslation(l) ? {} : { role: l.role === 'user' ? 'coach' : 'user' })), [patch])

  const cycleLane = useCallback(id => patch(id, l => ({ lane: ((l.lane ?? 0) + 1) % 3 })), [patch])

  const toggleVisible = useCallback(id => patch(id, l => ({ visible: !l.visible })), [patch])

  const updateClip = useCallback((id, clip) => patch(id, () => ({ clips: [clip] })), [patch])

  const updateRepeat = useCallback((id, index, clip) => patch(id, l => ({
    repeats: l.repeats.map((r, i) => (i === index ? clip : r)),
  })), [patch])

  // Повтор: тот же полёт следом за последним вылетом (или у конца композиции)
  const duplicateClip = useCallback((id, timelineLen) => patch(id, l => {
    const base = l.clips[0]
    if (!base) return {}
    const last = [base, ...l.repeats].reduce((m, c) => (c.end > m.end ? c : m), base)
    const dur = base.end - base.start
    const start = Math.min(last.end, Math.max(0, timelineLen - dur))
    return { repeats: [...l.repeats, { start, end: Math.min(timelineLen, start + dur) }] }
  }), [patch])

  const removeRepeat = useCallback((id, index) => patch(id, l => ({
    repeats: l.repeats.filter((_, i) => i !== index),
  })), [patch])

  const removeLayer = useCallback(id => setLayers(prev => prev.filter(l => l.id !== id)), [])

  // Авто-раскладка целиком подменяет слои (speechLaneTiming.autoLayoutCoach)
  const replaceLayers = useCallback(next => setLayers(next), [])

  function getTimeline() { return { layers } }

  return {
    layers, addLayer, duplicateLayer, updateLayer, toggleRole, cycleLane, toggleVisible,
    updateClip, updateRepeat, duplicateClip, removeRepeat, removeLayer, replaceLayers, getTimeline,
  }
}
