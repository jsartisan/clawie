#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

const SESSION_NAME = "clawie";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(root, "web");

// ─── Tmux bindings ───────────────────────────────────────────────────────────

const TMUX_BINDINGS = {
  root: {
    ":": "command-prompt",
    r: "switch-client -T restart",
    g: "switch-client -T prefix_g",
    D: "detach-client",
    Tab: "select-window -n",
    BTab: "select-window -p",
    "C-k": "copy-mode",
    "C-u": "copy-mode; send-keys -X halfpage-up",
    "C-d": "copy-mode; send-keys -X halfpage-down",
    "C-b": "copy-mode; send-keys -X page-up",
    "C-f": "copy-mode; send-keys -X page-down",
    ...Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [String(i), `select-window -t ${i}`])
    ),
  },
  restart: {
    r: "respawn-pane -k",
    h: "respawn-pane -k -t host; select-window -t host",
    w: "respawn-pane -k -t web; select-window -t web",
    a: "respawn-pane -k -t host; respawn-pane -k -t web; select-window -t host",
  },
  prefix_g: {
    K: [
      `set-option message-style "bg=#f03d27 fg=#ffffff bright"`,
      `display-message -d 3000 " Killing all processes... "`,
      `run-shell "tmux -L clawie list-panes -s -F \\"#{pane_pid}\\" 2>/dev/null | while read pid; do pkill -TERM -P $pid 2>/dev/null; done; sleep 1"`,
      "kill-session",
    ].join("; "),
  },
  "copy-mode-vi": {
    MouseDragEnd1Pane:
      'send-keys -X pipe "pbcopy"; display-message -d 1000 "Copied to clipboard"',
    y: 'send-keys -X pipe "pbcopy"; display-message -d 1000 "Copied to clipboard"',
    "C-c":
      'send-keys -X pipe "pbcopy"; display-message -d 1000 "Copied to clipboard"',
    Escape: "send-keys -X cancel",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tmux(args) {
  const result = spawnSync("tmux", ["-L", SESSION_NAME, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0 && result.status !== null) {
    const err = new Error(`tmux ${args.join(" ")} failed: ${result.stderr}`);
    err.status = result.status;
    throw err;
  }
  return result.stdout?.trim() ?? "";
}

function sessionExists(name) {
  try {
    tmux(["has-session", "-t", name]);
    return true;
  } catch {
    return false;
  }
}

function log(tag, msg, color = "\x1b[33m") {
  const NC = "\x1b[0m";
  console.log(`${color}[${tag}]${NC} ${msg}`);
}

function portalUrl() {
  try {
    const env = readFileSync(path.join(root, ".env"), "utf8");
    const match = env.match(/^NCL_PORTAL_TOKEN=(.+)$/m);
    if (match) return `http://127.0.0.1:4101/?token=${match[1].trim()}`;
  } catch {
    // No .env yet — the host will generate the token and log its own link.
  }
  return "http://127.0.0.1:4101";
}

// ─── Tmux session setup ───────────────────────────────────────────────────────

function setupTmuxBindings() {
  for (const [table, maps] of Object.entries(TMUX_BINDINGS)) {
    for (const [key, command] of Object.entries(maps)) {
      tmux(["bind-key", "-T", table, key, command]);
    }
  }
}

function configureTmuxSession(sessionName) {
  tmux(["set-window-option", "-t", sessionName, "-g", "remain-on-exit", "on"]);
  tmux(["set-option", "-t", sessionName, "-g", "mouse", "on"]);
  tmux(["set-option", "-t", sessionName, "-g", "mode-keys", "vi"]);
  tmux(["set-option", "-t", sessionName, "-g", "history-limit", "50000"]);
  tmux(["set-option", "-t", sessionName, "-g", "status-left", "#S "]);
  tmux(["set-option", "-t", sessionName, "-g", "status-left-length", "30"]);
  tmux(["set-option", "-t", sessionName, "-g", "set-titles", "on"]);
  tmux(["set-option", "-t", sessionName, "-g", "set-titles-string", "clawie #{window_name}"]);
  tmux(["set-option", "-t", sessionName, "-g", "status-style", "bg=default fg=default"]);

  const fmt = "#{window_index}∙#{window_name}";
  tmux(["set-option", "-t", sessionName, "-g", "window-status-format", fmt]);
  tmux(["set-option", "-t", sessionName, "-g", "window-status-current-format", fmt]);
  tmux(["set-option", "-t", sessionName, "-g", "window-status-current-style", "bg=#0066ff fg=#ffffff"]);
  tmux(["set-option", "-t", sessionName, "-g", "key-table", "root"]);
}

function createWindow(sessionName, windowName, command, workingDir) {
  tmux(["new-window", "-d", "-c", workingDir, "-t", sessionName, "-n", windowName, command]);
}

// ─── Hotkeys info ─────────────────────────────────────────────────────────────

function hotkeysInfo() {
  const url = portalUrl();
  return `
    CLAWIE DEV

        Portal:  ${url}

    HOTKEYS
        :     — tmux command prompt
        D     — detach (processes keep running, run "task dev" to reattach)
        rr    — restart current window
        ra    — restart host + web
        rh    — restart host
        rw    — restart web
        Tab   — next window
        S-Tab — previous window
        0..9  — jump to window
        C-u   — enter copy mode + halfpage up

    Copy mode:
        y     — copy to clipboard
        q/Esc — exit copy mode
        C-u/d — halfpage up/down
        C-b/f — page up/down
`;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdStart() {
  if (sessionExists(SESSION_NAME)) {
    log("tmux", `Session '${SESSION_NAME}' already exists. Run 'task dev' to attach.`);
    return;
  }

  const info = hotkeysInfo();

  log("tmux", "Creating tmux session...");

  tmux([
    "new-session", "-d",
    "-s", SESSION_NAME,
    "-c", root,
    "-n", "main",
    `sleep 0.5; cat <<'HOTKEYS'\n${info}\nHOTKEYS`,
  ]);

  configureTmuxSession(SESSION_NAME);
  setupTmuxBindings();

  createWindow(SESSION_NAME, "host", "pnpm run dev", root);
  createWindow(SESSION_NAME, "web", "bun run dev", webDir);

  tmux(["select-window", "-t", `${SESSION_NAME}:main`]);

  log("tmux", "Development environment started!", "\x1b[32m");
  log("tmux", `Portal: ${portalUrl()}`, "\x1b[36m");
}

function cmdDev() {
  if (!sessionExists(SESSION_NAME)) {
    cmdStart();
  }

  log("tmux", `Attaching to session '${SESSION_NAME}'...`);
  spawnSync("tmux", ["-L", SESSION_NAME, "attach-session", "-t", SESSION_NAME], {
    stdio: "inherit",
  });
}

function cmdStop() {
  if (!sessionExists(SESSION_NAME)) {
    log("tmux", `No session '${SESSION_NAME}' running.`);
    return;
  }

  log("tmux", `Stopping session '${SESSION_NAME}'...`);

  for (const win of ["host", "web"]) {
    try {
      tmux(["send-keys", "-t", `${SESSION_NAME}:${win}`, "C-c", ""]);
    } catch {
      // window might not exist
    }
  }

  spawnSync("sleep", ["1"]);

  try {
    tmux(["kill-session", "-t", SESSION_NAME]);
  } catch {
    // already gone
  }

  log("tmux", `Session '${SESSION_NAME}' stopped.`, "\x1b[32m");
}

function cmdStatus() {
  if (!sessionExists(SESSION_NAME)) {
    console.log(`No active session '${SESSION_NAME}'.`);
    return;
  }

  console.log(`\nSession: ${SESSION_NAME}\n`);

  const windows = tmux([
    "list-windows", "-t", SESSION_NAME,
    "-F", "#{window_index} #{window_name} #{pane_dead} #{pane_dead_status}",
  ]);

  for (const line of windows.split("\n")) {
    if (!line.trim()) continue;
    const [idx, name, dead, deadStatus] = line.split(" ");
    const status =
      dead === "1"
        ? `\x1b[31m✗ exited (${deadStatus ?? "?"})\x1b[0m`
        : "\x1b[32m● running\x1b[0m";
    console.log(`  ${idx}  ${name.padEnd(12)} ${status}`);
  }
  console.log();
}

function cmdRestart(service) {
  if (!sessionExists(SESSION_NAME)) {
    console.error(`No active session '${SESSION_NAME}'.`);
    process.exit(1);
  }

  log("tmux", `Restarting ${service}...`);
  tmux(["respawn-pane", "-k", "-t", `${SESSION_NAME}:${service}`]);
  log("tmux", `${service} restarted.`, "\x1b[32m");
}

function cmdTail(service) {
  if (!sessionExists(SESSION_NAME)) {
    console.error(`No active session '${SESSION_NAME}'.`);
    process.exit(1);
  }

  const output = tmux([
    "capture-pane", "-p",
    "-t", `${SESSION_NAME}:${service}`,
    "-S", "-200",
  ]);
  console.log(output);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case "dev":
    cmdDev();
    break;
  case "start":
    cmdStart();
    break;
  case "stop":
    cmdStop();
    break;
  case "status":
    cmdStatus();
    break;
  case "restart":
    if (!arg) {
      console.error("Usage: dev.mjs restart <service>");
      process.exit(1);
    }
    cmdRestart(arg);
    break;
  case "tail":
    if (!arg) {
      console.error("Usage: dev.mjs tail <service>");
      process.exit(1);
    }
    cmdTail(arg);
    break;
  default:
    console.log(`Usage: dev.mjs <command>

Commands:
  dev                Start and attach to dev environment
  start              Start dev environment (don't attach)
  stop               Stop dev environment
  status             Show status of all windows
  restart <service>  Restart a service (host, web)
  tail <service>     View recent output from a service
`);
    break;
}
