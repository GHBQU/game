# UOS ARM64 使用说明

你的目标 CPU 与 APK 内的 `arm64-v8a` 库匹配，不需要为 x86 主机配置 ARM 转译。仍需要 Android 应用运行环境：APK 中的 ARM64 库使用 Android 的接口，不能直接在 UOS 桌面运行。

## 先检查系统现状

在目标 UOS 桌面终端、解压后的目录内运行：

```bash
bash uos-check.sh > uos-check.txt 2>&1
```

这个检查无需 sudo，不会安装软件、添加软件源、启动 Android 容器或修改内核配置。它记录 UOS 版本、CPU、显示会话、已有 Android 环境命令及 Binder 支持线索。

`uos-check.txt` 可用于确定下一步安装方法。仅知道“UOS ARM64”，还不能确定具体软件源、内核配置或桌面类型；本包没有把 Ubuntu/Debian 的软件源直接加入 UOS。

## 已经有 Android 应用环境

如果 UOS 已经安装能导入本地 APK 的 Android 应用环境，先在该环境的“安装本地 APK”等入口选择本包的 `game.apk`，然后从该环境内启动游戏。不同环境的菜单和命令可能不同，本包没有假定 UEngine 等环境的 CLI 参数。

若使用 Waydroid，先确保容器和桌面会话已经运行，再执行：

```bash
bash run.sh check
bash run.sh
```

助手会查询 Android 环境本身是否支持 ARM64/ARMv7，不能只靠 UOS 的 `aarch64` 名称判断。

## UOS 当前为 X11 时

`uos-check.txt` 中 `XDG_SESSION_TYPE=x11` 通常表示当前是 X11 会话。Waydroid 的窗口集成需要 Wayland，不能直接在普通 X11 终端运行本包助手。

可以使用 UOS 提供且设备支持的 Wayland 会话；如果没有，也可以考虑 Weston 的嵌套 Wayland 窗口。下面只是适用于“已经安装 Weston 和 Waydroid、容器已就绪”的手动启动方式，尚未在你的 UOS 版本或 GPU 上验证：

1. 在 X11 桌面的第一个终端打开 Weston，并保持该窗口运行：

   ```bash
   weston --backend=x11-backend.so --socket=waydroid-60s
   ```

2. 在第二个桌面终端启动 Android 会话并保留该终端：

   ```bash
   WAYLAND_DISPLAY=waydroid-60s waydroid session start
   ```

3. 在运行包目录的第三个桌面终端安装并启动游戏：

   ```bash
   WAYLAND_DISPLAY=waydroid-60s bash run.sh
   ```

如果另一个 Waydroid 会话已经在运行，先从原桌面正常退出该会话，再切换到嵌套会话。Weston 的 X11 后端、图形驱动或 Binder 若不可用，上述方式也无法运行游戏；这时需要根据检查结果处理运行环境，不能通过更改 APK 解决。

## 交付状态

已经完成 APK 识别、原文件校验和兼容运行助手制作。尚未连接目标 UOS 设备，没有实际安装 Android 环境或验证游戏运行。详细 APK 检查见 `apk-report.json`，通用步骤及日志导出见 `README.md`。
