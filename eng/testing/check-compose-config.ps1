# SPDX-License-Identifier: Apache-2.0
# Licensed to the Ed-Fi Alliance under one or more agreements.
# The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
# See the LICENSE and NOTICES files in the project root for more information.

<#
.SYNOPSIS
Validates that the Docker Compose stack still renders from compose/.env.example.

.DESCRIPTION
Renders the compose files without starting anything - `docker compose config` only
parses and interpolates, so no Docker daemon is required - and asserts three things:

  1. Every compose file parses on its own, so a YAML error names the file it is in.
  2. The merged render declares every variable it references. Compose warns about a
     referenced-but-undeclared variable only when that reference has NO ':-' default,
     so this catches roughly a third of the variables in play. See LIMITATIONS below.
  3. Every service's healthcheck command matches compose/compose-healthchecks.golden.
     compose/edfi-services.yml defines its healthchecks through YAML anchors; this
     assertion is what catches a service pointed at the wrong anchor, which renders as
     valid YAML and would otherwise pass silently.

LIMITATIONS - what this does NOT catch:
  * A variable removed from compose/.env.example whose compose reference has a ':-'
    default. Compose falls back silently with no warning, so the stack changes and this
    check stays green. Tracked as a follow-up in the AC-520 audit under docs/design/.
  * A variable declared with an empty value. It IS set, so no warning is emitted.
  * A variable declared in compose/.env.example that nothing references any more.

.PARAMETER UpdateGolden
Rewrites compose/compose-healthchecks.golden from the current render instead of
comparing against it. Use after deliberately changing a healthcheck probe, and review
the resulting diff.

.EXAMPLE
pwsh ./eng/testing/check-compose-config.ps1

.EXAMPLE
pwsh ./eng/testing/check-compose-config.ps1 -UpdateGolden
#>

