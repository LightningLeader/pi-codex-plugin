import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { buildStatusSnapshot } from "./job-control.mjs";
import { PiRpcClient } from "./pi-rpc.mjs";
import {
  generateJobId,
  listWatchers,
  removeJob,
  resolveJobLogFile,
  resolveStateDir,
  upsertJob,
  writeJobFile
} from "./state.mjs";
import { appendLogLine } from "./tracked-jobs.mjs";
import { terminateProcessTree } from "./process.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

const UI_DIR = path.resolve(fileURLToPath(new URL("../../control-ui", import.meta.url)));
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;
const MAX_BUFFERED_EVENTS = 2500;
const MAX_LEGACY_LOG_BYTES = 1024 * 1024;
const MAX_PI_SESSION_HISTORY_BYTES = 32 * 1024 * 1024;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

function jsonResponse(response, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function errorResponse(response, status, message) {
  jsonResponse(response, status, { error: message });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie ?? "").split(";");
  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function normalizeEvent(event) {
  const encoded = JSON.stringify(event);
  if (Buffer.byteLength(encoded) <= MAX_EVENT_BYTES) {
    return event;
  }
  return {
    type: event?.type ?? "oversized_event",
    truncated: true,
    size: Buffer.byteLength(encoded),
    summary: "Event exceeded the dashboard payload limit. The canonical result remains in the Pi session."
  };
}

function safeSessionName(value, fallback) {
  const name = String(value ?? "").trim().replace(/[\r\n\t]+/g, " ");
  return name.slice(0, 120) || fallback;
}

function publicSession(session) {
  const rpcProcess = session.client?.proc ?? null;
  const rpcPid = Number.isInteger(rpcProcess?.pid) ? rpcProcess.pid : null;
  const rpcExitCode = Number.isInteger(rpcProcess?.exitCode) ? rpcProcess.exitCode : null;
  const rpcSignal = rpcProcess?.signalCode ?? null;
  const rpcProcessStatus = session.status === "closed"
    ? "exited"
    : rpcPid === null
    ? "not-started"
    : rpcExitCode !== null || rpcSignal
      ? "exited"
      : rpcProcess.killed
        ? "stopping"
        : "running";
  return {
    id: session.id,
    piSessionId: session.piSessionId,
    sessionFile: session.sessionFile,
    name: session.name,
    cwd: session.cwd,
    model: session.model,
    effort: session.effort,
    readOnly: session.readOnly,
    status: session.status,
    phase: session.phase,
    isStreaming: session.isStreaming,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastError: session.lastError,
    eventSequence: session.sequence,
    pendingUiRequests: [...session.pendingUiRequests.values()].map((request) => ({
      id: request.id,
      method: request.method,
      title: request.title ?? null,
      message: request.message ?? null,
      options: request.options ?? null,
      placeholder: request.placeholder ?? null,
      prefill: request.prefill ?? null,
      timeout: request.timeout ?? null
    })),
    jobId: session.jobId ?? null,
    jobIds: [...session.jobs.keys()],
    rpcPid,
    rpcProcessStatus,
    rpcExitCode,
    rpcSignal
  };
}

function buildSpawnArgs(options) {
  const args = [];
  if (options.resumeSession) {
    args.push("--session", String(options.resumeSession));
  }
  if (options.readOnly) {
    args.push("--tools", "read,grep,find,ls");
  }
  if (options.model) {
    args.push("--model", String(options.model));
  }
  return args;
}

function createControlSession(id, options) {
  const timestamp = new Date().toISOString();
  return {
    id,
    client: null,
    piSessionId: null,
    sessionFile: null,
    name: safeSessionName(options.name, `Pi session ${id.slice(-6)}`),
    cwd: options.cwd,
    model: options.model ?? null,
    effort: options.effort ?? null,
    readOnly: Boolean(options.readOnly),
    status: "starting",
    phase: "starting",
    isStreaming: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
    sequence: 0,
    events: [],
    subscribers: new Set(),
    pendingUiRequests: new Map(),
    closedByUser: false,
    jobId: options.jobId ?? null,
    job: options.job ?? null,
    jobs: new Map(options.job?.id ? [[options.job.id, options.job]] : []),
    originSessionId: options.originSessionId ?? options.job?.sessionId ?? null,
    lastAssistantText: "",
    reasoningSections: [],
    abortRequested: false
  };
}

function setActiveManagedJob(session, job) {
  session.job = job;
  session.jobId = job.id;
  session.jobs.set(job.id, job);
  session.lastAssistantText = "";
  session.reasoningSections = [];
  session.abortRequested = false;
  session.lastError = null;
}

function extractMessageContent(message, type, field) {
  if (!Array.isArray(message?.content)) {
    return [];
  }
  return message.content
    .filter((block) => block?.type === type && typeof block[field] === "string")
    .map((block) => block[field])
    .filter(Boolean);
}

function finalizeManagedJob(context, session, status, errorMessage = null) {
  if (!session.job || !["queued", "running"].includes(session.job.status)) {
    return;
  }
  const completedAt = new Date().toISOString();
  const rawOutput = session.lastAssistantText;
  const completed = {
    ...session.job,
    status,
    phase: status === "completed" ? "done" : status,
    completedAt,
    pid: null,
    piSessionId: session.piSessionId,
    piSessionFile: session.sessionFile,
    controlSessionId: session.id ?? session.job.controlSessionId ?? null,
    rpcPid: Number.isInteger(session.client?.proc?.pid) ? session.client.proc.pid : null,
    errorMessage,
    result: {
      status: status === "completed" ? 0 : 1,
      piSessionId: session.piSessionId,
      piSessionFile: session.sessionFile,
      rawOutput,
      reasoningSummary: session.reasoningSections
    },
    rendered: rawOutput ? `${rawOutput.replace(/\n+$/, "")}\n` : `${errorMessage ?? "Pi session ended without a final message."}\n`
  };
  session.job = completed;
  session.jobs?.set(completed.id, completed);
  const jobWorkspaceRoot = completed.workspaceRoot ?? context.workspaceRoot;
  writeJobFile(jobWorkspaceRoot, completed.id, completed);
  upsertJob(jobWorkspaceRoot, {
    id: completed.id,
    status: completed.status,
    phase: completed.phase,
    pid: null,
    piSessionId: completed.piSessionId,
    piSessionFile: completed.piSessionFile,
    summary: rawOutput.split(/\r?\n/).find((line) => line.trim())?.trim() ?? completed.summary,
    completedAt,
    errorMessage
  });
  appendLogLine(completed.logFile, `Control session ${status}.`);
}

function eventLogPath(stateDir, sessionId) {
  const directory = path.join(stateDir, "control-events");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    // Best effort on filesystems without POSIX permissions.
  }
  return path.join(directory, `${sessionId}.jsonl`);
}

