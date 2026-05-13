import { config } from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const envPath = join(projectRoot, ".env");

const result = config({ path: envPath });

if (result.error) {
  const code = (result.error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") {
    console.log(`[env] No file at ${envPath}; using process.env only`);
  } else {
    console.warn(`[env] ${result.error.message}`);
  }
} else {
  console.log(`[env] Loaded ${envPath}`);
}
