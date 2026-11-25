package org.mineort.bridge.map;

import org.bukkit.World;

final class MapDimensions {
    private MapDimensions() {}

    static String forWorld(World world) {
        return switch (world.getEnvironment()) {
            case NORMAL -> "overworld";
            case NETHER -> "nether";
            default -> null;
        };
    }
}
