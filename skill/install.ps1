# LocalEvomap Skill Installer for Windows
# Supports: Claude Code, OpenCode, OpenAI Codex
#
# Usage:
#   irm http://your-server.example.com:3000/install.ps1 | iex
#   irm http://your-server.example.com:3000/install.ps1 | iex -Client claude
#   Or save and run:
#   Invoke-WebRequest http://your-server.example.com:3000/install.ps1 -OutFile install.ps1; .\install.ps1 -Client codex

param(
    [ValidateSet("claude", "opencode", "codex", "all", "")]
    [string]$Client = "",
    [switch]$Project
)

$Server = "http://your-server.example.com:3000"

function Write-Header {
    Write-Host ""
    Write-Host "  LocalEvomap Skill Installer" -ForegroundColor Cyan
    Write-Host "  Server: $Server" -ForegroundColor DarkCyan
    Write-Host ""
}

function Install-Claude {
    Write-Host "[Claude Code] " -ForegroundColor Yellow -NoNewline
    Write-Host "Installing..."

    if ($Project) {
        $dir = Join-Path (Get-Location) ".claude\commands"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $out = Join-Path $dir "evomap.md"
        Invoke-WebRequest -Uri "$Server/skill/claude" -OutFile $out -UseBasicParsing
        Write-Host "  OK " -ForegroundColor Green -NoNewline
        Write-Host "-> .claude\commands\evomap.md"
        Write-Host "     Use: " -NoNewline; Write-Host "/evomap" -ForegroundColor Blue -NoNewline; Write-Host " in Claude Code"
    } else {
        $dir = Join-Path $env:USERPROFILE ".claude\commands"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $out = Join-Path $dir "evomap.md"
        Invoke-WebRequest -Uri "$Server/skill/claude" -OutFile $out -UseBasicParsing
        Write-Host "  OK " -ForegroundColor Green -NoNewline
        Write-Host "-> ~/.claude/commands/evomap.md"
        Write-Host "     Use: " -NoNewline; Write-Host "/evomap" -ForegroundColor Blue -NoNewline; Write-Host " in Claude Code (global)"
    }
}

function Install-OpenCode {
    Write-Host "[OpenCode] " -ForegroundColor Yellow -NoNewline
    Write-Host "Installing..."

    if ($Project) {
        $dir = Join-Path (Get-Location) ".opencode\commands"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $out = Join-Path $dir "evomap.md"
        Invoke-WebRequest -Uri "$Server/skill/opencode" -OutFile $out -UseBasicParsing
        Write-Host "  OK " -ForegroundColor Green -NoNewline
        Write-Host "-> .opencode\commands\evomap.md"
        Write-Host "     Use: " -NoNewline; Write-Host "/evomap" -ForegroundColor Blue -NoNewline; Write-Host " in OpenCode"
    } else {
        $dir = Join-Path $env:USERPROFILE ".config\opencode\commands"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $out = Join-Path $dir "evomap.md"
        Invoke-WebRequest -Uri "$Server/skill/opencode" -OutFile $out -UseBasicParsing
        Write-Host "  OK " -ForegroundColor Green -NoNewline
        Write-Host "-> ~/.config/opencode/commands/evomap.md"
        Write-Host "     Use: " -NoNewline; Write-Host "/evomap" -ForegroundColor Blue -NoNewline; Write-Host " in OpenCode (global)"
    }
}

function Install-Codex {
    Write-Host "[Codex] " -ForegroundColor Yellow -NoNewline
    Write-Host "Installing..."

    if ($Project) {
        $out = Join-Path (Get-Location) "AGENTS.md"
        Invoke-WebRequest -Uri "$Server/skill/codex" -OutFile $out -UseBasicParsing
        Write-Host "  OK " -ForegroundColor Green -NoNewline
        Write-Host "-> ./AGENTS.md"
        Write-Host "     Codex will auto-load on next session"
    } else {
        $dir = Join-Path $env:USERPROFILE ".codex"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $out = Join-Path $dir "AGENTS.md"
        Invoke-WebRequest -Uri "$Server/skill/codex" -OutFile $out -UseBasicParsing
        Write-Host "  OK " -ForegroundColor Green -NoNewline
        Write-Host "-> ~/.codex/AGENTS.md"
        Write-Host "     Codex will auto-load on next session (global)"
    }
}

function Detect-Clients {
    $detected = @()
    if ((Get-Command claude -ErrorAction SilentlyContinue) -or (Test-Path "$env:USERPROFILE\.claude")) {
        $detected += "claude"
    }
    if ((Get-Command opencode -ErrorAction SilentlyContinue) -or (Test-Path "$env:USERPROFILE\.config\opencode")) {
        $detected += "opencode"
    }
    if ((Get-Command codex -ErrorAction SilentlyContinue) -or (Test-Path "$env:USERPROFILE\.codex")) {
        $detected += "codex"
    }
    return $detected
}

# Main
Write-Header

if ($Client) {
    switch ($Client) {
        "claude"  { Install-Claude }
        "opencode" { Install-OpenCode }
        "codex"   { Install-Codex }
        "all"     { Install-Claude; Install-OpenCode; Install-Codex }
    }
} else {
    $detected = Detect-Clients
    if ($detected.Count -eq 0) {
        Write-Host "No clients detected. Installing for all..." -ForegroundColor DarkYellow
        Install-Claude; Install-OpenCode; Install-Codex
    } else {
        Write-Host "Detected: " -NoNewline; Write-Host ($detected -join ", ") -ForegroundColor Green
        Write-Host ""
        foreach ($c in $detected) {
            switch ($c) {
                "claude"  { Install-Claude }
                "opencode" { Install-OpenCode }
                "codex"   { Install-Codex }
            }
        }
    }
}

Write-Host ""
Write-Host "Done! " -ForegroundColor Green -NoNewline
Write-Host "LocalEvomap skill installed."
Write-Host ""
Write-Host "Quick test:"
Write-Host "  curl $Server/api/v1/genes"
Write-Host ""
Write-Host "Dashboard: " -NoNewline; Write-Host $Server -ForegroundColor Blue
Write-Host ""
