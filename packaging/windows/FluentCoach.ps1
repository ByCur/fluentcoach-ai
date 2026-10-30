param(
    [ValidateSet('Install', 'Open', 'Stop', 'Check')]
    [string]$Action = 'Open',
    [switch]$NoBrowser,
    [switch]$NoShortcut
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$compose = Join-Path $PSScriptRoot 'compose.yaml'
# Do not inherit developer credentials, provider overrides or Compose overrides.
$composeArgs = @('compose', '--parallel', '1', '--project-name', 'fluentcoach-desktop', '--env-file', (Join-Path $PSScriptRoot 'desktop.env'), '-f', $compose)

function Invoke-Compose {
    param([string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $script:docker @script:composeArgs @Arguments
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($code -ne 0) { throw 'No se pudo completar la operacion. Comprueba Docker Desktop y vuelve a intentarlo. Tus datos se conservan.' }
}

function Wait-Docker {
    if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notlike 'npipe:*') {
        throw 'Esta entrega solo admite Docker local. Desactiva DOCKER_HOST remoto antes de continuar.'
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        $candidates = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
            (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
        )
        $script:docker = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    } else { $script:docker = (Get-Command docker).Source }
    if (-not $script:docker) { throw 'Instala primero Docker Desktop con WSL 2: https://docs.docker.com/desktop/setup/install/windows-install/ . Despues reinicia Windows si lo solicita y vuelve a abrir INSTALAR.cmd.' }
    # Native stderr is a terminating error under Windows PowerShell 5.1 with
    # ErrorActionPreference=Stop; an unavailable daemon is expected here.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $script:docker info --format '{{.OSType}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        $desktop = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\Docker Desktop.exe'),
            (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe')
        ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
        if ($desktop) { Start-Process -FilePath $desktop -WindowStyle Hidden }
        Write-Host 'Esperando a Docker Desktop (hasta 3 minutos)...'
        $deadline = (Get-Date).AddMinutes(3)
        do {
            Start-Sleep -Seconds 2
            & $script:docker info --format '{{.OSType}}' 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { break }
        } while ((Get-Date) -lt $deadline)
        if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no esta listo. Abre Docker Desktop y revisa WSL 2 y la virtualizacion; despues reintenta.' }
    }
    $ErrorActionPreference = $previousPreference
    $os = & $script:docker info --format '{{.OSType}}'
    if ($os -ne 'linux') { throw 'Selecciona Linux containers en Docker Desktop.' }
    $endpoint = & $script:docker context inspect --format '{{.Endpoints.docker.Host}}'
    if ($endpoint -notlike 'npipe:*') { throw 'Selecciona el contexto local de Docker Desktop; no se admite un servidor remoto.' }
}

function Open-App {
    Invoke-Compose -Arguments @('up', '-d', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '180')
    Write-Host 'Preparando el tutor local. La primera apertura puede tardar...'
    # Warm the model with synthetic text before the first timed learner request.
    Invoke-Compose -Arguments @('exec', '--interactive=false', '-T', 'ollama', 'timeout', '120', 'ollama', 'run', 'llama3.2:3b', 'Reply only with OK.') | Out-Null
    # Health of nginx alone is insufficient: verify the proxied API as well.
    $null = Invoke-RestMethod -Uri 'http://localhost:17880/api/v1/auth/mode' -TimeoutSec 10
    Write-Host 'FluentCoach esta listo en http://localhost:17880'
    if (-not $NoBrowser) { Start-Process 'http://localhost:17880' }
}

$launcherLock = New-Object System.Threading.Mutex($false, 'Local\FluentCoach.Desktop')
$hasLock = $false
try {
    try { $hasLock = $launcherLock.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $hasLock = $true }
    if (-not $hasLock) { throw 'FluentCoach ya se esta iniciando o instalando. Espera a que termine la otra ventana.' }
    Set-Location -LiteralPath $root
    # Explicit file selection also avoids loading an unrelated .env from the PC.
    Wait-Docker
    switch ($Action) {
        'Check' { Invoke-Compose -Arguments @('config', '--quiet'); Write-Host 'Configuracion correcta.' }
        'Stop' { Invoke-Compose -Arguments @('down'); Write-Host 'FluentCoach cerrado. Progreso y modelos conservados.' }
        'Install' {
            Write-Host 'Instalacion local de FluentCoach (version de prueba).'
            Write-Host 'Se descargaran contenedores y los modelos llama3.2:3b y Whisper base (varios GB).'
            Write-Host 'Revisa LEEME.txt y las licencias de los modelos antes de continuar.'
            Write-Host 'La primera instalacion necesita Internet y puede tardar bastante. No se activa ninguna API de pago.'
            Invoke-Compose -Arguments @('config', '--quiet')
            Invoke-Compose -Arguments @('build')
            Invoke-Compose -Arguments @('up', '-d', '--wait', '--wait-timeout', '180', 'postgres', 'redis', 'ollama')
            Invoke-Compose -Arguments @('exec', '-T', 'ollama', 'ollama', 'pull', 'llama3.2:3b')
            # Temporary one-shot container downloads only the multilingual base model.
            Invoke-Compose -Arguments @('run', '--rm', '--no-deps', 'whisper', 'download-model', 'base', '/models')
            Open-App
            if (-not $NoShortcut) {
                $shell = New-Object -ComObject WScript.Shell
                $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'FluentCoach.lnk'))
                $link.TargetPath = Join-Path $root 'ABRIR.cmd'
                $link.WorkingDirectory = $root
                $link.Description = 'Abrir FluentCoach local'
                $link.Save()
            }
            Write-Host 'Instalacion terminada. Las siguientes veces usa ABRIR.cmd o el acceso del escritorio.'
        }
        'Open' { Open-App }
    }
    exit 0
} catch {
    Write-Host ('ERROR: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Si es la primera vez, ejecuta INSTALAR.cmd. No borres los volumenes de Docker: contienen tu progreso.'
    exit 1
} finally {
    if ($hasLock) { $launcherLock.ReleaseMutex() }
    $launcherLock.Dispose()
}
