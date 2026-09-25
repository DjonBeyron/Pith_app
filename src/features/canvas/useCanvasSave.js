import { useState } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { canvasLsKey } from './canvasStorageKeys.js'
import { loadScript, saveLesson } from '../../shared/lib/lessonsApi.js'
import { notifyLessonSaved } from '../../shared/lib/lessonSavedBus.js'
import { injectR2Urls } from './injectR2Urls.js'

// Сохранение урока на сервер: догрузка несинхронизированных файлов, инъекция
// r2Url в ноды, запись + контрольное чтение сразу после (не доверяем «раз не
// было ошибки — значит записалось»), очистка локальных черновиков (canvas-
// ноды + настройки учителя) после успеха. Вынесено из CanvasPage.jsx.
export function useCanvasSave({
  lessonId, title, lessonXp, nodesRef, zonesRef, hasUnsynced, files, syncToServer,
  prepareForSave, clearTeacherDraft, setSyncStatus,
}) {
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    try {
      // Сначала догружаем в R2 всё, что ещё не синхронизировано (раньше это
      // была ОТДЕЛЬНАЯ кнопка «Синхронизировать» — если её не нажать или не
      // дождаться, Save «запекал» в урок старый/пустой r2Url). syncToServer
      // возвращает АКТУАЛЬНЫЙ список файлов явно — не читаем состояние `files`
      // из closure, оно бы осталось старым до следующего рендера
      const currentFiles = hasUnsynced ? await syncToServer() : files
      const teacherData = await prepareForSave()
      // r2Url — прямо в ноды, чтобы плееру не ходить в таблицу files
      const nodesForSave = injectR2Urls(nodesRef.current, currentFiles)
      // Зоны (визуальная группировка нод, см. features/canvas/zones/) — часть
      // урока наравне с нодами, но не участвуют в r2Url-инъекции: у них нет
      // файлов
      const scriptToSave = { nodes: nodesForSave, zones: zonesRef?.current ?? [], lessonXp, ...teacherData }
      dbg('[CANVAS] saving', nodesForSave.length, 'nodes to lesson', lessonId)
      await saveLesson(lessonId, { title, script: scriptToSave })
      // Схема модуля открыта под редактором и сама в базу больше не ходит —
      // сообщаем ей новое название и XP, иначе они обновились бы только после
      // перезагрузки приложения
      notifyLessonSaved({ id: lessonId, title, lessonXp })
      // Локальный черновик (CanvasBoard) свою задачу выполнил — он сохранён
      // на сервере. Чистим его: иначе при следующем открытии урока редактор
      // навсегда показывал бы этот черновик вместо настоящих данных сервера
      // (даже если их поменяли откуда-то ещё), см. canvasLsKey/loadSaved()
      localStorage.removeItem(canvasLsKey(lessonId))
      // Тот же принцип для черновика настроек учителя (useTeacherSettings) —
      // он раньше не чистился вообще и навсегда прятал бы правки учителя,
      // сделанные позже с другого устройства
      clearTeacherDraft()
      dbg('[CANVAS] save complete — verifying round-trip...')
      // Контрольное чтение сразу после сохранения — не доверяем «раз не было
      // ошибки, значит записалось» (see lessonsApi.saveLesson: .select() уже
      // ловит 0-строк, но это ещё одна независимая проверка того, что именно
      // ЧИТАЕТ сервер после нашей записи — включая реальные r2Url по нодам).
      // Статус виден в интерфейсе на любом устройстве, без включения дебага
      const stamp = new Date().toTimeString().slice(0, 8)
      try {
        const check = await loadScript(lessonId)
        const checkNodes = check?.script?.nodes ?? []
        dbg('[CANVAS] verify: server now has', checkNodes.length, 'nodes (sent', nodesForSave.length, ')')
        const checkFiles = checkNodes
          .filter(n => n.typeData?.[n.type]?.file_id)
          .map(n => `${n.type}#${n.seq}:${(n.typeData[n.type].file_id ?? '').slice(0, 8)}→${n.typeData[n.type].r2Url ? 'r2Url✓' : 'r2Url✗НЕТ'}`)
          .join(', ')
        if (checkFiles) dbg('[CANVAS] verify: server files:', checkFiles)
        setSyncStatus(checkNodes.length !== nodesForSave.length
          ? `⚠ Сохранено ${nodesForSave.length}, но сервер вернул ${checkNodes.length} — id ${lessonId.slice(0, 8)} · ${stamp}`
          : `✓ Сохранено и проверено: ${checkNodes.length} нод · id ${lessonId.slice(0, 8)} · ${stamp}`)
      } catch (e) {
        dbg('[CANVAS ERROR] post-save verify failed', e?.message)
        setSyncStatus(`Сохранено (без проверки — ${e?.message ?? '?'}) · ${stamp}`)
      }
    } catch (e) {
      // Раньше ошибка (RLS, сеть, 0 строк изменено) уходила в необработанный
      // reject молча — кнопка просто возвращалась в норму, будто сохранено,
      // хотя на сервере ничего не менялось: с другого компьютера тот же урок
      // выглядел «не синхронизированным». Явно сообщаем и не глотаем ошибку —
      // switchToProduction ждёт handleSave() и не должен переключать экран,
      // будто всё в порядке
      dbg('[CANVAS ERROR] save failed', e?.message)
      setSyncStatus('✗ Ошибка сохранения: ' + (e?.message ?? '?'))
      window.alert('Не удалось сохранить урок: ' + (e?.message ?? 'неизвестная ошибка') +
        '\n\nПравки остались только у вас в браузере — попробуйте сохранить ещё раз.')
      throw e
    } finally {
      setIsSaving(false)
    }
  }

  return { isSaving, handleSave }
}
