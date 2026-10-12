import { useState, useCallback } from 'react'
import { newNoteId } from './reviewNotes.js'

/** Состояние замечаний окна разбора: к нодам (notes) и общие (general). Хранится, пока окно открыто */
export function useReviewNotes() {
  const [notes, setNotes] = useState([])
  const [general, setGeneral] = useState([])
  const addNote = useCallback((ref, template, text) => setNotes(l => [...l, { id: newNoteId(), ref, template, text }]), [])
  const addGeneral = useCallback((template, text) => setGeneral(l => [...l, { id: newNoteId(), template, text }]), [])
  const removeNote = useCallback(id => setNotes(l => l.filter(n => n.id !== id)), [])
  const removeGeneral = useCallback(id => setGeneral(l => l.filter(n => n.id !== id)), [])
  const clear = useCallback(() => { setNotes([]); setGeneral([]) }, [])
  return { notes, general, addNote, addGeneral, removeNote, removeGeneral, clear }
}
