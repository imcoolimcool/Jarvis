import { Router } from "express";
import { db, jarvisSettings } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ALLOWED_KEYS = [
  "weather_location",
  "calendar_ics_url_1",
  "calendar_ics_url_2",
  "calendar_ics_url_3",
  "calendar_ics_url_4",
  "calendar_ics_url_5",
  "calendar_name_1",
  "calendar_name_2",
  "calendar_name_3",
  "calendar_name_4",
  "calendar_name_5",
  "personality",
  "web_search_enabled",
] as const;
type SettingKey = (typeof ALLOWED_KEYS)[number];

/** GET /api/jarvis/settings — returns all settings as a key→value map */
router.get("/settings", async (req, res) => {
  try {
    const rows = await db.select().from(jarvisSettings);
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    res.json(map);
  } catch (err) {
    req.log.error({ err }, "Failed to read settings");
    res.status(500).json({ error: "Failed to read settings" });
  }
});

/** PUT /api/jarvis/settings — upsert one or more settings */
router.put("/settings", async (req, res) => {
  const body = req.body as Partial<Record<SettingKey, string>>;

  const entries = Object.entries(body).filter(([k]) =>
    ALLOWED_KEYS.includes(k as SettingKey),
  ) as [SettingKey, string][];

  if (entries.length === 0) {
    res.status(400).json({ error: "No valid settings provided" });
    return;
  }

  try {
    for (const [key, value] of entries) {
      if (value === "" || value === null) {
        await db.delete(jarvisSettings).where(eq(jarvisSettings.key, key));
      } else {
        await db
          .insert(jarvisSettings)
          .values({ key, value, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: jarvisSettings.key,
            set: { value, updatedAt: new Date() },
          });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save settings");
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
