#!/usr/bin/env bash
#
# uninstall-dromx.sh — remove the DromX stack (mirror of setup-dromx.sh).
#
# Invoked by `dromx uninstall --all`, or run directly. Interactive by default:
# asks before each destructive step. Pass --yes / -y to skip all prompts.
#
# Removes (each confirmed separately):
#   1. dromx extensions (settings.json packages/extensions) + ~/.pi config dir
#   2. Kimi WebBridge daemon (~/.kimi-webbridge) via its own uninstaller
#   3. loopx (pip uninstall; also offers to remove a conda env named 'loopx')
#   4. the dedicated ~/.dromx-chrome browser profile
#   5. dromx / pi / dromx-auto shell aliases, and the global npm package if present
#
# It does NOT delete the DromX source checkout — remove that yourself if you cloned it.
#
set -uo pipefail

YES=0
for a in "$@"; do [ "$a" = "--yes" ] || [ "$a" = "-y" ] && YES=1; done

say(){ printf "\033[1;34m[uninstall]\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m[warn]\033[0m %s\n" "$*" >&2; }

# ask "question" -> returns 0 (yes) / 1 (no). Auto-yes with --yes.
ask(){
  [ "$YES" = "1" ] && return 0
  if [ -t 0 ]; then
    read -r -p "$1 [y/N]: " ans </dev/tty || ans=""
    case "$ans" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
  fi
  return 1  # non-interactive without --yes: default no
}

AGENT_DIR="$HOME/.pi/agent"
PI_DIR="$HOME/.pi"

say "This removes the DromX stack. Each step asks first (use --yes to skip prompts)."
echo ""

# --- 1. config dir (~/.pi: extensions, settings, sessions, memory, rg/fd) ---
if [ -d "$PI_DIR" ]; then
  SIZE=$(du -sh "$PI_DIR" 2>/dev/null | cut -f1)
  if ask "Remove config dir $PI_DIR (${SIZE:-?}: settings, extensions, sessions, memory)?"; then
    rm -rf "$PI_DIR" && say "removed $PI_DIR"
  else
    say "kept $PI_DIR"
  fi
else
  say "no $PI_DIR — skipping"
fi

# --- 2. Kimi WebBridge daemon ---
KWB="$HOME/.kimi-webbridge/bin/kimi-webbridge"
if [ -x "$KWB" ]; then
  if ask "Remove Kimi WebBridge daemon (~/.kimi-webbridge)?"; then
    "$KWB" uninstall 2>/dev/null || rm -rf "$HOME/.kimi-webbridge"
    say "removed WebBridge daemon"
    say "note: remove the 'Kimi WebBridge' Chrome extension manually in your browser."
  else
    say "kept WebBridge daemon"
  fi
elif [ -d "$HOME/.kimi-webbridge" ]; then
  ask "Remove ~/.kimi-webbridge?" && { rm -rf "$HOME/.kimi-webbridge"; say "removed"; }
fi

# --- 3. loopx (pip, and optional conda env) ---
if command -v loopx >/dev/null 2>&1; then
  if ask "Remove loopx (the /auto-loop engine)?"; then
    # pip uninstall from whichever python provides it
    for py in python3 python python3.13 python3.12 python3.11 py; do
      command -v "$py" >/dev/null 2>&1 && "$py" -m pip uninstall -y loopx >/dev/null 2>&1 && break
    done
    # a manual symlink (the maintainer's Mac setup used ~/.local/bin/loopx -> conda env)
    [ -L "$HOME/.local/bin/loopx" ] && rm -f "$HOME/.local/bin/loopx"
    # offer to remove a dedicated conda env named 'loopx' if present
    if command -v conda >/dev/null 2>&1 && conda env list 2>/dev/null | grep -qE "^loopx\s|/envs/loopx$"; then
      ask "A conda env named 'loopx' exists. Remove it too?" && conda env remove -n loopx -y >/dev/null 2>&1
    fi
    command -v loopx >/dev/null 2>&1 && warn "loopx still on PATH — remove it manually ($(command -v loopx))" || say "removed loopx"
  else
    say "kept loopx"
  fi
else
  say "loopx not installed — skipping"
fi

# --- 4. dedicated Chrome profile ---
if [ -d "$HOME/.dromx-chrome" ]; then
  ask "Remove the dedicated Chrome profile ~/.dromx-chrome?" && { rm -rf "$HOME/.dromx-chrome"; say "removed ~/.dromx-chrome"; }
fi

# --- 5. aliases + global npm package ---
for RC in "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$RC" ] || continue
  if grep -qE "alias (dromx|dromx-auto|pi)=" "$RC" 2>/dev/null; then
    if ask "Remove dromx/pi aliases from $RC?"; then
      # macOS/BSD sed vs GNU sed
      if sed --version >/dev/null 2>&1; then
        sed -i -E "/alias (dromx|dromx-auto|pi)=/d" "$RC"
      else
        sed -i '' -E "/alias (dromx|dromx-auto|pi)=/d" "$RC"
      fi
      say "removed aliases from $RC (restart your shell)"
    fi
  fi
done

if npm ls -g dromx-code >/dev/null 2>&1; then
  ask "Uninstall the global npm package 'dromx-code'?" && { npm rm -g dromx-code >/dev/null 2>&1 && say "removed global dromx-code"; }
fi

echo ""
say "Done. (The DromX source checkout, if you cloned one, was left in place.)"
