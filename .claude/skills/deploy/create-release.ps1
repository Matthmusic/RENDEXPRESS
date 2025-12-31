# PowerShell script to create GitHub release and upload installer
# Usage: .\create-release.ps1 -Version "0.0.10" -ChangelogNotes "Release notes here"

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$true)]
    [string]$ChangelogNotes
)

# Check for GitHub token
$token = $env:GITHUB_TOKEN
if (-not $token) {
    $token = $env:GH_TOKEN
}

if (-not $token) {
    Write-Error "No GitHub token found. Please set GITHUB_TOKEN or GH_TOKEN environment variable."
    Write-Host ""
    Write-Host "To create a token:"
    Write-Host "1. Go to https://github.com/settings/tokens/new"
    Write-Host "2. Token description: Rendexpress Deploy"
    Write-Host "3. Select scope: repo (Full control of private repositories)"
    Write-Host "4. Generate token and copy it"
    Write-Host "5. Run: setx GITHUB_TOKEN `"your_token_here`""
    Write-Host "6. Restart Claude Code"
    exit 1
}

# GitHub API settings
$owner = "Matthmusic"
$repo = "RENDEXPRESS"
$tag = "v$Version"
$installerPath = "electron-react\dist\Rendexpress-$Version-Setup.exe"

# Check if installer exists
if (-not (Test-Path $installerPath)) {
    Write-Error "Installer not found at: $installerPath"
    Write-Error "Please build the installer first with: npm run build:electron"
    exit 1
}

Write-Host "Creating GitHub release v$Version..." -ForegroundColor Cyan

# Prepare headers
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept" = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

# Create the release
$releaseBody = @{
    "tag_name" = $tag
    "name" = "v$Version"
    "body" = $ChangelogNotes
    "draft" = $false
    "prerelease" = $false
} | ConvertTo-Json -Depth 10

try {
    $releaseResponse = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/$owner/$repo/releases" `
        -Method Post `
        -Headers $headers `
        -Body $releaseBody `
        -ContentType "application/json"

    Write-Host "Release created successfully!" -ForegroundColor Green
    Write-Host "Release URL: $($releaseResponse.html_url)" -ForegroundColor Green

    # Extract upload URL
    $uploadUrlTemplate = $releaseResponse.upload_url
    $uploadUrl = $uploadUrlTemplate -replace '\{\?.*\}', "?name=Rendexpress-$Version-Setup.exe"

    Write-Host ""
    Write-Host "Uploading installer..." -ForegroundColor Cyan

    # Read installer file
    $fileBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $installerPath))
    $fileSizeMB = [math]::Round($fileBytes.Length / 1MB, 2)
    Write-Host "Installer size: $fileSizeMB MB" -ForegroundColor Gray

    # Upload the installer
    $uploadHeaders = @{
        "Authorization" = "Bearer $token"
        "Accept" = "application/vnd.github+json"
        "Content-Type" = "application/octet-stream"
    }

    $uploadResponse = Invoke-RestMethod `
        -Uri $uploadUrl `
        -Method Post `
        -Headers $uploadHeaders `
        -Body $fileBytes

    Write-Host "Installer uploaded successfully!" -ForegroundColor Green
    Write-Host "Download URL: $($uploadResponse.browser_download_url)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Deployment completed! Release is live at:" -ForegroundColor Cyan
    Write-Host $releaseResponse.html_url -ForegroundColor White

} catch {
    Write-Error "Failed to create release or upload installer:"
    Write-Error $_.Exception.Message

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Error "Response: $responseBody"
    }

    exit 1
}
