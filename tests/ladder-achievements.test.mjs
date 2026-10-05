import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const host=readFileSync(new URL('../arcade.html',import.meta.url),'utf8'),index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const roster=JSON.parse(index.match(/const RUMBLE_ROSTER=(.*);/)[1]);
const helper=index.split('/* LADDER BADGES START:')[1].split('/* LADDER BADGES END */')[0].replace(/^[\s\S]*?\*\//,'');
const badges=stats=>{const ctx={RUMBLE_ROSTER:roster,stats,earned:[]};vm.runInNewContext(helper+';ladderBadges(stats,k=>earned.push(k));',ctx);return ctx.earned;};
function harness(){
  let handler,user={uid:'one'};const data={},frame={contentWindow:{}};
  const ref=path=>({child:key=>ref(path+'/'+key),transaction:fn=>{const result=fn(structuredClone(data[path]??null));if(result!==undefined)data[path]=structuredClone(result);},set:v=>{data[path]=v;}});
  const window={addEventListener:(type,fn)=>{handler=fn;},__arcFirebase:fn=>fn(true)};
  const source=host.split('/* ---------- messages from the arcade ---------- */')[1].split('\n})();')[0];
  vm.runInNewContext(source,{window,frame,firebase:{database:()=>({ref}),auth:()=>({currentUser:user})}});
  return {data,send:(d,own=true)=>handler({source:own?frame.contentWindow:{},data:{type:'jcw-arcade',...d}}),user:uid=>{user=uid?{uid}:null;},get:uid=>data['lockers/'+(uid||'one')+'/arcade/ladder']};
}
const result=(overrides={})=>({ev:'ladder',resultId:'test-match-00000001',won:true,roster:'able',entrants:2,grabs:4,misses:0,falls:0,tips:0,score:3250,elapsed:30,online:false,...overrides});
test('clean fast win unlocks only the earned badges; duplicate result is atomic and idempotent',()=>{
 const h=harness();h.send(result());h.send(result());assert.equal(h.get().runs,1);assert.equal(h.get().wins,1);assert.equal(h.get().grabs,4);
 assert.deepEqual([...badges(h.get())].sort(),['lw_first','lw_win','lw_fast','lw_clean','lw_w_able'].sort());
 h.send({ev:'record',g:'ladder',v:3250});h.send({ev:'win',g:'ladder',v:3250});assert.equal(h.get().runs,1);
});
test('losses accumulate grabs and tips but never earn a championship, clean, comeback or speed badge',()=>{
 const h=harness();h.send(result({won:false,grabs:3,falls:1,tips:10}));assert.equal(h.get().wins,undefined);assert.deepEqual([...badges(h.get())].sort(),['lw_first','lw_tips10'].sort());
});
test('Chaos comeback and online win are separate achievements; missed grabs disqualify clean wins',()=>{
 const h=harness();h.send(result({entrants:4,falls:1,misses:2,elapsed:30.01}));assert.equal(h.get().clean,undefined);assert.equal(h.get().fast,undefined);assert.equal(h.get().onlineWins,undefined);assert.ok(badges(h.get()).includes('lw_chaos'));assert.ok(badges(h.get()).includes('lw_comeback'));
 h.send(result({resultId:'test-match-00000002',online:true,misses:1}));assert.equal(h.get().onlineWins,1);assert.equal(h.get().clean,undefined);
});
test('only the arcade frame and signed-in locker receive validated results; accounts stay separate',()=>{
 const h=harness();h.send(result(),false);assert.equal(h.get(),undefined);
 for(const change of [{roster:'not-a-wrestler'},{grabs:3},{tips:-1},{misses:NaN},{falls:Infinity},{elapsed:Infinity},{score:1.5},{entrants:21},{resultId:'bad'}])h.send(result(change));assert.equal(h.get(),undefined);
 h.user(null);h.send(result());assert.equal(h.get(),undefined);h.user('one');h.send(result());h.user('two');h.send(result({roster:'vincenzo'}));assert.equal(h.get('one').wonWith.able,1);assert.equal(h.get('two').wonWith.able,undefined);assert.equal(h.get('two').wins,1);
});
test('25 wins and all 21 champions unlock milestones; receipts remain bounded and unknown roster entries do not count',()=>{
 const h=harness();for(let i=0;i<70;i++)h.send(result({resultId:'test-match-'+String(i).padStart(8,'0'),roster:roster[i%roster.length][0]}));assert.equal(h.get().receipts.length,64);assert.equal(h.get().wins,70);const earned=badges(h.get());for(const id of ['lw_wins10','lw_wins25','lw_grabs100','lw_runs25','lw_wonwith5','lw_wonwithall'])assert.ok(earned.includes(id));assert.equal(earned.filter(k=>k.startsWith('lw_w_')).length,21);assert.deepEqual([...badges({wonWith:{nobody:1}})],[]);
});
test('catalog contains exactly 35 unique Ladder badges and Abel keeps his existing save ID',()=>{
 const source=index.slice(index.indexOf('const CLAW_SETS='),index.indexOf('  function lkAddWin()'));
 const ctx={};vm.runInNewContext(source+';globalThis.catalog=LK_BADGES;',ctx);const ladder=ctx.catalog.filter(b=>b[0].startsWith('lw_'));assert.equal(ladder.length,35);assert.equal(new Set(ladder.map(b=>b[0])).size,35);assert.equal(roster.find(r=>r[0]==='able')[1],'Abel');assert.ok(ladder.find(b=>b[0]==='lw_w_able')[1].includes('Abel'));
 assert.ok(index.includes('ladderBadges(a.ladder,add)'));assert.ok(index.includes('ladderBadges((v.arcade||{}).ladder,k=>derived.add(k))'));
});
test('every inline script remains syntactically valid',()=>{
 for(const html of [host,index])for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(script[0].includes('application/ld+json'))continue;new vm.Script(script[1]);}
});
