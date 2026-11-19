param(
    [ValidateSet('install', 'dev', 'build', 'preview', 'test', 'test:browser')]
    [string]$Task = 'dev'
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$projectTemp = Join-Path $projectDir '.cache/tmp'
New-Item -ItemType Directory -Force -Path $projectTemp | Out-Null
$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$previousCache = $env:npm_config_cache
Push-Location $projectDir
try {
    $env:TEMP = $projectTemp
    $env:TMP = $projectTemp
    $env:npm_config_cache = Join-Path $projectDir '.cache/npm'
    if ($Task -eq 'install') { & npm.cmd install }
    else { & npm.cmd run $Task }
    if ($LASTEXITCODE -ne 0) { throw "npm failed with exit code $LASTEXITCODE" }
}
finally {
    $env:TEMP = $previousTemp
    $env:TMP = $previousTmp
    $env:npm_config_cache = $previousCache
    Pop-Location
}
