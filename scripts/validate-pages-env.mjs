import { pathToFileURL } from "node:url";

const requiredPagesEnv = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY"
];

export function missingPagesEnv(env = process.env) {
  return requiredPagesEnv.filter((name) => !env[name]?.trim());
}

const isMain = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const missing = missingPagesEnv();
  if (missing.length > 0) {
    console.error(`Missing required GitHub Pages variables: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}
