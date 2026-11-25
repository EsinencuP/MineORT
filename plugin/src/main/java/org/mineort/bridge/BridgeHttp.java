package org.mineort.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.gson.JsonParseException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicLong;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class BridgeHttp {
    private static final Gson JSON = new Gson();
    private static final HexFormat HEX = HexFormat.of();
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(3))
        .build();
    private final SecureRandom random = new SecureRandom();
    private final AtomicLong clockOffset = new AtomicLong();
    private final URI site;
    private final String keyId;
    private final String secret;
    private final String version;

    BridgeHttp(URI site, String keyId, String secret, String version) {
        this.site = site;
        this.keyId = keyId;
        this.secret = secret;
        this.version = version;
    }

    public record Reply(int status, JsonObject body) {
        public String text(String key) {
            JsonElement value = body.get(key);
            return value != null && value.isJsonPrimitive() ? value.getAsString() : "";
        }

        public long integer(String key, long fallback) {
            try {
                return Long.parseLong(text(key));
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
    }

    public String markerUrl(UUID markerId) {
        return site.resolve("/map?m=" + markerId).toASCIIString();
    }

    public CompletableFuture<Reply> post(String path, Object data, boolean retry) {
        String body = JSON.toJson(data);
        return send(path, body).handle((reply, failure) -> {
            if (retry && (failure != null || reply.status() >= 500
                || "ERR_TS_SKEW".equals(reply.text("error")))) {
                return send(path, body);
            }
            return failure == null
                ? CompletableFuture.completedFuture(reply)
                : CompletableFuture.<Reply>failedFuture(failure);
        }).thenCompose(response -> response);
    }

    private CompletableFuture<Reply> send(String path, String body) {
        long now = Instant.now().getEpochSecond() + clockOffset.get();
        String timestamp = Long.toString(now);
        byte[] entropy = new byte[16];
        random.nextBytes(entropy);
        String nonce = HEX.formatHex(entropy);
        HttpRequest request = HttpRequest.newBuilder(site.resolve(path))
            .timeout(REQUEST_TIMEOUT)
            .header("content-type", "application/json")
            .header("x-mineort-key-id", keyId)
            .header("x-mineort-timestamp", timestamp)
            .header("x-mineort-nonce", nonce)
            .header("x-mineort-signature", signature(secret, path, timestamp, nonce, body))
            .header("x-mineort-bridge-version", version)
            .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
            .build();
        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
            .thenApply(response -> {
                JsonObject data = readObject(response.body());
                Reply reply = new Reply(response.statusCode(), data);
                long localTime = Instant.now().getEpochSecond();
                if ("ERR_TS_SKEW".equals(reply.text("error"))) {
                    clockOffset.set(reply.integer("server_time", localTime) - localTime);
                }
                return reply;
            });
    }

    private static JsonObject readObject(String body) {
        try {
            JsonElement json = JsonParser.parseString(body);
            return json.isJsonObject() ? json.getAsJsonObject() : new JsonObject();
        } catch (JsonParseException ignored) {
            return new JsonObject();
        }
    }

    static String signature(String secret, String path, String timestamp, String nonce, String body) {
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            String bodyHash = HEX.formatHex(hash.digest(body.getBytes(StandardCharsets.UTF_8)));
            String canonical = String.join("\n", "POST", path, timestamp, nonce, bodyHash);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HEX.formatHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Bridge request signing failed", error);
        }
    }
}
