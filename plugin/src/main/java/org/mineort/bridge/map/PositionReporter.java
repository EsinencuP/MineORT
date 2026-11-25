package org.mineort.bridge.map;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import org.bukkit.Location;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.mineort.bridge.BridgeHttp;

public final class PositionReporter {
    private static final String ENDPOINT = "/api/bridge/v1/map/positions";
    private static final int IDLE_MS = 5_000;
    private final JavaPlugin plugin;
    private final BridgeHttp bridge;

    public PositionReporter(JavaPlugin plugin, BridgeHttp bridge) {
        this.plugin = plugin;
        this.bridge = bridge;
    }

    private record Position(String uuid, String dim, double x, double y, double z, float yaw) {}
    private record Batch(List<Position> players) {}

    public void start() {
        plugin.getServer().getScheduler().runTask(plugin, this::publish);
    }

    private void publish() {
        long started = System.nanoTime();
        List<Position> positions = plugin.getServer().getOnlinePlayers().stream()
            .map(PositionReporter::snapshot)
            .filter(Objects::nonNull)
            .limit(200)
            .toList();
        bridge.post(ENDPOINT, new Batch(positions), false).whenComplete((reply, failure) -> {
            if (!plugin.isEnabled()) return;
            long requested = failure == null && reply.status() == 200
                ? reply.integer("interval_ms", IDLE_MS) : IDLE_MS;
            long interval = Math.clamp(requested, 1_000, IDLE_MS);
            long elapsed = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            long delayTicks = Math.max(1, (interval - elapsed + 49) / 50);
            plugin.getServer().getScheduler().runTaskLater(plugin, this::publish, delayTicks);
        });
    }

    private static Position snapshot(Player player) {
        Location location = player.getLocation();
        String dim = MapDimensions.forWorld(location.getWorld());
        if (dim == null) return null;
        return new Position(player.getUniqueId().toString(), dim,
            location.getX(), location.getY(), location.getZ(), location.getYaw());
    }
}
