// «Файл модели на сервере изменился?» при докачке кусками. Решаем ТОЛЬКО по полному размеру из Content-Range: Last-Modified и ETag
// CDN (Vercel / Cloudflare) может отдавать разными на разные запросы одного файла (разные узлы, MISS / HIT) — по ним раньше
// срабатывало «changed» (журнал слабого Android 2026-11-27: на втором куске, русская модель так и не скачалась). Подмену файла
// при равном размере всё равно ловит проверка формата архива в конце (finish). Без React — чистая логика.

/** Заголовки ответа для журнала: статус, etag, last-modified, content-length, content-range */
export function headerInfo(res) {
  const h = n => res?.headers?.get?.(n) || '—'
  return `статус ${res?.status ?? '—'}, etag ${h('etag')}, last-modified ${h('last-modified')}, content-length ${h('content-length')}, content-range ${h('content-range')}`
}

/** Изменился ли файл: true только когда оба размера известны и не равны */
export const sizeChanged = (metaTotal, rangeTotal) => Boolean(metaTotal > 0 && rangeTotal > 0 && metaTotal !== rangeTotal)

/** Validators первого и текущего куска различаются (только для журнала — решения не принимаем) */
export const validatorsDiffer = (a, b) => Boolean((a?.etag && b?.etag && a.etag !== b.etag) || (a?.lastModified && b?.lastModified && a.lastModified !== b.lastModified))
