import { supabase } from '../api/supabase.js'

export async function getFilesByIds(ids) {
  if (!ids?.length) return []
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, size_bytes, content_type, r2_url')
    .in('id', ids)
  if (error) throw error
  return data.map(r => ({
    id:       r.id,
    name:     r.file_name,
    size:     r.size_bytes,
    type:     r.content_type,
    r2Url:    r.r2_url,
    status:   'synced',
    localFile: null,
  }))
}

export async function listFiles() {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .order('uploaded_at', { ascending: false })
  if (error) throw error
  return data
}

export async function insertFile({ id, fileName, sizeBytes, contentType, r2Url, contentHash }) {
  const row = { file_name: fileName, size_bytes: sizeBytes, content_type: contentType, r2_url: r2Url }
  if (id) row.id = id
  if (contentHash) row.content_hash = contentHash
  let { data, error } = await supabase.from('files').insert(row).select().single()
  // Колонка content_hash появляется миграцией 20260824224341 — пока она не
  // применена, пишем без хэша, а не роняем загрузку целиком (тот же приём,
  // что в curriculaApi.loadCurricula для колонок переводов)
  if (error && /content_hash/.test(error.message)) {
    console.warn('[files] нет колонки content_hash — применить миграцию 20260824224341_files_content_hash.sql')
    delete row.content_hash
    ;({ data, error } = await supabase.from('files').insert(row).select().single())
  }
  if (error) throw error
  return data
}

// Дедуп загрузки: файл с таким же содержимым (SHA-256) уже есть в R2 — его
// r2Url можно переиспользовать вместо повторной загрузки байт. Хэш узкий
// (SHA-256), совпадение чужого файла с чужим содержимым практически
// невозможно — доп. проверка по имени/размеру не нужна.
export async function findFileByHash(contentHash) {
  if (!contentHash) return null
  const { data, error } = await supabase
    .from('files')
    .select('id, file_name, size_bytes, content_type, r2_url')
    .eq('content_hash', contentHash)
    .limit(1)
    .maybeSingle()
  // Колонки может ещё не быть на сервере (миграция не применена) — дедуп
  // просто не сработает, это не должно ломать саму загрузку
  if (error) { console.warn('[files] findFileByHash', error.message); return null }
  if (!data) return null
  return { id: data.id, name: data.file_name, size: data.size_bytes, type: data.content_type, r2Url: data.r2_url }
}

export async function deleteFileRow(id) {
  const { error } = await supabase.from('files').delete().eq('id', id)
  if (error) throw error
}

// r2Url может быть переиспользован несколькими строками files (дедуп по
// хэшу — см. findFileByHash) — сам объект в R2 удаляем, только если на
// него не ссылается больше ни одна строка
export async function otherRowsShareR2Url(r2Url, ownId) {
  const { count, error } = await supabase
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('r2_url', r2Url)
    .neq('id', ownId)
  if (error) { console.warn('[files] otherRowsShareR2Url', error.message); return true } // не уверены — не удаляем объект из R2
  return (count ?? 0) > 0
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getMediaKind(contentType) {
  const type = contentType || ''
  if (type.startsWith('image/')) return 'photo'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'other'
}
