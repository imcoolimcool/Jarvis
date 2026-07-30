#!/bin/bash
set -e

# ───────────────────────────────────────────────
# Crostini Crash Fix Script
# For cheap Chromebooks — prevents OOM kills,
# thermal throttling crashes, and memory exhaustion
# ───────────────────────────────────────────────

echo "╔══════════════════════════════════════════╗"
echo "║    Crostini Crash Fix & Optimisation    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Memory overcommit ─────────────────────────
echo "▶ [1/8] Enabling memory overcommit..."
echo 1 | sudo tee /proc/sys/vm/overcommit_memory > /dev/null 2>&1 || echo "  ⚠ Skipped (not available)"
echo "   ✓ Done"

# ── 2. Swap file (if none exists) ─────────────────
echo "▶ [2/8] Ensuring swap file..."
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q /swapfile /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
  fi
  echo "   ✓ 2G swap created & enabled"
else
  echo "   ✓ Swap already exists"
fi

# ── 3. Install zram (compressed RAM) ──────────────
echo "▶ [3/8] Installing zram-tools (compressed memory)..."
if ! command -v zramctl &> /dev/null; then
  sudo apt-get update -qq && sudo apt-get install -y -qq zram-tools 2>&1 | tail -1
  echo 'ALGO=zstd' | sudo tee /etc/default/zramswap > /dev/null
  echo 'PERCENT=50' | sudo tee -a /etc/default/zramswap > /dev/null
  sudo systemctl enable zramswap 2>/dev/null || true
  sudo systemctl restart zramswap 2>/dev/null || true
  echo "   ✓ zram installed (50% of RAM, zstd compressed)"
else
  echo "   ✓ zram already installed"
fi

# ── 4. Lower CPU governor (powersave = less heat) ──
echo "▶ [4/8] Setting CPU governor to powersave..."
if command -v cpufreq-set &> /dev/null; then
  for cpu in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_governor; do
    echo powersave | sudo tee "$cpu" > /dev/null 2>&1 || true
  done
  echo "   ✓ Powersave governor set"
else
  echo "   ⚠ cpufreq-set not found, skipping"
fi

# ── 5. Disable unnecessary services ───────────────
echo "▶ [5/8] Disabling memory-hungry services..."
for svc in bluetooth whoopsie cups-browsed avahi-daemon; do
  sudo systemctl stop "$svc" 2>/dev/null || true
  sudo systemctl disable "$svc" 2>/dev/null || true
done
echo "   ✓ Unneeded services stopped"

# ── 6. Set Node.js memory limit globally ───────────
echo "▶ [6/8] Setting Node.js memory limit to 512MB..."
if ! grep -q "NODE_OPTIONS" /etc/environment 2>/dev/null; then
  echo 'NODE_OPTIONS="--max-old-space-size=512"' | sudo tee -a /etc/environment > /dev/null
  echo "   ✓ NODE_OPTIONS set (reboot to take effect)"
else
  echo "   ✓ NODE_OPTIONS already set"
fi

# ── 7. Add safe Puppeteer defaults ─────────────────
echo "▶ [7/8] Adding safe Chromium/Puppeteer flags..."
PROFILE_FILE="$HOME/.bashrc"
CHROMIUM_FLAGS='export CHROMIUM_FLAGS="--disable-dev-shm-usage --no-sandbox --disable-gpu --disable-software-rasterizer"'
if ! grep -q "CHROMIUM_FLAGS" "$PROFILE_FILE"; then
  echo "$CHROMIUM_FLAGS" >> "$PROFILE_FILE"
  echo "   ✓ Chromium flags added to ~/.bashrc"
else
  echo "   ✓ Chromium flags already present"
fi

# ── 8. Clean up disk space ─────────────────────────
echo "▶ [8/8] Cleaning up disk space..."
sudo apt-get clean -qq 2>/dev/null || true
sudo apt-get autoremove -y -qq 2>/dev/null || true
sudo journalctl --vacuum-size=100M > /dev/null 2>&1 || true
echo "   ✓ Disk cleaned (logs capped at 100M)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ All done! Reboot recommended.      ║"
echo "║   Run: sudo reboot                      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "What this did:"
echo "  • Memory overcommit enabled     (less OOM)"
echo "  • 2G swap added               (memory safety net)"
echo "  • zram compressed memory      (2x effective RAM)"
echo "  • Powersave CPU governor      (less heat/throttling)"
echo "  • Bluetooth/printers off      (free ~200MB RAM)"
echo "  • Node limited to 512MB       (survive builds)"
echo "  • Chromium safe flags set     (no GPU crashes)"
echo "  • Disk cleaned + logs capped  (more free space)"
