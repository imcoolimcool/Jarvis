import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

/** Deep health check — verifies DB connectivity and reports uptime */
router.get("/healthz", async (_req, res) => {
  const start = Date.now();
  try {
    // Quick DB ping — SELECT 1
    await db.execute({ sql: "SELECT 1" as any });
    const dbMs = Date.now() - start;
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json({
      ...data,
      db: "connected",
      dbLatencyMs: dbMs,
      uptimeSec: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  } catch (err) {
    const data = HealthCheckResponse.parse({ status: "ok" }); // server is still running
    res.status(200).json({
      ...data,
      db: "disconnected",
      dbError: err instanceof Error ? err.message : "unknown",
      uptimeSec: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  }
});

export default router;
