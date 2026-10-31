import {mkdirSync,copyFileSync,existsSync,unlinkSync} from 'node:fs';
mkdirSync('dist',{recursive:true});
for(const path of ['index.html','core.mjs','finance-ui.mjs','finance-import.mjs'])copyFileSync(path,`dist/${path}`);
for(const path of ['dist/qa.html','dist/qa-client.mjs'])if(existsSync(path))unlinkSync(path);
console.log('dist contains the production client. QA fixtures are excluded.');
