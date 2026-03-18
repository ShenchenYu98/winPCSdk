@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

set "SOURCE_WECODE=%SCRIPT_DIR%\@wecode"
set "OPENCODE_DIR=%USERPROFILE%\.config\opencode"
set "OPENCODE_JSON=%OPENCODE_DIR%\opencode.json"
set "MESSAGE_BRIDGE_JSONC=%OPENCODE_DIR%\message-bridge.jsonc"
set "NODE_MODULES_DIR=%USERPROFILE%\.cache\opencode\node_modules"
set "TARGET_WECODE=%NODE_MODULES_DIR%\@wecode"
set "NPMRC_FILE=%USERPROFILE%\.npmrc"
set "PLUGIN_NAME=@wecode/skill-opencode-plugin"
set "PREVIEW_FILE=%TEMP%\opencode-install-preview-%RANDOM%%RANDOM%.txt"
set "PS_SCRIPT=%TEMP%\opencode-install-%RANDOM%%RANDOM%.ps1"

call :write_powershell
if errorlevel 1 (
  echo [FAILED] Could not prepare the installer runtime.
  call :maybe_pause
  exit /b 1
)

echo [opencode] one-click installer
echo.

if not exist "%SOURCE_WECODE%" (
  echo [FAILED] Missing install folder: %SOURCE_WECODE%
  echo Keep the .bat file and the @wecode folder in the same directory.
  call :cleanup
  call :maybe_pause
  exit /b 1
)

echo [1/3] Enter AK. Press Enter to allow an empty value.
set "INSTALL_AK="
set /p "INSTALL_AK=> "
echo.
echo [2/3] Enter SK. Press Enter to allow an empty value.
set "INSTALL_SK="
set /p "INSTALL_SK=> "
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" preview
set "PREVIEW_EXIT=%ERRORLEVEL%"
if not "%PREVIEW_EXIT%"=="0" (
  call :handle_error "%PREVIEW_EXIT%"
  call :cleanup
  call :maybe_pause
  exit /b %PREVIEW_EXIT%
)

echo [3/3] Review the pending config changes:
echo.
type "%PREVIEW_FILE%"
echo.
set "INSTALL_CONFIRM="
set /p "INSTALL_CONFIRM=Proceed with install? (y/n): "
if /I not "%INSTALL_CONFIRM%"=="y" (
  echo.
  echo [FAILED] Installation cancelled by user.
  call :cleanup
  call :maybe_pause
  exit /b 1
)

echo.
echo Applying changes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" apply
set "APPLY_EXIT=%ERRORLEVEL%"
if not "%APPLY_EXIT%"=="0" (
  call :handle_error "%APPLY_EXIT%"
  call :cleanup
  call :maybe_pause
  exit /b %APPLY_EXIT%
)

echo [SUCCESS] Installation completed.
echo.
echo Updated paths:
echo - %TARGET_WECODE%
echo - %OPENCODE_JSON%
echo - %NPMRC_FILE%
echo - %MESSAGE_BRIDGE_JSONC%

call :cleanup
call :maybe_pause
exit /b 0

:handle_error
set "INSTALL_EXIT=%~1"
if "%INSTALL_EXIT%"=="11" echo [FAILED] opencode.json was not found: %OPENCODE_JSON%
if "%INSTALL_EXIT%"=="12" echo [FAILED] opencode.json is not valid JSON.
if "%INSTALL_EXIT%"=="13" echo [FAILED] opencode.json root must be a JSON object.
if "%INSTALL_EXIT%"=="21" echo [FAILED] message-bridge.jsonc is not valid JSONC.
if "%INSTALL_EXIT%"=="22" echo [FAILED] message-bridge.jsonc root must be a JSON object.
if "%INSTALL_EXIT%"=="31" echo [FAILED] Could not create or replace the @wecode folder in node_modules.
if "%INSTALL_EXIT%"=="32" echo [FAILED] Could not update opencode.json.
if "%INSTALL_EXIT%"=="33" echo [FAILED] Could not update .npmrc.
if "%INSTALL_EXIT%"=="34" echo [FAILED] Could not update message-bridge.jsonc.
if "%INSTALL_EXIT%"=="35" echo [FAILED] Could not write the preview details.
if "%INSTALL_EXIT%"=="90" echo [FAILED] The installer hit an unexpected error.
exit /b 0

