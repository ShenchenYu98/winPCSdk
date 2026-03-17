@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "SOURCE_PLUGIN=%SCRIPT_DIR%\message-bridge.plugin.js"
set "OPENCODE_DIR=%USERPROFILE%\.config\opencode"
set "PLUGINS_DIR=%OPENCODE_DIR%\plugins"
set "TARGET_PLUGIN=%PLUGINS_DIR%\message-bridge.plugin.js"
set "CONFIG_FILE=%OPENCODE_DIR%\message-bridge.json"

set "PLUGIN_STATUS=FAILED"
set "PLUGIN_ERROR_MESSAGE="
set "JSON_STATUS=FAILED"
set "JSON_ERROR_MESSAGE="
set "FINAL_STATUS=FAILURE"

echo [opencode] message-bridge installer
echo.

if not exist "%SOURCE_PLUGIN%" (
  echo [FAILED] Missing install file: message-bridge.plugin.js
  echo Keep the .bat file and message-bridge.plugin.js in the same folder.
  echo.
  pause
  exit /b 1
)

if not exist "%OPENCODE_DIR%" (
  echo [FAILED] opencode config directory was not found:
  echo %OPENCODE_DIR%
  echo Please install and initialize opencode for this user first.
  echo.
  pause
  exit /b 1
)

echo [1/3] Enter AK. Press Enter to save an empty string.
set "INSTALL_AK="
set /p "INSTALL_AK=> "
echo.
echo [2/3] Enter SK. Press Enter to save an empty string.
set "INSTALL_SK="
set /p "INSTALL_SK=> "
echo.
echo [3/3] Installing plugin and updating config...
echo.

if not exist "%PLUGINS_DIR%" mkdir "%PLUGINS_DIR%" >nul 2>&1

if not exist "%PLUGINS_DIR%" (
  set "PLUGIN_STATUS=FAILED"
  set "PLUGIN_ERROR_MESSAGE=Could not create the plugins directory."
) else (
  copy /Y "%SOURCE_PLUGIN%" "%TARGET_PLUGIN%" >nul
  if errorlevel 1 (
    set "PLUGIN_STATUS=FAILED"
    set "PLUGIN_ERROR_MESSAGE=Could not copy the plugin file."
  ) else (
    set "PLUGIN_STATUS=SUCCESS"
  )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "& {" ^
  "param([string]$ak, [string]$sk)" ^
  "$ErrorActionPreference = 'Stop';" ^
  "$configPath = $env:CONFIG_FILE;" ^
  "function ConvertTo-NativeObject([object]$InputObject) {" ^
  "  if ($null -eq $InputObject) { return $null }" ^
  "  if ($InputObject -is [System.Collections.IDictionary]) {" ^
  "    $hash = @{}; foreach ($key in $InputObject.Keys) { $hash[$key] = ConvertTo-NativeObject $InputObject[$key] }; return $hash" ^
  "  }" ^
  "  if ($InputObject -is [System.Management.Automation.PSCustomObject]) {" ^
  "    $hash = @{}; foreach ($property in $InputObject.PSObject.Properties) { $hash[$property.Name] = ConvertTo-NativeObject $property.Value }; return $hash" ^
  "  }" ^
  "  if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {" ^
  "    $items = New-Object System.Collections.ArrayList; foreach ($item in $InputObject) { [void]$items.Add((ConvertTo-NativeObject $item)) }; return ,$items.ToArray()" ^
  "  }" ^
  "  return $InputObject" ^
  "}" ^
  "if (Test-Path -LiteralPath $configPath) {" ^
  "  try { $parsed = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -ErrorAction Stop } catch { exit 11 }" ^
  "  $config = ConvertTo-NativeObject $parsed;" ^
  "  if ($config -isnot [System.Collections.IDictionary]) { exit 12 }" ^
  "} else {" ^
  "  $config = @{}" ^
  "}" ^
  "if (-not $config.ContainsKey('auth') -or $null -eq $config['auth'] -or $config['auth'] -isnot [System.Collections.IDictionary]) { $config['auth'] = @{} }" ^
  "$config['auth']['ak'] = $ak;" ^
  "$config['auth']['sk'] = $sk;" ^
  "$json = $config | ConvertTo-Json -Depth 32;" ^
  "Set-Content -LiteralPath $configPath -Value $json -Encoding UTF8" ^
  "}" ^
  "%INSTALL_AK%" "%INSTALL_SK%"

set "JSON_EXIT_CODE=%ERRORLEVEL%"

if "%JSON_EXIT_CODE%"=="0" (
  set "JSON_STATUS=SUCCESS"
) else (
  if "%JSON_EXIT_CODE%"=="11" (
    set "JSON_STATUS=FAILED"
    set "JSON_ERROR_MESSAGE=message-bridge.json is not valid JSON. No overwrite was made."
  ) else (
    if "%JSON_EXIT_CODE%"=="12" (
      set "JSON_STATUS=FAILED"
      set "JSON_ERROR_MESSAGE=message-bridge.json root must be a JSON object."
    ) else (
      set "JSON_STATUS=FAILED"
      set "JSON_ERROR_MESSAGE=message-bridge.json update failed. Check file permissions."
    )
  )
)

if "%PLUGIN_STATUS%"=="SUCCESS" if "%JSON_STATUS%"=="SUCCESS" set "FINAL_STATUS=SUCCESS"
if not "%FINAL_STATUS%"=="SUCCESS" if "%PLUGIN_STATUS%"=="SUCCESS" set "FINAL_STATUS=PARTIAL"
if not "%FINAL_STATUS%"=="SUCCESS" if "%JSON_STATUS%"=="SUCCESS" set "FINAL_STATUS=PARTIAL"

if "%FINAL_STATUS%"=="SUCCESS" (
  echo [SUCCESS] Plugin installed and config updated.
  exit /b 0
)

if "%FINAL_STATUS%"=="PARTIAL" (
  echo [PARTIAL] Some steps succeeded, but at least one step failed.
) else (
  echo [FAILED] The install did not complete successfully.
)

echo.
if "%PLUGIN_STATUS%"=="SUCCESS" (
  echo - Plugin copy: success
) else (
  echo - Plugin copy: failed
  if not "%PLUGIN_ERROR_MESSAGE%"=="" echo   Reason: %PLUGIN_ERROR_MESSAGE%
)

if "%JSON_STATUS%"=="SUCCESS" (
  echo - Config update: success
) else (
  echo - Config update: failed
  if not "%JSON_ERROR_MESSAGE%"=="" echo   Reason: %JSON_ERROR_MESSAGE%
)

echo.
echo Config directory: %OPENCODE_DIR%
echo Plugin path: %TARGET_PLUGIN%
echo Config file: %CONFIG_FILE%
echo.
pause

if "%FINAL_STATUS%"=="PARTIAL" (
  exit /b 2
)

exit /b 1
