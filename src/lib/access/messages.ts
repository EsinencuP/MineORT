/** User-facing texts (Russian) for stable access error codes. */
export const ACCESS_MESSAGES: Record<string, string> = {
  forbidden: "Недостаточно прав для этого действия.",
  post_forbidden: "Публиковать могут только участники сервера.",
  post_empty: "Напишите текст публикации (до 2000 символов).",
  post_rate_limited: "Слишком много публикаций, попробуйте позже.",
  upload_rate_limited: "Слишком много загрузок, попробуйте позже.",
  upload_quota_day: "Дневной лимит загрузок (50 МБ) исчерпан.",
  upload_quota_total:
    "Достигнут общий лимит хранилища (500 МБ). Удалите ненужные изображения.",
  too_many_images: "К публикации можно приложить до 10 изображений.",
  file_too_large: "Файл больше 10 МБ.",
  invalid_image: "Не удалось прочитать изображение. Нужен JPEG, PNG или WebP.",
  invalid_image_type: "Допустимы только JPEG, PNG и WebP.",
  image_too_big: "Изображение больше 4096 px по одной из сторон.",
  upload_missing: "Файл не найден. Загрузите изображение ещё раз.",
  post_not_found: "Публикация не найдена.",
  news_forbidden: "Официальные новости публикует модерация.",
  report_own: "Нельзя пожаловаться на свою публикацию.",
  report_duplicate: "Вы уже отправили жалобу на эту публикацию.",
  report_not_found: "Жалоба не найдена.",
  report_closed: "По этой жалобе решение уже принято.",
  reason_too_short: "Укажите причину (не короче 3 символов).",
  media_not_found: "Изображение не найдено.",
  account_not_active: "Аккаунт недоступен. Обратитесь к администратору.",
  rules_required: "Отметь, что ознакомился с правилами сервера.",
  rules_version_outdated:
    "Правила обновились. Откройте страницу правил и примите новую версию.",
  version_not_newer: "Номер версии должен быть больше текущего.",
  nick_invalid_format: "Ник: 3–16 символов, только латиница, цифры и «_».",
  nick_taken: "Этот ник уже занят другим игроком.",
  nick_quarantined:
    "Этот ник временно недоступен после освобождения. Выберите другой.",
  nick_locked:
    "Подтверждённый ник нельзя изменить самостоятельно. Напишите администратору.",
  nick_required: "Сначала укажите ник в Minecraft.",
  invitation_invalid: "Приглашение не найдено. Проверьте ссылку.",
  invitation_revoked: "Приглашение отозвано. Попросите новое у администратора.",
  invitation_expired:
    "Срок приглашения истёк. Попросите новое у администратора.",
  invitation_exhausted: "Приглашение уже использовано.",
  invitation_not_active: "Приглашение уже отозвано.",
  already_member: "Допуск у вас уже есть.",
  application_pending: "Заявка уже на рассмотрении.",
  retry_too_soon: "Повторно подать заявку можно через 7 дней после отклонения.",
  no_pending_application: "Нет заявки на рассмотрении.",
  reason_required: "Укажите причину отклонения.",
  bad_decision: "Неизвестное решение.",
  bad_input: "Проверьте заполнение полей.",
  application_not_found: "Заявка не найдена.",
  already_decided: "По этой заявке решение уже принято.",
  bad_action: "Неизвестное действие.",
  cannot_target_self: "Нельзя применить это действие к самому себе.",
  user_not_found: "Игрок не найден.",
  user_deleted: "Аккаунт уже удалён.",
  bad_transition: "Это действие недоступно при текущем статусе аккаунта.",
  delete_forbidden_banned:
    "Аккаунт с ограничением нельзя удалить самостоятельно. Обратитесь к администратору.",
  totp_invalid:
    "Неверный код. Проверьте время на телефоне и попробуйте ещё раз.",
  totp_rate_limited: "Слишком много попыток. Подождите несколько минут.",
  totp_not_configured: "Двухфакторная защита ещё не настроена.",
  confirm_required: "Подтвердите удаление, отметив флажок.",
  unknown: "Что-то пошло не так. Попробуйте ещё раз.",
};

export const messageFor = (code: string | null | undefined) =>
  code ? (ACCESS_MESSAGES[code] ?? ACCESS_MESSAGES.unknown) : null;
