package org.mineort.bridge.map;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

final class MarkerCommandTest {
    @Test
    void keepsASeparateThirtySecondCooldownForEachPlayer() {
        MarkerCooldown cooldown = new MarkerCooldown();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        assertEquals(0, cooldown.tryAcquire(first, 100));
        assertEquals(30, cooldown.tryAcquire(first, 100));
        assertEquals(0, cooldown.tryAcquire(second, 100));
        assertEquals(1, cooldown.tryAcquire(first, 100 + TimeUnit.SECONDS.toNanos(29)));
        assertEquals(0, cooldown.tryAcquire(first, 100 + TimeUnit.SECONDS.toNanos(30)));
    }

    @Test
    void suppliesADefaultNameAndDoesNotSplitSurrogatePairs() {
        assertEquals("Метка", MarkerCommand.markerName(""));
        assertEquals("x".repeat(60), MarkerCommand.markerName("x".repeat(70)));
        assertEquals("x".repeat(59), MarkerCommand.markerName("x".repeat(59) + "🌍"));
    }
}
