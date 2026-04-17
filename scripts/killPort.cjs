const { execSync } = require('child_process');

const port = process.argv[2] || process.env.PORT || '5000';

const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).toString();

try {
  const out = run(`netstat -ano | findstr :${port}`);
  const lines = out.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    console.log(`No process found listening on port ${port}`);
    process.exit(0);
  }

  const pids = new Set();
  lines.forEach((line) => {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  });

  for (const pid of pids) {
    console.log(`Killing PID ${pid} (port ${port}) ...`);
    try {
      // Use taskkill on Windows
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'inherit' });
    } catch (e) {
      console.error(`Failed to kill PID ${pid}:`, e && e.message);
    }
  }
  console.log('Done.');
} catch (e) {
  console.log(`No listening sockets found for port ${port} or command failed.`);
  process.exit(1);
}
