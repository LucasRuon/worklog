import { parseArgs } from 'node:util';
import { defaultDataDir, openStore } from '../src/core/context.js';
import { ssh, syncHost, type RemoteHost } from '../src/remote/ssh.js';

const { values } = parseArgs({ options: { host: { type: 'string', default: 'macmini' }, 'data-dir': { type: 'string' } } });
const ctx = await openStore(values['data-dir'] ?? defaultDataDir());
try {
  const host = ctx.db.get<RemoteHost>('SELECT * FROM remote_hosts WHERE host = ?', values.host!);
  if (!host) throw new Error('REMOTE_NOT_REGISTERED');
  const program = `const fs=require('node:fs'),os=require('node:os'),cp=require('node:child_process'),path=require('node:path');
const home=os.homedir(),root=fs.mkdtempSync(home+'/projetos/worklog-verificacao-'),config=path.join(root,'worklog-settings.json');
let result={passed:false};
try {
 cp.execFileSync('git',['init','-q',root]);cp.execFileSync('git',['-C',root,'remote','add','origin','https://github.com/LucasRuon/worklog.git']);
 const original=JSON.parse(fs.readFileSync(home+'/.claude/settings.json','utf8')),hooks={};
 for(const [event,groups]of Object.entries(original.hooks||{})){const selected=groups.flatMap(g=>{const owned=g.hooks.filter(h=>Array.isArray(h.args)&&h.args.includes('--worklog-hook-v1'));return owned.length?[{...g,hooks:owned}]:[]});if(selected.length)hooks[event]=selected;}
 fs.writeFileSync(config,JSON.stringify({hooks}),{mode:384});
 let nativeSucceeded=false,category='unknown';
 try{const raw=cp.execFileSync(home+'/.local/bin/claude',['-p','Responda apenas OK.','--settings',config,'--setting-sources','','--disable-slash-commands','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--tools','','--permission-mode','dontAsk','--max-budget-usd','0.10','--no-session-persistence','--output-format','json','--no-chrome','--system-prompt','Responda apenas OK.'],{cwd:root,encoding:'utf8',timeout:90000,maxBuffer:131072,stdio:['ignore','pipe','pipe']});const value=JSON.parse(raw);nativeSucceeded=!value.is_error;category=nativeSucceeded?'success':'native-error';}catch(error){const text=String(error.stdout||'')+String(error.stderr||'');category=/auth|login/i.test(text)?'authentication':error.killed?'timeout':'native-error';}
 const packet=JSON.parse(cp.execFileSync(process.execPath,[process.argv[1]+'/dist/cli/index.js','agent','export','--data-dir',process.argv[2],'--after','0','--limit','500'],{encoding:'utf8',maxBuffer:16777216}));
 const events=packet.batch.events.filter(e=>e.cwd===root);result={passed:nativeSucceeded&&events.some(e=>e.type==='session.start')&&events.some(e=>e.type==='turn.end'),nativeSucceeded,category,root,events:events.map(e=>({type:e.type,eventId:e.eventId,nativeSessionId:e.nativeSessionId})),installationId:packet.identity.installationId};
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(JSON.stringify(result));`;
  const native: unknown = JSON.parse(await ssh(host.host, [host.node_path, '-e', program, host.app_path, host.data_dir], { timeout: 110_000 }));
  const sync = await syncHost(ctx, host.host);
  console.log(JSON.stringify({ native, sync }, null, 2));
  if (!(native as { passed?: boolean }).passed) process.exitCode = 1;
} finally { await ctx.shutdown(); }
