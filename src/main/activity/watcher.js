// Surveille la fenêtre au premier plan sous Windows, en lecture seule.
//
// Un seul petit processus PowerShell tourne en arrière-plan (fenêtre cachée,
// aucune installation) : toutes les 1,5 s il lit la fenêtre active (nom du
// logiciel, titre, plein écran ou non) et le morceau joué par Spotify, et
// n'écrit une ligne JSON que quand quelque chose change. Rien n'est modifié
// sur l'ordinateur et rien n'est envoyé sur Internet.
//
// Pour tester hors Windows : CLAUDE_PET_ACTIVITY_FILE=chemin.jsonl, chaque
// ligne ajoutée au fichier est lue comme un changement de fenêtre.
const fs = require('fs');
const { spawn } = require('child_process');

const SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PetFg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public static string Text(IntPtr h) { var s = new StringBuilder(512); GetWindowText(h, s, 512); return s.ToString(); }
  public static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  // Plein écran : la fenêtre couvre tout l'écran sans être simplement agrandie.
  public static bool Full(IntPtr h) {
    RECT r; if (!GetWindowRect(h, out r) || IsZoomed(h)) return false;
    var mi = new MONITORINFO(); mi.cbSize = Marshal.SizeOf(mi);
    if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
    return r.L <= mi.rcMonitor.L && r.T <= mi.rcMonitor.T && r.R >= mi.rcMonitor.R && r.B >= mi.rcMonitor.B;
  }
}
'@
[void][PetFg]::SetProcessDPIAware()
$parent = [int]$env:CLAUDE_PET_PARENT
$procs = @{}
$last = ''
$music = ''
$tick = 0
while ($true) {
  if ($parent -and -not (Get-Process -Id $parent)) { exit }
  $h = [PetFg]::GetForegroundWindow()
  $cls = [PetFg]::Cls($h)
  if ($h -ne [IntPtr]::Zero -and $cls -notin @('Shell_TrayWnd', 'Progman', 'WorkerW', 'Shell_SecondaryTrayWnd')) {
    $procId = [PetFg]::Pid($h)
    if (-not $procs.ContainsKey($procId)) {
      $p = Get-Process -Id $procId
      $procs[$procId] = @{ app = [string]$p.ProcessName; path = [string]$p.Path }
      if ($procs.Count -gt 300) { $procs = @{} }
    }
    if ($tick % 3 -eq 0) {
      $music = ''
      foreach ($s in (Get-Process -Name Spotify)) {
        $t = $s.MainWindowTitle
        if ($t -and $t -like '* - *') { $music = $t; break }
      }
    }
    $tick++
    $line = [ordered]@{
      app = $procs[$procId].app; path = $procs[$procId].path; pid = $procId
      title = [PetFg]::Text($h); full = [PetFg]::Full($h); music = $music
    } | ConvertTo-Json -Compress
    if ($line -ne $last) { [Console]::Out.WriteLine($line); [Console]::Out.Flush(); $last = $line }
  }
  Start-Sleep -Milliseconds 1500
}
`;

// Lance la surveillance ; `onChange(fenêtre)` reçoit { app, path, pid, title, full, music }.
// Renvoie une fonction d'arrêt.
function start(onChange, onError = () => {}) {
  const fake = process.env.CLAUDE_PET_ACTIVITY_FILE;
  if (fake) return watchFile(fake, onChange);
  if (process.platform !== 'win32') {
    onError(new Error('Détection des fenêtres disponible seulement sous Windows'));
    return () => {};
  }

  let child = null;
  let stopped = false;
  let restarts = 0;
  let retryTimer = null;

  const launch = () => {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    child = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLAUDE_PET_PARENT: String(process.pid) } });
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try { onChange(JSON.parse(line)); } catch { /* ligne incomplète, on ignore */ }
      }
    });
    child.stderr.on('data', () => {}); // PowerShell peut être bavard, on ne bloque pas le tuyau
    child.on('error', onError);
    child.on('exit', (code) => {
      child = null;
      if (stopped) return;
      // Relance quelques fois si PowerShell s'arrête (mise en veille, erreur passagère).
      if (restarts++ < 5) retryTimer = setTimeout(launch, 30000);
      else onError(new Error(`La surveillance des fenêtres s'est arrêtée (code ${code})`));
    });
  };
  launch();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    if (child) child.kill();
  };
}

function watchFile(file, onChange) {
  let offset = 0;
  const timer = setInterval(() => {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    if (text.length < offset) offset = 0;
    const lines = text.slice(offset).split('\n');
    const rest = lines.pop();
    offset = text.length - rest.length;
    for (const line of lines) {
      if (!line.trim()) continue;
      try { onChange(JSON.parse(line)); } catch { /* ignore */ }
    }
  }, 300);
  return () => clearInterval(timer);
}

module.exports = { start, SCRIPT };
