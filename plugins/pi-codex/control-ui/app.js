const state = {
  workspaceRoot: "",
  controlPid: null,
  sessions: [],
  jobs: [],
  watchers: [],
  selectedType: null,
  selectedId: null,
  source: null,
  events: new Map(),
  toolEvents: new Map(),
  streamBlocks: new Map(),
  sessionUi: new Map(),
  lastSequences: new Map(),
  cardStates: new Map(),
  poll: null,
  overviewTimer: null,
  scrollFrame: null,
  forceScroll: false,
  eventTarget: null,
  jobHistorySignatures: new Map(),
  followOutput: true,
  collapseMode: localStorage.getItem("pi-control-collapse-mode") === "collapsed" ? "collapsed" : "expanded"
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  connection: $("#connection"), shutdownControl: $("#shutdown-control"), sessionList: $("#session-list"),
  sessionCount: $("#session-count"), empty: $("#empty-state"), sessionView: $("#session-view"),
  jobView: $("#job-view"), sessionTitle: $("#session-title"), sessionStatus: $("#session-status"),
  sessionMeta: $("#session-meta"), stream: $("#event-stream"), input: $("#message-input"),
  mode: $("#message-mode"), collapseMode: $("#collapse-mode"), pendingUi: $("#pending-ui"),
  jumpLatest: $("#jump-latest"),
  jobTitle: $("#job-title"), jobStatus: $("#job-status"), jobMeta: $("#job-meta"), jobLog: $("#job-log"),
  jobHistory: $("#job-history"), jobHistoryNote: $("#job-history-note"),
  dialog: $("#new-session-dialog"), form: $("#new-session-form"), dialogError: $("#dialog-error")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

function statusChip(element, status) {
  const labels = {
    starting: "启动中", running: "运行中", thinking: "思考中", responding: "回复中",
    tool: "工具中", idle: "空闲", completed: "已完成", done: "已完成", failed: "失败",
    disconnected: "已断开", offline: "离线", closed: "已关闭", compacting: "压缩中", retrying: "重试中"
  };
  element.textContent = labels[status] || status || "未知";
  element.className = `status-chip ${status || ""}`;
  element.title = status === "idle" ? "Pi 会话在线，当前没有执行任务，可以继续发送消息。" : status || "unknown";
}

function rpcProcessLabel(session, compact = false) {
  if (!("rpcProcessStatus" in session)) {
    return compact ? "RPC PID 待后端重启" : "RPC PID 将在控制中心重启后显示";
  }
  const pid = session.rpcPid ? `PID ${session.rpcPid}` : "无 PID";
  if (session.rpcProcessStatus === "running") return compact ? `RPC ${pid}` : `RPC ${pid}（运行中）`;
  if (session.rpcProcessStatus === "stopping") return compact ? `RPC ${pid} 停止中` : `RPC ${pid}（停止中）`;
  if (session.rpcProcessStatus === "exited") {
    const reason = session.rpcSignal ? `信号 ${session.rpcSignal}` : `退出码 ${session.rpcExitCode ?? "未知"}`;
    return compact ? `RPC 已退出 · ${reason}` : `RPC ${pid}（已退出，${reason}）`;
  }
  return compact ? "RPC 尚未启动" : "RPC 尚未启动（无 PID）";
}

function jobIdLabel(session, compact = false) {
  const jobId = session?.jobId || session?.jobIds?.at(-1) || null;
  if (!jobId) return compact ? "无 Job ID" : "Job ID：无（普通控制会话）";
  const historyCount = Array.isArray(session.jobIds) ? session.jobIds.length : 0;
  const history = !compact && historyCount > 1 ? `（共 ${historyCount} 个关联任务）` : "";
  return `Job ID：${jobId}${history}`;
}

function watcherForJob(jobId) {
  if (!jobId) return null;
  return state.watchers.find((watcher) => watcher.jobId === jobId) ?? null;
}

function supervisionLabel(jobId) {
  const watcher = watcherForJob(jobId);
  if (!watcher) return "";
  if (watcher.watcherStatus === "watching") return "监督中";
  if (watcher.jobStatus === "completed") return "监督完成";
  if (watcher.jobStatus === "cancelled") return "监督到已取消";
  return "监督到异常";
}

function canTerminateSession(session) {
  return session?.rpcProcessStatus === "running";
}

async function terminateSession(id, name, trigger) {
  const session = state.sessions.find((item) => item.id === id);
  if (!session || !canTerminateSession(session)) return;
  if (!window.confirm(`结束“${name || session.name || id}”的 Pi 进程？当前任务会被取消，但会话记录将保留。`)) return;
  const originalLabel = trigger?.textContent;
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = "结束中…";
  }
  try {
    await api(`/api/sessions/${encodeURIComponent(id)}/terminate`, { method: "POST", body: "{}" });
    await refreshOverview();
    if (state.selectedType === "session" && state.selectedId === id) {
      await openSession(id, true);
    }
  } catch (error) {
    if (state.selectedType === "session" && state.selectedId === id) {
      renderSimpleEvent("error", "error", error.message);
    } else {
      window.alert(error.message);
    }
  } finally {
    if (trigger) {
      trigger.textContent = originalLabel;
      const current = state.sessions.find((item) => item.id === id);
      trigger.disabled = !canTerminateSession(current);
    }
  }
}

