import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startControlServer } from "../plugins/pi-codex/scripts/lib/control-server.mjs";

class FakePiRpcClient {
  constructor(sessionFile) {
    this.sessionFile = sessionFile;
    this.eventHandler = null;
    this.uiHandler = null;
    this.calls = [];
    this.exitError = null;
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
  }

  setEventHandler(handler) { this.eventHandler = handler; }
  setUiHandler(handler) { this.uiHandler = handler; }
  async start() {
    this.calls.push(["start"]);
    this.proc = { pid: 4242, exitCode: null, signalCode: null, killed: false };
  }
  async getState() {
    return {
      sessionId: "fake-pi-session",
      sessionFile: this.sessionFile,
      model: { provider: "fake", id: "test-model" }
    };
  }
  async setSessionName(name) { this.calls.push(["name", name]); }
  async setThinkingLevel(effort) { this.calls.push(["effort", effort]); }
  async sendPrompt(message, options) {
    this.calls.push(["prompt", message, options]);
    this.eventHandler?.({ type: "agent_start" });
    this.eventHandler?.({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "hello" }
    });
    this.eventHandler?.({
      type: "message_end",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "test reasoning" },
          { type: "text", text: "hello" }
        ]
      }
    });
    this.eventHandler?.({ type: "agent_settled" });
  }
  async steer(message) { this.calls.push(["steer", message]); }
  async followUp(message) { this.calls.push(["follow-up", message]); }
  async abort() { this.calls.push(["abort"]); }
  async getMessages() { return { messages: [{ role: "assistant", content: [{ type: "text", text: "hello" }] }] }; }
  respondToUi(id, response) { this.calls.push(["ui", id, response]); }
  async close() { this.calls.push(["close"]); this.resolveExit(); }
}

async function request(base, token, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  return {
    status: response.status,
    text,
    json: () => JSON.parse(text)
  };
}