:cleanup
if exist "%PREVIEW_FILE%" del /q "%PREVIEW_FILE%" >nul 2>&1
if exist "%PS_SCRIPT%" del /q "%PS_SCRIPT%" >nul 2>&1
exit /b 0

:maybe_pause
if defined INSTALLER_NO_PAUSE exit /b 0
echo.
pause
exit /b 0

:write_powershell
set "PS_MARKER_LINE="
for /f "tokens=1 delims=:" %%I in ('findstr /n "__POWERSHELL__" "%~f0"') do (
  set "PS_MARKER_LINE=%%I"
)
if not defined PS_MARKER_LINE exit /b 1
more +%PS_MARKER_LINE% "%~f0" > "%PS_SCRIPT%"
if errorlevel 1 exit /b 1
exit /b 0

goto :eof
:__POWERSHELL__
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('preview', 'apply')]
  [string]$Mode
)

$ErrorActionPreference = 'Stop'

$pluginName = $env:PLUGIN_NAME
$sourceWecode = $env:SOURCE_WECODE
$targetWecode = $env:TARGET_WECODE
$nodeModulesDir = $env:NODE_MODULES_DIR
$opencodeJsonPath = $env:OPENCODE_JSON
$messageBridgePath = $env:MESSAGE_BRIDGE_JSONC
$npmrcPath = $env:NPMRC_FILE
$previewPath = $env:PREVIEW_FILE
$ak = $env:INSTALL_AK
$sk = $env:INSTALL_SK

function Fail {
  param(
    [int]$Code,
    [string]$Message
  )

  if ($Message) {
    Write-Host $Message
  }
  exit $Code
}

function ConvertTo-NativeObject {
  param(
    [Parameter(ValueFromPipeline = $true)]
    [object]$InputObject
  )

  if ($null -eq $InputObject) {
    return $null
  }

  if ($InputObject -is [System.Collections.IDictionary]) {
    $dictionary = [ordered]@{}
    foreach ($key in $InputObject.Keys) {
      $dictionary[$key] = ConvertTo-NativeObject $InputObject[$key]
    }
    return $dictionary
  }

  if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
    $dictionary = [ordered]@{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $dictionary[$property.Name] = ConvertTo-NativeObject $property.Value
    }
    return $dictionary
  }

  if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
    $items = New-Object System.Collections.Generic.List[object]
    foreach ($item in $InputObject) {
      [void]$items.Add((ConvertTo-NativeObject $item))
    }
    return $items.ToArray()
  }

  return $InputObject
}

function Get-Utf8Encoding {
  return New-Object System.Text.UTF8Encoding($false, $true)
}

function Read-Utf8Text {
  param(
    [string]$Path,
    [int]$FailureCode
  )

  try {
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $encoding = Get-Utf8Encoding
    $text = $encoding.GetString($bytes)
    if ($text.Length -gt 0 -and [int][char]$text[0] -eq 0xFEFF) {
      $text = $text.Substring(1)
    }
    return $text
  }
  catch {
    Fail -Code $FailureCode -Message ''
  }
}

function Write-Utf8Text {
  param(
    [string]$Path,
    [string]$Text,
    [int]$FailureCode
  )

  try {
    $bytes = (Get-Utf8Encoding).GetBytes($Text)
    [System.IO.File]::WriteAllBytes($Path, $bytes)
  }
  catch {
    Fail -Code $FailureCode -Message ''
  }
}

function Write-Utf8Lines {
  param(
    [string]$Path,
    [string[]]$Lines,
    [int]$FailureCode
  )

  try {
    $text = [string]::Join([Environment]::NewLine, $Lines)
    if ($Lines.Length -gt 0) {
      $text += [Environment]::NewLine
    }
    Write-Utf8Text -Path $Path -Text $text -FailureCode $FailureCode
  }
  catch {
    Fail -Code $FailureCode -Message ''
  }
}

function Read-JsonFile {
  param(
    [string]$Path,
    [int]$InvalidCode,
    [switch]$AllowJsonc
  )

  try {
    $text = Read-Utf8Text -Path $Path -FailureCode $InvalidCode
    if ($AllowJsonc) {
      $text = ConvertFrom-JsoncText -Text $text
    }
    return ($text | ConvertFrom-Json -ErrorAction Stop)
  }
  catch {
    Fail -Code $InvalidCode -Message ''
  }
}

