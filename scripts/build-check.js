import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = ['server.js','src/config.js','src/store.js','src/router.js','src/provider.js','src/http.js','public/index.html','public/app.js','public/app.css','test/server.test.js','render.yaml'];
for (const file of required) { const p=path.join(root,file); if(!fs.existsSync(p)||fs.statSync(p).size===0) throw new Error(`Missing or empty required file: ${file}`); }
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='0.5.1'||pkg.type!=='module'||pkg.engines?.node!=='>=22 <25') throw new Error('Invalid package metadata');
for(const name of ['start','test','build']) if(typeof pkg.scripts?.[name]!=='string') throw new Error(`Missing npm script: ${name}`);
console.log(JSON.stringify({event:'build_verified',version:pkg.version,requiredFiles:required.length}));
