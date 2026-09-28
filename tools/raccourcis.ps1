# Crée les raccourcis « Claude Pet » sur le Bureau et dans le menu Démarrer.
# Ils lancent le compagnon directement, sans fenêtre de commande.
# Ne modifie rien d'autre sur l'ordinateur.
param([string]$Electron)
$ErrorActionPreference = 'Stop'
$dossier = Split-Path -Parent $PSScriptRoot
$electron = if ($Electron) { $Electron } else { Join-Path $dossier 'node_modules\electron\dist\electron.exe' }
$icone = Join-Path $dossier 'assets\icon.ico'
if (-not (Test-Path $electron)) { throw "Electron introuvable : lance d'abord « npm install » dans $dossier" }

$shell = New-Object -ComObject WScript.Shell
$cibles = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Claude Pet.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Claude Pet.lnk')
)
foreach ($lnk in $cibles) {
  $r = $shell.CreateShortcut($lnk)
  $r.TargetPath = $electron
  $r.Arguments = '"' + $dossier + '"'
  $r.WorkingDirectory = $dossier
  $r.IconLocation = $icone
  $r.Description = 'Claude Pet, ton compagnon de bureau'
  $r.Save()
  Write-Host "Raccourci créé : $lnk"
}
