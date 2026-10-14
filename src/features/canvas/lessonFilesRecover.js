import { getFilesByIds } from '../../shared/lib/filesApi.js'
import { lfGet } from '../../shared/lib/localFileStore.js'

// Вспомогательные шаги useLessonFiles.js, которые сверяют локальный список файлов урока с сервером/хранилищем браузера.
// Вынесены из хука, чтобы он оставался в мягком лимите 250 строк; состояние (setFiles, журнал) приходит параметрами.

export const IDB_KEY = (lid, fid) => `lesson_blob_${lid}_${fid}`

// Фоновая сверка synced-файлов с сервером (вызывается из эффекта загрузки хука) — не блокирует первый кадр (рисуем сразу
// из кэша), молча поправляет расхождения: файл удалили в другом месте — убираем повисшую ссылку; r2Url/имя изменились —
// подтягиваем актуальные. У уже синхронизированных файлов легитимных локальных правок не бывает — сервер безусловная истина
export function reconcileSyncedFiles(cachedRest, setFiles) {
  const syncedIds = cachedRest.filter(f => f.status === 'synced').map(f => f.id)
  if (!syncedIds.length) return
  getFilesByIds(syncedIds).then(serverFiles => {
    const byId = Object.fromEntries(serverFiles.map(f => [f.id, f]))
    setFiles(prev => {
      let changed = false
      const next = prev
        .filter(f => {
          if (f.status !== 'synced' || !syncedIds.includes(f.id)) return true
          if (byId[f.id]) return true
          changed = true
          return false // удалили на сервере в другом месте — не тащим висячую ссылку
        })
        .map(f => {
          if (f.status !== 'synced' || !byId[f.id]) return f
          const s = byId[f.id]
          if (s.r2Url === f.r2Url && s.name === f.name) return f
          changed = true
          return { ...f, r2Url: s.r2Url, name: s.name, size: s.size, type: s.type }
        })
      return changed ? next : prev
    })
  }).catch(() => {})
}

// Файл «локальный», но копии в памяти нет (status 'local' без localFile): сначала ищем её в хранилище браузера (IndexedDB),
// потом — не загружен ли он уже на сервер (отметка в браузере могла отстать). Только если нигде нет — файл действительно
// потерян. Возвращает обновлённый список; каждый шаг пишется в журнал загрузки (addLog)
export async function recoverStuckLocal({ files, stuck, lessonId, addLog }) {
  let working = files
  addLog(`Без локальной копии: ${stuck.length}. Ищу копию в хранилище браузера и файл на сервере…`)
  const noBlob = []
  for (const f of stuck) {
    const blob = await lfGet(IDB_KEY(lessonId, f.id)).catch(err => { addLog(`  ${f.name}: ошибка чтения хранилища браузера: ${err?.message ?? err}`); return null })
    if (blob) {
      working = working.map(x => (x.id === f.id ? { ...x, localFile: blob } : x))
      addLog(`  ✓ ${f.name} (id ${String(f.id).slice(0, 8)}): копия найдена в хранилище браузера (${Math.round(blob.size / 1024)} КБ), будет загружена`)
    } else noBlob.push(f)
  }
  if (noBlob.length) {
    let server = []
    try { server = await getFilesByIds(noBlob.map(f => f.id)) } catch (err) { addLog(`  ✗ не удалось спросить сервер: ${err?.message ?? err}`) }
    const byId = Object.fromEntries(server.map(x => [x.id, x]))
    for (const f of noBlob) {
      const row = byId[f.id]
      if (row?.r2Url) {
        working = working.map(x => (x.id === f.id ? { ...x, status: 'synced', r2Url: row.r2Url, localFile: null } : x))
        addLog(`  ✓ ${f.name} (id ${String(f.id).slice(0, 8)}): уже есть на сервере, помечен как загруженный`)
      } else addLog(`  ✗ ${f.name} (id ${String(f.id).slice(0, 8)}): нет ни копии в браузере, ни файла на сервере${row ? ' (строка есть, но без ссылки)' : ''} — файл потерян, у ноды нажмите «Сбросить файл» и озвучьте заново`)
    }
  }
  return working
}
