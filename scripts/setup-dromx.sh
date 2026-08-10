#!/usr/bin/env bash
#
# setup-dromx.sh — one-click install of the dromx + loopx autonomous stack.
#
# What it does:
#   1. checks node >=22.19
#   2. if loopx not installed: checks python >=3.11, then installs loopx
#   3. installs pi extensions (all via npm): mcp-adapter, hashline-edit, web-access,
#      lens, hermes-memory, subagents, messenger, intercom
#   4. copies the built-in permission-gate + plan-mode examples
#   4b. installs the Kimi WebBridge daemon + skill + autostart extension (real-browser control; --no-webbridge to skip)
#   5. registers the pi-loopx extension (6 tools + auto-continue + autonomous-start) in settings.json
#   6. prompts for a DeepSeek API key (optional; /login works too)
#   7. adds `pi` and `pi-auto` aliases
#   8. verifies pi loads all extensions cleanly
#
# Usage:
#   git clone https://github.com/tony3liu/DromX-Code.git && cd DromX-Code
#   bash scripts/setup-dromx.sh
#
# Prereqs (the script checks + instructs, does NOT install these for you):
#   - node >= 22.19  (nvm install 22 / n 22 / brew install node@22)
#   - python >= 3.11  (pyenv install 3.12 / conda create -n py312 python=3.12 / brew install python@3.12) — only needed if loopx isn't installed yet
#   - GitHub reachable (or the mirror fallback kicks in)
#
# Idempotent: safe to re-run — skips installed items, doesn't duplicate settings/aliases.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
PI="$REPO/dromx-test.sh"
AGENT_DIR="$HOME/.pi/agent"
EXT_DIR="$AGENT_DIR/extensions"
SETTINGS="$AGENT_DIR/settings.json"
LOOPX_EXT="$REPO/packages/coding-agent/examples/extensions/loopx/index.ts"

say(){ printf "\033[1;34m[setup]\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }
err(){ printf "\033[1;31m[err]\033[0m %s\n" "$*" >&2; }

mkdir -p "$AGENT_DIR" "$EXT_DIR"

# --- 1. node >= 22.19 -------------------------------------------------------
say "checking node >= 22.19..."
command -v node >/dev/null 2>&1 || { err "node not found. Install node >=22.19 (nvm/n/brew)."; exit 1; }
read -r NODE_MAJ NODE_MIN < <(node -p 'process.versions.node.split(".").slice(0,2).join(" ")')
if [ "$NODE_MAJ" -lt 22 ] || { [ "$NODE_MAJ" -eq 22 ] && [ "$NODE_MIN" -lt 19 ]; }; then
  err "node $(node -v) < 22.19. Upgrade: nvm install 22 / n 22 / brew install node@22."
  exit 1
fi
say "node $(node -v) ok"

# --- 2. loopx (skip if already on PATH; else need python >=3.11 to install) -
say "checking loopx..."
if command -v loopx >/dev/null 2>&1; then
  say "loopx $(loopx --version 2>&1 | head -1) already on PATH — skipping install."
else
  say "loopx not found — need python >= 3.11 to install it."
  PY=""
  for c in python3.13 python3.12 python3.11 python3; do
    if command -v "$c" >/dev/null 2>&1; then
      V=$("$c" -c 'import sys;print("%d %d"%(sys.version_info[0],sys.version_info[1]))' 2>/dev/null || echo "0 0")
      read -r PMAJ PMIN <<<"$V"
      if { [ "$PMAJ" -gt 3 ] || { [ "$PMAJ" -eq 3 ] && [ "$PMIN" -ge 11 ]; }; }; then PY="$c"; break; fi
    fi
  done
  if [ -z "$PY" ]; then
    err "python >= 3.11 not found (needed to install loopx). Install: pyenv install 3.12 / conda create -n py312 python=3.12 / brew install python@3.12, then re-run."
    exit 1
  fi
  say "python: $PY ($($PY --version 2>&1)) — installing loopx..."
  # official installer first (handles python detection + PATH + wrapper)
  if curl -fsSL https://raw.githubusercontent.com/huangruiteng/loopx/main/scripts/install-from-github.sh | bash 2>/tmp/loopx-install.log; then
    :
  else
    warn "official installer failed (see /tmp/loopx-install.log); falling back to pip --user with $PY"
    # --no-build-isolation: loopx pins setuptools==83.0.0 (not on PyPI); use the env's setuptools.
    "$PY" -m pip install --user --quiet --no-build-isolation git+https://github.com/huangruiteng/loopx.git 2>&1 | tail -3 || true
  fi
  # make sure the user bin dir is on PATH for this session
  USER_BIN="$("$PY" -c 'import site,os;print(os.path.join(site.getuserbase(),"bin"))' 2>/dev/null || echo "$HOME/.local/bin")"
  case ":$PATH:" in
    *":$USER_BIN:"*) ;;
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$USER_BIN:$HOME/.local/bin:$PATH" ;;
  esac
  command -v loopx >/dev/null 2>&1 || { err "loopx install failed. See https://github.com/huangruiteng/loopx"; exit 1; }
  say "loopx $(loopx --version 2>&1 | head -1) installed."
