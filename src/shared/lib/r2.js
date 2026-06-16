import { dbg } from './debug.js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Chrome's fetch() drops the connection for large PUT bodies (ERR_CONNECTION_RESET).
// XHR doesn't have this limitation — use it for the actual upload to R2.
function xhrPut(url, contentType, body) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) dbg('[R2] upload progress:', Math.round(e.loaded / e.total * 100) + '%', `${e.loaded}/${e.total}`)
    }
    xhr.onload  = () => {
      if (xhr.status < 200 || xhr.status >= 300) console.error('[R2] PUT failed, response body:', xhr.responseText)
      resolve(xhr.status)
    }
    xhr.onerror   = () => reject(new Error('XHR network error'))
    xhr.ontimeout = () => reject(new Error('XHR timeout'))
    xhr.send(body)
  })
}

export async function uploadToR2(file) {
  dbg('[R2] uploadToR2 called', { fileName: file.name, contentType: file.type, sizeKb: Math.round(file.size / 1024) })

  const contentType = file.type || 'application/octet-stream'

  const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/r2-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ fileName: file.name, contentType }),
  });

  dbg('[R2] Edge Function response status:', fnRes.status)

  if (!fnRes.ok) {
    const text = await fnRes.text();
    console.error('[R2] Edge Function error body:', text)
    throw new Error(`Ошибка получения URL: ${fnRes.status} | ${text}`);
  }

  const { uploadUrl, publicUrl } = await fnRes.json();
  dbg('[R2] Got publicUrl:', publicUrl)

  const status = await xhrPut(uploadUrl, contentType, file)
  dbg('[R2] R2 upload status:', status)
  if (status < 200 || status >= 300) throw new Error(`Ошибка загрузки в R2: ${status}`);

  return publicUrl;
}

export async function deleteFromR2(publicUrl) {
  dbg('[R2] deleteFromR2 called', publicUrl)
  const res = await fetch(`${SUPABASE_URL}/functions/v1/r2-delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ url: publicUrl }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`R2 delete failed: ${res.status} | ${text}`)
  }
  dbg('[R2] delete OK', publicUrl)
}
