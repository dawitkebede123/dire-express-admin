import { spawn, execSync } from "node:child_process";
import net from "node:net";
import process from "node:process";

function canConnect(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

function wslIp() {
  try {
    const out = execSync("wsl -e hostname -I", { encoding: "utf8" }).trim();
    return out.split(/\s+/).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function withHost(url, host, port) {
  const parsed = new URL(url);
  parsed.hostname = host;
  parsed.port = String(port);
  return parsed.toString();
}

async function resolveDatabaseUrl() {
  const base =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/dire_express?schema=public";
  const parsed = new URL(base);
  const port = Number(parsed.port || 5433);

  if (await canConnect(parsed.hostname, port)) {
    return base;
  }

  if (process.platform === "win32") {
    const ip = wslIp();
    if (ip && (await canConnect(ip, port))) {
      const resolved = withHost(base, ip, port);
      console.log(`[db] localhost:${port} unreachable; using WSL host ${ip}:${port}`);
      return resolved;
    }
  }

  return base;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/windows-db-env.mjs <command> [...args]");
  process.exit(1);
}

const databaseUrl = await resolveDatabaseUrl();
const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
