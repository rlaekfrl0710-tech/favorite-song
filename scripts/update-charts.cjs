// Scheduled GitHub Actions collector: never overwrite valid chart with empty/partial data.
const fs=require('node:fs/promises');
const path=require('node:path');
const endpoint='https://www.tjmedia.com/legacy/api/topAndHot100';
const kinds={all:'0',kpop:'1',jpop:'3'};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function collect(kind,code){
 const body=new URLSearchParams({chartType:'TOP',strType:code,searchStartDate:'',searchEndDate:''});
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(endpoint,{method:'POST',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',Accept:'application/json, text/javascript, */*; q=0.01',
     'X-Requested-With':'XMLHttpRequest',Origin:'https://www.tjmedia.com',Referer:'https://www.tjmedia.com/chart/top100',
     'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'},
    body});
   if(!response.ok)throw Error('HTTP '+response.status);
   const payload=await response.json();
   if(!Array.isArray(payload?.resultData?.items))throw Error('Unexpected response structure');
   const seen=new Set();
   const items=payload.resultData.items.map(x=>({rank:parseInt(x.rank,10),title:String(x.indexTitle||'').trim(),artist:String(x.indexSong||'').trim(),tj:String(x.pro||'').trim()}))
    .filter(x=>Number.isInteger(x.rank)&&x.rank>0&&x.title&&x.artist&&x.tj)
    .filter(x=>{if(seen.has(x.rank))return false;seen.add(x.rank);return true;}).sort((a,b)=>a.rank-b.rank).slice(0,100);
   if(items.length<50)throw Error('Insufficient '+kind+' rows: '+items.length);
   return items;
  }catch(error){last=error;await sleep(1200*(attempt+1));}
 }
 throw Error(kind+' collection failed: '+last.message);
}
async function main(){
 const categories={};
 for(const [kind,code] of Object.entries(kinds)){categories[kind]=await collect(kind,code);console.log(kind,categories[kind].length);}
 const output={source:'TJ official TOP100 web endpoint',updatedAt:new Date().toISOString(),archive:false,categories};
 await fs.writeFile(path.join(__dirname,'../data/chart-data.json'),JSON.stringify(output)+'\n');
 console.log('Updated chart-data.json:',output.updatedAt);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