async function waitFor(check, message, timeout = 2000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

describe("Pi Control Center", () => {
  it("serves the dashboard and controls a managed RPC session", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-control-test-"));
    const fakeSessionFile = path.join(cwd, "fake-session.jsonl");
    fs.writeFileSync(fakeSessionFile, [
      JSON.stringify({ type: "session", id: "fake-pi-session", timestamp: "2026-01-01T00:00:00.000Z", cwd }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: { role: "assistant", content: [{ type: "thinking", thinking: "reasoning" }, { type: "text", text: "answer" }] }
      }),
      JSON.stringify({ type: "compaction", timestamp: "2026-01-01T00:00:02.000Z", summary: "compact summary" })
    ].join("\n") + "\n");
    const clients = [];
    const token = "test-control-token";
    const control = await startControlServer({
      cwd,
      host: "127.0.0.1",
      port: 0,
      token,
      registerGlobal: false,
      clientFactory: () => {
        const client = new FakePiRpcClient(fakeSessionFile);
        clients.push(client);
        return client;
      }
    });
    const base = `http://127.0.0.1:${control.descriptor.port}`;

    try {
      const unauthorized = await fetch(`${base}/`);
      assert.equal(unauthorized.status, 401);

      const dashboard = await fetch(`${base}/?token=${token}`);
      assert.equal(dashboard.status, 200);
      const dashboardHtml = await dashboard.text();
      assert.match(dashboardHtml, /Pi Control Center/);
      assert.match(dashboardHtml, /id="collapse-mode"/);
      assert.match(dashboardHtml, /id="collapse-mode" type="checkbox"/);
      assert.match(dashboardHtml, /全部折叠/);
      assert.match(dashboardHtml, /class="history-panel"/);
      assert.match(dashboardHtml, /id="jump-latest"/);
      assert.match(dashboardHtml, /id="terminate-session"/);
      assert.match(dashboardHtml, /中断当前正在执行的一轮任务/);
      assert.match(dashboardHtml, /会话记录会保留，但不能继续对话/);
      assert.match(dashboardHtml, /停止 Pi RPC 进程并从控制中心删除该会话/);
      assert.match(dashboardHtml, /id="job-history"/);
      assert.match(dashboardHtml, /原始任务日志（诊断）/);
      assert.match(dashboardHtml, /<h2>会话<\/h2>/);
      assert.doesNotMatch(dashboardHtml, /插件任务/);
      assert.doesNotMatch(dashboardHtml, /id="job-list"/);
      assert.match(dashboardHtml, /styles\.css\?v=layout-8/);

      const dashboardScript = await request(base, token, "/app.js");
      assert.match(dashboardScript.text, /latestLines/);
      assert.match(dashboardScript.text, /renderThinkingEvent/);
      assert.match(dashboardScript.text, /followOutput/);
      assert.match(dashboardScript.text, /captureCardStates/);
      assert.match(dashboardScript.text, /collapseMode\.checked/);
      assert.match(dashboardScript.text, /renderToolCallDelta/);
      assert.match(dashboardScript.text, /renderMarkdownInto/);
      assert.match(dashboardScript.text, /splitMarkdownTableRow/);
      assert.match(dashboardScript.text, /session-history/);
      assert.match(dashboardScript.text, /managedJobIds/);
      assert.match(dashboardScript.text, /function jobIdLabel/);
      assert.match(dashboardScript.text, /Job ID：/);
      assert.doesNotMatch(dashboardScript.text, /jobIdLabel\(item, true\).*rpcProcessLabel\(item, true\)/);
      assert.match(dashboardScript.text, /terminateSession/);
      assert.doesNotMatch(dashboardScript.text, /nav-terminate/);
      assert.match(dashboardScript.text, /只读记录/);
      assert.match(dashboardScript.text, /sequence <= lastSequence/);
      assert.match(dashboardScript.text, /state\.source !== source/);
      assert.match(dashboardScript.text, /compacting: "压缩中"/);
      assert.doesNotMatch(dashboardScript.text, /compacting: "整理中"/);
      assert.doesNotMatch(dashboardScript.text, /response-elapsed/);

      const dashboardStyles = await request(base, token, "/styles.css");
      assert.match(dashboardStyles.text, /--text-soft/);
      assert.match(dashboardStyles.text, /status-chip::before/);
      assert.match(dashboardStyles.text, /\.status-chip\.running[^\n]+#ffb45e/);
      assert.match(dashboardStyles.text, /\.status-chip\.idle \{/);
      assert.match(dashboardStyles.text, /\.status-chip\.completed, \.status-chip\.done \{/);
      assert.doesNotMatch(dashboardStyles.text, /\.status-chip\.idle, \.status-chip\.completed/);
      assert.match(dashboardStyles.text, /Noto Sans SC/);
      assert.match(dashboardStyles.text, /-webkit-line-clamp: 3/);
      assert.match(dashboardStyles.text, /grid-template-columns: minmax\(0, 1fr\) auto/);
      assert.doesNotMatch(dashboardStyles.text, /\.nav-terminate/);

      const createdDirectory = path.join(cwd, "created", "on-demand");
      const created = await request(base, token, "/api/sessions", {
        method: "POST",
        body: JSON.stringify({ cwd: createdDirectory, name: "Test", effort: "high", prompt: "Do work" })
      });
      assert.equal(created.status, 201);
      const session = created.json();
      assert.equal(session.status, "starting");
      assert.equal(fs.statSync(createdDirectory).isDirectory(), true);
      const readySession = await waitFor(async () => {
        const overview = await request(base, token, "/api/overview");
        const current = overview.json().sessions.find((item) => item.id === session.id);
        return current?.piSessionId ? current : null;
      }, "managed session startup");
      assert.equal(readySession.piSessionId, "fake-pi-session");
      assert.equal(readySession.status, "idle");
      assert.equal(readySession.eventSequence, 6);
      assert.deepEqual(clients[0].calls.slice(0, 4), [
        ["start"], ["name", "Test"], ["effort", "high"], ["prompt", "Do work", undefined]
      ]);

      const streamAbort = new AbortController();
      try {
        const streamResponse = await fetch(`${base}/api/sessions/${session.id}/events?after=0`, {
          headers: { authorization: `Bearer ${token}`, "last-event-id": "5" },
          signal: streamAbort.signal
        });
        assert.equal(streamResponse.status, 200);
        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let streamed = "";
        while (!streamed.split("\n").some((line) => line.startsWith("data: "))) {
          const chunk = await reader.read();
          if (chunk.done) break;
          streamed += decoder.decode(chunk.value, { stream: true });
        }
        const dataLine = streamed.split("\n").find((line) => line.startsWith("data: "));
        assert.ok(dataLine, "reconnected SSE stream should replay the first unseen event");
        assert.equal(JSON.parse(dataLine.slice(6)).sequence, 6);
        await reader.cancel();
      } finally {
        streamAbort.abort();
      }

      const overview = await request(base, token, "/api/overview");
      assert.equal(overview.status, 200);
      assert.equal(overview.json().controlPid, process.pid);
      assert.equal(overview.json().sessions.length, 1);
      assert.equal(overview.json().sessions[0].rpcPid, 4242);
      assert.equal(overview.json().sessions[0].rpcProcessStatus, "running");

      const messages = await request(base, token, `/api/sessions/${session.id}/messages`);
      assert.equal(messages.json().messages[0].role, "assistant");

      for (const [action, message] of [["steer", "change"], ["follow-up", "then this"]]) {
        const result = await request(base, token, `/api/sessions/${session.id}/${action}`, {
          method: "POST", body: JSON.stringify({ message })
        });
        assert.equal(result.status, 202);
      }
      const aborted = await request(base, token, `/api/sessions/${session.id}/abort`, {
        method: "POST", body: "{}"
      });
      assert.equal(aborted.status, 202);
      assert.ok(clients[0].calls.some(([name]) => name === "abort"));

      const terminated = await request(base, token, `/api/sessions/${session.id}/terminate`, {
        method: "POST", body: "{}"
      });
      assert.equal(terminated.status, 200);
      assert.equal(terminated.json().terminated, true);
      assert.ok(clients[0].calls.some(([name]) => name === "close"));
      const afterTerminate = await request(base, token, "/api/overview");
      const preserved = afterTerminate.json().sessions.find((item) => item.id === session.id);
      assert.equal(preserved.status, "closed");
      assert.equal(preserved.rpcProcessStatus, "exited");
      const closedMessages = await request(base, token, `/api/sessions/${session.id}/messages`);
      assert.equal(closedMessages.json().messages[0].role, "assistant");

      const terminatedAgain = await request(base, token, `/api/sessions/${session.id}/terminate`, {
        method: "POST", body: "{}"
      });
      assert.equal(terminatedAgain.status, 200);
      assert.equal(terminatedAgain.json().terminated, false);

      const closed = await request(base, token, `/api/sessions/${session.id}`, { method: "DELETE" });
      assert.equal(closed.status, 200);
      assert.ok(clients[0].calls.some(([name]) => name === "close"));
      const afterClose = await request(base, token, "/api/overview");
      assert.equal(afterClose.json().sessions.some((item) => item.id === session.id), false);

      const crossWorkspace = path.join(cwd, "cross-workspace");
      const taskResult = await request(base, token, "/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          cwd: crossWorkspace,
          prompt: "Managed task",
          write: false,
          originSessionId: "caller-session-1"
        })
      });
      assert.equal(taskResult.status, 202);
      const task = taskResult.json();
      assert.match(task.jobId, /^task-/);
      const stored = await waitFor(async () => {
        const taskOverview = await request(base, token, "/api/overview");
        const current = taskOverview.json().jobs.find((job) => job.id === task.jobId);
        return current?.status === "completed" ? current : null;
      }, "managed task completion");
      assert.equal(stored.status, "completed");
      assert.equal(stored.piSessionId, "fake-pi-session");
      assert.equal(stored.workspaceRoot, crossWorkspace);
      assert.equal(fs.statSync(crossWorkspace).isDirectory(), true);
      assert.equal(stored.controlSessionId, task.controlSessionId);

      const taskClient = clients.at(-1);
      const clientCountBeforeContinue = clients.length;
      const continued = await request(base, token, "/api/continue", {
        method: "POST",
        body: JSON.stringify({
          cwd: crossWorkspace,
          jobId: task.jobId,
          prompt: "Fix the review findings",
          originSessionId: "caller-session-1"
        })
      });
      assert.equal(continued.status, 202);
      const continuation = continued.json();
      assert.equal(continuation.parentJobId, task.jobId);
      assert.equal(continuation.controlSessionId, task.controlSessionId);
      assert.equal(continuation.piSessionId, "fake-pi-session");
      assert.equal(continuation.rpcPid, 4242);
      assert.equal(continuation.reusedProcess, true);
      assert.equal(clients.length, clientCountBeforeContinue);
      assert.ok(taskClient.calls.some(([name, message]) => name === "prompt" && message === "Fix the review findings"));

      const continuedJob = await waitFor(async () => {
        const taskOverview = await request(base, token, "/api/overview");
        const current = taskOverview.json().jobs.find((job) => job.id === continuation.jobId);
        return current?.status === "completed" ? current : null;
      }, "continued task completion");
      assert.equal(continuedJob.parentJobId, task.jobId);
      assert.equal(continuedJob.controlSessionId, task.controlSessionId);
      assert.equal(continuedJob.rpcPid, 4242);
      assert.equal(continuedJob.reusedProcess, true);
      const continuedSession = await request(base, token, `/api/sessions/${task.controlSessionId}`);
      assert.deepEqual(continuedSession.json().jobIds, [task.jobId, continuation.jobId]);

      const continuedLatest = await request(base, token, "/api/continue", {
        method: "POST",
        body: JSON.stringify({
          cwd: crossWorkspace,
          prompt: "Continue the latest idle task",
          originSessionId: "caller-session-1"
        })
      });
      assert.equal(continuedLatest.status, 202);
      const latestContinuation = continuedLatest.json();
      assert.equal(latestContinuation.parentJobId, continuation.jobId);
      assert.equal(latestContinuation.controlSessionId, task.controlSessionId);
      assert.equal(latestContinuation.rpcPid, 4242);
      assert.equal(latestContinuation.reusedProcess, true);
      assert.equal(clients.length, clientCountBeforeContinue);
      await waitFor(async () => {
        const taskOverview = await request(base, token, "/api/overview");
        const current = taskOverview.json().jobs.find((job) => job.id === latestContinuation.jobId);
        return current?.status === "completed" ? current : null;
      }, "latest continued task completion");

      const liveSession = control.context.sessions.get(task.controlSessionId);
      liveSession.status = "running";
      liveSession.phase = "tool";
      liveSession.isStreaming = true;
      const busyContinue = await request(base, token, "/api/continue", {
        method: "POST",
        body: JSON.stringify({ cwd: crossWorkspace, jobId: task.jobId, prompt: "Do not queue this" })
      });
      assert.equal(busyContinue.status, 409);
      assert.match(busyContinue.json().error, /currently tool/);
      assert.equal(clients.length, clientCountBeforeContinue);
      liveSession.status = "idle";
      liveSession.phase = "idle";
      liveSession.isStreaming = false;

      const missingContinue = await request(base, token, "/api/continue", {
        method: "POST",
        body: JSON.stringify({ cwd: crossWorkspace, jobId: "task-does-not-exist", prompt: "Never spawn" })
      });
      assert.equal(missingContinue.status, 404);
      assert.match(missingContinue.json().error, /no live Control Session/);
      assert.equal(clients.length, clientCountBeforeContinue);

      const taskHistory = await request(base, token, `/api/jobs/${task.jobId}/session-history`);
      assert.equal(taskHistory.status, 200);
      assert.equal(taskHistory.json().available, true);
      assert.equal(taskHistory.json().entries.length, 2);
      assert.equal(taskHistory.json().entries[0].message.content[1].text, "answer");
      assert.equal(taskHistory.json().entries[1].type, "compaction");

      const deletedTask = await request(base, token, `/api/jobs/${task.jobId}`, { method: "DELETE" });
      assert.equal(deletedTask.status, 200);
      const afterDelete = await request(base, token, "/api/overview");
      assert.equal(afterDelete.json().jobs.some((job) => job.id === task.jobId), false);

      const terminatedTask = await request(base, token, `/api/sessions/${task.controlSessionId}/terminate`, {
        method: "POST", body: "{}"
      });
      assert.equal(terminatedTask.status, 200);
      assert.equal(terminatedTask.json().terminated, true);
      const continueTerminated = await request(base, token, "/api/continue", {
        method: "POST",
        body: JSON.stringify({
          cwd: crossWorkspace,
          jobId: latestContinuation.jobId,
          prompt: "This must not spawn a replacement"
        })
      });
      assert.equal(continueTerminated.status, 409);
      assert.match(continueTerminated.json().error, /original Pi RPC process is unavailable/);
      assert.equal(clients.length, clientCountBeforeContinue);
    } finally {
      await control.close();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects non-loopback binding without explicit opt-in", async () => {
    await assert.rejects(
      startControlServer({ cwd: process.cwd(), host: "0.0.0.0", port: 0, token: "x", registerGlobal: false }),
      /only binds to loopback/
    );
  });

  it("replays persisted events that were evicted from the live buffer", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-control-replay-test-"));
    const clients = [];
    const token = "test-replay-token";
    const control = await startControlServer({
      cwd,
      host: "127.0.0.1",
      port: 0,
      token,
      registerGlobal: false,
      clientFactory: () => {
        const client = new FakePiRpcClient(path.join(cwd, "session.jsonl"));
        clients.push(client);
        return client;
      }
    });
    const base = `http://127.0.0.1:${control.descriptor.port}`;

    try {
      const created = await request(base, token, "/api/sessions", {
        method: "POST",
        body: JSON.stringify({ cwd, name: "Replay test" })
      });
      const session = created.json();
      await waitFor(async () => {
        const overview = await request(base, token, "/api/overview");
        return overview.json().sessions.find((item) => item.id === session.id)?.piSessionId;
      }, "replay test session startup");

      for (let index = 0; index < 2501; index += 1) {
        clients[0].eventHandler?.({
          type: "message_update",
          assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: `chunk-${index}` }
        });
      }

      const streamAbort = new AbortController();
      try {
        const streamResponse = await fetch(`${base}/api/sessions/${session.id}/events?after=0`, {
          headers: { authorization: `Bearer ${token}` },
          signal: streamAbort.signal
        });
        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let streamed = "";
        while (!streamed.split("\n").some((line) => line.startsWith("data: "))) {
          const chunk = await reader.read();
          if (chunk.done) break;
          streamed += decoder.decode(chunk.value, { stream: true });
        }
        const firstDataLine = streamed.split("\n").find((line) => line.startsWith("data: "));
        assert.ok(firstDataLine, "SSE replay should include persisted history");
        assert.equal(JSON.parse(firstDataLine.slice(6)).sequence, 1);
        await reader.cancel();
      } finally {
        streamAbort.abort();
      }
    } finally {
      await control.close();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
