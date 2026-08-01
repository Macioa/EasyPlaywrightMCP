# Platform tools

Logical external tools used by EasyPlaywrightMCP’s demo/compile pipeline.  
Runtime resolution lives in `src/platform/tools.ts` — same IDs, same install hints.

To add a tool later: extend `PlatformToolId` + `PLATFORM_TOOLS` in code, then add a row here.

| ID | Purpose | Windows | macOS | Linux |
|----|---------|---------|-------|-------|
| `ffmpeg` | Convert, captions, VO mux, trim, splice | `winget install Gyan.FFmpeg` | `brew install ffmpeg` | `sudo apt install ffmpeg` |
| `ffprobe` | Duration probing (same package as ffmpeg) | same as ffmpeg | same as ffmpeg | same as ffmpeg |
| `python` | Host for edge-tts | `python` / `py` / `python3`; `winget install Python.Python.3.12` | `python3` / `python`; `brew install python` | `python3` / `python`; `sudo apt install python3` |
| `edge-tts` | Microsoft Edge neural TTS | `{python} -m pip install edge-tts` | same | same |
| `caption-font` | ffmpeg `drawtext` fontfile | `%WINDIR%\Fonts\` Arial/Segoe/Calibri | Arial / Helvetica system paths | DejaVu / Liberation |

## Notes

- The server does **not** run winget/brew/apt; it only probes PATH and surfaces the hint on failure.
- Binary names are tried in order from the registry (e.g. Mac prefers `python3` before `python`).
- Bundled fonts under `assets/fonts/` are preferred when present; otherwise OS candidates above.
- MCP tool surface (`login`, `start_session`, …) is unchanged; only these backends are platform-routed.
