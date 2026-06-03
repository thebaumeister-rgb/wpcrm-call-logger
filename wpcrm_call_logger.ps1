$ErrorActionPreference = "Stop"

$DataDir = Join-Path $PSScriptRoot "data"
$JsonlPath = Join-Path $DataDir "sales_calls.jsonl"
$CsvPath = Join-Path $DataDir "sales_calls.csv"

function Read-Required {
    param([string]$Prompt)

    while ($true) {
        $RawValue = Read-Host $Prompt
        $Value = if ($null -eq $RawValue) { "" } else { $RawValue.Trim() }
        if ($Value) {
            return $Value
        }
        Write-Host "Please enter a value."
    }
}

function Read-AppointmentType {
    Write-Host ""
    Write-Host "Appointment type:"
    Write-Host "  1. conference call"
    Write-Host "  2. meeting"

    while ($true) {
        $RawChoice = Read-Host "Choose 1 or 2"
        $Choice = if ($null -eq $RawChoice) { "" } else { $RawChoice.Trim().ToLowerInvariant() }
        switch ($Choice) {
            "1" { return "conference call" }
            "2" { return "meeting" }
            "conference call" { return "conference call" }
            "meeting" { return "meeting" }
            default { Write-Host "Please choose 1 for conference call or 2 for meeting." }
        }
    }
}

function Read-DateTime {
    $DefaultValue = (Get-Date).ToString("yyyy-MM-dd HH:mm")
    $RawValue = Read-Host "Date/time [$DefaultValue]"
    $Value = if ($null -eq $RawValue) { "" } else { $RawValue.Trim() }
    if ($Value) {
        return $Value
    }
    return $DefaultValue
}

function Read-Multiline {
    param([string]$Prompt)

    Write-Host $Prompt
    Write-Host "Enter one item per line. Press Enter on a blank line when finished."
    $Lines = New-Object System.Collections.Generic.List[string]
    while ($true) {
        $RawLine = Read-Host "-"
        $Line = if ($null -eq $RawLine) { "" } else { $RawLine.Trim() }
        if (-not $Line) {
            break
        }
        $Lines.Add($Line)
    }
    return ($Lines -join "`n")
}

function Save-SalesCall {
    param([pscustomobject]$Call)

    if (-not (Test-Path $DataDir)) {
        New-Item -ItemType Directory -Path $DataDir | Out-Null
    }

    $Call | ConvertTo-Json -Compress | Add-Content -Path $JsonlPath -Encoding UTF8

    if (Test-Path $CsvPath) {
        $Call | Export-Csv -Path $CsvPath -NoTypeInformation -Append
    }
    else {
        $Call | Export-Csv -Path $CsvPath -NoTypeInformation
    }
}

Write-Host "WPCRM Sales Call Logger"
Write-Host ""

$ContactName = Read-Required "Contact name"
$AppointmentType = Read-AppointmentType
$AppointmentDateTime = Read-DateTime
$MeetingPoint = Read-Required "Point of the meeting"
$Actions = Read-Multiline "Specific actions and/or to-do items:"
$RecordedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

$Call = [pscustomobject]@{
    contact_name = $ContactName
    appointment_type = $AppointmentType
    appointment_datetime = $AppointmentDateTime
    meeting_point = $MeetingPoint
    actions = $Actions
    recorded_at = $RecordedAt
}

Write-Host ""
Write-Host "Review:"
Write-Host "Contact: $($Call.contact_name)"
Write-Host "Appointment type: $($Call.appointment_type)"
Write-Host "Date/time: $($Call.appointment_datetime)"
Write-Host "Point: $($Call.meeting_point)"
Write-Host "Actions:"
if ($Call.actions) {
    Write-Host $Call.actions
}
else {
    Write-Host "(none)"
}

$RawConfirm = Read-Host "Save this entry? [Y/n]"
$Confirm = if ($null -eq $RawConfirm) { "" } else { $RawConfirm.Trim().ToLowerInvariant() }
if ($Confirm -in @("", "y", "yes")) {
    Save-SalesCall $Call
    Write-Host ""
    Write-Host "Saved to:"
    Write-Host "  $JsonlPath"
    Write-Host "  $CsvPath"
}
else {
    Write-Host ""
    Write-Host "Entry discarded."
}
