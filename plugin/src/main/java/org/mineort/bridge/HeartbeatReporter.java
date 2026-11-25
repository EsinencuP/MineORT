package org.mineort.bridge;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.bukkit.plugin.java.JavaPlugin;

final class HeartbeatReporter {
    private static final String ENDPOINT = "/api/bridge/v1/heartbeat";
    private static final long HEARTBEAT_TICKS = 30 * 20;
    private static final long WARNING_INTERVAL_MS = TimeUnit.MINUTES.toMillis(1);
    private final JavaPlugin plugin;
    private final BridgeHttp bridge;
    private final AtomicLong lastWarningAt = new AtomicLong(Long.MIN_VALUE);

    HeartbeatReporter(JavaPlugin plugin, BridgeHttp bridge) {
        this.plugin = plugin;
        this.bridge = bridge;
    }

    private record Heartbeat(
        String bridge_version, String server_version, int online_count, int max_players
    ) {}

    void start() {
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::publish, 1, HEARTBEAT_TICKS);
    }

    private void publish() {
        var server = plugin.getServer();
        var heartbeat = new Heartbeat(
            plugin.getPluginMeta().getVersion(),
            server.getName() + " " + server.getMinecraftVersion(),
            server.getOnlinePlayers().size(),
            server.getMaxPlayers()
        );
        bridge.post(ENDPOINT, heartbeat, true).whenComplete((reply, failure) -> {
            if (!plugin.isEnabled() || (failure == null && reply.status() == 200)) return;
            long now = System.currentTimeMillis();
            long previous = lastWarningAt.get();
            if (previous > now - WARNING_INTERVAL_MS || !lastWarningAt.compareAndSet(previous, now)) {
                return;
            }
            String status = failure == null ? "HTTP " + reply.status() : "connection failed";
            plugin.getLogger().warning("MineOrt Bridge heartbeat failed (" + status + ").");
        });
    }
}