function navItem(item, type) {
  const button = document.createElement("button");
  button.className = `nav-item ${state.selectedType === type && state.selectedId === item.id ? "active" : ""}`;
  button.innerHTML = `<span class="nav-item-title"><span></span><span class="status-chip"></span></span><span class="nav-item-meta"></span>`;
  const title = item.name ?? item.title ?? item.id;
  const titleElement = button.querySelector(".nav-item-title > span:first-child");
  titleElement.textContent = title;
  titleElement.title = title;
  statusChip(button.querySelector(".status-chip"), item.status);
  const meta = type === "session"
    ? jobIdLabel(item, true)
    : `Job ID：${item.id} · 只读记录 · ${item.summary || item.cwd || item.id}`;
  const jobId = type === "session" ? (item.jobId || item.jobIds?.at(-1)) : item.id;
  const supervision = supervisionLabel(jobId);
  const fullMeta = supervision ? `${meta} · ${supervision}` : meta;
  button.querySelector(".nav-item-meta").textContent = fullMeta;
  button.querySelector(".nav-item-meta").title = fullMeta;
  button.addEventListener("click", () => selectItem(type, item.id));
  return button;
}

function renderNavigation() {
  const managedJobIds = new Set(state.sessions.flatMap((session) => session.jobIds ?? [session.jobId]).filter(Boolean));
  const entries = [
    ...state.sessions.map((item) => ({ item, type: "session" })),
    ...state.jobs
      .filter((item) => !managedJobIds.has(item.id))
      .map((item) => ({ item, type: "job" }))
  ].sort((left, right) => {
    const timestamp = ({ item }) => Date.parse(
      item.updatedAt || item.completedAt || item.startedAt || item.createdAt || 0
    ) || 0;
    return timestamp(right) - timestamp(left);
  });
  elements.sessionList.replaceChildren(...entries.map(({ item, type }) => navItem(item, type)));
  elements.sessionCount.textContent = entries.length;
}

async function refreshOverview() {
  try {
    const overview = await api("/api/overview");
    state.workspaceRoot = overview.workspaceRoot;
    state.controlPid = overview.controlPid ?? null;
    state.sessions = overview.sessions;
    state.jobs = overview.jobs;
    state.watchers = overview.watchers ?? [];
    elements.connection.textContent = "已连接";
    elements.connection.className = "status-chip running";
    elements.connection.title = state.controlPid ? `Pi Control Center PID ${state.controlPid}` : "Pi Control Center 已连接";
    $("#session-cwd").value ||= state.workspaceRoot;
    renderNavigation();
    if (state.selectedType === "session") {
      const session = state.sessions.find((item) => item.id === state.selectedId);
      if (session) renderSessionHeader(session);
    }
  } catch (error) {
    elements.connection.textContent = "连接断开";
    elements.connection.className = "status-chip offline";
  }
}

function scheduleOverviewRefresh(delay = 200) {
  if (state.overviewTimer) return;
  state.overviewTimer = setTimeout(() => {
    state.overviewTimer = null;
    refreshOverview();
  }, delay);
}

function selectItem(type, id) {
  stashCurrentSession();
  state.selectedType = type;
  state.selectedId = id;
  state.source?.close();
  state.source = null;
  elements.empty.classList.add("hidden");
  elements.sessionView.classList.toggle("hidden", type !== "session");
  elements.jobView.classList.toggle("hidden", type !== "job");
  if (type === "session") {
    elements.sessionTitle.textContent = "正在打开…";
  } else {
    elements.jobTitle.textContent = "正在加载…";
    elements.jobLog.textContent = "正在加载任务日志…";
  }
  renderNavigation();
  if (type === "session") openSession(id);
  else openJob(id);
}

function stashCurrentSession() {
  if (state.selectedType !== "session" || !state.selectedId || elements.sessionView.classList.contains("hidden")) return;
  const fragment = document.createDocumentFragment();
  fragment.append(...elements.stream.childNodes);
  state.sessionUi.set(state.selectedId, {
    fragment,
    toolEvents: state.toolEvents,
    streamBlocks: state.streamBlocks,
    scrollTop: elements.stream.scrollTop,
    followOutput: state.followOutput
  });
  state.toolEvents = new Map();
  state.streamBlocks = new Map();
}

function renderSessionHeader(session) {
  elements.sessionTitle.textContent = session.name;
  elements.sessionTitle.title = session.name;
  statusChip(elements.sessionStatus, session.phase || session.status);
  const model = typeof session.model === "object"
    ? `${session.model.provider ?? ""}/${session.model.id ?? session.model.name ?? ""}`
    : session.model || "Pi 默认模型";
  const jobId = session.jobId || session.jobIds?.at(-1) || null;
  const supervision = supervisionLabel(jobId);
  elements.sessionMeta.textContent = `${session.cwd} · ${model} · ${session.readOnly ? "只读" : "可写"} · ${jobIdLabel(session)}${supervision ? ` · ${supervision}` : ""} · ${rpcProcessLabel(session)}`;
  const processLive = canTerminateSession(session);
  $("#terminate-session").disabled = !processLive;
  $("#abort-session").disabled = !processLive || !session.isStreaming;
  elements.input.disabled = !processLive;
  elements.mode.disabled = !processLive;
  $("#composer button[type=submit]").disabled = !processLive;
  renderPendingUi(session.pendingUiRequests ?? []);
}

