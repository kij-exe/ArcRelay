import { config } from "dotenv";
import { existsSync } from "fs";
import path from "path";

const defaultEnvPath = path.resolve(process.cwd(), ".env");
const envPath = process.env.ENV_FILE || defaultEnvPath;

if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  config();
}

