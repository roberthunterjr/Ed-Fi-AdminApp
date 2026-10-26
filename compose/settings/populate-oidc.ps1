
param(
	[string]$ClientId = "edfiadminapp",
	[Parameter(Mandatory = $true)]
	[string]$ClientSecret,
	[string]$Issuer = "https://localhost/auth/realms/edfi"
)

$db_name = "edfiadminapp-postgres"
$sql_file = Join-Path $PSScriptRoot "seed-oidc-dynamic.sql"

# Generate dynamic SQL file
# Escape single quotes in input variables to prevent SQL injection
$EscapedClientId = $ClientId -replace "'", "''"
$EscapedClientSecret = $ClientSecret -replace "'", "''"
$EscapedIssuer = $Issuer -replace "'", "''"
# Generate dynamic SQL file
$sqlContent = @"
INSERT INTO public.oidc(issuer, "clientId", "clientSecret", scope)
SELECT '$EscapedIssuer', '$EscapedClientId', '$EscapedClientSecret', ''
WHERE NOT EXISTS (
	SELECT 1 FROM public.oidc WHERE "clientId" = '$EscapedClientId'
);
SELECT * FROM public.oidc;
"@
Set-Content -Path $sql_file -Value $sqlContent

# Copy the SQL file to the container
docker cp $sql_file ${db_name}:/tmp/seed-oidc.sql

# Execute the SQL file
docker exec $db_name psql -U postgres -d sbaa -f /tmp/seed-oidc.sql

# Optional: Clean up the temporary file
docker exec $db_name rm /tmp/seed-oidc.sql
Remove-Item $sql_file
