/* A conservative publication check, not a replacement for code review. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ignore = new Set(['node_modules', '.git', 'build', 'dist', 'coverage', '.local', '.scratch', '__pycache__']);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const findings = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(item.name)) continue;
    const full = path.join(dir, item.name);
    const relative = path.relative(root, full).replace(/\\/g, '/');
    if (item.isDirectory()) { walk(full); continue; }
    if (item.name.startsWith('.env') && item.name !== '.env.example') {
      // Local secrets are allowed on disk only when git ignores them.
      const { spawnSync } = require('node:child_process');
      const check = spawnSync('git', ['check-ignore', '--quiet', '--', relative], { cwd: root });
      if (check.status !== 0) findings.push(`${relative}: environment file is not ignored`);
      continue;
    }
    if (!/\.(?:js|jsx|ts|tsx|cjs|mjs|json|md|html|txt|yml|yaml|hbs|svg|drawio|css|py)$/.test(item.name)) continue;
    const content = fs.readFileSync(full, 'utf8');
    // Registry lockfiles contain upstream maintainers' public metadata; they
    // are dependency records, not this application's participant/contact data.
    if (relative !== 'scripts/check-publication.js' && item.name !== 'package-lock.json') {
      const emails = content.match(emailPattern) || [];
      for (const address of emails) {
        const domain = address.split('@')[1].toLowerCase();
        if (!/^(?:[\w.-]+\.)?example\.(?:com|org|net|test|invalid)$/.test(domain)
          && !domain.endsWith('.test') && !domain.endsWith('.invalid')) {
          findings.push(`${relative}: non-example email address`);
          break;
        }
      }
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) findings.push(`${relative}: private key`);
      if (/mongodb(?:\+srv)?:\/\/[^\s"']+:[^\s"']+@/i.test(content)) findings.push(`${relative}: database credential URL`);
      if (/cloudinary:\/\/\d+:[^\s"']+@/i.test(content)) findings.push(`${relative}: media credential URL`);
      if (/rzp_live_[A-Za-z0-9]{10,}/.test(content)) findings.push(`${relative}: live payment key`);
    }
  }
}
walk(root);
if (findings.length) {
  console.error(findings.join('\n')); process.exitCode = 1;
} else console.log('Publication privacy check passed (reserved fixture emails; no detected credential URLs/keys).');
