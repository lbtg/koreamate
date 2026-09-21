import { spawnSync } from "node:child_process";
const preview = process.argv.includes("--preview");
const value = process.env.VITE_API_ORIGIN;
if (!value)
  throw Error(
    "Set VITE_API_ORIGIN to the HTTPS website/gateway origin before building the App.",
  );
const url = new URL(value);
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
)
  throw Error(
    "VITE_API_ORIGIN must be an HTTPS origin, with no path or credentials.",
  );
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    ...(preview ? ["--mode", "showcase"] : []),
  ],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
