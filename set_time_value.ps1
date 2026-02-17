<#
set_time_value.ps1
------------------------------------------------------------
功能说明:
1) 交互模式(-Interactive):
   - 提供 6 个选项:
     [1] 90 分钟: 开发或写作等长时间学习
     [2] 50 分钟: 听课或其他中等时间学习
     [3] 25 分钟: 作业或其他短时间任务
     [4] 自定义: 输入 1~180 分钟
     [5] 开启页面提示音(WebAudio 木琴)
     [6] 关闭页面提示音
   - 自动同时更新 pomodoro_replay.html 和 pomodoro(index)
     (优先 index.html, 回退 pomodoro_ai.html)

2) 直连模式:
   - 传入 -FilePath 和 -Minutes 可改时长
   - 传入 -FilePath 和 -Sound(on/off) 可改音效开关
   - 可同时传入 Minutes + Sound 一起更新

实现逻辑摘要:
- 先做输入和范围校验
- 再做正则分组替换, 只改数字/音效开关不改结构
- 最后用 UTF-8 with BOM 回写, 降低中文乱码风险
- 交互模式会自动适配 pomodoro(index) 文件名:
  优先 index.html, 回退 pomodoro_ai.html
#>

param(
  [string]$FilePath,
  [Nullable[int]]$Minutes,
  [ValidateSet("on", "off")]
  [string]$Sound,
  [switch]$Interactive
)

function Test-MinutesValid {
  param([Nullable[int]]$Value)
  return ($null -ne $Value -and $Value -ge 1 -and $Value -le 180)
}

function Test-SoundValid {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $v = $Value.Trim().ToLowerInvariant()
  return ($v -eq "on" -or $v -eq "off")
}

function Read-CustomMinutes {
  while ($true) {
    $raw = Read-Host "请输入自定义分钟数(1-180)"
    $parsed = 0
    if (-not [int]::TryParse($raw, [ref]$parsed)) {
      Write-Host "输入无效: 必须是整数。"
      Start-Sleep -Milliseconds 900
      continue
    }
    if ($parsed -lt 1 -or $parsed -gt 180) {
      Write-Host "输入无效: 只能输入 1~180。"
      Start-Sleep -Milliseconds 900
      continue
    }
    return $parsed
  }
}

function Read-InteractiveAction {
  while ($true) {
    Clear-Host
    Write-Host "=============================================="
    Write-Host "番茄钟设置"
    Write-Host "=============================================="
    Write-Host ""
    Write-Host "[1] 90 分钟 - 适合开发或写作等长时间学习"
    Write-Host "[2] 50 分钟 - 适合听课或其他中等时间学习"
    Write-Host "[3] 25 分钟 - 适合作业或其他短时间任务"
    Write-Host "[4] 自定义  - 手动输入 1~180 分钟"
    Write-Host "[5] 开启页面提示音（WebAudio 木琴）"
    Write-Host "[6] 关闭页面提示音"
    Write-Host "[0] 退出"
    Write-Host ""
    Write-Host "时长会同步更新: pomodoro_replay + pomodoro(index)"
    Write-Host "音效开关作用于: pomodoro(index)"
    Write-Host ""

    $choice = Read-Host "请输入选项(0-6)"
    switch ($choice) {
      "1" { return [pscustomobject]@{ Action = "minutes"; Minutes = 90; Sound = $null } }
      "2" { return [pscustomobject]@{ Action = "minutes"; Minutes = 50; Sound = $null } }
      "3" { return [pscustomobject]@{ Action = "minutes"; Minutes = 25; Sound = $null } }
      "4" {
        $custom = Read-CustomMinutes
        return [pscustomobject]@{ Action = "minutes"; Minutes = $custom; Sound = $null }
      }
      "5" { return [pscustomobject]@{ Action = "sound"; Minutes = $null; Sound = "on" } }
      "6" { return [pscustomobject]@{ Action = "sound"; Minutes = $null; Sound = "off" } }
      "0" {
        Write-Host "已取消。"
        exit 0
      }
      default {
        Write-Host "无效选项, 请重新输入。"
        Start-Sleep -Milliseconds 900
      }
    }
  }
}

function Update-TargetFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [int]$TargetMinutes
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Error "Target file not found: $Path"
    return $false
  }

  $utf8Bom = [System.Text.UTF8Encoding]::new($true)
  $content = [System.IO.File]::ReadAllText($Path, $utf8Bom)
  $updated = $content

  $mainPattern = '(<span\b[^>]*\bid="mainTime"[^>]*>)\d+(</span>)'
  $subPattern  = '(<span\b[^>]*\bid="subTime"[^>]*>)\d+(</span>)'
  $h1Pattern   = '(<h1\b[^>]*>[^0-9]*)(\d+)([^<]*</h1>)'
  $pPattern    = '(<p\b[^>]*class="[^"]*\bencourage\b[^"]*"[^>]*>[^0-9]*)(\d+)([^<]*</p>)'

  $matchCount = 0
  $matchCount += [regex]::Matches($updated, $mainPattern).Count
  $matchCount += [regex]::Matches($updated, $subPattern).Count
  $matchCount += [regex]::Matches($updated, $h1Pattern).Count
  $matchCount += [regex]::Matches($updated, $pPattern).Count

  if ($matchCount -eq 0) {
    Write-Error "No replacements made. Patterns were not matched: $Path"
    return $false
  }

  $updated = [regex]::Replace($updated, $mainPattern, {
    param($m) $m.Groups[1].Value + $TargetMinutes + $m.Groups[2].Value
  })
  $updated = [regex]::Replace($updated, $subPattern, {
    param($m) $m.Groups[1].Value + $TargetMinutes + $m.Groups[2].Value
  })
  $updated = [regex]::Replace($updated, $h1Pattern, {
    param($m) $m.Groups[1].Value + $TargetMinutes + $m.Groups[3].Value
  })
  $updated = [regex]::Replace($updated, $pPattern, {
    param($m) $m.Groups[1].Value + $TargetMinutes + $m.Groups[3].Value
  })

  [System.IO.File]::WriteAllText($Path, $updated, $utf8Bom)
  Write-Host ("Updated minutes: " + (Split-Path -Leaf $Path))
  return $true
}

