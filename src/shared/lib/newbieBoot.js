import { installNewbieSandbox } from './newbieSim.js'

// Побочный эффект при импорте: если включён режим «новенький» (newbieSim.js), подменяем хранилище до того,
// как приложение начнёт его читать. Импортируется в main.jsx первым
installNewbieSandbox()
