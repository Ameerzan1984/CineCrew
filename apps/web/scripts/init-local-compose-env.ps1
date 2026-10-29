$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$envPath = Join-Path $repoRoot ".env"

if (Test-Path -LiteralPath $envPath) {
  throw "A local .env already exists. Keep it unchanged and update it manually if needed."
}

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $passwordBytes = New-Object byte[] 32
  $serviceBytes = New-Object byte[] 32
  $vaultBytes = New-Object byte[] 32
  $rng.GetBytes($passwordBytes)
  $rng.GetBytes($serviceBytes)
  $rng.GetBytes($vaultBytes)
} finally {
  $rng.Dispose()
}

$password = [BitConverter]::ToString($passwordBytes).Replace("-", "").ToLowerInvariant()
$serviceToken = [Convert]::ToBase64String($serviceBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$vaultKey = [Convert]::ToBase64String($vaultBytes)
$lines = @(
  "POSTGRES_PASSWORD=$password"
  "DATABASE_URL=postgresql://cinemesh:$password@postgres:5432/cinemesh"
  "FILM_ENGINE_SERVICE_TOKEN=$serviceToken"
  "APP_ORIGIN=http://localhost:3000"
  "CHATGPT_VAULT_KEY=$vaultKey"
  "HIGGSFIELD_VAULT_KEY="
)
[System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Output "Created a private local .env with fresh database, service, and vault secrets. Its values were not displayed."