async function openSession(id, forceReload = false) {
  if (forceReload) {
    captureCardStates(id);
    state.source?.close();
    state.source = null;
    state.sessionUi.delete(id);
  }
  let session = state.sessions.find((item) => item.id === id);
  if (!session) return;
  try {
    session = await api(`/api/sessions/${encodeURIComponent(id)}`);
  } catch {
    // The overview snapshot is still sufficient to open the event stream.
  }
  if (state.selectedType !== "session" || state.selectedId !== id) return;
  const cached = !forceReload ? state.sessionUi.get(id) : null;
  if (cached) {
    renderSessionHeader(session);
    elements.stream.replaceChildren(cached.fragment);
    state.toolEvents = cached.toolEvents;
    state.streamBlocks = cached.streamBlocks;
    state.followOutput = true;
    elements.jumpLatest.classList.add("hidden");
    connectEvents(id, state.lastSequences.get(id) ?? session.eventSequence ?? 0);
    scrollToLatest(true);
    state.sessionUi.delete(id);
    return;
  }
  const historySequence = session.eventSequence ?? 0;
  renderSessionHeader(session);
  elements.stream.replaceChildren();
  state.events.set(id, []);
  state.toolEvents.clear();
  state.streamBlocks.clear();
  state.followOutput = true;
  elements.jumpLatest.classList.add("hidden");
  if (session.isStreaming || session.status === "running") {
    state.lastSequences.set(id, 0);
    connectEvents(id, 0);
    return;
  }
  const messages = session.status === "starting" ? [] : await loadHistory(id);
  if (state.selectedType !== "session" || state.selectedId !== id) return;
  for (const message of messages) renderHistoricalMessage(message);
  state.lastSequences.set(id, historySequence);
  connectEvents(id, historySequence);
  scrollToLatest(true);
}

async function loadHistory(id) {
  try {
    const payload = await api(`/api/sessions/${encodeURIComponent(id)}/messages`);
    return payload.messages ?? [];
  } catch (error) {
    if (state.selectedType === "session" && state.selectedId === id) {
      renderSimpleEvent("error", "history", error.message);
    }
    return [];
  }
}

function renderHistoricalMessage(message, timestamp = message.timestamp) {
  const role = message.role ?? message.type ?? "message";
  const blocks = Array.isArray(message.content) ? message.content : [];
  let renderedPrompt = false;
  for (const block of blocks) {
    if (block.type === "text" && block.text && ["assistant", "user"].includes(role)) {
      const isAssistant = role === "assistant";
      if (isAssistant) renderAssistantEvent(block.text, timestamp);
      else renderSimpleEvent("prompt", "prompt", block.text, timestamp);
      if (role === "user") renderedPrompt = true;
    }
    if (block.type === "thinking" && block.thinking) renderThinkingEvent(block.thinking, timestamp);
    if (block.type === "toolCall") {
      renderHistoricalTool(block.id, block.name, block.arguments);
    }
  }
  if (renderedPrompt) renderSimpleEvent("agent", "agent_start", '{"type":"agent_start"}');
  if (role === "toolResult") renderHistoricalToolResult(message);
}

function connectEvents(id, after = 0) {
  const source = new EventSource(`/api/sessions/${encodeURIComponent(id)}/events?after=${after}`);
  state.source = source;
  source.addEventListener("pi-event", (message) => {
    if (state.source !== source || state.selectedType !== "session" || state.selectedId !== id) return;
    const event = JSON.parse(message.data);
    const sequence = Number(event.sequence);
    const lastSequence = Number(state.lastSequences.get(id) ?? after);
    if (Number.isFinite(sequence) && sequence <= lastSequence) return;
    if (Number.isFinite(sequence)) state.lastSequences.set(id, sequence);
    renderRpcEvent(event);
    if (["agent_start", "agent_settled", "rpc_exit", "control_session_error", "extension_ui_request"].includes(event.type)) {
      scheduleOverviewRefresh();
    }
  });
  source.onerror = () => {
    if (state.source === source && state.selectedType === "session" && state.selectedId === id) {
      statusChip(elements.sessionStatus, "disconnected");
    }
  };
}

function eventRow(kind, label) {
  const row = document.createElement("article");
  row.className = `event ${kind}`;
  const badge = document.createElement("div");
  badge.className = "event-kind";
  badge.textContent = label;
  const body = document.createElement("div");
  body.className = "event-body";
  row.append(badge, body);
  (state.eventTarget ?? elements.stream).append(row);
  return { row, body };
}

