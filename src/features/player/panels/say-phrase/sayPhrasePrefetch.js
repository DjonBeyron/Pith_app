// Тихая подгрузка чанка панели «Сказать фразу» (без lazyRetry: упавший прогрев не должен перезагружать страницу)
export const prefetchSayPhrasePanel = () => import('./SayPhrasePanel.jsx')
