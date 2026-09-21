#!/usr/bin/env node
/**
 * Cross-platform launcher for the FastAPI backend.
 *
 * Runs uvicorn by default, or pytest with `test` as the first arg. Uses the
 * project's virtualenv at backend/.venv when present, falling back to
 * whatever python/python3/py is on PATH otherwise (with a warning, since
 * dependencies may not be installed there).
 */
const { spawn, spawnSync } = require("node:child_process");
const { backendDir, isWindows, venvExists, venvPythonPath, findSystemPython } = require("./python-utils");

function resolvePython() {
  if (venvExists()) return venvPythonPath();

  console.warn(
    "\n[backend] No virtualenv found at backend/.venv — falling back to the system Python.\n" +
      "[backend] Run `npm run setup:backend` once to create it and install dependencies.\n",
  );
  const fallback = findSystemPython();
  if (!fallback) {
    console.error(
      "[backend] Could not find a Python interpreter on PATH (tried py/python/python3).\n" +
        "[backend] Install Python 3.11+, then run `npm run setup:backend`.",
    );
    process.exit(1);
  }
  return fallback;
}

const mode = process.argv[2];
const python = resolvePython();
const args =
  mode === "test"
    ? ["-m", "pytest"]
    : ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"];

console.log(`[backend] ${python} ${args.join(" ")}  (cwd: backend)`);

const child = spawn(python, args, { cwd: backendDir, stdio: "inherit" });

function shutdown(signal) {
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else if (child.pid) {
    try {
      child.kill(signal);
    } catch {
      /* already exited */
    }
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("error", (err) => {
  console.error(`[backend] Failed to start: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
