import { useState, useEffect } from 'react'
import { listFiles } from '../../shared/lib/filesApi.js'

export default function NodeFileSelect({ value, onChange }) {
  const [files, setFiles] = useState([])

  useEffect(() => {
    listFiles().then(rows => setFiles(rows ?? [])).catch(() => {})
  }, [])

  return (
    <select
      className="nodeFileSelect"
      value={value ?? ''}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(e.target.value || null) }}
    >
      <option value="">— Файл не привязан —</option>
      {files.map(f => (
        <option key={f.id} value={f.id}>{f.file_name}</option>
      ))}
    </select>
  )
}
