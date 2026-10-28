import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(`${root}/.cache`, {recursive:true});
const result = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'test', ...process.argv.slice(2)], {
 cwd:root, stdio:'inherit', env:{...process.env, PLAYWRIGHT_BROWSERS_PATH:`${root}/.browsers`, TMP:`${root}/.cache`, TEMP:`${root}/.cache`}
});
process.exit(result.status ?? 1);