function Update-OpenSoundFlag {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [ValidateSet("on", "off")]
    [string]$SoundState
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Error "Target file not found: $Path"
    return $false
  }

  $utf8Bom = [System.Text.UTF8Encoding]::new($true)
  $content = [System.IO.File]::ReadAllText($Path, $utf8Bom)
  $updated = $content

  $metaPattern = '<meta\s+name=["'']pomodoro-open-sound["'']\s+content=["''][^"'']*["'']\s*/?>'
  $metaLine = "<meta name=`"pomodoro-open-sound`" content=`"$SoundState`" />"
  $metaRegex = [regex]::new($metaPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)

  if ($metaRegex.IsMatch($updated)) {
    $updated = $metaRegex.Replace($updated, $metaLine, 1)
  } else {
    $newline = if ($updated.Contains("`r`n")) { "`r`n" } else { "`n" }
    if ($updated -match "</head>") {
      $updated = $updated -replace "</head>", ("  $metaLine$newline</head>")
    } else {
      Write-Error "Cannot find </head> to insert sound meta: $Path"
      return $false
    }
  }

  [System.IO.File]::WriteAllText($Path, $updated, $utf8Bom)
  Write-Host ("Updated open-sound: " + (Split-Path -Leaf $Path) + " => " + $SoundState)
  return $true
}

function Resolve-MainPageTarget {
  param([string]$RootPath)
  $candidates = @("index.html", "pomodoro_ai.html")
  foreach ($name in $candidates) {
    $full = Join-Path $RootPath $name
    if (Test-Path -LiteralPath $full) { return $full }
  }
  return $null
}

if ($Interactive) {
  $actionType = $null
  $selectedMinutes = $null
  $selectedSound = $null

  if (Test-SoundValid -Value $Sound) {
    $actionType = "sound"
    $selectedSound = $Sound.Trim().ToLowerInvariant()
  } elseif (Test-MinutesValid -Value $Minutes) {
    $actionType = "minutes"
    $selectedMinutes = $Minutes
  } else {
    $action = Read-InteractiveAction
    $actionType = $action.Action
    $selectedMinutes = $action.Minutes
    $selectedSound = $action.Sound
  }

  if ($actionType -eq "minutes") {
    if (-not (Test-MinutesValid -Value $selectedMinutes)) {
      Write-Error "Minutes must be between 1 and 180."
      exit 1
    }

    $target1 = Join-Path $PSScriptRoot "pomodoro_replay.html"
    $target2 = Resolve-MainPageTarget -RootPath $PSScriptRoot
    if (-not $target2) {
      Write-Error "pomodoro(index) file not found: expected index.html or pomodoro_ai.html"
      exit 1
    }

    $ok1 = Update-TargetFile -Path $target1 -TargetMinutes $selectedMinutes
    if (-not $ok1) { exit 1 }
    $ok2 = Update-TargetFile -Path $target2 -TargetMinutes $selectedMinutes
    if (-not $ok2) { exit 1 }

    Write-Host ""
    Write-Host ("完成: pomodoro_replay 与 pomodoro(index) 已更新为 {0} 分钟。" -f $selectedMinutes)
    exit 0
  }

  if ($actionType -eq "sound") {
    if (-not (Test-SoundValid -Value $selectedSound)) {
      Write-Error "Sound must be on or off."
      exit 1
    }
    $target = Resolve-MainPageTarget -RootPath $PSScriptRoot
    if (-not $target) {
      Write-Error "pomodoro(index) file not found: expected index.html or pomodoro_ai.html"
      exit 1
    }

    $ok = Update-OpenSoundFlag -Path $target -SoundState $selectedSound
    if (-not $ok) { exit 1 }
    Write-Host ""
    Write-Host ("完成: pomodoro(index) 页面打开提示音已设置为 {0}。" -f $selectedSound)
    exit 0
  }

  Write-Error "Unsupported interactive action."
  exit 1
}

if ([string]::IsNullOrWhiteSpace($FilePath)) {
  Write-Error "FilePath is required in non-interactive mode."
  exit 1
}

$didAnyWork = $false
$allOk = $true

if (Test-MinutesValid -Value $Minutes) {
  $didAnyWork = $true
  $okMinutes = Update-TargetFile -Path $FilePath -TargetMinutes $Minutes
  if (-not $okMinutes) { $allOk = $false }
}

if (Test-SoundValid -Value $Sound) {
  $didAnyWork = $true
  $soundValue = $Sound.Trim().ToLowerInvariant()
  $okSound = Update-OpenSoundFlag -Path $FilePath -SoundState $soundValue
  if (-not $okSound) { $allOk = $false }
}

if (-not $didAnyWork) {
  Write-Error "In non-interactive mode, pass -Minutes and/or -Sound(on|off)."
  exit 1
}

if (-not $allOk) { exit 1 }
exit 0
