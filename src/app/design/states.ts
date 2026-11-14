// Catalogue of preview states (titles for the index; the props live in [screen]/[state]/page.tsx).
export const SCREENS = [
  {
    id: "login",
    title: "Экран 1 · Вход через Telegram",
    route: "/login",
    states: [
      {
        id: "default",
        title: "Стандартный",
        note: "Заголовок, карточка входа, преимущества",
      },
      { id: "loading", title: "Загрузка", note: "Открываем Telegram…" },
      {
        id: "cancelled",
        title: "Отмена авторизации",
        note: "Окно Telegram закрыто",
      },
      {
        id: "error",
        title: "Ошибка проверки",
        note: "Не удалось подтвердить вход",
      },
      {
        id: "blocked",
        title: "Аккаунт заблокирован",
        note: "Причина, срок и контакт",
      },
    ],
  },
  {
    id: "onboarding",
    title: "Экран 2 · Привязка Minecraft и доступ",
    route: "/onboarding/minecraft",
    states: [
      { id: "empty", title: "1. Пустая форма", note: "Telegram ✓ → Minecraft" },
      { id: "filled", title: "2. Ник заполнен", note: "Превью аватара" },
      {
        id: "invite",
        title: "3. Приглашение",
        note: "Код подставлен из ссылки",
      },
      {
        id: "application",
        title: "4. Заявка",
        note: "Раскрытая короткая форма",
      },
      {
        id: "taken",
        title: "5. Ник занят",
        note: "Понятное сообщение об ошибке",
      },
      {
        id: "pending",
        title: "6. Заявка на рассмотрении",
        note: "Ожидается решение администрации",
      },
      {
        id: "syncing",
        title: "7. Доступ одобрен",
        note: "Whitelist синхронизируется",
      },
      {
        id: "ready",
        title: "8. Доступ готов",
        note: "Требуется первый вход в Minecraft",
      },
      {
        id: "rejected",
        title: "Заявка отклонена",
        note: "Причина и дата новой попытки",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Экран 3 · Личный кабинет «Мой MineOrt»",
    route: "/dashboard",
    states: [
      {
        id: "new",
        title: "Новый игрок",
        note: "Приоритет: настроить Minecraft",
      },
      {
        id: "pending",
        title: "Заявка на рассмотрении",
        note: "Без ложных обещаний про whitelist",
      },
      {
        id: "preparing",
        title: "Доступ одобрен, whitelist готовится",
        note: "Адрес пока скрыт",
      },
      {
        id: "ready",
        title: "Можно подключаться",
        note: "Нужен первый вход и подтверждение ника",
      },
      {
        id: "active",
        title: "Активный игрок",
        note: "Статистика, событие, проекты, голосование, лента",
      },
      {
        id: "offline",
        title: "Сервер недоступен",
        note: "Кнопка подключения не обещает работу",
      },
    ],
  },
] as const;
