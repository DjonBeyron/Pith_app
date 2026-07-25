// Кто говорит в чате урока: общий учитель (одна настройка на всё приложение)
// или свой, заданный внутри урока. Один источник правды для плеера, карточки
// запуска и превью в редакторе — чтобы правило не разъехалось по трём местам.

export const EMPTY_TEACHER = { name: '', logo: null, crop: null }

// Режим урока. Старые уроки поля teacherMode не имеют: если у них уже был
// задан свой учитель — считаем их 'custom', иначе они подхватят общего.
export function teacherModeOf(script) {
  if (script?.teacherMode === 'custom' || script?.teacherMode === 'global') return script.teacherMode
  return (script?.teacherName || script?.teacherLogo) ? 'custom' : 'global'
}

// script — сценарий урока (lessons.script), global — значение из app_settings.
// Возвращает { name, logo, crop } для шапки плеера.
export function resolveTeacher(script, global) {
  if (teacherModeOf(script) === 'custom') {
    return {
      name: script?.teacherName ?? '',
      logo: script?.teacherLogo ?? null,
      crop: script?.teacherLogoCrop ?? null,
    }
  }
  return {
    name: global?.name ?? '',
    logo: global?.logo ?? null,
    crop: global?.crop ?? null,
  }
}
