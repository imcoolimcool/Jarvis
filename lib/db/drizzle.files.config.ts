import { defineConfig } from "drizzle-kit";
import path from "path";

const url = process.env["DATABASE_URL_FILES"] || process.env["DATABASE_URL"];

if (!url) {
  throw new Error("DATABASE_URL_FILES (or DATABASE_URL as a fallback), ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/files.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
