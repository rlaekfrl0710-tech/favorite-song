// TJ chart data with explicitly dated archived fallback; never label archive as live.
const TYPES={all:'0',kpop:'1',jpop:'3'};
const archived=require('../data/chart-snapshot.json');
const clean=x=>String(x??'').trim();
const mapItems=raw=>raw.map(x=>({rank:parseInt(x.rank,10),title:clean(x.indexTitle??x.title),artist:clean(x.indexSong??x.artist),tj:clean(x.pro??x.tj)})).filter(x=>Number.isInteger(x.rank)&&x.rank>0&&x.title&&x.artist&&x.tj).sort((a,b)=>a.rank-b.rank).slice(0,100);
async function live(genre){
 const body=new URLSearchParams({chartType:'TOP',strType:TYPES[genre],searchStartDate:'',searchEndDate:''});
 const response=await fetch('https://www.tjmedia.com/legacy/api/topAndHot100',{method:'POST',signal:AbortSignal.timeout(6000),headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',Accept:'application/json, text/javascript, */*; q=0.01','X-Requested-With':'XMLHttpRequest',Origin:'https://www.tjmedia.com',Referer:'https://www.tjmedia.com/chart/top100','User-Agent':'Mozilla/5.0'},body});
 if(!response.ok)throw Error('TJ HTTP '+response.status);
 const json=await response.json();
 if(!Array.isArray(json?.resultData?.items))throw Error('Unexpected TJ response');
 return mapItems(json.resultData.items);
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const genre=clean(req.query.genre||'all');
 if(!(genre in TYPES))return res.status(400).json({error:'잘못된 차트 종류입니다.'});
 try{
  const items=await live(genre);
  if(items.length)return res.status(200).json({items,genre,snapshot:false,fetchedAt:new Date().toISOString()});
 }catch(error){console.warn('TJ chart unavailable; using dated archive:',error.message);}
 const korean=mapItems(archived.categories.kpop),japanese=mapItems(archived.categories.jpop);
 const items=genre==='kpop'?korean:genre==='jpop'?japanese:[...korean,...japanese].sort((x,y)=>x.rank-y.rank).map((x,i)=>({...x,rank:i+1})).slice(0,100);
 if(!items.length)return res.status(503).json({error:'차트 데이터가 없습니다.'});
 return res.status(200).json({items,genre,snapshot:true,fetchedAt:archived.updatedAt,notice:'실시간 차트 연결 실패 · 과거 보관본 표시'});
};
