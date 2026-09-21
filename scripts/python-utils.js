/**
 * Shared helpers for locating a Python interpreter, used by both
 * run-backend.js (dev/test launcher) and setup-backend.js (venv creation).
 */
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const isWindows = process.platform === "win32";
const backendDir = path.join(__dirname, "..", "backend");

function venvPythonPath() {
  return isWindows
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : path.join(backendDir, ".venv", "bin", "python");
}

function venvExists() {
  return existsSync(venvPythonPath());
}

/** First interpreter on PATH that actually runs, in platform-appropriate order. */
function findSystemPython() {
  const candidates = isWindows ? ["py", "python", "python3"] : ["python3", "python"];
  for (const candidate of candidates) {
    const check = spawnSync(candidate, ["--version"]);
    if (!check.error && check.status === 0) return candidate;
  }
  return null;
}

module.exports = { isWindows, backendDir, venvPythonPath, venvExists, findSystemPython };