function scrollToLatest(force = false) {
  const target = state.eventTarget ?? elements.stream;
  if (!force && !state.followOutput) return;
  state.forceScroll ||= force;
  if (state.scrollFrame) return;
  state.scrollFrame = requestAnimationFrame(() => {
    state.scrollFrame = null;
    const shouldScroll = state.forceScroll || state.followOutput;
    state.forceScroll = false;
    if (shouldScroll) target.scrollTop = target.scrollHeight;
  });
}

function renderSimpleEvent(kind, label, content, timestamp) {
  const { body } = eventRow(kind, label);
  body.textContent = content;
  if (timestamp) {
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = new Date(timestamp).toLocaleTimeString();
    body.append(time);
  }
  scrollToLatest();
  return body;
}

function appendInlineMarkdown(parent, text) {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|\[[^\]\n]+\]\([^\s)]+\))/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else if (token.startsWith("**") || token.startsWith("__")) {
      const strong = document.createElement("strong");
      appendInlineMarkdown(strong, token.slice(2, -2));
      parent.append(strong);
    } else if (token.startsWith("*")) {
      const emphasis = document.createElement("em");
      appendInlineMarkdown(emphasis, token.slice(1, -1));
      parent.append(emphasis);
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = linkMatch?.[2] ?? "";
      if (/^(https?:|mailto:|\/|#)/i.test(href)) {
        const link = document.createElement("a");
        link.textContent = linkMatch[1];
        link.href = href;
        if (/^https?:/i.test(href)) {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        parent.append(link);
      } else {
        parent.append(document.createTextNode(token));
      }
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function splitMarkdownTableRow(line) {
  let value = String(line ?? "").trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);

  const cells = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "`") inCode = !inCode;
    if (character === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function markdownTableDivider(line) {
  const cells = splitMarkdownTableRow(line);
  if (!cells.length || cells.some((cell) => !/^:?-{3,}:?$/.test(cell))) return null;
  return cells.map((cell) => {
    if (cell.startsWith(":") && cell.endsWith(":")) return "center";
    if (cell.endsWith(":")) return "right";
    if (cell.startsWith(":")) return "left";
    return "";
  });
}

function renderMarkdownInto(container, markdown) {
  container.replaceChildren();
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = line.match(/^\s*```([^\s`]*)\s*$/);
    if (fence) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      if (fence[1]) code.dataset.language = fence[1];
      code.textContent = codeLines.join("\n");
      pre.append(code);
      container.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${heading[1].length}`);
      appendInlineMarkdown(element, heading[2]);
      container.append(element);
      index += 1;
      continue;
    }
    const tableHeader = line.includes("|") ? splitMarkdownTableRow(line) : [];
    const tableAlignments = index + 1 < lines.length ? markdownTableDivider(lines[index + 1]) : null;
    if (tableHeader.length && tableAlignments?.length === tableHeader.length) {
      const wrapper = document.createElement("div");
      wrapper.className = "markdown-table-wrap";
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (let column = 0; column < tableHeader.length; column += 1) {
        const cell = document.createElement("th");
        appendInlineMarkdown(cell, tableHeader[column]);
        if (tableAlignments[column]) cell.style.textAlign = tableAlignments[column];
        headRow.append(cell);
      }
      head.append(headRow);
      table.append(head);
      index += 2;

      const body = document.createElement("tbody");
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        const values = splitMarkdownTableRow(lines[index]);
        const row = document.createElement("tr");
        for (let column = 0; column < tableHeader.length; column += 1) {
          const cell = document.createElement("td");
          appendInlineMarkdown(cell, values[column] ?? "");
          if (tableAlignments[column]) cell.style.textAlign = tableAlignments[column];
          row.append(cell);
        }
        body.append(row);
        index += 1;
      }
      table.append(body);
      wrapper.append(table);
      container.append(wrapper);
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      container.append(document.createElement("hr"));
      index += 1;
      continue;
    }
    const listMatch = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (index < lines.length) {
        const itemMatch = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/);
        if (!itemMatch || Boolean(itemMatch[2]) !== ordered) break;
        const item = document.createElement("li");
        appendInlineMarkdown(item, itemMatch[3]);
        list.append(item);
        index += 1;
      }
      container.append(list);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = document.createElement("blockquote");
      const quoteLines = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) quoteLines.push(lines[index++].replace(/^\s*>\s?/, ""));
      appendInlineMarkdown(quote, quoteLines.join("\n"));
      container.append(quote);
      continue;
    }
    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^\s*```|^\s*(?:[-+*]|\d+\.)\s+|^\s*>/.test(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, paragraphLines.join(" "));
    container.append(paragraph);
  }
}

function renderAssistantEvent(content = "", timestamp, streaming = false) {
  const { body } = eventRow("text", "assistant");
  const markdown = document.createElement("div");
  markdown.className = `markdown-body ${streaming ? "streaming" : ""}`;
  if (streaming) markdown.textContent = content;
  else renderMarkdownInto(markdown, content);
  body.append(markdown);
  if (timestamp) {
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = new Date(timestamp).toLocaleTimeString();
    body.append(time);
  }
  scrollToLatest();
  return { body: markdown, raw: content };
}

function latestLines(content, count = 3) {
  return String(content ?? "").replace(/\s+$/, "").split("\n").slice(-count).join("\n");
}