function readPersistedEventsBefore(stateDir, sessionId, after, before) {
  if (after >= before - 1) return [];
  const logFile = eventLogPath(stateDir, sessionId);
  if (!fs.existsSync(logFile)) return [];
  const events = [];
  for (const line of fs.readFileSync(logFile, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.sessionId === sessionId && event.sequence > after && event.sequence < before) {
        events.push(event);
      }
    } catch {
      // Ignore a trailing partial record if a reader catches an append in progress.
    }
  }
  return events;
}

function publishEvent(stateDir, session, payload) {
  const event = {
    sessionId: session.id,
    sequence: ++session.sequence,
    timestamp: new Date().toISOString(),
    ...normalizeEvent(payload)
  };
  session.updatedAt = event.timestamp;
  session.events.push(event);
  if (session.events.length > MAX_BUFFERED_EVENTS) {
    session.events.splice(0, session.events.length - MAX_BUFFERED_EVENTS);
  }
  fs.appendFileSync(eventLogPath(stateDir, session.id), `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  const frame = `id: ${event.sequence}\nevent: pi-event\ndata: ${JSON.stringify(event)}\n\n`;
  for (const response of session.subscribers) {
    response.write(frame);
  }
  return event;
}

function updateSessionFromEvent(context, session, event) {
  switch (event.type) {
    case "agent_start":
      session.status = "running";
      session.phase = "running";
      session.isStreaming = true;
      break;
    case "turn_start":
      session.status = "running";
      session.phase = "thinking";
      session.isStreaming = true;
      break;
    case "message_update":
      session.phase = "responding";
      session.isStreaming = true;
      break;
    case "message_end": {
      if (event.message?.role === "assistant") {
        const text = extractMessageContent(event.message, "text", "text").join("");
        const thinking = extractMessageContent(event.message, "thinking", "thinking");
        if (text) session.lastAssistantText = text;
        if (thinking.length > 0) session.reasoningSections.push(...thinking);
      }
      break;
    }
    case "tool_execution_start":
    case "tool_execution_update":
      session.phase = "tool";
      session.isStreaming = true;
      break;
    case "compaction_start":
      session.phase = "compacting";
      break;
    case "auto_retry_start":
      session.phase = "retrying";
      break;
    case "agent_settled":
      session.status = "idle";
      session.phase = "idle";
      session.isStreaming = false;
      finalizeManagedJob(context, session, session.abortRequested ? "cancelled" : "completed");
      break;
    case "extension_error":
      session.lastError = event.errorMessage ?? event.message ?? "Pi extension error";
      break;
    default:
      break;
  }
}

function startManagedSession(context, options) {
  const id = `session-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const cwd = path.resolve(options.cwd || context.workspaceRoot);
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
  } else if (!fs.statSync(cwd).isDirectory()) {
    throw new Error(`Working directory path is not a directory: ${cwd}`);
  }

  const session = createControlSession(id, { ...options, cwd });
  const client = context.createClient(cwd, {
    spawnArgs: buildSpawnArgs(options),
    env: process.env
  });
  session.client = client;
  context.sessions.set(id, session);

  client.setEventHandler((event) => {
    updateSessionFromEvent(context, session, event);
    publishEvent(context.stateDir, session, event);
  });
  client.setUiHandler((request) => {
    if (["select", "input", "editor", "confirm"].includes(request.method)) {
      session.pendingUiRequests.set(request.id, request);
    }
    publishEvent(context.stateDir, session, { type: "extension_ui_request", request });
  });

  session.ready = (async () => {
    try {
      await client.start();
      client.exitPromise.then(() => {
        session.isStreaming = false;
        session.status = session.closedByUser ? "closed" : "disconnected";
        session.phase = session.status;
        session.lastError = client.exitError?.message ?? session.lastError;
        if (!session.closedByUser) {
          finalizeManagedJob(context, session, "failed", session.lastError ?? "Pi RPC process disconnected.");
        }
        publishEvent(context.stateDir, session, {
          type: "rpc_exit",
          status: session.status,
          error: session.lastError
        });
      });

      const state = await client.getState();
      session.piSessionId = state?.sessionId ?? null;
      session.sessionFile = state?.sessionFile ?? null;
      session.model = state?.model ?? session.model;
      session.status = "idle";
      session.phase = "idle";
      if (session.name) {
        await client.setSessionName(session.name).catch(() => {});
      }
      if (session.effort) {
        await client.setThinkingLevel(session.effort).catch(() => {});
      }
      publishEvent(context.stateDir, session, { type: "control_session_ready", state });

      if (String(options.prompt ?? "").trim()) {
        const prompt = String(options.prompt).trim();
        publishEvent(context.stateDir, session, { type: "control_user_message", action: "prompt", message: prompt });
        await client.sendPrompt(prompt);
      }
      return session;
    } catch (error) {
      session.status = "failed";
      session.phase = "failed";
      session.lastError = error instanceof Error ? error.message : String(error);
      publishEvent(context.stateDir, session, { type: "control_session_error", error: session.lastError });
      finalizeManagedJob(context, session, "failed", session.lastError);
      await client.close().catch(() => {});
      return session;
    }
  })();
  session.ready.catch(() => {});
  return session;
}

