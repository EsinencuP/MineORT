package org.mineort.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

final class BridgeHttpTest {
    private record Request(String timestamp, String nonce, String signature, String body) {}

    @Test
    void signsTheSameUtf8BodyAsTheSite() {
        assertEquals("bc65f166727edb2698656fa95434bedc2e7771fd0b490df2b1de9d3678b9c104",
            BridgeHttp.signature("test-bridge-key", "/api/bridge/v1/community/marker",
                "1795870800", "0123456789abcdef0123456789abcdef", "{\"name\":\"Метка\"}"));
    }

    @Test
    void heartbeatRetriesWithCorrectedClockAndFreshNonce() throws Exception {
        String path = "/api/bridge/v1/heartbeat";
        String secret = "fixture-bridge-key";
        List<Request> requests = new CopyOnWriteArrayList<>();
        HttpServer site = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        site.createContext(path, exchange -> {
            try {
                var headers = exchange.getRequestHeaders();
                requests.add(new Request(
                    headers.getFirst("x-mineort-timestamp"),
                    headers.getFirst("x-mineort-nonce"),
                    headers.getFirst("x-mineort-signature"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)
                ));
                boolean first = requests.size() == 1;
                long serverTime = Instant.now().getEpochSecond() + 120;
                String json = first ? "{\"error\":\"ERR_TS_SKEW\",\"server_time\":" + serverTime + "}"
                    : "{\"ok\":true}";
                byte[] reply = json.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(first ? 401 : 200, reply.length);
                exchange.getResponseBody().write(reply);
            } finally {
                exchange.close();
            }
        });
        site.start();
        try {
            BridgeHttp bridge = new BridgeHttp(
                URI.create("http://127.0.0.1:" + site.getAddress().getPort()),
                "fixture-key-id", secret, "0.1.1"
            );
            assertEquals(200, bridge.post(path, Map.of("online_count", 30), true)
                .get(6, TimeUnit.SECONDS).status());
            assertEquals(2, requests.size());
            Request first = requests.get(0);
            Request second = requests.get(1);
            assertEquals("{\"online_count\":30}", first.body());
            assertEquals(first.body(), second.body());
            assertNotEquals(first.nonce(), second.nonce());
            assertTrue(Long.parseLong(second.timestamp()) - Long.parseLong(first.timestamp()) >= 120);
            for (Request request : requests) {
                assertEquals(BridgeHttp.signature(secret, path, request.timestamp(), request.nonce(), request.body()),
                    request.signature());
            }
        } finally {
            site.stop(0);
        }
    }
}