function updateCardContent(card, content) {
  card.pre.textContent = content;
  card.preview.textContent = latestLines(content);
}

function hashText(value) {
  let hash = 5381;
  for (const character of String(value ?? "")) hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  return (hash >>> 0).toString(36);
}

function cardStateKey(details, content) {
  const type = details.classList.contains("thinking-card") ? "thinking" : "tool";
  return `${type}:${hashText(content)}`;
}

function sessionCardStates(id = state.selectedId) {
  if (!state.cardStates.has(id)) state.cardStates.set(id, new Map());
  return state.cardStates.get(id);
}

function captureCardStates(id, container = elements.stream) {
  if (!id || state.selectedId !== id) return;
  const saved = sessionCardStates(id);
  container.querySelectorAll(".tool-card").forEach((details) => {
    saved.set(cardStateKey(details, details.querySelector("pre")?.textContent), details.open);
  });
}

function createCollapsibleCard(body, className, summaryText, content = "") {
  const details = document.createElement("details");
  details.className = `tool-card ${className} preview-tail`.trim();
  details.open = state.collapseMode !== "collapsed";
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const pre = document.createElement("pre");
  const preview = document.createElement("pre");
  preview.className = "collapsed-preview";
  details.append(summary, pre);
  body.append(details, preview);
  const card = { details, summary, pre, preview };
  updateCardContent(card, content);
  const saved = sessionCardStates();
  const remembered = saved.get(cardStateKey(details, content));
  if (remembered !== undefined && state.collapseMode === "expanded") details.open = remembered;
  details.addEventListener("toggle", () => {
    saved.set(cardStateKey(details, pre.textContent), details.open);
  });
  return card;
}

function renderHistoricalTool(id, name, args) {
  const { body } = eventRow("tool", "tool");
  const card = createCollapsibleCard(body, "tool-call-card", `${name ?? "tool"} · completed`, formatToolArguments(name, args));
  if (id) state.toolEvents.set(id, card);
}

function renderHistoricalToolResult(message) {
  const card = state.toolEvents.get(message.toolCallId);
  const content = Array.isArray(message.content)
    ? message.content.map((block) => block?.text ?? "").filter(Boolean).join("\n")
    : String(message.content ?? "");
  if (card) {
    card.summary.textContent = `${message.toolName ?? "tool"} · ${message.isError ? "failed" : "completed"}`;
    updateCardContent(card, content);
    return;
  }
  const { body } = eventRow("tool", "tool");
  createCollapsibleCard(body, "tool-call-card", `${message.toolName ?? "tool"} · ${message.isError ? "failed" : "completed"}`, content);
}

function renderThinkingEvent(content = "", timestamp, streaming = false) {
  const { body } = eventRow("thinking", "thinking");
  const card = createCollapsibleCard(body, "thinking-card", `thinking · ${streaming ? "streaming" : "completed"}`, content);
  if (timestamp) {
    const time = document.createElement("span");
    time.className = "event-time";
    time.textContent = new Date(timestamp).toLocaleTimeString();
    body.append(time);
  }
  scrollToLatest();
  return card;
}

function renderToolEvent(event) {
  const id = event.toolCallId ?? `${event.toolName}-${event.sequence}`;
  if (event.type === "tool_execution_start") {
    const prepared = state.toolEvents.get(id);
    if (prepared) {
      prepared.details.classList.remove("preparing");
      prepared.details.classList.add("executing");
      prepared.summary.textContent = `${event.toolName} · 正在执行…`;
      updateCardContent(prepared, formatToolArguments(event.toolName, event.args));
      statusChip(elements.sessionStatus, "tool");
      scrollToLatest();
      return;
    }
    const { body } = eventRow("tool", "tool");
    const card = createCollapsibleCard(body, "tool-call-card", `${event.toolName} · 正在执行…`, formatToolArguments(event.toolName, event.args));
    card.details.classList.add("executing");
    state.toolEvents.set(id, card);
    statusChip(elements.sessionStatus, "tool");
    scrollToLatest();
    return;
  }
  const card = state.toolEvents.get(id);
  if (!card) return;
  if (event.type === "tool_execution_update") {
    updateCardContent(card, JSON.stringify(event.partialResult ?? {}, null, 2));
  } else {
    card.details.classList.remove("preparing", "executing");
    card.summary.textContent = `${event.toolName} · ${event.isError ? "failed" : "completed"}`;
    updateCardContent(card, JSON.stringify(event.result ?? {}, null, 2));
  }
  scrollToLatest();
}

function formatToolArguments(name, args) {
  if (!args || typeof args !== "object") return JSON.stringify(args ?? {}, null, 2);
  const summarized = { ...args };
  if (typeof summarized.content === "string") {
    summarized.content = `[正在写入 ${summarized.content.length.toLocaleString()} 个字符]`;
  }
  if (Array.isArray(summarized.edits)) {
    summarized.edits = summarized.edits.map((edit, index) => ({
      index: index + 1,
      oldText: typeof edit?.oldText === "string" ? `[${edit.oldText.length} 个字符]` : edit?.oldText,
      newText: typeof edit?.newText === "string" ? `[${edit.newText.length} 个字符]` : edit?.newText
    }));
  }
  return JSON.stringify(summarized, null, 2);
}