function authenticate(context, request, url) {
  const queryToken = url.searchParams.get("token");
  const bearer = String(request.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const cookieToken = readCookie(request, "pi_control_token");
  return queryToken === context.token || bearer === context.token || cookieToken === context.token;
}

function validateOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function serveStatic(response, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(UI_DIR, relative);
  if (!target.startsWith(`${UI_DIR}${path.sep}`) && target !== path.join(UI_DIR, "index.html")) {
    errorResponse(response, 404, "Not found");
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    errorResponse(response, 404, "Not found");
    return;
  }
  const content = fs.readFileSync(target);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES.get(path.extname(target)) ?? "application/octet-stream",
    "content-length": content.length,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(content);
}

function readLegacyLog(job) {
  if (!job?.logFile || !fs.existsSync(job.logFile)) {
    return "";
  }
  const stat = fs.statSync(job.logFile);
  const start = Math.max(0, stat.size - MAX_LEGACY_LOG_BYTES);
  const fd = fs.openSync(job.logFile, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return `${start > 0 ? "[Earlier log output truncated]\n" : ""}${buffer.toString("utf8")}`;
  } finally {
    fs.closeSync(fd);
  }
}

function readPiSessionHistory(job) {
  const sessionFile = job?.piSessionFile;
  if (!sessionFile || !fs.existsSync(sessionFile) || !fs.statSync(sessionFile).isFile()) {
    return { available: false, sessionFile: sessionFile ?? null, entries: [], truncated: false, size: 0, modifiedAt: null };
  }

  const stat = fs.statSync(sessionFile);
  const start = Math.max(0, stat.size - MAX_PI_SESSION_HISTORY_BYTES);
  const fd = fs.openSync(sessionFile, "r");
  let text;
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    text = buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
  if (start > 0) {
    const firstNewline = text.indexOf("\n");
    text = firstNewline === -1 ? "" : text.slice(firstNewline + 1);
  }

  const entries = [];
  let parseErrors = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.type === "message" && record.message) {
        entries.push({ type: "message", timestamp: record.timestamp ?? null, message: record.message });
      } else if (["compaction", "branch_summary"].includes(record.type)) {
        entries.push({
          type: "compaction",
          timestamp: record.timestamp ?? null,
          summary: record.summary ?? record.content ?? "上下文已压缩。"
        });
      }
    } catch {
      parseErrors += 1;
    }
  }
  return {
    available: true,
    sessionFile,
    entries,
    truncated: start > 0,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    parseErrors
  };
}

