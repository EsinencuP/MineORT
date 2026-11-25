package org.mineort.bridge.map;

import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Location;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.mineort.bridge.BridgeHttp;

public final class MarkerCommand implements CommandExecutor {
    private static final int NAME_LIMIT = 60;
    private static final String ENDPOINT = "/api/bridge/v1/community/marker";
    private final JavaPlugin plugin;
    private final BridgeHttp bridge;
    private final MarkerCooldown cooldown = new MarkerCooldown();

    public MarkerCommand(JavaPlugin plugin, BridgeHttp bridge) {
        this.plugin = plugin;
        this.bridge = bridge;
    }

    private record Request(
        String event_id, String player_uuid, String occurred_at,
        String dim, int x, int y, int z, String name
    ) {}

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0 || !"new".equalsIgnoreCase(args[0])) return false;
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Component.text("Команда доступна игрокам."));
            return true;
        }
        if (!player.hasPermission("mineort.marker.create")) {
            player.sendMessage(Component.text("У вас нет права создавать метки."));
            return true;
        }
        Location location = player.getLocation();
        String dimension = MapDimensions.forWorld(location.getWorld());
        if (dimension == null) {
            player.sendMessage(Component.text("В этом мире метки Атласа недоступны."));
            return true;
        }
        UUID playerId = player.getUniqueId();
        long wait = cooldown.tryAcquire(playerId, System.nanoTime());
        if (wait > 0) {
            player.sendMessage(Component.text("Попробуйте снова через " + wait + " сек."));
            return true;
        }

        String fullName = String.join(" ", Arrays.copyOfRange(args, 1, args.length)).strip();
        if (fullName.length() > NAME_LIMIT) {
            player.sendMessage(Component.text("Название сокращено до 60 символов."));
        }
        Request request = new Request(
            UUID.randomUUID().toString(), playerId.toString(), Instant.now().toString(),
            dimension, location.getBlockX(), location.getBlockY(), location.getBlockZ(),
            markerName(fullName)
        );
        bridge.post(ENDPOINT, request, true).whenComplete((reply, failure) -> {
            if (!plugin.isEnabled()) return;
            plugin.getServer().getScheduler().runTask(plugin, () -> {
                Player current = plugin.getServer().getPlayer(playerId);
                if (current != null) announce(current, reply, failure);
            });
        });
        return true;
    }

    static String markerName(String name) {
        if (name.isBlank()) return "Метка";
        if (name.length() <= NAME_LIMIT) return name;
        int end = Character.isHighSurrogate(name.charAt(NAME_LIMIT - 1)) ? NAME_LIMIT - 1 : NAME_LIMIT;
        return name.substring(0, end).stripTrailing();
    }

    private void announce(Player player, BridgeHttp.Reply reply, Throwable failure) {
        if (failure == null && reply.status() == 200) {
            try {
                UUID id = UUID.fromString(reply.text("marker_id"));
                player.sendMessage(Component.text("Метка создана. ")
                    .append(Component.text("Открыть на карте", NamedTextColor.GREEN)
                        .clickEvent(ClickEvent.openUrl(bridge.markerUrl(id)))));
                return;
            } catch (IllegalArgumentException invalidId) {
                player.sendMessage(Component.text("Сайт вернул некорректную ссылку на метку."));
                return;
            }
        }
        String code = failure == null ? reply.text("error") : "";
        String message = switch (code) {
            case "ERR_PLAYER_NOT_FOUND" -> "Подтвердите игровой профиль на сайте MineOrt.";
            case "marker_rate_limited", "ERR_RATE_LIMIT" -> "Достигнут лимит меток. Попробуйте позже.";
            default -> "Не удалось создать метку. Попробуйте позже.";
        };
        player.sendMessage(Component.text(message, NamedTextColor.RED));
    }
}
