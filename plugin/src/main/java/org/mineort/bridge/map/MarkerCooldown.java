package org.mineort.bridge.map;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

final class MarkerCooldown {
    private static final long COOLDOWN = TimeUnit.SECONDS.toNanos(30);
    private final Map<UUID, Long> deadlines = new HashMap<>();

    /** Returns the wait in seconds, or zero to reserve the player's next submission. */
    long tryAcquire(UUID player, long now) {
        deadlines.values().removeIf(deadline -> deadline - now <= 0);
        Long deadline = deadlines.get(player);
        if (deadline == null) {
            deadlines.put(player, now + COOLDOWN);
            return 0;
        }
        return TimeUnit.NANOSECONDS.toSeconds(deadline - now - 1) + 1;
    }
}
