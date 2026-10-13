import { useState, useCallback, useRef } from 'react'
import { newNoteId } from './reviewNotes.js'

/** Состояние замечаний окна разбора: к нодам (notes) и общие (general). Хранится, пока окно открыто */
export function useReviewNotes() {
  const [notes, setNotes] = useState([])
  // Оригиналы нод (ref → { item, canvasNode, text }): снимок при ПЕРВОМ открытии окна замечания — «до», которое дальше не меняется
  const originals = useRef(new Map())
  const remember = useCallback((ref, snap) => { if (!originals.current.has(ref)) originals.current.set(ref, snap) }, [])
  const [general, setGeneral] = useState([])
  const addNote = useCallback((ref, template, text) => setNotes(l => [...l, { id: newNoteId(), ref, template, text }]), [])
  const addGeneral = useCallback((template, text) => setGeneral(l => [...l, { id: newNoteId(), template, text }]), [])
  const removeNote = useCallback(id => setNotes(l => l.filter(n => n.id !== id)), [])
  const removeGeneral = useCallback(id => setGeneral(l => l.filter(n => n.id !== id)), [])
  const clear = useCallback(() => { setNotes([]); setGeneral([]) }, [])
  const originalTexts = () => new Map([...originals.current].map(([k, v]) => [k, v.text]))
  return { notes, general, originals, remember, originalTexts, addNote, addGeneral, removeNote, removeGeneral, clear }
}
