// Stops the node process that listens on port 3000 (usually an old "next dev" left running), then exits.
// Used by "pnpm dev:fresh". It only stops node.exe, never another kind of program.
import { execSync } from "node:child_process";

const PORT = 3000;

function listeningPids() {
  const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[3] === "LISTENING" && parts[1]?.endsWith(`:${PORT}`)) pids.add(parts[4]);
  }
  return [...pids];
}

for (const pid of listeningPids()) {
  const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: "utf8" });
  if (task.toLowerCase().includes('"node.exe"')) {
    execSync(`taskkill /PID ${pid} /F`);
    console.log(`Stopped old node server (PID ${pid}) on port ${PORT}.`);
  } else {
    console.log(`Port ${PORT} is used by a program that is not node (PID ${pid}). Left it alone.`);
  }
}
