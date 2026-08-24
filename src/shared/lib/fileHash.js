// SHA-256 содержимого файла — считается в браузере (Web Crypto), без сервера.
// Используется для дедупликации загрузок: если такой хэш уже есть в таблице
// files, файл с тем же содержимым уже лежит в R2 — грузить его повторно не нужно.
export async function hashFile(file) {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}
