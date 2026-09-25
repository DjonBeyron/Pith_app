import { useState, useEffect, useCallback } from 'react'
import { loadScript, saveReviewCards } from '../../shared/lib/lessonsApi.js'
import { useLessonFiles } from '../canvas/useLessonFiles.js'
import { injectR2Urls } from '../canvas/injectR2Urls.js'
import { dbg } from '../../shared/lib/debug.js'
import { plural } from '../../shared/lib/plural.js'
import { copyNodesForCard, draftDeckFromLesson, makeEmptyCard, appendToCard, cardFromTask } from './reviewCardCopy.js'

const cardsWord = n => `${n} ${plural(n, 'карточка', 'карточки', 'карточек')}`

// Состояние страницы «Карточки повтора»: ноды урока (источник для «Подтянуть
// из урока» — только читаем), колода, выбранная карточка, сохранение.
// Файлы — общие с уроком (useLessonFiles): медиа карточек лежат там же
export function useReviewCards(lessonId) {
  const [title, setTitle] = useState('')
  const [lessonNodes, setLessonNodes] = useState([])
  const [cards, setCards] = useState([])
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const lessonFiles = useLessonFiles(lessonId)
  const { fetchMissingFiles } = lessonFiles

  useEffect(() => {
    if (!lessonId) return
    loadScript(lessonId)
      .then(data => {
        setTitle(data?.title ?? '')
        setLessonNodes(data?.script?.nodes ?? [])
        const loaded = data?.script?.reviewCards ?? []
        setCards(loaded)
        const ids = loaded.flatMap(c => c.nodes ?? []).map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
        if (ids.length) fetchMissingFiles(ids)
        setStatus(`Загружено: ${cardsWord(loaded.length)}`)
      })
      .catch(e => setStatus('✗ Ошибка загрузки: ' + (e?.message ?? '?')))
      .finally(() => setLoading(false))
  }, [lessonId, fetchMissingFiles])

  const change = useCallback(next => { setCards(next); setDirty(true) }, [])

  function setActiveNodes(nodes) {
    change(cards.map((c, i) => (i === active ? { ...c, nodes } : c)))
    const ids = nodes.map(n => n.typeData?.[n.type]?.file_id).filter(Boolean)
    if (ids.length) fetchMissingFiles(ids)
  }

  function addCard() {
    change([...cards, makeEmptyCard()])
    setActive(cards.length)
  }

  function addDraft() {
    const draft = draftDeckFromLesson(lessonNodes)
    if (!draft.length) return 0
    change([...cards, ...draft])
    setActive(cards.length)
    return draft.length
  }

  // «＋ Карточка из задания» в уроке слева: новая карточка = контекст + задание
  function addCardFromTask(taskId) {
    const card = cardFromTask(lessonNodes, taskId)
    if (!card) return
    change([...cards, card])
    setActive(cards.length)
  }

  function removeActive() {
    change(cards.filter((_, i) => i !== active))
    setActive(a => Math.max(0, a - 1))
  }

  // «Подтянуть из урока» — копии выбранных нод в конец выбранной карточки
  function pullIntoActive(ids) {
    if (!ids.length) return
    const copies = copyNodesForCard(lessonNodes, ids)
    if (!cards.length) { change([{ ...makeEmptyCard(), nodes: copies }]); setActive(0); return }
    setActiveNodes(appendToCard(cards[active]?.nodes, copies))
  }

  // Пустые карточки не сохраняем. Как и урок: сначала догружаем файлы в R2,
  // вписываем r2Url в ноды, пишем и сверяем с сервером
  async function save() {
    setSaving(true)
    try {
      const files = lessonFiles.hasUnsynced ? await lessonFiles.syncToServer() : lessonFiles.files
      const toSave = cards.filter(c => c.nodes?.length).map(c => ({ ...c, nodes: injectR2Urls(c.nodes, files) }))
      const dropped = cards.length - toSave.length
      dbg('[CARDS] saving', toSave.length, 'cards for lesson', lessonId)
      await saveReviewCards(lessonId, toSave)
      const check = await loadScript(lessonId)
      const got = check?.script?.reviewCards?.length ?? 0
      const stamp = new Date().toTimeString().slice(0, 8)
      const note = dropped ? ` · пустые убраны: ${dropped}` : ''
      setStatus(got === toSave.length
        ? `✓ Сохранено и проверено: ${cardsWord(got)}${note} · ${stamp}`
        : `⚠ Сохранено ${toSave.length}, но сервер вернул ${got} · ${stamp}`)
      setCards(toSave)
      setActive(a => Math.min(a, Math.max(0, toSave.length - 1)))
      setDirty(false)
    } catch (e) {
      setStatus('✗ Ошибка сохранения: ' + (e?.message ?? '?'))
      window.alert('Не удалось сохранить карточки: ' + (e?.message ?? 'неизвестная ошибка'))
      throw e
    } finally {
      setSaving(false)
    }
  }

  return {
    title, lessonNodes, cards, active, setActive, loading, saving, dirty, status, lessonFiles,
    setActiveNodes, addCard, addDraft, addCardFromTask, removeActive, pullIntoActive, save,
  }
}
