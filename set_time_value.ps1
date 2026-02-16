<#
set_time_value.ps1
------------------------------------------------------------
功能说明:
1) 交互模式(-Interactive):
   - 提供 4 个选项:
     [1] 90 分钟: 开发或写作等长时间学习
     [2] 50 分钟: 听课或其他中等时间学习
     [3] 25 分钟: 作业或其他短时间任务
     [4] 自定义: 输入 1~180 分钟
   - 自动同时更新 pomodoro_replay.html 和 pomodoro(index)
     (优先 index.html, 回退 pomodoro_ai.html)

2) 直连模式:
   - 传入 -FilePath 和 -Minutes
   - 只更新一个文件, 适合被 bat 子过程调用

实现逻辑摘要:
- 先做输入和范围校验
- 再做正则分组替换, 只改数字不改 HTML 结构
- 最后用 UTF-8 with BOM 回写, 降低中文乱码风险
- 交互模式会自动适配 pomodoro(index) 文件名:
  优先 index.html, 回退 pomodoro_ai.html
#>

param(
  [string]$FilePath,
  [Nullable[int]]$Minutes,
  [switch]$Interactive
)

function Test-MinutesValid {
  param([Nullable[int]]$Value)
  return ($null -ne $Value -and $Value -ge 1 -and $Value -le 180)
}

function Read-MinutesFromMenu {
  while ($true) {
    Clear-Host
    Write-Host "=============================================="
    Write-Host "番茄钟时长设置"
    Write-Host "=============================================="
    Write-Host ""
    Write-Host "[1] 90 分钟 - 适合开发或写作等长时间学习"
    Write-Host "[2] 50 分钟 - 适合听课或其他中等时间学习"
    Write-Host "[3] 25 分钟 - 适合作业或其他短时间任务"
    Write-Host "[4] 自定义  - 手动输入 1~180 分钟"
    Write-Host "[0] 退出"
    Write-Host "将同步更新: pomodoro_replay + pomodoro(index)"
    Write-Host ""

    $choice = Read-Host "请输入选项(0-4)"
    switch ($choice) {
      "1" { return 90 }
      "2" { return 50 }
      "3" { return 25 }
      "4" {
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

  # 读写统一为 UTF-8 with BOM
  $utf8Bom = [System.Text.UTF8Encoding]::new($true)
  $content = [System.IO.File]::ReadAllText($Path, $utf8Bom)
  $updated = $content

  # 结构A: 复刻页面 span id
  $mainPattern = '(<span\b[^>]*\bid="mainTime"[^>]*>)\d+(</span>)'
  $subPattern  = '(<span\b[^>]*\bid="subTime"[^>]*>)\d+(</span>)'

  # 结构B: AI 页面 h1 和 p.encourage 文案数字
  $h1Pattern = '(<h1\b[^>]*>[^0-9]*)(\d+)([^<]*</h1>)'
  $pPattern  = '(<p\b[^>]*class="[^"]*\bencourage\b[^"]*"[^>]*>[^0-9]*)(\d+)([^<]*</p>)'

  # 先检查是否命中至少一个模式
  $matchCount = 0
  $matchCount += [regex]::Matches($updated, $mainPattern).Count
  $matchCount += [regex]::Matches($updated, $subPattern).Count
  $matchCount += [regex]::Matches($updated, $h1Pattern).Count
  $matchCount += [regex]::Matches($updated, $pPattern).Count

  if ($matchCount -eq 0) {
    Write-Error "No replacements made. Patterns were not matched: $Path"
    return $false
  }

  # 分组替换, 只替换数字
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
  Write-Host ("Updated: " + (Split-Path -Leaf $Path))
  return $true
}

function Resolve-MainPageTarget {
  param([string]$RootPath)

  # 优先新文件名 index.html；不存在再回退旧文件名 pomodoro_ai.html
  $candidates = @("index.html", "pomodoro_ai.html")
  foreach ($name in $candidates) {
    $full = Join-Path $RootPath $name
    if (Test-Path -LiteralPath $full) {
      return $full
    }
  }

  return $null
}

# ---------------------------
# 主流程
# ---------------------------
if ($Interactive) {
  if (-not (Test-MinutesValid -Value $Minutes)) {
    $Minutes = Read-MinutesFromMenu
  }

  if (-not (Test-MinutesValid -Value $Minutes)) {
    Write-Error "Minutes must be between 1 and 180."
    exit 1
  }

  $target1 = Join-Path $PSScriptRoot "pomodoro_replay.html"
  $target2 = Resolve-MainPageTarget -RootPath $PSScriptRoot

  if (-not $target2) {
    Write-Error "pomodoro(index) file not found: expected index.html or pomodoro_ai.html"
    exit 1
  }

  $ok1 = Update-TargetFile -Path $target1 -TargetMinutes $Minutes
  if (-not $ok1) { exit 1 }

  $ok2 = Update-TargetFile -Path $target2 -TargetMinutes $Minutes
  if (-not $ok2) { exit 1 }

  Write-Host ""
  Write-Host ("完成: pomodoro_replay 与 pomodoro(index) 已更新为 {0} 分钟。" -f $Minutes)
  exit 0
}

# 直连模式: 必须有 FilePath + Minutes
if ([string]::IsNullOrWhiteSpace($FilePath)) {
  Write-Error "FilePath is required in non-interactive mode."
  exit 1
}
if (-not (Test-MinutesValid -Value $Minutes)) {
  Write-Error "Minutes must be between 1 and 180."
  exit 1
}

$ok = Update-TargetFile -Path $FilePath -TargetMinutes $Minutes
if (-not $ok) { exit 1 }
exit 0
