import { useSyncExternalStore } from 'react'
import { peekSceneBuilderRequest, subscribeSceneBuilderRequest } from './openSceneBuilderEvent.js'

// Невостребованный запрос «открыть сборщик сцен» (openSceneBuilderEvent.js) или null. AdminV2 по нему включает субвкладку
// «Сцены», ScenesTab — открывает окно и забирает запрос (consumeSceneBuilderRequest).
export const useSceneBuilderRequest = () => useSyncExternalStore(subscribeSceneBuilderRequest, peekSceneBuilderRequest, () => null)
