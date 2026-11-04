// Collect three TJ TOP100 categories on GitHub Actions; never present stale data as fresh.
const fs=require('node:fs/promises');
const path=require('node:path');
const outputPath=path.join(__dirname,'../data/chart-data.json');
const hosts=['https://www.tjmedia.com','https://www.tjmedia.co.kr'];
const kinds={all:'0',kpop:'1',jpop:'3'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const valid=x=>Array.isArray(x)&&x.length>=50;
function parse(json){
 const candidates=[json?.resultData?.items,json?.resultData?.list,json?.data?.items,json?.items,json?.resultData];
 const rows=candidates.find(Array.isArray);
 if(!rows)throw Error('Unrecognized JSON keys: '+Object.keys(json||{}).join(','));
 const seen=new Set();
 return rows.map(x=>({rank:Number.parseInt(x.rank??x.ranking??x.rnk,10),title:String(x.indexTitle??x.title??x.songTitle??'').trim(),artist:String(x.indexSong??x.artist??x.singer??'').trim(),tj:String(x.pro??x.songNo??x.no??'').trim()}))
  .filter(x=>Number.isInteger(x.rank)&&x.rank>0&&x.title&&x.artist&&x.tj)
  .filter(x=>{if(seen.has(x.rank))return false;seen.add(x.rank);return true;})
  .sort((a,b)=>a.rank-b.rank).slice(0,100);
}
async function request(host,kind,code){
 const body=new URLSearchParams({chartType:'TOP',strType:code,searchStartDate:'',searchEndDate:''});
 const url=host+'/legacy/api/topAndHot100';
 const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(12000),headers:{
  'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
  Accept:'application/json, text/javascript, */*; q=0.01','X-Requested-With':'XMLHttpRequest',
  Origin:host,Referer:host+'/chart/top100',
  'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
 },body});
 const content=await response.text();
 if(!response.ok)throw Error('HTTP '+response.status+' '+content.slice(0,120).replace(/\s+/g,' '));
 let json;try{json=JSON.parse(content);}catch{throw Error('Non-JSON response: '+content.slice(0,120).replace(/\s+/g,' '));}
 const songs=parse(json);
 if(!valid(songs))throw Error('Too few parsed rows: '+songs.length+' (keys '+Object.keys(json||{}).join(',')+')');
 console.log('OK',kind,host,songs.length);
 return songs;
}
async function collect(kind,code){
 let last;
 for(const host of hosts){
  for(let retry=0;retry<2;retry++){
   try{return await request(host,kind,code);}
   catch(error){last=error;console.warn('Attempt failed:',kind,host,error.message);await sleep(700);}
  }
 }
 throw Error(kind+': '+last?.message);
}
async function main(){
 const existing=JSON.parse(await fs.readFile(outputPath,'utf8'));
 const categories={...existing.categories};
 const collectedAt={...existing.collectedAt};
 const failed=[];
 for(const [kind,code] of Object.entries(kinds)){
  try{categories[kind]=await collect(kind,code);collectedAt[kind]=new Date().toISOString();}
  catch(error){failed.push(kind);console.error('FAILED',kind,error.message);}
 }
 if(failed.length){
  // Do not commit partial updates with one global date or mislabel old chart as current.
  throw Error('Incomplete chart update: '+failed.join(', ')+'. Existing data preserved.');
 }
 const result={source:'TJ official TOP100 web chart',updatedAt:new Date().toISOString(),archive:false,collectedAt,categories};
 await fs.writeFile(outputPath,JSON.stringify(result)+'\n');
 console.log('All three categories collected:',result.updatedAt);
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