function inferPreparingTool(raw) {
  if (raw.includes('"content"')) return "write";
  if (raw.includes('"edits"') || raw.includes('"oldText"')) return "edit";
  if (raw.includes('"command"')) return "bash";
  if (raw.includes('"path"')) return "file tool";
  return "tool";
}

function renderToolCallDelta(delta) {
  const key = `toolcall:${delta.contentIndex ?? 0}`;
  if (delta.type === "toolcall_start" || !state.streamBlocks.has(key)) {
    const { body } = eventRow("tool", "tool");
    const card = createCollapsibleCard(body, "tool-call-card preparing", "tool · 正在生成参数…", "正在准备工具调用…");
    card.rawArgs = "";
    state.streamBlocks.set(key, card);
    statusChip(elements.sessionStatus, "tool");
    scrollToLatest();
  }
  const card = state.streamBlocks.get(key);
  if (delta.type === "toolcall_delta") {
    card.rawArgs += delta.delta ?? "";
    const inferred = inferPreparingTool(card.rawArgs);
    card.summary.textContent = `${inferred} · 正在生成参数…`;
    updateCardContent(card, `模型正在准备 ${inferred} 操作\n已生成 ${card.rawArgs.length.toLocaleString()} 个参数字符`);
    scrollToLatest();
    return;
  }
  if (delta.type === "toolcall_end") {
    const toolCall = delta.toolCall ?? {};
    card.details.classList.remove("preparing");
    card.summary.textContent = `${toolCall.name ?? "tool"} · 参数已生成，等待执行…`;
    updateCardContent(card, formatToolArguments(toolCall.name, toolCall.arguments));
    if (toolCall.id) state.toolEvents.set(toolCall.id, card);
    state.streamBlocks.delete(key);
    scrollToLatest();
  }
}

function renderRpcEvent(event) {
  if (event.type === "message_update") {
    const delta = event.assistantMessageEvent;
    if (!delta) return;
    if (delta.type.startsWith("toolcall_")) {
      renderToolCallDelta(delta);
      return;
    }
    const kind = delta.type.startsWith("thinking_") ? "thinking" : delta.type.startsWith("text_") ? "text" : null;
    if (kind) {
      const key = `${kind}:${delta.contentIndex ?? 0}`;
      if (delta.type.endsWith("_start") || !state.streamBlocks.has(key)) {
        const block = kind === "thinking"
          ? renderThinkingEvent("", event.timestamp, true)
          : renderAssistantEvent("", event.timestamp, true);
        state.streamBlocks.set(key, block);
      }
      const block = state.streamBlocks.get(key);
      const contentNode = block?.pre ?? block?.body;
      if (contentNode && delta.type.endsWith("_delta")) {
        if (block.pre) {
          updateCardContent(block, `${block.pre.textContent}${delta.delta ?? ""}`);
        } else {
          block.raw += delta.delta ?? "";
          contentNode.textContent = block.raw;
        }
        scrollToLatest();
      }
      if (contentNode && delta.type.endsWith("_end") && typeof delta.content === "string") {
        if (block.pre) {
          updateCardContent(block, delta.content);
          block.summary.textContent = "thinking · completed";
        } else {
          block.raw = delta.content;
          contentNode.classList.remove("streaming");
          renderMarkdownInto(contentNode, delta.content);
        }
        state.streamBlocks.delete(key);
      }
    }
    return;
  }
  if (event.type === "control_user_message") {
    renderSimpleEvent(event.action || "user", event.action || "you", event.message, event.timestamp);
    return;
  }
  if (event.type?.startsWith("tool_execution_")) {
    renderToolEvent(event);
    return;
  }
  if (event.type === "extension_ui_request") {
    scheduleOverviewRefresh();
    return;
  }
  if (event.type === "agent_settled") {
    const id = event.sessionId;
    if (id && state.selectedType === "session" && state.selectedId === id) {
      setTimeout(() => openSession(id, true), 0);
    }
    return;
  }
  const visible = new Set(["agent_start", "compaction_start", "compaction_end", "auto_retry_start", "auto_retry_end", "rpc_exit", "control_session_error"]);
  if (visible.has(event.type)) {
    const kind = event.type.includes("error") ? "error"
      : event.type.startsWith("agent_") ? "agent"
        : event.type.startsWith("turn_") ? "turn"
          : event.type.startsWith("compaction_") ? "compaction"
            : event.type.startsWith("auto_retry_") ? "retry" : "system";
    renderSimpleEvent(kind, event.type, JSON.stringify(event, null, 2), event.timestamp);
  }
}

