import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import http from "node:http";
import localtunnel from "localtunnel";
import QRCode from "qrcode";

const PORT = Number(process.env.PORT || 3000);
const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, ".share");
const qrFilePath = path.join(outputDir, "app-share-qr.png");
const urlFilePath = path.join(outputDir, "app-share-url.txt");
const cloudflaredPath = path.join(projectRoot, "scripts", "bin", "cloudflared.exe");

function getDevCommand() {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "npm", "run", "dev"],
    };
  }

  return {
    command: "npm",
    args: ["run", "dev"],
  };
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        candidates.push({ name: name.toLowerCase(), address: entry.address });
      }
    }
  }

  const preferred = [
    (candidate) => candidate.address.startsWith("192.168."),
    (candidate) => candidate.address.startsWith("172.") && !candidate.name.includes("vpn"),
    (candidate) => candidate.address.startsWith("10.") && !candidate.name.includes("vpn"),
  ];

  for (const rule of preferred) {
    const found = candidates.find(rule);
    if (found) {
      return found.address;
    }
  }

  if (candidates.length) {
    return candidates[0].address;
  }

  return "127.0.0.1";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 45000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500);
      });

      req.on("error", () => resolve(false));
      req.setTimeout(3000, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (ok) {
      return;
    }

    await wait(1000);
  }

  throw new Error(`Server did not become ready within ${timeoutMs / 1000}s`);
}

async function writeQrArtifacts(publicUrl, localUrl) {
  fs.mkdirSync(outputDir, { recursive: true });
  await QRCode.toFile(qrFilePath, publicUrl, {
    type: "png",
    margin: 1,
    width: 360,
  });

  fs.writeFileSync(
    urlFilePath,
    `Public URL: ${publicUrl}\nLocal URL: ${localUrl}\nGenerated At: ${new Date().toISOString()}\n`,
    "utf8",
  );

  const terminalQr = await QRCode.toString(publicUrl, {
    type: "terminal",
    small: true,
  });

  return terminalQr;
}

async function createCloudflaredTunnel() {
  if (!fs.existsSync(cloudflaredPath)) {
    return null;
  }

  return await new Promise((resolve, reject) => {
    const tunnelProcess = spawn(
      cloudflaredPath,
      ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"],
      {
        cwd: projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        tunnelProcess.kill();
        reject(new Error("cloudflared tunnel startup timed out"));
      }
    }, 30000);

    const handleOutput = (chunk) => {
      const text = String(chunk);
      const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/iu);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({
          url: match[0],
          provider: "cloudflared",
          close: () => tunnelProcess.kill(),
          process: tunnelProcess,
        });
      }
    };

    tunnelProcess.stdout.on("data", handleOutput);
    tunnelProcess.stderr.on("data", handleOutput);

    tunnelProcess.on("exit", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited before producing a URL (${code ?? "unknown"})`));
      }
    });
  });
}

async function createLocaltunnel() {
  const tunnel = await localtunnel({
    port: PORT,
    local_host: "127.0.0.1",
    subdomain: process.env.SHARE_SUBDOMAIN || undefined,
  });

  return {
    url: tunnel.url,
    provider: "localtunnel",
    close: () => tunnel.close(),
    process: tunnel,
  };
}

async function main() {
  const devCommand = getDevCommand();
  const localIp = getLocalIpAddress();
  const localUrl = `http://${localIp}:${PORT}`;
  const localhostUrl = `http://127.0.0.1:${PORT}`;

  console.log(`Starting dev server on port ${PORT}...`);
  const serverProcess = spawn(devCommand.command, devCommand.args, {
    cwd: projectRoot,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT) },
  });

  serverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
  });

  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  serverProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Dev server exited with code ${code}`);
      process.exit(code ?? 1);
    }
  });

  await waitForServer(localhostUrl);
  console.log(`Local server is ready: ${localUrl}`);
  console.log("Creating public tunnel...");
  let tunnel;
  try {
    tunnel = await createCloudflaredTunnel();
  } catch (error) {
    console.warn(`Cloudflared unavailable: ${error.message}`);
  }

  if (!tunnel) {
    tunnel = await createLocaltunnel();
  }

  const publicUrl = tunnel.url;
  const terminalQr = await writeQrArtifacts(publicUrl, localUrl);

  console.log("");
  console.log("Scan this QR code with your phone:");
  console.log(terminalQr);
  console.log(`Public URL: ${publicUrl}`);
  console.log(`Local URL:  ${localUrl}`);
  console.log(`Tunnel:     ${tunnel.provider}`);
  console.log(`QR PNG:     ${qrFilePath}`);
  console.log(`URL TXT:    ${urlFilePath}`);
  console.log("");
  console.log("If your phone is on the same Wi-Fi, the local URL is usually faster.");
  console.log("If not, scan the QR code or open the public URL.");

  if (typeof tunnel.process?.on === "function") {
    tunnel.process.on("close", () => {
      console.log("Tunnel closed.");
    });
  }

  const shutdown = () => {
    console.log("\nShutting down share session...");
    tunnel.close();
    serverProcess.kill();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Share mode failed:", error.message);
  process.exit(1);
});
