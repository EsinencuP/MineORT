import { beforeEach, describe, expect, it, vi } from "vitest";
import { discardMedia } from "./media";

const storage = vi.hoisted(() => ({
  remove: vi.fn(),
  exists: vi.fn(),
  removeRows: vi.fn(),
}));
vi.mock("@/lib/supabase-admin", () => ({
  db: () => ({
    storage: { from: () => storage },
    from: () => ({ delete: () => ({ in: storage.removeRows }) }),
  }),
}));

describe("physical media cleanup", () => {
  const rows = [{ id: "fixture", storage_key: "screenshots/test.webp" }];
  beforeEach(() => vi.resetAllMocks());

  it("keeps the database record if Storage fails", async () => {
    storage.remove.mockResolvedValue({ error: { message: "unavailable" } });
    await expect(discardMedia(rows)).rejects.toThrow("unavailable");
    expect(storage.removeRows).not.toHaveBeenCalled();
  });

  it("keeps the record if Storage still reports a file", async () => {
    storage.remove.mockResolvedValue({ error: null });
    storage.exists.mockResolvedValue({ data: true, error: null });
    await expect(discardMedia(rows)).rejects.toThrow("could not be confirmed");
    expect(storage.removeRows).not.toHaveBeenCalled();
  });

  it("can retry after the file is gone and then remove the row", async () => {
    storage.remove.mockResolvedValue({ error: null });
    storage.exists.mockResolvedValue({
      data: false,
      error: { code: "NoSuchKey" },
    });
    storage.removeRows.mockResolvedValue({ error: null });
    await expect(discardMedia(rows)).resolves.toBe(1);
    expect(storage.removeRows).toHaveBeenCalledWith("id", ["fixture"]);
  });
});
