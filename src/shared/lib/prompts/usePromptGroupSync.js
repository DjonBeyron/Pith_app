import { useEffect } from 'react'
import { syncPromptGroup, loadPromptShare } from '../../api/promptGroupApi.js'

// Синхронизация контрольной группы вопросов Пита (promptGroup.js) с сервером. Вызывается в оболочке (ShellV2).
//   Доля группы (app_settings.prompt_control) — один раз на старте, читает и гость: она нужна, чтобы новое устройство
//   попало в группу по актуальной доле (первое обращение currentGroup() может случиться раньше — тогда по умолчанию 10%).
//   Группа в профиль — при входе и при смене пользователя: RPC set_prompt_group записывает группу устройства, если в профиле
//   её нет, и возвращает группу профиля (она побеждает — человек не «перескакивает» между устройствами).
export function usePromptGroupSync(userId) {
  useEffect(() => { loadPromptShare() }, [])
  useEffect(() => { if (userId) syncPromptGroup() }, [userId])
}
