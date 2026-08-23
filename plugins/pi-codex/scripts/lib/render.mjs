function formatJobLine(job) {
  const parts = [job.id, `${job.status || "unknown"}`];
  if (job.kindLabel) {
    parts.push(job.kindLabel);
  }
  if (job.title) {
    parts.push(job.title);
  }
  return parts.join(" | ");
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

function formatPiResumeCommand(job) {
  if (!job?.piSessionId) {
    return null;
  }
  return `pi --session ${job.piSessionId}`;
}

function appendActiveJobsTable(lines, jobs) {
  lines.push("Active jobs:");
  lines.push("| Job | Kind | Status | Phase | Elapsed | Pi Session ID | Summary | Actions |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const job of jobs) {
    const actions = [`$pi-codex:status ${job.id}`];
    if (job.status === "queued" || job.status === "running") {
      actions.push(`$pi-codex:cancel ${job.id}`);
    }
    lines.push(
      `| ${escapeMarkdownCell(job.id)} | ${escapeMarkdownCell(job.kindLabel)} | ${escapeMarkdownCell(job.status)} | ${escapeMarkdownCell(job.phase ?? "")} | ${escapeMarkdownCell(job.elapsed ?? "")} | ${escapeMarkdownCell(job.piSessionId ?? "")} | ${escapeMarkdownCell(job.summary ?? "")} | ${actions.map((action) => `\`${action}\``).join("<br>")} |`
    );
  }
}

function pushJobDetails(lines, job, options = {}) {
  lines.push(`- ${formatJobLine(job)}`);
  if (job.summary) {
    lines.push(`  Summary: ${job.summary}`);
  }
  if (job.phase) {
    lines.push(`  Phase: ${job.phase}`);
  }
  if (options.showElapsed && job.elapsed) {
    lines.push(`  Elapsed: ${job.elapsed}`);
  }
  if (options.showDuration && job.duration) {
    lines.push(`  Duration: ${job.duration}`);
  }
  if (job.piSessionId) {
    lines.push(`  Pi session ID: ${job.piSessionId}`);
  }
  const resumeCommand = formatPiResumeCommand(job);
  if (resumeCommand) {
    lines.push(`  Resume in Pi: ${resumeCommand}`);
  }
  if (job.logFile && options.showLog) {
    lines.push(`  Log: ${job.logFile}`);
  }
  if ((job.status === "queued" || job.status === "running") && options.showCancelHint) {
    lines.push(`  Cancel: $pi-codex:cancel ${job.id}`);
  }
  if (job.status !== "queued" && job.status !== "running" && options.showResultHint) {
    lines.push(`  Result: $pi-codex:result ${job.id}`);
  }
  if (job.progressPreview?.length) {
    lines.push("  Progress:");
    for (const line of job.progressPreview) {
      lines.push(`    ${line}`);
    }
  }
}

export function renderSetupReport(report) {
  const lines = [
    "# Pi Setup",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    "Checks:",
    `- node: ${report.node.detail}`,
    `- pi: ${report.pi.detail}`
  ];

  if (report.pi.version) {
    const ok = report.pi.versionWarning ? "!" : "ok";
    lines.push(`  version: ${report.pi.version} (>= 0.75.0 ${ok})`);
  }

  lines.push(`- models: ${report.models.detail}`);

  if (report.availableModels.length > 0) {
    lines.push(`- available models: ${report.availableModels.join(", ")}`);
  }

  const fallbackModels = report.fallbackModels ?? [];
  lines.push(
    fallbackModels.length > 0
      ? `- fallback models: ${fallbackModels.join(", ")}`
      : "- fallback models: none (set PI_PLUGIN_FALLBACK_MODELS=model1,model2 to auto-retry failed runs on another model)"
  );

  if (report.subagents) {
    if (report.subagents.installed) {
      const names = report.subagents.agentNames.length > 0
        ? report.subagents.agentNames.join(", ")
        : "scout, researcher, planner, worker, reviewer, context-builder, oracle, delegate";
      lines.push(`- pi-subagents: installed (${report.subagents.agentCount} agents: ${names})`);
    } else {
      lines.push("- pi-subagents: not installed (run `pi install npm:pi-subagents` to enable parallel subagents)");
    }
  }

  lines.push(
    `- session runtime: ${report.sessionRuntime.label}`,
    ""
  );

  if (report.nextSteps.length > 0) {
    lines.push("Next steps:");
    for (const step of report.nextSteps) {
      lines.push(`- ${step}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

// --out-file mode writes the full output to a file and relays only the
// task's one-line summary to the caller.
export function renderOutFileSummary(execution, outFile) {
  const lines = [];
  if (execution.summary) {
    lines.push(execution.summary);
  }
  lines.push("", `Full output written to ${outFile}`);
  return `${lines.join("\n")}\n`;
}

// race: { write, dirtyWarning, racers: [{ model, ok, finalMessage, failure,
//   patchFile, patchStat, patchEmpty, piSessionId }] }
export function renderRaceResult(race, meta) {
  const okCount = race.racers.filter((racer) => racer.ok).length;
  const lines = [
    `# Pi Race (${race.racers.length} models)`,
    "",
    `Task: ${meta.taskSummary}`,
    race.write
      ? "Mode: write — each racer ran in an isolated git worktree created from HEAD"
      : "Mode: read-only — racers analyzed the same working tree"
  ];
  if (race.dirtyWarning) {
    lines.push(`Warning: ${race.dirtyWarning}`);
  }
  lines.push("");

  for (const racer of race.racers) {
    lines.push(`## ${racer.model} — ${racer.ok ? "ok" : "failed"}`);
    if (!racer.ok) {
      lines.push("", racer.failure || "Run failed.", "");
      continue;
    }
    if (racer.finalMessage?.trim()) {
      lines.push("", racer.finalMessage.trim(), "");
    }
    if (race.write) {
      if (racer.patchEmpty || !racer.patchFile) {
        lines.push("Patch: no file changes.", "");
      } else {
        lines.push("Patch:", "```text", racer.patchStat, "```", `Apply with: git apply ${racer.patchFile}`, "");
      }
    }
    if (racer.piSessionId) {
      lines.push(`Resume in Pi: pi --session ${racer.piSessionId}`, "");
    }
  }

  if (okCount === 0) {
    lines.push("All racers failed.");
  } else if (race.write) {
    lines.push("Pick a winner: review each patch, then apply exactly one with `git apply <patch>`.");
  } else {
    lines.push("Pick a winner: compare the answers above; agreement across models is a strong signal.");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderTaskResult(parsedResult, _meta) {
  const rawOutput = typeof parsedResult?.rawOutput === "string" ? parsedResult.rawOutput : "";
  if (rawOutput) {
    return rawOutput.endsWith("\n") ? rawOutput : `${rawOutput}\n`;
  }

  const message = String(parsedResult?.failureMessage ?? "").trim() || "Pi did not return a final message.";
  return `${message}\n`;
}

export function renderStatusReport(report) {
  const lines = [
    "# Pi Status",
    "",
    `Session runtime: ${report.sessionRuntime.label}`,
    ""
  ];

  if (report.running.length > 0) {
    appendActiveJobsTable(lines, report.running);
    lines.push("");
    lines.push("Live details:");
    for (const job of report.running) {
      pushJobDetails(lines, job, {
        showElapsed: true,
        showLog: true
      });
    }
    lines.push("");
  }

  if (report.latestFinished) {
    lines.push("Latest finished:");
    pushJobDetails(lines, report.latestFinished, {
      showDuration: true,
      showLog: report.latestFinished.status === "failed"
    });
    lines.push("");
  }

  if (report.recent.length > 0) {
    lines.push("Recent jobs:");
    for (const job of report.recent) {
      pushJobDetails(lines, job, {
        showDuration: true,
        showLog: job.status === "failed"
      });
    }
    lines.push("");
  } else if (report.running.length === 0 && !report.latestFinished) {
    lines.push("No jobs recorded yet.", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderJobStatusReport(job) {
  const lines = ["# Pi Job Status", ""];
  pushJobDetails(lines, job, {
    showElapsed: job.status === "queued" || job.status === "running",
    showDuration: job.status !== "queued" && job.status !== "running",
    showLog: true,
    showCancelHint: true,
    showResultHint: true
  });
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderStoredJobResult(job, storedJob) {
  const piSessionId = storedJob?.piSessionId ?? job.piSessionId ?? null;
  const resumeCommand = piSessionId ? `pi --session ${piSessionId}` : null;
  const rawOutput =
    (typeof storedJob?.result?.rawOutput === "string" && storedJob.result.rawOutput) ||
    (typeof storedJob?.result?.pi?.stdout === "string" && storedJob.result.pi.stdout) ||
    "";
  if (rawOutput) {
    const output = rawOutput.endsWith("\n") ? rawOutput : `${rawOutput}\n`;
    if (!piSessionId) {
      return output;
    }
    return `${output}\nPi session ID: ${piSessionId}\nResume in Pi: ${resumeCommand}\n`;
  }

  if (storedJob?.rendered) {
    const output = storedJob.rendered.endsWith("\n") ? storedJob.rendered : `${storedJob.rendered}\n`;
    if (!piSessionId) {
      return output;
    }
    return `${output}\nPi session ID: ${piSessionId}\nResume in Pi: ${resumeCommand}\n`;
  }

  const lines = [
    `# ${job.title ?? "Pi Result"}`,
    "",
    `Job: ${job.id}`,
    `Status: ${job.status}`
  ];

  if (piSessionId) {
    lines.push(`Pi session ID: ${piSessionId}`);
    lines.push(`Resume in Pi: ${resumeCommand}`);
  }

  if (job.summary) {
    lines.push(`Summary: ${job.summary}`);
  }

  if (job.errorMessage) {
    lines.push("", job.errorMessage);
  } else if (storedJob?.errorMessage) {
    lines.push("", storedJob.errorMessage);
  } else {
    lines.push("", "No captured result payload was stored for this job.");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderCancelReport(job) {
  const lines = [
    "# Pi Cancel",
    "",
    `Cancelled ${job.id}.`,
    ""
  ];

  if (job.title) {
    lines.push(`- Title: ${job.title}`);
  }
  if (job.summary) {
    lines.push(`- Summary: ${job.summary}`);
  }
  lines.push("- Check `$pi-codex:status` for the updated queue.");

  return `${lines.join("\n").trimEnd()}\n`;
}
