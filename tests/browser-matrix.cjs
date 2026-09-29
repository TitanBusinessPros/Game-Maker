// Tests run sequentially so competing browsers do not distort frame timings.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const map = process.argv[2];
if (!map) throw Error('Provide a downloaded game HTML path.');
const targets = [
  {name:'Chrome', engine:'chromium', executable:'C:/Program Files/Google/Chrome/Application/chrome.exe'},
  {name:'Edge', engine:'chromium', executable:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'},
  {name:'Firefox', engine:'firefox'},
  {name:'WebKit', engine:'webkit'},
  {name:'Chrome phone emulation', engine:'chromium', executable:'C:/Program Files/Google/Chrome/Application/chrome.exe',mobile:true},
  {name:'WebKit phone emulation', engine:'webkit',mobile:true},
];
(async()=>{
  const results=[];
  for(const target of targets){
    if(process.env.GIF_TEST_TARGETS && !process.env.GIF_TEST_TARGETS.split('|').includes(target.name)) continue;
    console.log('\nTARGET '+target.name);
    for(const file of (process.env.GIF_TEST_FILES || 'gif-playback.cjs|export-assets.cjs|gif-performance.cjs|file-startup.cjs').split('|')) {
      const result=await new Promise(resolve=>{
        const child=spawn(process.execPath,[path.join(__dirname,file),...(['gif-performance.cjs','file-startup.cjs'].includes(file)?[map]:[])],{
          env:{...process.env,GIF_TEST_ENGINE:target.engine,GIF_TEST_BROWSER:target.executable||'',GIF_TEST_MOBILE:target.mobile?'1':'0'},
          windowsHide:true,
        });
        let output='';
        child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});
        child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});
        const timeout=setTimeout(()=>child.kill(),120000);
        child.on('close',code=>{clearTimeout(timeout);resolve({target:target.name,test:file,code,output});});
      });
      results.push(result);
      fs.writeFileSync(path.join(__dirname,process.env.GIF_TEST_REPORT || 'browser-results.json'),JSON.stringify({date:new Date().toISOString(),results},null,2));
    }
  }
  if(results.some(r=>r.code!==0))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
