package org.mineort.bridge;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

final class BridgeHttpTest {
    @Test
    void signsTheSameUtf8BodyAsTheSite() {
        assertEquals("bc65f166727edb2698656fa95434bedc2e7771fd0b490df2b1de9d3678b9c104",
            BridgeHttp.signature("test-bridge-key", "/api/bridge/v1/community/marker",
                "1795870800", "0123456789abcdef0123456789abcdef", "{\"name\":\"Метка\"}"));
    }
}
