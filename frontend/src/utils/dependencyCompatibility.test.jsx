/** @jest-environment node */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadNycConfig } = require('@istanbuljs/load-nyc-config');

// The test tool's YAML reader is overridden to a patched version. Exercise its
// actual public entry point, including extends/array handling, before publishing.
test('patched coverage YAML dependency remains compatible with the Jest loader', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'muster-yaml-'));
  const packageFile = path.join(folder, 'package.json');
  const configFile = path.join(folder, '.nycrc.yaml');
  const baseFile = path.join(folder, 'coverage-base.json');
  try {
    fs.writeFileSync(packageFile, '{"name":"coverage-compatibility-fixture"}');
    fs.writeFileSync(baseFile, '{"include":["src/**"],"reporter":["text"]}');
    fs.writeFileSync(configFile, 'extends: ./coverage-base.json\nall: true\nexclude:\n  - src/**/*.test.jsx\n');
    expect(await loadNycConfig({ cwd: folder, nycrcPath: '.nycrc.yaml' })).toMatchObject({
      all: true, include: ['src/**'], exclude: ['src/**/*.test.jsx'], reporter: ['text']
    });
  } finally {
    for (const file of [configFile, baseFile, packageFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(folder);
  }
});
