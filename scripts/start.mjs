import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({root, server:{host:'127.0.0.1',port:5174,strictPort:true,open:process.argv.includes('--open')}});
await server.listen();
console.log('\nNexus prototype — local sample data, no connected agents.');
server.printUrls();
