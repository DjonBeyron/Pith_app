import { useState, useEffect, useCallback } from 'react'
import { loadScript, saveWordCard } from '../../shared/lib/lessonsApi.js'
import { dbg } from '../../shared/lib/debug.js'
import { nodeText } from '../player/admin/playerEditLabel.js'
import { makeBlock, normalizeWordCard, cleanForSave, moveBlock } from './wordCardModel.js'

const MAX_BLOCKS = 12

// Состояние страницы «Справка»: ноды урока (источник «＋ в справку» — только
// читаем), блоки справки, тег, сохранение с проверкой чтением с сервера.
// Хранится одна справка на урок-слово — в lessons.script.wordCard (saveWordCard)
export function useWordCard(lessonId) {
  const [title, setTitle] = useState('')
  const [lessonNodes, setLessonNodes] = useState([])
  const [tag, setTag] = useState('')
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        setTitle(data?.title ?? '')
        setLessonNodes(data?.script?.nodes ?? [])
        const wc = normalizeWordCard(data?.script?.wordCard)
        setTag(wc?.tag ?? '')
        setNodes(wc?.nodes ?? [])
        setStatus(wc ? `Загружено: блоков ${wc.nodes.length}` : 'Справки пока нет')
      })
      .catch(e => setStatus('✗ Ошибка загрузки: ' + (e?.message ?? '?')))
      .finally(() => setLoading(false))
  }, [lessonId])

  const change = useCallback(next => { setNodes(next); setDirty(true) }, [])
  const changeTag = useCallback(v => { setTag(v); setDirty(true) }, [])

  const canAdd = nodes.length < MAX_BLOCKS
  const addBlock = type => { if (canAdd) change([...nodes, makeBlock(type)]) }
  const addText = text => { if (canAdd) change([...nodes, { ...makeBlock('text'), text }]) }
  // «＋ в справку» у сообщения урока: его текст — новым блоком «Текст» (копия, урок не меняется)
  const addFromLesson = id => addText(nodeText(lessonNodes.find(n => n.id === id) ?? {}) || '')
  const updateBlock = (id, patch) => change(nodes.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const removeBlock = id => change(nodes.filter(b => b.id !== id))
  const move = (id, dir) => change(moveBlock(nodes, nodes.findIndex(b => b.id === id), dir))

  // Пустые блоки/строки не сохраняем; после записи читаем с сервера и сверяем
  async function save() {
    setSaving(true)
    try {
      const toSave = cleanForSave({ tag, nodes })
      dbg('[WORDCARD] saving', toSave?.nodes?.length ?? 0, 'blocks for lesson', lessonId)
      await saveWordCard(lessonId, toSave)
      const check = await loadScript(lessonId)
      const got = normalizeWordCard(check?.script?.wordCard)?.nodes.length ?? 0
      const want = toSave?.nodes.length ?? 0
      const stamp = new Date().toTimeString().slice(0, 8)
      setStatus(got === want
        ? `✓ Сохранено и проверено: блоков ${got} · ${stamp}`
        : `⚠ Сохранено ${want}, но сервер вернул ${got} · ${stamp}`)
      setTag(toSave?.tag ?? '')
      setNodes(toSave?.nodes ?? [])
      setDirty(false)
    } catch (e) {
      setStatus('✗ Ошибка сохранения: ' + (e?.message ?? '?'))
      window.alert('Не удалось сохранить справку: ' + (e?.message ?? 'неизвестная ошибка'))
      throw e
    } finally {
      setSaving(false)
    }
  }

  return {
    title, lessonNodes, tag, nodes, loading, saving, dirty, status, canAdd,
    changeTag, addBlock, addFromLesson, updateBlock, removeBlock, move, save,
  }
}