function ConvertFrom-JsoncText {
  param(
    [string]$Text
  )

  $builder = New-Object System.Text.StringBuilder
  $inString = $false
  $escaped = $false
  $inLineComment = $false
  $inBlockComment = $false

  for ($index = 0; $index -lt $Text.Length; $index++) {
    $char = $Text[$index]
    $next = [char]0
    if ($index + 1 -lt $Text.Length) {
      $next = $Text[$index + 1]
    }

    if ($inLineComment) {
      if ($char -eq "`r" -or $char -eq "`n") {
        $inLineComment = $false
        [void]$builder.Append($char)
      }
      continue
    }

    if ($inBlockComment) {
      if ($char -eq '*' -and $next -eq '/') {
        $inBlockComment = $false
        $index++
      }
      continue
    }

    if ($inString) {
      [void]$builder.Append($char)
      if ($escaped) {
        $escaped = $false
      } elseif ($char -eq '\') {
        $escaped = $true
      } elseif ($char -eq '"') {
        $inString = $false
      }
      continue
    }

    if ($char -eq '/' -and $next -eq '/') {
      $inLineComment = $true
      $index++
      continue
    }

    if ($char -eq '/' -and $next -eq '*') {
      $inBlockComment = $true
      $index++
      continue
    }

    if ($char -eq '"') {
      $inString = $true
    }

    [void]$builder.Append($char)
  }

  $withoutComments = $builder.ToString()
  return [regex]::Replace($withoutComments, ',(?=\s*[\}\]])', '')
}

function Load-JsonObject {
  param(
    [string]$Path,
    [int]$MissingCode,
    [int]$InvalidCode,
    [int]$RootCode,
    [switch]$AllowMissing,
    [switch]$AllowJsonc
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    if ($AllowMissing) {
      return [ordered]@{}
    }
    Fail -Code $MissingCode -Message ''
  }

  $parsed = Read-JsonFile -Path $Path -InvalidCode $InvalidCode -AllowJsonc:$AllowJsonc
  $native = ConvertTo-NativeObject $parsed
  if ($native -isnot [System.Collections.IDictionary]) {
    Fail -Code $RootCode -Message ''
  }

  return $native
}

function Test-PluginArrayContains {
  param(
    [object[]]$Values,
    [string]$Needle
  )

  foreach ($value in $Values) {
    if ($value -is [string] -and $value -ceq $Needle) {
      return $true
    }
  }

  return $false
}

function Get-UpdatedPluginList {
  param(
    [System.Collections.IDictionary]$Config
  )

  $pluginExists = $Config.Contains('plugin')
  $currentValue = $null
  if ($pluginExists) {
    $currentValue = $Config['plugin']
  }

  if (-not $pluginExists -or $null -eq $currentValue) {
    return @($pluginName)
  }

  if ($currentValue -is [System.Array]) {
    $plugins = @($currentValue)
    if (-not (Test-PluginArrayContains -Values $plugins -Needle $pluginName)) {
      $plugins += $pluginName
    }
    return $plugins
  }

  if ($currentValue -is [System.Collections.IEnumerable] -and $currentValue -isnot [string]) {
    $plugins = @($currentValue)
    if (-not (Test-PluginArrayContains -Values $plugins -Needle $pluginName)) {
      $plugins += $pluginName
    }
    return $plugins
  }

  if ($currentValue -is [string] -and $currentValue -ceq $pluginName) {
    return @($pluginName)
  }

  return @($currentValue, $pluginName)
}

function Ensure-AuthObject {
  param(
    [System.Collections.IDictionary]$Config
  )

  if (-not $Config.Contains('auth') -or $null -eq $Config['auth'] -or $Config['auth'] -isnot [System.Collections.IDictionary]) {
    $Config['auth'] = [ordered]@{}
  }
}

function Write-JsonObject {
  param(
    [string]$Path,
    [System.Collections.IDictionary]$Data,
    [int]$FailureCode
  )

  $json = $Data | ConvertTo-Json -Depth 32
  Write-Utf8Text -Path $Path -Text $json -FailureCode $FailureCode
}

