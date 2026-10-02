# Local whisper.cpp and ffmpeg setup on Windows

FluentCoach does not install or download whisper.cpp, ffmpeg, or a model. Run
these PowerShell commands in a host directory outside the repository:

```powershell
winget install --id Git.Git -e
winget install --id Kitware.CMake -e
winget install --id Gyan.FFmpeg -e
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release -j
PowerShell -ExecutionPolicy Bypass -File .\models\download-ggml-model.ps1 base.en
.\build\bin\Release\whisper-server.exe -m .\models\ggml-base.en.bin --host 127.0.0.1 --port 8080 --convert
```

Choose a different explicitly downloaded model by changing both model commands.
`--convert` allows whisper-server to ask host ffmpeg to convert MediaRecorder
WebM/Opus. Verify that both executables and the chosen model exist; no model is
silently downloaded by FluentCoach.

In another PowerShell window, from the FluentCoach repository:

```powershell
$env:SPEECH_PROVIDER="whisper-cpp"
$env:WHISPER_BASE_URL="http://127.0.0.1:8080"
$env:WHISPER_LANGUAGE="auto"
$env:WHISPER_TIMEOUT_MS="45000"
pnpm smoke:whisper -- C:\path\to\synthetic-speech.webm
```

The smoke command prints provider, success/failure status, transcript, and
elapsed milliseconds. Use synthetic or consented audio; the script does not
write audio or transcripts to FluentCoach storage.
