import { useState, useCallback, useRef } from 'react'
import { newNoteId } from './reviewNotes.js'

/** Состояние замечаний окна разбора: к нодам (notes) и общие (general). Начальное состояние — из localStorage (saved) */
export function useReviewNotes(saved = null) {
  const [notes, setNotes] = useState(() => saved?.notes ?? [])
  // Оригиналы нод (ref → { item, canvasNode, text }): снимок при ПЕРВОМ открытии окна замечания — «до», которое дальше не меняется
  const [version, bump] = useState(0) // растёт при изменении оригиналов — чтобы сохранение и счётчики обновились
  const originals = useRef(new Map(saved?.originals ?? []))
  const remember = useCallback((ref, snap) => { if (!originals.current.has(ref)) { originals.current.set(ref, snap); bump(n => n + 1) } }, [])
  const [general, setGeneral] = useState(() => saved?.general ?? [])
  const addNote = useCallback((ref, template, text) => setNotes(l => [...l, { id: newNoteId(), ref, template, text }]), [])
  const addGeneral = useCallback((template, text) => setGeneral(l => [...l, { id: newNoteId(), template, text }]), [])
  const removeNote = useCallback(id => setNotes(l => l.filter(n => n.id !== id)), [])
  const removeGeneral = useCallback(id => setGeneral(l => l.filter(n => n.id !== id)), [])
  const forget = useCallback(ref => { originals.current.delete(ref); bump(n => n + 1) }, [])
  const clear = useCallback(() => { setNotes([]); setGeneral([]); originals.current = new Map() }, [])
  const originalTexts = () => new Map([...originals.current].map(([k, v]) => [k, v.text]))
  return { version, notes, general, originals, remember, forget, originalTexts, addNote, addGeneral, removeNote, removeGeneral, clear }
}
