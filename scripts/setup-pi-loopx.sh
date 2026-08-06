#!/usr/bin/env bash
#
# setup-pi-loopx.sh — one-click install of the pi + loopx autonomous stack.
#
# What it does:
#   1. checks node >=22.19
#   2. if loopx not installed: checks python >=3.11, then installs loopx
#   3. installs 6 pi extensions (mcp-adapter, subagents, hashline-edit,
#      messenger, intercom, web-access) with a ghproxy mirror fallback for flaky GitHub clones
#   4. copies the built-in permission-gate + plan-mode examples
#   5. registers the pi-loopx extension (6 tools + auto-continue + autonomous-start) in settings.json
#   6. prompts for a DeepSeek API key (optional; /login works too)
#   7. adds `pi` and `pi-auto` aliases
#   8. verifies pi loads all extensions cleanly
#
# Usage:
#   git clone https://github.com/tony3liu/DromX-Code.git && cd DromX-Code
#   bash scripts/setup-pi-loopx.sh
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
PI="$REPO/pi-test.sh"
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
    "$PY" -m pip install --user --quiet git+https://github.com/huangruiteng/loopx.git 2>&1 | tail -3 || true
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
install_git "git:github.com/nicobailon/pi-subagents" "nicobailon/pi-subagents"
install_git "git:github.com/nicobailon/pi-messenger" "nicobailon/pi-messenger"
install_git "git:github.com/nicobailon/pi-intercom" "nicobailon/pi-intercom"
install_git "git:github.com/nicobailon/pi-web-access" "nicobailon/pi-web-access"

# --- 4. built-in examples --------------------------------------------------
say "copying built-in extensions (permission-gate, plan-mode)..."
cp "$REPO/packages/coding-agent/examples/extensions/permission-gate.ts" "$EXT_DIR/" 2>/dev/null || warn "permission-gate.ts copy failed"
cp -r "$REPO/packages/coding-agent/examples/extensions/plan-mode" "$EXT_DIR/" 2>/dev/null || warn "plan-mode copy failed"

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

# --- 7. verify pi loads everything -----------------------------------------
say "verifying pi loads all extensions (pi --print OK)..."
if PI_OFFLINE=1 "$PI" --print "Reply with exactly: OK" 2>&1 | tail -3 | grep -q "^OK$"; then
  say "pi loads all extensions cleanly ✅"
else
  warn "pi did not reply OK — an extension may have failed to load. Run: $PI --print 'Reply: OK' to see the error."
fi

cat <<EOF

──────────────────────────────────────────────────────────────────
✅  Done.  Next:

  source $RC        # (or open a new terminal)
  cd ~/your-project
  pi-auto
  # type your objective, press enter, walk away.
  # footer shows "LoopX: auto-loop N/100"; stops at goal-done / gate / cap.

Notes:
  • pi runs from source at: $REPO  (update: git pull && npm run build)
  • pi-loopx extension path is tied to that repo: $LOOPX_EXT
  • loopx is on PATH; health: loopx doctor
  • provider key in $RC (or /login inside pi)
  • re-run this script any time — it's idempotent.
──────────────────────────────────────────────────────────────────
EOF
