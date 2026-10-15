import { useEffect } from 'react'
import { onOpenModule } from '../shared/lib/openModuleEvent.js'
import { onOpenSceneBuilder } from '../shared/lib/openSceneBuilderEvent.js'

// Просьбы «открыть вкладку» из любого места приложения (ShellV2):
//   · pithy:open-module — мостик «Продолжить фразу»: вкладка «Уроки» (модуль откроет FeedTab);
//   · pithy:open-scene-builder — «← Вернуться в сборщик» с тестового слайда песочницы: вкладка «Админ» (только настоящему админу);
//     субвкладку «Сцены» и окно сборщика включают AdminV2 / ScenesTab по запомненному запросу.
export function useShellOpenEvents(setTab, canOpenAdmin) {
  useEffect(() => onOpenModule(() => setTab('feed')), [setTab])
  useEffect(() => onOpenSceneBuilder(() => { if (canOpenAdmin) setTab('admin') }), [setTab, canOpenAdmin])
}
