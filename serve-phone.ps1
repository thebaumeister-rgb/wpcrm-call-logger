$ErrorActionPreference = "Stop"

$Port = if ($args.Count -gt 0) { [int]$args[0] } else { 8081 }
$Root = (Get-Location).Path

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".svg" = "image/svg+xml"
}

function Write-Response {
    param(
        [System.Net.Sockets.TcpClient]$Client,
        [int]$StatusCode,
        [string]$StatusText,
        [byte[]]$Body,
        [string]$ContentType = "text/plain; charset=utf-8"
    )

    $Stream = $Client.GetStream()
    $Header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
    $HeaderBytes = [System.Text.Encoding]::UTF8.GetBytes($Header)
    $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
    $Client.Close()
}

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
$Listener.Start()
Write-Host "Serving $Root on all network interfaces at port $Port"

try {
    while ($true) {
        $Client = $Listener.AcceptTcpClient()
        try {
            $Stream = $Client.GetStream()
            $Buffer = New-Object byte[] 4096
            $Read = $Stream.Read($Buffer, 0, $Buffer.Length)
            if ($Read -le 0) {
                $Client.Close()
                continue
            }

            $Request = [System.Text.Encoding]::UTF8.GetString($Buffer, 0, $Read)
            $FirstLine = ($Request -split "`r?`n")[0]
            $Parts = $FirstLine -split " "
            if ($Parts.Count -lt 2 -or $Parts[0] -ne "GET") {
                Write-Response $Client 405 "Method Not Allowed" ([System.Text.Encoding]::UTF8.GetBytes("Method not allowed"))
                continue
            }

            $RequestPath = [System.Uri]::UnescapeDataString(($Parts[1] -split "\?")[0].TrimStart("/"))
            if (-not $RequestPath) {
                $RequestPath = "index.html"
            }

            $ResolvedRoot = [System.IO.Path]::GetFullPath($Root)
            $ResolvedPath = [System.IO.Path]::GetFullPath((Join-Path $Root $RequestPath))

            if (-not $ResolvedPath.StartsWith($ResolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
                Write-Response $Client 403 "Forbidden" ([System.Text.Encoding]::UTF8.GetBytes("Forbidden"))
                continue
            }

            if (-not (Test-Path $ResolvedPath -PathType Leaf)) {
                Write-Response $Client 404 "Not Found" ([System.Text.Encoding]::UTF8.GetBytes("Not found"))
                continue
            }

            $Bytes = [System.IO.File]::ReadAllBytes($ResolvedPath)
            $Extension = [System.IO.Path]::GetExtension($ResolvedPath)
            $ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }
            Write-Response $Client 200 "OK" $Bytes $ContentType
        }
        catch {
            if ($Client.Connected) {
                Write-Response $Client 500 "Internal Server Error" ([System.Text.Encoding]::UTF8.GetBytes("Server error"))
            }
        }
    }
}
finally {
    $Listener.Stop()
}
