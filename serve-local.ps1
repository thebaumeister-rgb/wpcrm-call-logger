$ErrorActionPreference = "Stop"

$Port = if ($args.Count -gt 0) { [int]$args[0] } else { 8080 }
$Root = (Get-Location).Path
$Prefix = "http://localhost:$Port/"

$MimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css" = "text/css; charset=utf-8"
    ".js" = "text/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".svg" = "image/svg+xml"
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add($Prefix)
$Listener.Start()
Write-Host "Serving $Root at $Prefix"

try {
    while ($Listener.IsListening) {
        $Context = $Listener.GetContext()
        $RequestPath = [System.Uri]::UnescapeDataString($Context.Request.Url.AbsolutePath.TrimStart("/"))
        if (-not $RequestPath) {
            $RequestPath = "index.html"
        }

        $FullPath = Join-Path $Root $RequestPath
        $ResolvedRoot = [System.IO.Path]::GetFullPath($Root)
        $ResolvedPath = [System.IO.Path]::GetFullPath($FullPath)

        if (-not $ResolvedPath.StartsWith($ResolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            $Context.Response.StatusCode = 403
            $Context.Response.Close()
            continue
        }

        if (-not (Test-Path $ResolvedPath -PathType Leaf)) {
            $Context.Response.StatusCode = 404
            $Context.Response.Close()
            continue
        }

        $Bytes = [System.IO.File]::ReadAllBytes($ResolvedPath)
        $Extension = [System.IO.Path]::GetExtension($ResolvedPath)
        $Context.Response.ContentType = if ($MimeTypes.ContainsKey($Extension)) { $MimeTypes[$Extension] } else { "application/octet-stream" }
        $Context.Response.ContentLength64 = $Bytes.Length
        $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
        $Context.Response.Close()
    }
}
finally {
    $Listener.Stop()
    $Listener.Close()
}
