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

export async function insertFile({ fileName, sizeBytes, contentType, r2Url }) {
  const { data, error } = await supabase
    .from('files')
    .insert({
      file_name: fileName,
      size_bytes: sizeBytes,
      content_type: contentType,
      r2_url: r2Url,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteFileRow(id) {
  const { error } = await supabase.from('files').delete().eq('id', id)
  if (error) throw error
}

export async function deleteFileByR2Url(r2Url) {
  const { error } = await supabase.from('files').delete().eq('r2_url', r2Url)
  if (error) throw error
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