[CmdletBinding()]
param(
  [switch]$UpdateGolden
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..' '..')
$composeDir = Join-Path $repoRoot 'compose'
$goldenPath = Join-Path $composeDir 'compose-healthchecks.golden'

# Every compose file in compose/, discovered rather than hardcoded, so adding one
# does not silently fall out of coverage.
$composeFiles = Get-ChildItem -Path $composeDir -Filter '*.yml' | Sort-Object Name

if ($composeFiles.Count -eq 0) {
  throw "No compose files found in $composeDir."
}

# Isolate Compose interpolation from the caller's environment.
#
# `--env-file` does NOT make Compose ignore exported variables - the shell environment
# takes PRECEDENCE over the env file. So an exported POSTGRES_USER silently changes the
# rendered healthcheck commands (a spurious golden failure), an exported MSSQL_SA_PASSWORD
# suppresses the warning the self-test below depends on (a spurious self-test failure that
# blames Compose for rewording), and any other exported name can mask a variable that
# compose/.env.example fails to declare.
#
# Only names the compose files actually interpolate are cleared, so PATH, DOCKER_HOST and
# everything else the Docker CLI needs are left untouched. Restored in the finally block.
$referencedVars = $composeFiles |
  ForEach-Object { [regex]::Matches((Get-Content $_.FullName -Raw), '\$\{([A-Za-z_][A-Za-z0-9_]*)') } |
  ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique

$savedEnv = @{}
foreach ($name in $referencedVars) {
  $existing = [Environment]::GetEnvironmentVariable($name)
  if ($null -ne $existing) {
    $savedEnv[$name] = $existing
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
}
if ($savedEnv.Count -gt 0) {
  # Say so rather than silently ignoring them, or the developer wonders why their export
  # had no effect.
  Write-Host (
    "Ignoring $($savedEnv.Count) exported variable(s) so the check reads compose/.env.example " +
    "only: $(($savedEnv.Keys | Sort-Object) -join ', ')") -ForegroundColor DarkGray
}

# MSSQL_SA_PASSWORD is intentionally undeclared: it has no default and must be supplied
# by the operator, or by eng/testing/run-e2e-ui.ps1 for the E2E run. Matched on the full
# quoted name so a longer variable (MSSQL_SA_PASSWORD_FILE) is not swallowed too.
$expectedUndeclared = @('MSSQL_SA_PASSWORD')

$isCI = $env:GITHUB_ACTIONS -eq 'true'
$failed = $false

function Write-Failure {
  param([string]$Message, [string]$File)
  $script:failed = $true
  if ($isCI) {
    if ($File) { Write-Host "::error file=$File::$Message" } else { Write-Host "::error::$Message" }
  }
  Write-Host "FAIL: $Message" -ForegroundColor Red
}

Push-Location $composeDir
try {
  # --- 1. Per-file parse, so a YAML error names its own file ------------------------
  foreach ($file in $composeFiles) {
    # --env-file is required even here. Without it Compose falls back to compose/.env,
    # which is gitignored and does not exist on a CI runner, so every interpolated value
    # renders empty and unrelated errors appear (a blank LOGS_FOLDER turns a volume spec
    # into ':/app/logs'). Always validate against the file the repo actually ships.
    $null = & docker compose -f $file.Name --env-file '.env.example' config --quiet 2>&1
    if ($LASTEXITCODE -ne 0) {
      $raw = (& docker compose -f $file.Name --env-file '.env.example' config --quiet 2>&1 | Out-String)
      # Drop Compose's warning lines: the real error is usually last, and a CI annotation
      # shows only the first line of the message.
      $detail = ($raw -split "`n" | Where-Object { $_ -notmatch 'level=warning' }) -join ' '
      # Compose error text is repo-controlled; strip '::' so it cannot forge a
      # workflow command in the Actions log.
      $detail = ($detail -replace '::', ': :').Trim()
      Write-Failure -Message "Failed to parse $($file.Name). $detail" -File "compose/$($file.Name)"
    }
  }
  # A file that does not parse makes every later assertion meaningless, so stop here.
  # Must be `exit`, not `return`: `return` at script scope ends the script with code 0.
  if ($failed) { exit 1 }

  $fileArgs = $composeFiles | ForEach-Object { '-f'; $_.Name }

  # Ask Compose for the profile list instead of scanning the YAML. A text scan only
  # recognises one shape - the first item of a block list directly under `profiles:` -
  # and silently misses `profiles: [alpha, beta]` or a second block-list item. A profile
  # missed here means its services never render, so they would be absent from the
  # all-profiles golden comparison below without anything failing.
  $profiles = & docker compose @fileArgs --env-file '.env.example' config --profiles 2>$null |
    Where-Object { $_ -match '\S' } |
    Sort-Object -Unique
  if ($LASTEXITCODE -ne 0 -or -not $profiles) {
    Write-Failure -Message (
      'Could not list compose profiles via `docker compose config --profiles`. ' +
      'Every later assertion depends on that list, so stopping here.')
    exit 1
  }

  # --- 2. Undeclared variables, per profile -----------------------------------------
  foreach ($profile in $profiles) {
    $stderrPath = New-TemporaryFile
    try {
      $null = & docker compose @fileArgs --env-file '.env.example' --profile $profile config `
        2> $stderrPath.FullName
      if ($LASTEXITCODE -ne 0) {
        $detail = ((Get-Content $stderrPath.FullName -Raw) -replace '::', ': :').Trim()
        Write-Failure -Message "docker compose config failed for profile '$profile'. $detail"
        continue
      }

      # Compose writes structured logs, so the quotes around the variable name arrive
      # escaped: msg="The \"FOO\" variable is not set." Tolerate both forms.
      $warningLines = Get-Content $stderrPath.FullName
      $missing = $warningLines |
        Select-String -Pattern '\\?"([A-Za-z_][A-Za-z0-9_]*)\\?" variable is not set' |
        ForEach-Object { $_.Matches[0].Groups[1].Value } |
        Where-Object { $expectedUndeclared -notcontains $_ } |
        Sort-Object -Unique

      # Guard against the detector silently breaking if Compose ever rewords this
      # warning: MSSQL_SA_PASSWORD is always undeclared, so we must always see it.
      $sawExpected = $warningLines |
        Select-String -Pattern '\\?"MSSQL_SA_PASSWORD\\?" variable is not set' -Quiet
      if (-not $sawExpected) {
        Write-Failure -Message (
          "Self-test failed for profile '$profile': expected a 'MSSQL_SA_PASSWORD variable is not " +
          "set' warning and saw none. Compose may have reworded the warning, which would silently " +
          "disable this check. Update the pattern in $($MyInvocation.MyCommand.Name).")
      }

      if ($missing) {
        Write-Failure -File 'compose/.env.example' -Message (
          "Undeclared variable(s) referenced by compose but missing from compose/.env.example " +
          "(profile '$profile'): $($missing -join ', '). Declare each one, or give the reference " +
          "a ':-' default in the compose file.")
      }
      else {
        Write-Host "Profile '$profile': no undeclared variables." -ForegroundColor Green
      }
    }
    finally {
      Remove-Item $stderrPath.FullName -Force -ErrorAction SilentlyContinue
    }
  }

  # --- 3. Healthcheck commands match the golden file --------------------------------
  # Rendered with every profile enabled so profile-gated services (the Admin App's own
  # postgres and mssql containers) are covered too. The healthcheck command is the one
  # part of the render that does not churn with image tags, so it golden-files cleanly.
  $profileArgs = $profiles | ForEach-Object { '--profile'; $_ }
  $renderJson = & docker compose @fileArgs --env-file '.env.example' @profileArgs config --format json 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Failure -Message 'Could not render compose config as JSON for the healthcheck comparison.'
    exit 1
  }

  $services = ($renderJson | ConvertFrom-Json).services
  $actual = $services.PSObject.Properties |
    Sort-Object Name |
    ForEach-Object {
      $test = $_.Value.healthcheck.test
      $rendered = if ($null -eq $test) { '<none>' } else { ($test | ConvertTo-Json -Compress -Depth 5) }
      "$($_.Name) | $rendered"
    }

  if ($UpdateGolden) {
    # A failure above means this render cannot be trusted as a source of truth: an
    # undeclared variable can change the very commands about to be recorded. Refuse to
    # write, and exit non-zero. `return` would end the script with code 0 and report
    # success right after printing FAIL - the same trap guarded against at the parse step.
    if ($failed) {
      Write-Failure -Message (
        "Refusing to update the golden file while the checks above are failing - the render " +
        "cannot be trusted. Fix those first, then re-run with -UpdateGolden.")
      exit 1
    }

    # Written with explicit LF endings: .gitattributes enforces LF repo-wide, and
    # Set-Content would emit CRLF on Windows, so the file would churn on every
    # regeneration.
    [System.IO.File]::WriteAllText($goldenPath, (($actual -join "`n") + "`n"))
    Write-Host "Wrote $($actual.Count) entries to $goldenPath. Review the diff before committing." -ForegroundColor Cyan
    exit 0
  }

  if (-not (Test-Path $goldenPath)) {
    Write-Failure -Message "Golden file missing: $goldenPath. Regenerate with -UpdateGolden."
    exit 1
  }

  $expected = Get-Content $goldenPath
  $delta = Compare-Object -ReferenceObject $expected -DifferenceObject $actual
  if ($delta) {
    $lines = $delta | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
    Write-Failure -File 'compose/edfi-services.yml' -Message (
      "Healthcheck commands changed.`n" +
      "Expected if you did any of these - regenerate with 'npm run compose:check:update', review " +
      "the diff, and commit it:`n" +
      "  * changed a healthcheck probe, or pointed a service at a different x-healthcheck-* anchor`n" +
      "  * added or removed a service (the golden has one line per service)`n" +
      "  * changed the VALUE of POSTGRES_USER, POSTGRES_PORT or MSSQL_SA_PASSWORD - the golden " +
      "stores resolved commands, so those three variables appear inside it`n" +
      "Otherwise a service is pointed at the wrong anchor. Check the diff below: '=>' is what the " +
      "compose files render now, '<=' is what the golden file expects.`n" +
      ($lines -join "`n"))
  }
  else {
    Write-Host "Healthcheck commands match the golden file ($($actual.Count) services)." -ForegroundColor Green
  }
}
finally {
  Pop-Location
  foreach ($entry in $savedEnv.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value)
  }
}

if ($failed) {
  exit 1
}

Write-Host 'Compose configuration validated.' -ForegroundColor Green