function managedJobs(context) {
  return [...context.sessions.values()].flatMap((session) => [...session.jobs.values()]);
}

function sessionProcessLive(session) {
  const proc = session.client?.proc;
  return Boolean(
    proc &&
    Number.isInteger(proc.pid) &&
    proc.exitCode === null &&
    !proc.signalCode &&
    !proc.killed &&
    !session.client.closed &&
    session.status !== "closed" &&
    session.status !== "disconnected"
  );
}

function sessionMatchesReference(session, reference) {
  if (!reference) return true;
  return session.id === reference || session.piSessionId === reference || session.jobs.has(reference);
}

function findContinuationSession(context, { reference, workspaceRoot, originSessionId }) {
  let workspaceCandidates = [...context.sessions.values()]
    .filter((session) => resolveWorkspaceRoot(session.cwd) === workspaceRoot)
    .filter((session) => session.jobs.size > 0)
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));

  if (reference) {
    return workspaceCandidates.find((session) => sessionMatchesReference(session, reference)) ?? null;
  }
  if (originSessionId) {
    workspaceCandidates = workspaceCandidates.filter((session) => session.originSessionId === originSessionId);
  }
  return workspaceCandidates.find((session) =>
    sessionProcessLive(session) && session.status === "idle" && !session.isStreaming
  ) ?? null;
}

function createManagedTaskJob({ workspaceRoot, prompt, write, request, originSessionId = null, parentJobId = null }) {
  const jobId = generateJobId("task");
  const timestamp = new Date().toISOString();
  const logFile = resolveJobLogFile(workspaceRoot, jobId);
  const job = {
    id: jobId,
    kind: "task",
    kindLabel: "task",
    title: parentJobId ? "Pi Continue" : "Pi Task",
    jobClass: "task",
    summary: prompt.replace(/\s+/g, " ").slice(0, 120),
    workspaceRoot,
    write: Boolean(write),
    status: "running",
    phase: "starting",
    pid: process.pid,
    logFile,
    createdAt: timestamp,
    startedAt: timestamp,
    request,
    ...(originSessionId ? { sessionId: originSessionId, originSessionId } : {}),
    ...(parentJobId ? { parentJobId, continuation: true } : {})
  };
  fs.writeFileSync(logFile, "", { mode: 0o600 });
  appendLogLine(logFile, parentJobId
    ? `Continuing Pi Task ${parentJobId} in its existing Control Session.`
    : "Starting Pi Task through Pi Control Center.");
  writeJobFile(workspaceRoot, jobId, job);
  upsertJob(workspaceRoot, job);
  return job;
}

function persistManagedJob(job) {
  writeJobFile(job.workspaceRoot, job.id, job);
  upsertJob(job.workspaceRoot, job);
}