function Build-PreviewText {
  param(
    [object[]]$Plugins,
    [string]$AkValue,
    [string]$SkValue
  )

  $pluginJson = ConvertTo-Json -InputObject @($Plugins) -Compress
  $lines = @(
    '[opencode.json]',
    ('plugin=' + $pluginJson),
    '',
    '[.npmrc]',
    'sslVerify=false',
    'strict-ssl=false',
    '@wecode:registry=https://cmc.xxx.com/npm/product_npm/',
    '',
    '[message-bridge.jsonc]',
    ('ak=' + $AkValue),
    ('sk=' + $SkValue)
  )

  Write-Utf8Lines -Path $previewPath -Lines $lines -FailureCode 35
}

function Update-NpmrcFile {
  $desired = [ordered]@{
    'sslVerify' = 'false'
    'strict-ssl' = 'false'
    '@wecode:registry' = 'https://cmc.xxx.com/npm/product_npm/'
  }

  try {
    $existingLines = @()
    if (Test-Path -LiteralPath $npmrcPath) {
      $existingLines = @([System.IO.File]::ReadAllLines($npmrcPath, (Get-Utf8Encoding)))
    }

    $resultLines = New-Object System.Collections.Generic.List[string]
    foreach ($line in $existingLines) {
      $shouldSkip = $false
      foreach ($key in $desired.Keys) {
        $pattern = '^\s*' + [regex]::Escape($key) + '\s*='
        if ($line -match $pattern) {
          $shouldSkip = $true
          break
        }
      }

      if (-not $shouldSkip) {
        [void]$resultLines.Add($line)
      }
    }

    foreach ($key in $desired.Keys) {
      [void]$resultLines.Add(($key + '=' + $desired[$key]))
    }

    Write-Utf8Lines -Path $npmrcPath -Lines $resultLines.ToArray() -FailureCode 33
  }
  catch {
    Fail -Code 33 -Message ''
  }
}

function Update-MessageBridgeFile {
  $config = Load-JsonObject -Path $messageBridgePath -MissingCode 0 -InvalidCode 21 -RootCode 22 -AllowMissing -AllowJsonc
  Ensure-AuthObject -Config $config
  $config['auth']['ak'] = $ak
  $config['auth']['sk'] = $sk
  Write-JsonObject -Path $messageBridgePath -Data $config -FailureCode 34
}

function Update-OpencodeConfig {
  $config = Load-JsonObject -Path $opencodeJsonPath -MissingCode 11 -InvalidCode 12 -RootCode 13
  $config['plugin'] = @(Get-UpdatedPluginList -Config $config)
  Write-JsonObject -Path $opencodeJsonPath -Data $config -FailureCode 32
}

function Copy-WecodeFolder {
  try {
    if (-not (Test-Path -LiteralPath $sourceWecode)) {
      Fail -Code 31 -Message ''
    }

    [void](New-Item -ItemType Directory -Path $nodeModulesDir -Force)

    if (Test-Path -LiteralPath $targetWecode) {
      Remove-Item -LiteralPath $targetWecode -Recurse -Force
    }

    Copy-Item -LiteralPath $sourceWecode -Destination $nodeModulesDir -Recurse -Force
  }
  catch {
    Fail -Code 31 -Message ''
  }
}

switch ($Mode) {
  'preview' {
    $opencodeConfig = Load-JsonObject -Path $opencodeJsonPath -MissingCode 11 -InvalidCode 12 -RootCode 13
    if (Test-Path -LiteralPath $messageBridgePath) {
      [void](Load-JsonObject -Path $messageBridgePath -MissingCode 0 -InvalidCode 21 -RootCode 22 -AllowJsonc)
    }

    $plugins = Get-UpdatedPluginList -Config $opencodeConfig
    Build-PreviewText -Plugins $plugins -AkValue $ak -SkValue $sk
    exit 0
  }

  'apply' {
    [void](Load-JsonObject -Path $opencodeJsonPath -MissingCode 11 -InvalidCode 12 -RootCode 13)
    if (Test-Path -LiteralPath $messageBridgePath) {
      [void](Load-JsonObject -Path $messageBridgePath -MissingCode 0 -InvalidCode 21 -RootCode 22 -AllowJsonc)
    }

    Copy-WecodeFolder
    Update-OpencodeConfig
    Update-NpmrcFile
    Update-MessageBridgeFile
    exit 0
  }
}

Fail -Code 90 -Message ''
