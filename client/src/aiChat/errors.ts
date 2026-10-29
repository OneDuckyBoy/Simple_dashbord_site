// Какво виждат хората, когато нещо не стане (docs/chat-api.md, раздели 4 и 7).

const CODE_TEXT: Record<string, string> = {
  unavailable: 'Асистентът не е достъпен в момента. Опитай след минута.',
  storage_unavailable: 'Файловете не могат да се запазят в момента. Опитай след малко.',
  rate_limited: 'Твърде много заявки. Изчакай минута.',
  failed: 'Нещо се обърка. Опитай пак.',
}

/** Текстът за кода от събитие `error`. */
export function errorCodeText(code: unknown): string {
  return CODE_TEXT[String(code)] ?? CODE_TEXT.failed
}

/** Съдържанието на ред с role `error`: обикновено код (на стари редове `pending`), иначе изречение. */
export function errorRowText(content: string): string {
  return content === 'pending' || content in CODE_TEXT ? errorCodeText(content) : content
}

/** Текстът за HTTP отказ; `message` е това, което платформата е казала. */
export function httpErrorText(status: number, message?: string): string {
  switch (status) {
    case 401:
      return 'Асистентът не е настроен правилно. Свържи се с администратора.'
    case 403:
      return 'Нямаш достъп до асистента. Имейлът ти трябва да има акаунт в AI платформата.'
    case 409:
      return 'Асистентът още мисли. Опитай след малко.'
    case 413:
      return 'Файлът е над 10 MB.'
    case 429:
      return 'Твърде много заявки. Изчакай минута.'
    case 502:
    case 503:
      return 'Асистентът не е достъпен в момента. Опитай след минута.'
    default:
      return message || `Грешка ${status}`
  }
}

/** Прекъснат поток се взима наново, освен при 4xx (без 408 и 429): тогава няма смисъл. */
export function retriable(status: number): boolean {
  return status < 400 || status >= 500 || status === 408 || status === 429
}