function findVisibleJob(context, jobId) {
  const managedJob = managedJobs(context).find((job) => job?.id === jobId);
  if (managedJob) return managedJob;
  const jobs = buildStatusSnapshot(context.workspaceRoot, {
    all: true,
    env: { PI_COMPANION_SESSION_ID: "" }
  });
  return [...jobs.running, ...(jobs.latestFinished ? [jobs.latestFinished] : []), ...jobs.recent]
    .find((candidate) => candidate.id === jobId) ?? null;
}

async function handleApi(context, request, response, url) {
  if (!authenticate(context, request, url)) {
    errorResponse(response, 401, "Invalid or missing control token.");
    return;
  }
  if (request.method !== "GET" && !validateOrigin(request)) {
    errorResponse(response, 403, "Untrusted request origin.");
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/overview") {
    const jobs = buildStatusSnapshot(context.workspaceRoot, {
      all: true,
      env: { PI_COMPANION_SESSION_ID: "" }
    });
    const persistedJobs = [...jobs.running, ...(jobs.latestFinished ? [jobs.latestFinished] : []), ...jobs.recent];
    const liveManagedJobs = managedJobs(context);
    const mergedJobs = [...liveManagedJobs, ...persistedJobs]
      .filter((job, index, all) => all.findIndex((candidate) => candidate.id === job.id) === index);
    const watcherRoots = new Set([
      context.workspaceRoot,
      ...mergedJobs.map((job) => job.workspaceRoot).filter(Boolean)
    ]);
    const watchers = [...watcherRoots]
      .flatMap((workspaceRoot) => listWatchers(workspaceRoot))
      .filter((watcher, index, all) => all.findIndex((candidate) => candidate.jobId === watcher.jobId) === index);
    jsonResponse(response, 200, {
      workspaceRoot: context.workspaceRoot,
      controlPid: process.pid,
      sessions: [...context.sessions.values()].map(publicSession),
      jobs: mergedJobs,
      watchers
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/shutdown") {
    if (context.shutdownRequested) {
      jsonResponse(response, 202, { accepted: true, alreadyRequested: true });
      return;
    }
    context.shutdownRequested = true;
    response.once("finish", () => context.performShutdown?.());
    jsonResponse(response, 202, {
      accepted: true,
      liveSessions: [...context.sessions.values()].filter(sessionProcessLive).length
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sessions") {
    const body = await readJsonBody(request);
    const session = startManagedSession(context, body);
    jsonResponse(response, 201, publicSession(session));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJsonBody(request);
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      errorResponse(response, 400, "A non-empty task prompt is required.");
      return;
    }
    const taskWorkspaceRoot = resolveWorkspaceRoot(body.cwd || context.workspaceRoot);
    const job = createManagedTaskJob({
      workspaceRoot: taskWorkspaceRoot,
      prompt,
      write: body.write,
      request: body,
      originSessionId: body.originSessionId ?? null
    });
    try {
      const session = startManagedSession(context, {
        ...body,
        prompt,
        readOnly: !body.write,
        name: body.name || `Pi Task: ${job.summary}`,
        jobId: job.id,
        job
      });
      job.controlSessionId = session.id;
      session.originSessionId = body.originSessionId ?? session.originSessionId;
      persistManagedJob(job);
      appendLogLine(job.logFile, `Control session created: ${session.id}.`);
      jsonResponse(response, 202, {
        jobId: job.id,
        controlSessionId: session.id,
        piSessionId: session.piSessionId,
        status: "running",
        title: job.title,
        summary: job.summary,
        logFile: job.logFile
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finalizeManagedJob(context, { job, lastAssistantText: "", reasoningSections: [] }, "failed", message);
      throw error;
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/continue") {
    const body = await readJsonBody(request);
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      errorResponse(response, 400, "A non-empty continuation prompt is required.");
      return;
    }
    const workspaceRoot = resolveWorkspaceRoot(body.cwd || context.workspaceRoot);
    const reference = String(body.jobId ?? body.controlSessionId ?? "").trim() || null;
    const session = findContinuationSession(context, {
      reference,
      workspaceRoot,
      originSessionId: body.originSessionId ?? null
    });
    if (!session) {
      errorResponse(
        response,
        reference ? 404 : 409,
        reference
          ? `Cannot continue ${reference}: no live Control Session is associated with that reference.`
          : "Cannot continue the latest task: no live Control Session is available for this workspace and caller."
      );
      return;
    }
    if (!sessionProcessLive(session)) {
      errorResponse(response, 409, `Cannot continue ${reference ?? session.id}: its original Pi RPC process is unavailable.`);
      return;
    }
    if (session.status !== "idle" || session.isStreaming) {
      errorResponse(
        response,
        409,
        `Cannot continue ${reference ?? session.id}: Control Session ${session.id} is currently ${session.phase || session.status}.`
      );
      return;
    }

    const parentJobId = reference && session.jobs.has(reference) ? reference : session.jobId;
    const continuationRequest = {
      cwd: session.cwd,
      workspaceRoot,
      prompt,
      continueJobId: parentJobId,
      controlSessionId: session.id,
      originSessionId: body.originSessionId ?? session.originSessionId ?? null
    };
    const job = createManagedTaskJob({
      workspaceRoot,
      prompt,
      write: !session.readOnly,
      request: continuationRequest,
      originSessionId: continuationRequest.originSessionId,
      parentJobId
    });
    job.controlSessionId = session.id;
    job.piSessionId = session.piSessionId;
    job.piSessionFile = session.sessionFile;
    job.rpcPid = session.client.proc.pid;
    job.reusedProcess = true;
    persistManagedJob(job);
    setActiveManagedJob(session, job);
    session.status = "running";
    session.phase = "starting";
    session.isStreaming = true;
    publishEvent(context.stateDir, session, { type: "control_user_message", action: "prompt", message: prompt });
    try {
      await session.client.sendPrompt(prompt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.status = "idle";
      session.phase = "idle";
      session.isStreaming = false;
      session.lastError = message;
      finalizeManagedJob(context, session, "failed", message);
      errorResponse(response, 502, `Failed to continue ${parentJobId}: ${message}`);
      return;
    }
    appendLogLine(job.logFile, `Reused Control Session ${session.id} and RPC PID ${session.client.proc.pid}.`);
    jsonResponse(response, 202, {
      jobId: job.id,
      parentJobId,
      controlSessionId: session.id,
      piSessionId: session.piSessionId,
      rpcPid: session.client.proc.pid,
      reusedProcess: true,
      status: "running",
      title: job.title,
      summary: job.summary,
      logFile: job.logFile
    });
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (sessionMatch) {
    const session = context.sessions.get(decodeURIComponent(sessionMatch[1]));
    const action = sessionMatch[2] ?? "";
    if (!session) {
      errorResponse(response, 404, "Unknown control session.");
      return;
    }

    if (request.method === "GET" && action === "") {
      jsonResponse(response, 200, publicSession(session));
      return;
    }
    if (request.method === "GET" && action === "messages") {
      if (session.status === "closed" || session.client?.closed) {
        const history = readPiSessionHistory({ piSessionFile: session.sessionFile });
        const messages = history.entries
          .filter((entry) => entry.type === "message")
          .map((entry) => ({ ...entry.message, timestamp: entry.timestamp ?? entry.message?.timestamp }));
        jsonResponse(response, 200, { messages });
      } else {
        const messages = await session.client.getMessages();
        jsonResponse(response, 200, messages ?? { messages: [] });
      }
      return;
    }
    if (request.method === "GET" && action === "events") {
      // Native EventSource reconnects with Last-Event-ID while preserving the
      // original URL. Prefer that advancing cursor over the stale `after`
      // query parameter, otherwise every reconnect replays old UI events.
      const reconnectCursor = request.headers["last-event-id"];
      const after = Number(reconnectCursor ?? url.searchParams.get("after") ?? 0);
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });
      response.write(": connected\n\n");
      const firstBufferedSequence = session.events[0]?.sequence ?? session.sequence + 1;
      for (const event of readPersistedEventsBefore(
        context.stateDir,
        session.id,
        after,
        firstBufferedSequence
      )) {
        response.write(`id: ${event.sequence}\nevent: pi-event\ndata: ${JSON.stringify(event)}\n\n`);
      }
      for (const event of session.events) {
        if (event.sequence > after) {
          response.write(`id: ${event.sequence}\nevent: pi-event\ndata: ${JSON.stringify(event)}\n\n`);
        }
      }
      session.subscribers.add(response);
      const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
      request.on("close", () => {
        clearInterval(heartbeat);
        session.subscribers.delete(response);
      });
      return;
    }
    if (request.method === "POST" && ["prompt", "steer", "follow-up"].includes(action)) {
      const body = await readJsonBody(request);
      const message = String(body.message ?? "").trim();
      if (!message) {
        errorResponse(response, 400, "A non-empty message is required.");
        return;
      }
      publishEvent(context.stateDir, session, { type: "control_user_message", action, message });
      if (action === "steer") {
        await session.client.steer(message);
      } else if (action === "follow-up") {
        await session.client.followUp(message);
      } else {
        await session.client.sendPrompt(message, {
          streamingBehavior: session.isStreaming ? body.streamingBehavior ?? "followUp" : undefined
        });
      }
      jsonResponse(response, 202, { accepted: true, action });
      return;
    }
    if (request.method === "POST" && action === "abort") {
      session.abortRequested = true;
      await session.client.abort();
      jsonResponse(response, 202, { accepted: true });
      return;
    }
    if (request.method === "POST" && action === "terminate") {
      if (session.status === "closed" || session.client?.closed) {
        jsonResponse(response, 200, { terminated: false, session: publicSession(session) });
        return;
      }
      session.closedByUser = true;
      session.abortRequested = true;
      session.pendingUiRequests.clear();
      publishEvent(context.stateDir, session, { type: "rpc_termination_requested" });
      finalizeManagedJob(context, session, "cancelled", "Pi RPC process terminated by user.");
      await session.client.close();
      session.status = "closed";
      session.phase = "closed";
      session.isStreaming = false;
      jsonResponse(response, 200, { terminated: true, session: publicSession(session) });
      return;
    }
    if (request.method === "POST" && action === "ui-response") {
      const body = await readJsonBody(request);
      const pending = session.pendingUiRequests.get(body.id);
      if (!pending) {
        errorResponse(response, 404, "Unknown UI request.");
        return;
      }
      session.client.respondToUi(body.id, body.response ?? { cancelled: true });
      session.pendingUiRequests.delete(body.id);
      jsonResponse(response, 200, { accepted: true });
      return;
    }
    if (request.method === "DELETE" && action === "") {
      session.closedByUser = true;
      await session.client.close();
      context.sessions.delete(session.id);
      try {
        fs.unlinkSync(path.join(context.stateDir, "control-events", `${session.id}.jsonl`));
      } catch {
        // No event log was created yet, or it was already removed.
      }
      jsonResponse(response, 200, { deleted: true });
      return;
    }
  }

  const logMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/log$/);
  if (request.method === "GET" && logMatch) {
    const job = findVisibleJob(context, decodeURIComponent(logMatch[1]));
    if (!job) {
      errorResponse(response, 404, "Unknown legacy job.");
      return;
    }
    jsonResponse(response, 200, { id: job.id, log: readLegacyLog(job), live: job.status === "running" });
    return;
  }

  const historyMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/session-history$/);
  if (request.method === "GET" && historyMatch) {
    const job = findVisibleJob(context, decodeURIComponent(historyMatch[1]));
    if (!job) {
      errorResponse(response, 404, "Unknown plugin job.");
      return;
    }
    jsonResponse(response, 200, { id: job.id, live: job.status === "running", ...readPiSessionHistory(job) });
    return;
  }

  const jobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (request.method === "DELETE" && jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const job = findVisibleJob(context, jobId);
    if (!job) {
      errorResponse(response, 404, "Unknown plugin job.");
      return;
    }
    const managedSession = [...context.sessions.values()].find((session) => session.jobs.has(jobId));
    if (managedSession) {
      const deletingActiveJob = managedSession.jobId === jobId && ["queued", "running"].includes(job.status);
      if (deletingActiveJob) {
        managedSession.closedByUser = true;
        managedSession.abortRequested = true;
        await managedSession.client.close().catch(() => {});
        context.sessions.delete(managedSession.id);
      } else {
        managedSession.jobs.delete(jobId);
        if (managedSession.jobId === jobId) {
          const remaining = [...managedSession.jobs.values()].at(-1) ?? null;
          managedSession.job = remaining;
          managedSession.jobId = remaining?.id ?? null;
        }
      }
    } else if (["queued", "running"].includes(job.status) && job.pid) {
      terminateProcessTree(job.pid);
    }
    removeJob(job.workspaceRoot ?? context.workspaceRoot, jobId);
    jsonResponse(response, 200, { deleted: true, id: jobId });
    return;
  }

  errorResponse(response, 404, "Unknown API endpoint.");
}

function writeDescriptor(context, server) {
  const address = server.address();
  const descriptor = {
    pid: process.pid,
    host: context.host,
    port: typeof address === "object" && address ? address.port : context.port,
    token: context.token,
    workspaceRoot: context.workspaceRoot,
    startedAt: new Date().toISOString()
  };
  fs.mkdirSync(context.stateDir, { recursive: true });
  fs.writeFileSync(context.descriptorFile, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  if (context.globalDescriptorFile) {
    fs.mkdirSync(path.dirname(context.globalDescriptorFile), { recursive: true });
    fs.writeFileSync(context.globalDescriptorFile, `${JSON.stringify(descriptor, null, 2)}\n`, { mode: 0o600 });
  }
  return descriptor;
}

export function resolveControlDescriptorFile(cwd) {
  return path.join(resolveStateDir(cwd), "control-server.json");
}

export function resolveGlobalControlDescriptorFile(cwd = process.cwd()) {
  return path.join(path.dirname(resolveStateDir(cwd)), "control-server-global.json");
}

function readDescriptorFile(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function readControlDescriptor(cwd) {
  return readDescriptorFile(resolveControlDescriptorFile(cwd));
}

export function readGlobalControlDescriptor(cwd = process.cwd()) {
  return readDescriptorFile(resolveGlobalControlDescriptorFile(cwd));
}

export function removeControlDescriptorIfOwned(file, pid) {
  const descriptor = readDescriptorFile(file);
  if (descriptor?.pid !== pid) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

export async function startControlServer(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options.cwd ?? process.cwd());
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackHost(host) && !options.allowRemote) {
    throw new Error("Pi Control Center only binds to loopback by default. Pass --allow-remote explicitly to override.");
  }
  const context = {
    workspaceRoot,
    stateDir: resolveStateDir(workspaceRoot),
    descriptorFile: resolveControlDescriptorFile(workspaceRoot),
    globalDescriptorFile: options.registerGlobal === false ? null : resolveGlobalControlDescriptorFile(workspaceRoot),
    host,
    port: Number(options.port ?? 43120),
    token: options.token ?? randomBytes(24).toString("hex"),
    sessions: new Map(),
    shutdownRequested: false,
    performShutdown: null,
    createClient: options.clientFactory ?? ((cwd, clientOptions) => new PiRpcClient(cwd, clientOptions))
  };
  if (!Number.isInteger(context.port) || context.port < 0 || context.port > 65535) {
    throw new Error(`Invalid control server port: ${options.port}`);
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${context.port}`}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(context, request, response, url);
        return;
      }
      if (!authenticate(context, request, url)) {
        response.writeHead(401, { "content-type": "text/plain; charset=utf-8" });
        response.end("Open this dashboard with the authenticated URL printed by pi-companion.\n");
        return;
      }
      if (url.searchParams.get("token") === context.token) {
        response.setHeader(
          "set-cookie",
          `pi_control_token=${encodeURIComponent(context.token)}; HttpOnly; SameSite=Strict; Path=/`
        );
      }
      serveStatic(response, url.pathname);
    } catch (error) {
      errorResponse(response, 500, error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(context.port, host, resolve);
  });
  const descriptor = writeDescriptor(context, server);

  let closePromise = null;
  const close = () => {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      for (const session of context.sessions.values()) {
        session.closedByUser = true;
        await session.client.close().catch(() => {});
        for (const subscriber of session.subscribers) subscriber.end();
        session.subscribers.clear();
      }
      const serverClosed = new Promise((resolve) => server.close(resolve));
      server.closeIdleConnections?.();
      await serverClosed;
      removeControlDescriptorIfOwned(context.descriptorFile, process.pid);
      if (context.globalDescriptorFile) removeControlDescriptorIfOwned(context.globalDescriptorFile, process.pid);
    })();
    return closePromise;
  };
  context.performShutdown = () => {
    setImmediate(async () => {
      await close().catch(() => {});
      await Promise.resolve(options.onShutdown?.()).catch(() => {});
    });
  };

  return { server, context, descriptor, close };
}
