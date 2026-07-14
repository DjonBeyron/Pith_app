// Ключ localStorage-черновика канваса (CanvasBoard.jsx) — вынесен в отдельный
// файл, а не экспортирован прямо из CanvasBoard.jsx, чтобы не ломать Fast
// Refresh (react-refresh/only-export-components: файл компонента должен
// экспортировать только компонент). CanvasPage.jsx чистит этот ключ сразу
// после успешного сохранения — иначе редактор навсегда показывал бы черновик
// вместо настоящих данных сервера, см. handleSave в CanvasPage.jsx
export const canvasLsKey = id => `lesson_canvas_${id}`
