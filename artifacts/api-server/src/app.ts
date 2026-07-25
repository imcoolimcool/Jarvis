import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildErrorDetail } from "./lib/error-detail";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust the first proxy (Replit, nginx, etc.) so req.ip reflects real client IP
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "1gb" }));
app.use(express.urlencoded({ extended: true, limit: "1gb" }));

app.use("/api", router);

// ── Serve built frontend static files ──
const staticDir = path.resolve(__dirname, "..", "..", "..", "artifacts", "jarvis", "dist", "public");
app.use(express.static(staticDir));

// ── SPA fallback — any non-API, non-static request serves index.html ──
app.use((req: Request, res: Response) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ── Global error handler — catches any unhandled errors and returns detailed info ──
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  const detail = buildErrorDetail(err, req, 500, Date.now());
  res.status(500).json({ error: "Internal server error", detail });
});

export default app;
