#!/usr/bin/env node
/**
 * One-time backend setup: creates backend/.venv if it doesn't exist yet,
 * then installs/updates backend/requirements.txt into it.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { backendDir, venvExists, venvPythonPath, findSystemPython } = require("./python-utils");

function run(command, args, options = {}) {
  console.log(`[setup] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error || result.status !== 0) {
    console.error(`[setup] Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

if (!venvExists()) {
  const systemPython = findSystemPython();
  if (!systemPython) {
    console.error(
      "[setup] Could not find a Python interpreter on PATH (tried py/python/python3).\n" +
        "[setup] Install Python 3.11+ from https://python.org and re-run `npm run setup:backend`.",
    );
    process.exit(1);
  }
  console.log(`[setup] Creating virtualenv at backend/.venv using "${systemPython}"...`);
  run(systemPython, ["-m", "venv", ".venv"], { cwd: backendDir });
} else {
  console.log("[setup] backend/.venv already exists, reusing it.");
}

const python = venvPythonPath();
run(python, ["-m", "pip", "install", "--upgrade", "pip"], { cwd: backendDir });
run(python, ["-m", "pip", "install", "-r", path.join(backendDir, "requirements.txt")], { cwd: backendDir });

console.log("\n[setup] Backend ready. Copy backend/.env.example to backend/.env if you need to customize it.");
