# Ringside

Ringside is the Tauri v2 mission-control HUD for Ringer. It reads `~/.config/ringer/config.toml`, scans `<state_dir>/runs/*.json`, and emits the run array into the shared dashboard UI.

`SwarmHUD.swift` is the deprecated macOS-only predecessor. Keep it for reference; Ringside is the maintained HUD.

## Prerequisites

```bash
source ~/.cargo/env
cargo install tauri-cli --locked
```

Install the platform prerequisites from the Tauri v2 guide for your OS:

- macOS: Xcode Command Line Tools.
- Linux: WebKitGTK/AppIndicator development packages for your distro.
- Windows: Microsoft C++ Build Tools and WebView2.

## Development

```bash
cd hud
cargo tauri dev
```

No Node/npm toolchain is used. `build.rs` copies `../dashboard/dashboard.html` and `frontend/hud.js` into `hud/dist/` before Tauri builds or runs.

## Release Build

```bash
cd hud
cargo tauri build
```

On macOS this produces `hud/target/release/bundle/macos/Ringside.app` plus release bundles under `hud/target/release/bundle/`.