fi

# --- helpers for extension install -----------------------------------------
PI_ENV=(env PI_OFFLINE=1)
install_npm(){
  local src="$1"
  if "${PI_ENV[@]}" "$PI" install "$src" >/tmp/pi-install.log 2>&1; then
    say "installed $src"
  else
    warn "FAILED $src — see /tmp/pi-install.log. Retry: $PI install $src"
  fi
}
install_git(){
  local src="$1" repo="$2"
  if "${PI_ENV[@]}" "$PI" install "$src" >/tmp/pi-install.log 2>&1; then
    say "installed $src"
    return
  fi
  warn "$src direct failed (GitHub flaky?) — trying ghproxy mirror..."
  local name; name="$(basename "$repo")"
  if git clone --depth 1 "https://ghproxy.com/https://github.com/$repo" "/tmp/$name" 2>/dev/null \
     && "${PI_ENV[@]}" "$PI" install "/tmp/$name" >/tmp/pi-install.log 2>&1; then
    say "installed $repo (via mirror)"
  else
    warn "FAILED $src — see /tmp/pi-install.log. Manual: $PI install $src  (or git clone a github mirror then $PI install ./dir)"
  fi
}

# --- 3. pi extensions -------------------------------------------------------
say "installing pi extensions..."
install_npm "npm:pi-mcp-adapter"
install_npm "npm:pi-hashline-edit"
install_npm "npm:pi-web-access"
install_npm "npm:pi-lens"
install_npm "npm:pi-hermes-memory"
install_npm "npm:pi-subagents"
install_npm "npm:pi-messenger"
install_npm "npm:pi-intercom"

# --- 4. built-in examples --------------------------------------------------
say "copying built-in extensions (permission-gate, plan-mode)..."
cp "$REPO/packages/coding-agent/examples/extensions/permission-gate.ts" "$EXT_DIR/" 2>/dev/null || warn "permission-gate.ts copy failed"
cp -r "$REPO/packages/coding-agent/examples/extensions/plan-mode" "$EXT_DIR/" 2>/dev/null || warn "plan-mode copy failed"

# --- 4b. Kimi WebBridge (real-browser control) — daemon + skill (default) ---
# dromx ships WebBridge support by default: install the local daemon binary (NOT
# started — dromx controls start/stop via the /webbridge command) and copy its
# skill into the dromx skills dir. The user installs the Chrome EXTENSION themselves
# (a browser action a script can't do) — see README. Skipped with --no-webbridge.
if [ "${1:-}" != "--no-webbridge" ]; then
  KWB_BIN="$HOME/.kimi-webbridge/bin/kimi-webbridge"
  if [ -x "$KWB_BIN" ]; then
    say "Kimi WebBridge daemon already installed — skipping."
  else
    say "installing Kimi WebBridge daemon (real-browser control; --no-start --no-skill — dromx controls start/stop via /webbridge, and wires the skill itself)..."
    if curl -fsSL https://kimi-web-img.moonshot.cn/webbridge/install.sh | bash -s -- --no-start --no-skill >/tmp/kwb-install.log 2>&1; then
      say "Kimi WebBridge daemon installed (not started — run /webbridge inside dromx to start it)."
    else
      warn "Kimi WebBridge daemon install failed (see /tmp/kwb-install.log) — browser control will be unavailable until installed. Non-fatal."
    fi
  fi
  # Copy the WebBridge skill into the dromx skills dir (install.sh --no-skill didn't).
  # It gets installed to other agents' dirs by `kimi-webbridge install-skill`; grab it from there,
  # else fall back to running install-skill for Claude Code and copying from there.
  KWB_SKILL_DST="$AGENT_DIR/skills/kimi-webbridge"
  if [ -x "$KWB_BIN" ] && [ ! -f "$KWB_SKILL_DST/SKILL.md" ]; then
    mkdir -p "$AGENT_DIR/skills"
    KWB_SKILL_SRC=""
    for d in "$HOME/.claude/skills/kimi-webbridge" "$HOME/.codex/skills/kimi-webbridge"; do
      [ -f "$d/SKILL.md" ] && KWB_SKILL_SRC="$d" && break
    done
    if [ -z "$KWB_SKILL_SRC" ]; then
      "$KWB_BIN" install-skill -y >/dev/null 2>&1 || true
      for d in "$HOME/.claude/skills/kimi-webbridge" "$HOME/.codex/skills/kimi-webbridge"; do
        [ -f "$d/SKILL.md" ] && KWB_SKILL_SRC="$d" && break
      done
    fi
    if [ -n "$KWB_SKILL_SRC" ]; then
      cp -r "$KWB_SKILL_SRC" "$KWB_SKILL_DST" && say "WebBridge skill → $KWB_SKILL_DST"
    else
      warn "could not locate the kimi-webbridge skill to copy into dromx skills dir."
    fi
  fi
  # Register the webbridge extension — provides the /webbridge command (start daemon + launch Chrome + guide extension install).
  cp -r "$REPO/packages/coding-agent/examples/extensions/webbridge" "$EXT_DIR/" 2>/dev/null \
    && say "installed webbridge extension (use /webbridge inside dromx to enable browser control)" || warn "webbridge copy failed"
