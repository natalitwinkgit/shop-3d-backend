const { execSync } = require('child_process');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');

try {
  execSync('taskkill /F /IM node.exe', { stdio: 'ignore' });
  console.log('Existing node processes terminated (if any).');
} catch (e) {
  console.log('No node processes needed killing or taskkill failed.');
}

console.log('Starting server with `npm run dev` in', projectDir);
try {
  execSync('npm run dev', { cwd: projectDir, stdio: 'inherit', shell: true });
} catch (e) {
  console.error('Failed to start dev server:', e && e.message);
  process.exit(1);
}
