import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.type === "get_state") {
    process.stdout.write(`${JSON.stringify({
      type: "response",
      id: request.id,
      success: true,
      data: { sessionId: "windows-test-session", sessionFile: null }
    })}\n`);
  }
});
