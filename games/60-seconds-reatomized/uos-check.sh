#!/usr/bin/env bash
# Read system prerequisites only; do not install packages or change kernel settings.
set -u
export LC_ALL=C
printf '%s\n' 'UOS ARM64 Android runtime prerequisites'
if [ "$(uname -s)" != Linux ]; then
  printf '%s\n' 'Run this check on the target UOS computer.' >&2
  exit 1
fi
printf '\n%s\n' '[OS]'
for release_file in /etc/os-release /etc/uos-release; do
  if [ -r "$release_file" ]; then
    printf '%s\n' "$release_file"
    cat -- "$release_file"
  fi
done
printf '\n%s\n' '[Kernel / CPU]'
uname -r
uname -m
printf '\n%s\n' '[Desktop]'
printf 'XDG_SESSION_TYPE=%s\n' "${XDG_SESSION_TYPE:-unset}"
printf 'WAYLAND_DISPLAY=%s\n' "${WAYLAND_DISPLAY:-unset}"
printf 'DISPLAY=%s\n' "${DISPLAY:-unset}"
printf '\n%s\n' '[Installed commands]'
for candidate in python3 waydroid uengine uengine-cli adb weston; do
  location=$(command -v "$candidate" 2>/dev/null || true)
  printf '%s=%s\n' "$candidate" "${location:-not found}"
done
if command -v dpkg-query >/dev/null 2>&1; then
  printf '\n%s\n' '[Matching package records]'
  dpkg-query -W -f='${binary:Package}\t${Version}\t${Architecture}\t${db:Status-Status}\n' '*waydroid*' '*uengine*' '*weston*' 2>/dev/null || true
fi
if command -v waydroid >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
  printf '\n%s\n' '[Waydroid status]'
  timeout 10s waydroid status 2>&1 || true
fi
printf '\n%s\n' '[Binder kernel configuration]'
kernel_config="/boot/config-$(uname -r)"
if [ -r "$kernel_config" ]; then
  awk '/CONFIG_ANDROID_BINDER|CONFIG_ASHMEM/ {print}' "$kernel_config"
elif [ -r /proc/config.gz ] && command -v gzip >/dev/null 2>&1; then
  gzip -cd /proc/config.gz | awk '/CONFIG_ANDROID_BINDER|CONFIG_ASHMEM/ {print}'
else
  printf '%s\n' 'Kernel config not readable; binder support is UNKNOWN.'
fi
printf '\n%s\n' '[Binder observations]'
if [ -d /sys/module/binder_linux ]; then
  printf '%s\n' '/sys/module/binder_linux exists (loaded or built in).'
fi
if [ -r /proc/filesystems ]; then
  awk '/binder/ {print}' /proc/filesystems
fi
if [ -r /proc/self/mountinfo ]; then
  awk '/binder|ashmem/ {print}' /proc/self/mountinfo
fi
shopt -s nullglob
nodes=(/dev/binder /dev/hwbinder /dev/vndbinder /dev/ashmem /dev/binderfs /dev/binderfs/* /dev/dri/*)
for device in "${nodes[@]}"; do
  if [ -e "$device" ]; then ls -ld -- "$device"; fi
done
printf '\n%s\n' 'Missing nodes alone do not prove the kernel lacks Binder.'
printf '%s\n' 'This report does not prove that the game runs.'