function renderPendingUi(requests) {
  elements.pendingUi.classList.toggle("hidden", requests.length === 0);
  elements.pendingUi.replaceChildren();
  for (const request of requests) {
    const text = document.createElement("div");
    text.textContent = request.message || request.title || `Pi 请求输入：${request.method}`;
    elements.pendingUi.append(text);
    if (request.method === "select") {
      for (const option of request.options ?? []) {
        const choice = document.createElement("button");
        choice.textContent = option;
        choice.onclick = () => respondUi(request.id, { value: option });
        elements.pendingUi.append(choice);
      }
    } else if (request.method === "input" || request.method === "editor") {
      const field = document.createElement(request.method === "editor" ? "textarea" : "input");
      field.placeholder = request.placeholder ?? "";
      field.value = request.prefill ?? "";
      if (field instanceof HTMLTextAreaElement) field.rows = 4;
      const submit = document.createElement("button");
      submit.textContent = "提交";
      submit.className = "primary";
      submit.onclick = () => respondUi(request.id, { value: field.value });
      elements.pendingUi.append(field, submit);
    } else {
      const approve = document.createElement("button");
      approve.textContent = "允许";
      approve.className = "primary";
      approve.onclick = () => respondUi(request.id, { confirmed: true });
      elements.pendingUi.append(approve);
    }
    const deny = document.createElement("button");
    deny.textContent = "拒绝";
    deny.onclick = () => respondUi(request.id, request.method === "confirm" ? { confirmed: false } : { cancelled: true });
    elements.pendingUi.append(deny);
  }
}

async function respondUi(id, response) {
  await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/ui-response`, {
    method: "POST", body: JSON.stringify({ id, response })
  });
  await refreshOverview();
}

async function openJob(id) {
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return;
  elements.jobTitle.textContent = job.title || job.id;
  elements.jobTitle.title = job.title || job.id;
  statusChip(elements.jobStatus, job.phase || job.status);
  const supervision = supervisionLabel(job.id);
  elements.jobMeta.textContent = `Job ID：${job.id}${supervision ? ` · ${supervision}` : ""} · ${job.elapsed || job.duration || ""}`;
  try {
    const [history, log] = await Promise.all([
      api(`/api/jobs/${encodeURIComponent(id)}/session-history`),
      api(`/api/jobs/${encodeURIComponent(id)}/log`)
    ]);
    if (state.selectedType !== "job" || state.selectedId !== id) return;
    const signature = `${history.modifiedAt ?? "none"}:${history.size ?? 0}:${history.entries?.length ?? 0}`;
    if (state.jobHistorySignatures.get(id) !== signature) {
      const distanceFromBottom = elements.jobHistory.scrollHeight - elements.jobHistory.scrollTop - elements.jobHistory.clientHeight;
      const follow = elements.jobHistory.childElementCount === 0 || distanceFromBottom < 64;
      captureCardStates(id, elements.jobHistory);
      elements.jobHistory.replaceChildren();
      state.toolEvents = new Map();
      state.eventTarget = elements.jobHistory;
      try {
        if (!history.available) {
          renderSimpleEvent("system", "session", "Pi 会话文件尚未生成，正在等待 RPC 就绪…");
        } else if (!history.entries?.length) {
          renderSimpleEvent("system", "session", "会话已经建立，暂时还没有消息记录。");
        } else {
          for (const entry of history.entries) {
            if (entry.type === "message") {
              renderHistoricalMessage(entry.message, entry.timestamp);
            } else if (entry.type === "compaction") {
              const { body } = eventRow("compaction", "compaction");
              createCollapsibleCard(body, "compaction-card", "context · compacted", entry.summary);
            }
          }
        }
      } finally {
        state.eventTarget = null;
      }
      state.jobHistorySignatures.set(id, signature);
      if (follow) elements.jobHistory.scrollTop = elements.jobHistory.scrollHeight;
    }
    const details = [history.live ? "实时只读镜像" : "只读会话记录", `${history.entries?.length ?? 0} 条记录`];
    if (history.truncated) details.push("较早内容已截断");
    if (history.parseErrors) details.push(`${history.parseErrors} 行待写入/无法解析`);
    elements.jobHistoryNote.textContent = details.join(" · ");
    elements.jobHistoryNote.title = history.sessionFile ?? "尚无 Pi sessionFile";
    elements.jobLog.textContent = log.log || "暂无日志。";
    elements.jobLog.scrollTop = elements.jobLog.scrollHeight;
  } catch (error) {
    elements.jobHistoryNote.textContent = "加载失败";
    elements.jobHistory.replaceChildren();
    state.eventTarget = elements.jobHistory;
    renderSimpleEvent("error", "error", error.message);
    state.eventTarget = null;
  }
}

$("#new-session").addEventListener("click", () => elements.dialog.showModal());
elements.shutdownControl.addEventListener("click", async () => {
  const liveSessions = state.sessions.filter(canTerminateSession).length;
  const detail = liveSessions
    ? `当前有 ${liveSessions} 个在线 Pi RPC 会话，它们也会被结束。`
    : "当前没有在线 Pi RPC 会话。";
  if (!window.confirm(`关闭整个 Pi Control Center？\n\n${detail}`)) return;
  elements.shutdownControl.disabled = true;
  elements.shutdownControl.textContent = "正在关闭…";
  try {
    await api("/api/shutdown", { method: "POST", body: "{}" });
    state.source?.close();
    clearInterval(state.poll);
    clearTimeout(state.overviewTimer);
    statusChip(elements.connection, "closed");
    elements.sessionView.classList.add("hidden");
    elements.jobView.classList.add("hidden");
    elements.empty.classList.remove("hidden");
    elements.empty.querySelector("h2").textContent = "Pi Control Center 已关闭";
    elements.empty.querySelector("p").textContent = "需要再次使用时，重新调用 $pi-codex:ui。";
  } catch (error) {
    elements.shutdownControl.disabled = false;
    elements.shutdownControl.textContent = "关闭 Control Center";
    window.alert(`关闭失败：${error.message}`);
  }
});
$("#close-dialog").addEventListener("click", () => elements.dialog.close());
$("#cancel-dialog").addEventListener("click", () => elements.dialog.close());
$("#refresh").addEventListener("click", refreshOverview);
$("#reload-history").addEventListener("click", async () => {
  if (state.selectedType !== "session" || !state.selectedId) return;
  await openSession(state.selectedId);
});
$("#abort-session").addEventListener("click", async () => {
  if (!state.selectedId) return;
  await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/abort`, { method: "POST", body: "{}" });
});
$("#terminate-session").addEventListener("click", async (event) => {
  if (state.selectedType !== "session" || !state.selectedId) return;
  const session = state.sessions.find((item) => item.id === state.selectedId);
  await terminateSession(state.selectedId, session?.name, event.currentTarget);
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.dialogError.textContent = "";
  const submit = elements.form.querySelector('button[type="submit"]');
  const originalLabel = submit.textContent;
  submit.disabled = true;
  submit.textContent = "正在启动…";
  const data = Object.fromEntries(new FormData(elements.form));
  data.readOnly = elements.form.elements.readOnly.checked;
  try {
    const session = await api("/api/sessions", { method: "POST", body: JSON.stringify(data) });
    elements.dialog.close();
    elements.form.reset();
    $("#session-cwd").value = state.workspaceRoot;
    await refreshOverview();
    selectItem("session", session.id);
  } catch (error) {
    elements.dialogError.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }
});

