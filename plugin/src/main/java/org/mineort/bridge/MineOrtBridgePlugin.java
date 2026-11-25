package org.mineort.bridge;

import java.net.URI;
import java.util.Objects;
import org.bukkit.plugin.java.JavaPlugin;
import org.mineort.bridge.map.MarkerCommand;
import org.mineort.bridge.map.PositionReporter;

public final class MineOrtBridgePlugin extends JavaPlugin {
    @Override
    public void onEnable() {
        saveDefaultConfig();
        String keyId = System.getenv("MINEORT_BRIDGE_KEY_ID");
        String secret = System.getenv("MINEORT_BRIDGE_SECRET");
        URI site;
        try {
            site = URI.create(getConfig().getString("site-url", "").strip());
            if (!validSite(site) || keyId == null || keyId.isBlank() || secret == null || secret.isBlank()) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException invalidConfiguration) {
            getLogger().severe("Configure site-url and both MINEORT_BRIDGE environment variables.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        BridgeHttp bridge = new BridgeHttp(site, keyId, secret, getPluginMeta().getVersion());
        Objects.requireNonNull(getCommand("marker")).setExecutor(new MarkerCommand(this, bridge));
        new PositionReporter(this, bridge).start();
    }

    private static boolean validSite(URI site) {
        String host = site.getHost();
        if (host == null || site.getRawUserInfo() != null || site.getRawQuery() != null
            || site.getRawFragment() != null || !(site.getPath().isEmpty() || "/".equals(site.getPath()))) {
            return false;
        }
        return "https".equals(site.getScheme())
            || ("http".equals(site.getScheme()) && ("localhost".equals(host) || "127.0.0.1".equals(host)));
    }
}
