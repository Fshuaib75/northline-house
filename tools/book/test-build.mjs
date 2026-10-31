// Each importing test worker gets its own synthetic build; never remove another worker's files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const testBuild=fs.mkdtempSync(path.join(os.tmpdir(),'nl-book-test-'));
process.once('exit',()=>fs.rmSync(testBuild,{recursive:true,force:true}));
execFileSync(process.execPath,['tools/book/dev-build.mjs'],{cwd:root,env:{...process.env,NL_BOOK_TEST_OUT:testBuild},stdio:'pipe'});
export const builtBook=fs.readFileSync(path.join(testBuild,'book/index.html'),'utf8');
