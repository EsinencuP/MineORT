# Дополнение к реестру решений (после 14.11.2026)

Записи владельца, которые ещё не внесены в [реестр OD](03-open-decisions.md).

| Дата | Решение | Следствия |
|---|---|---|
| 14.11.2026 | **Модов не будет.** Сервер на плагинах; клиент — обычный Minecraft Java Edition без сборки | OD-25 закрыт: список модов не нужен. US-E06-02 (сборка MineOrt Client, `.mrpack`, таблица лицензий мода) снимается; остаются версия Minecraft и ссылка на лаунчер в настройках `/admin/guides`. Риск R-18 (лицензии модов) сужается до плагинов |
| 14.11.2026 | **Начальный набор плагинов (13):** Let Me Despawn, Chunky, CalcMod, LuckPerms, SkinsRestorer, TAB, WorldGuard, CoreProtect, TabTPS, Armor Hider, AuthMe ReReloaded (fork), ImageFrame, GSit | SP-08: плагин приватов — WorldGuard, права — LuckPerms, история блоков — CoreProtect. AuthMe — кандидат на парольный резерв (OD-23, US-E07-06). Совместимость каждого плагина с версией Paper по OD-22 (Paper 26.3 + Java 25) — [ПРОВЕРИТЬ] до M1 (в первой проверке Dynmap, LibreLogin и FastLogin для 26.x не подтверждены; AuthMe 6.0.1, LuckPerms 5.5.71 подтверждены) |