else
  say "skipping Kimi WebBridge (--no-webbridge)"
fi

# --- 5. register pi-loopx extension in settings.json -----------------------
say "registering pi-loopx extension in $SETTINGS..."
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
node -e '
const fs=require("fs");
const p=process.argv[1], ext=process.argv[2];
let s={}; try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch{}
s.extensions=Array.isArray(s.extensions)?s.extensions.filter(x=>x!==ext):[];
if(!s.extensions.includes(ext)) s.extensions.push(ext);
if(Array.isArray(s.packages)) s.packages=[...new Set(s.packages)]; // dedup
if(s.hideThinkingBlock===undefined) s.hideThinkingBlock=true; // collapse CoT by default; ctrl+t to expand
fs.writeFileSync(p, JSON.stringify(s,null,2)+"\n");
console.log("extensions:", s.extensions.join(", "));
console.log("packages:", (s.packages||[]).length, "entries");
' "$SETTINGS" "$LOOPX_EXT"

# --- 6. provider key (optional) + aliases ----------------------------------
RC=""
case "$(basename "$SHELL" 2>/dev/null)" in
  zsh) RC="$HOME/.zshrc" ;;
  bash) for c in "$HOME/.bash_profile" "$HOME/.bashrc"; do [ -f "$c" ] && RC="$c" && break; done; [ -n "$RC" ] || RC="$HOME/.bash_profile" ;;
  *) RC="$HOME/.bashrc" ;;
esac
touch "$RC"

say "provider key — DeepSeek (your own). pi-native way is /login inside pi."
if [ -t 0 ]; then
  read -r -p "Paste DeepSeek API key (Enter to skip & /login later): " KEY </dev/tty || KEY=""
else
  KEY=""
fi
if [ -n "$KEY" ]; then
  grep -q "DEEPSEEK_API_KEY=" "$RC" 2>/dev/null || printf '\nexport DEEPSEEK_API_KEY=%s\n' "$KEY" >> "$RC"
  say "DEEPSEEK_API_KEY written to $RC (comment it out to remove)."
else
  say "skipped. Later: run pi then /login, or: echo 'export DEEPSEEK_API_KEY=sk-...' >> $RC"
fi

add_alias(){
  local name="$1" body="$2"
  if grep -q "alias $name=" "$RC" 2>/dev/null; then
    say "alias $name already in $RC (left as-is)"
  else
    printf "\nalias %s='%s'\n" "$name" "$body" >> "$RC"
    say "added alias $name to $RC"
  fi
}
say "aliases (in $RC):"
add_alias "pi" "$PI"
add_alias "pi-auto" "LOOPX_MAX_TURNS=100 PI_OFFLINE=1 $PI --auto-loopx"
add_alias "dromx" "$PI"  # rebranded command (TUI/process title show "dromx"); `pi` still works
add_alias "dromx-auto" "LOOPX_MAX_TURNS=100 PI_OFFLINE=1 $PI --auto-loopx"

# --- 7. verify pi loads everything -----------------------------------------
say "verifying pi loads all extensions (pi --print OK)..."
if PI_OFFLINE=1 "$PI" --print "Reply with exactly: OK" 2>&1 | tail -3 | grep -q "^OK$"; then
  say "dromx loads all extensions cleanly ✅"
else
  warn "dromx did not reply OK — an extension may have failed to load. Run: $PI --print 'Reply: OK' to see the error."
fi

cat <<EOF

──────────────────────────────────────────────────────────────────
✅  Done.  Next:

  source $RC        # (or open a new terminal)
  cd ~/your-project
  dromx                               # start; then /login + /auto-loop <objective>
  # /auto-loop drives the loopx loop to completion (footer: "LoopX: auto-loop N/100")

Notes:
  • dromx runs from source at: $REPO  (update: git pull && npm run build)
  • the loopx extension path is tied to that repo: $LOOPX_EXT
  • loopx is on PATH; health: loopx doctor
  • provider key in $RC (or /login inside dromx)
  • re-run this script any time — it's idempotent.

Kimi WebBridge (real-browser control):
  • daemon installed at ~/.kimi-webbridge/bin/kimi-webbridge (health: kimi-webbridge status)
  • Enable inside dromx with:  /webbridge   (starts daemon, launches a clean Chrome profile,
    and tells you how to install the browser extension). Check anytime with /webbridge status.
  • YOU install the Chrome EXTENSION yourself: https://www.kimi.com/features/webbridge
    (install it in the dromx-launched window ~/.dromx-chrome; a clean profile avoids other
    extensions stealing the tab via CDP.)

Per-project .gitignore — dromx auto-ensures these on first run in a git repo
(creates .gitignore if missing, appends if absent; idempotent — skips if present):
    .pi/
    .loopx/
    .codex/
──────────────────────────────────────────────────────────────────
EOF
