# MineOrt Bridge для Paper

Соберите плагин на JDK 25 командой `./gradlew build` из каталога `plugin`. На Windows используйте `gradlew.bat build`. JAR появится в `build/libs`. Целевая версия сервера — Paper 26.3. [Требования Paper](https://docs.papermc.io/paper/getting-started/)

## Установка на BisectHosting

1. Остановите тестовый сервер и положите JAR в каталог `plugins`. На сервере должна оставаться одна версия MineOrt Bridge.
2. Создайте `plugins/MineOrtBridge/config.yml`, если файла ещё нет, и укажите в `site-url` адрес нужного контура MineOrt. Передайте выданные для этого контура идентификатор ключа и секрет через переменные среды сервера `MINEORT_BRIDGE_KEY_ID` и `MINEORT_BRIDGE_SECRET`.
3. Запустите сервер. В админке Bridge проверьте, что сервер перешёл в состояние `online` и время heartbeat обновляется примерно каждые 30 секунд.
4. Войдите игроком с подтверждённой привязкой UUID и правом `mineort.marker.create`. Выполните `/marker new Проверка Атласа` и откройте ссылку из чата. Вторая команда в течение 30 секунд должна показать оставшееся время.

Настройка `map-enabled: false` отключает отправку позиций и создание меток из игры. Heartbeat остаётся включённым. [Протокол Bridge](../docs/03-architecture/05-community-v-bridge.md)
