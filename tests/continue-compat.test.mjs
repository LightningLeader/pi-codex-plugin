import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPANION = path.join(REPO_ROOT, "plugins/pi/scripts/pi-companion.mjs");

describe("legacy Control Center continuation", () => {
  it("continues the exact registered RPC session without the new /api/continue endpoint", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-continue-compat-"));
    const cwd = path.join(root, "workspace");
    const pluginData = path.join(root, "plugin-data");
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(path.join(pluginData, "state"), { recursive: true });
    const token = "compat-token";
    let prompt = null;
    let eventSequence = 10;

    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      const send = (status, payload) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(`${JSON.stringify(payload)}\n`);
      };
      if (request.headers.authorization !== `Bearer ${token}`) return send(401, { error: "unauthorized" });
      if (request.method === "POST" && url.pathname === "/api/continue") {
        return send(404, { error: "Unknown API endpoint." });
      }
      if (request.method === "POST" && url.pathname === "/api/sessions/session-old/prompt") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        prompt = JSON.parse(Buffer.concat(chunks).toString("utf8")).message;
        eventSequence += 2;
        return send(202, { accepted: true, action: "prompt" });
      }
      if (request.method === "GET" && url.pathname === "/api/overview") {
        return send(200, {
          workspaceRoot: cwd,
          sessions: [{
            id: "session-old",
            piSessionId: "pi-old",
            cwd,
            jobId: "task-old",
            jobIds: ["task-old"],
            rpcPid: 4242,
            rpcProcessStatus: "running",
            status: "idle",
            phase: "idle",
            isStreaming: false,
            eventSequence
          }],
          jobs: []
        });
      }
      if (request.method === "GET" && url.pathname === "/api/sessions/session-old/messages") {
        return send(200, { messages: [{ role: "assistant", content: [{ type: "text", text: "legacy answer" }] }] });
      }
      return send(404, { error: "not found" });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    fs.writeFileSync(path.join(pluginData, "state", "control-server-global.json"), `${JSON.stringify({
      pid: process.pid,
      host: "127.0.0.1",
      port,
      token,
      workspaceRoot: cwd
    })}\n`);

    try {
      const result = await execFileAsync(process.execPath, [
        COMPANION,
        "continue",
        "--cwd",
        cwd,
        "--job",
        "task-old",
        "follow up"
      ], {
        cwd,
        env: { ...process.env, CLAUDE_PLUGIN_DATA: pluginData }
      });
      assert.equal(prompt, "follow up");
      assert.equal(result.stdout, "legacy answer\n");
      assert.equal(result.stderr, "");
    } finally {
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