$("#composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = elements.input.value.trim();
  if (!message || !state.selectedId) return;
  elements.input.value = "";
  try {
    await api(`/api/sessions/${encodeURIComponent(state.selectedId)}/${elements.mode.value}`, {
      method: "POST", body: JSON.stringify({ message })
    });
  } catch (error) {
    renderSimpleEvent("error", "error", error.message);
  }
});

elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    $("#composer").requestSubmit();
  }
});

elements.stream.addEventListener("wheel", (event) => {
  if (event.deltaY < 0) {
    state.followOutput = false;
    elements.jumpLatest.classList.remove("hidden");
  }
}, { passive: true });

elements.stream.addEventListener("scroll", () => {
  const distanceFromBottom = elements.stream.scrollHeight - elements.stream.scrollTop - elements.stream.clientHeight;
  state.followOutput = distanceFromBottom < 64;
  elements.jumpLatest.classList.toggle("hidden", state.followOutput);
}, { passive: true });

elements.jumpLatest.addEventListener("click", () => {
  state.followOutput = true;
  elements.jumpLatest.classList.add("hidden");
  scrollToLatest(true);
});

elements.collapseMode.checked = state.collapseMode === "collapsed";
elements.collapseMode.addEventListener("change", () => {
  state.collapseMode = elements.collapseMode.checked ? "collapsed" : "expanded";
  localStorage.setItem("pi-control-collapse-mode", state.collapseMode);
  const open = state.collapseMode === "expanded";
  document.querySelectorAll(".tool-card").forEach((card) => { card.open = open; });
  for (const cached of state.sessionUi.values()) {
    cached.fragment.querySelectorAll(".tool-card").forEach((card) => { card.open = open; });
  }
});

$("#delete-session").addEventListener("click", async () => {
  if (state.selectedType !== "session" || !state.selectedId) return;
  const id = state.selectedId;
  if (!window.confirm("删除这个会话并停止它的 Pi 进程？此操作不可恢复。")) return;
  try {
    state.source?.close();
    await api(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
    state.sessionUi.delete(id);
    state.lastSequences.delete(id);
    state.cardStates.delete(id);
    state.selectedType = null;
    state.selectedId = null;
    elements.sessionView.classList.add("hidden");
    elements.empty.classList.remove("hidden");
    await refreshOverview();
  } catch (error) {
    renderSimpleEvent("error", "error", error.message);
  }
});

$("#delete-job").addEventListener("click", async () => {
  if (state.selectedType !== "job" || !state.selectedId) return;
  const id = state.selectedId;
  if (!window.confirm("删除这个会话记录？如果它仍在运行，也会同时停止。")) return;
  try {
    await api(`/api/jobs/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
    state.selectedType = null;
    state.selectedId = null;
    elements.jobView.classList.add("hidden");
    elements.empty.classList.remove("hidden");
    await refreshOverview();
  } catch (error) {
    elements.jobLog.textContent = error.message;
  }
});

refreshOverview();
state.poll = setInterval(async () => {
  await refreshOverview();
  if (state.selectedType === "job" && state.selectedId) await openJob(state.selectedId);
}, 3000);
