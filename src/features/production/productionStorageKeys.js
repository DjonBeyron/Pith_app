// Ключ localStorage-памяти позиции скролла продакшен-списка — отдельный
// файл по тому же приёму, что и canvasStorageKeys.js (не экспортировать
// из файла компонента, чтобы не ломать Fast Refresh)
export const productionScrollKey = id => `lesson_production_scroll_${id}`
