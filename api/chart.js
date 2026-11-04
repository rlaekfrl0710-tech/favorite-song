// TJ website's own chart endpoint; rankings are provider aggregates, not second-by-second live.
const TYPES={all:'0',kpop:'1',jpop:'3'};
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const genre=String(req.query.genre||'all');
  if(!Object.prototype.hasOwnProperty.call(TYPES,genre))return res.status(400).json({error:'잘못된 차트 종류입니다.'});
  try{
    const body=new URLSearchParams({chartType:'TOP',strType:TYPES[genre],searchStartDate:'',searchEndDate:''});
    const response=await fetch('https://www.tjmedia.com/legacy/api/topAndHot100',{
      method:'POST',signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',Accept:'application/json, text/javascript, */*; q=0.01','X-Requested-With':'XMLHttpRequest',Origin:'https://www.tjmedia.com',Referer:'https://www.tjmedia.com/chart/top100','User-Agent':'Mozilla/5.0'},
      body
    });
    if(!response.ok)throw Error('TJ 차트 서버 응답 오류');
    const payload=await response.json();
    const raw=payload?.resultData?.items;
    if(!Array.isArray(raw))throw Error('TJ 차트 데이터 형식이 변경되었습니다.');
    const seen=new Set();
    const items=raw.map(x=>({rank:Number.parseInt(x.rank,10),title:String(x.indexTitle||'').trim(),artist:String(x.indexSong||'').trim(),tj:String(x.pro||'').trim()}))
      .filter(x=>Number.isInteger(x.rank)&&x.rank>0&&x.title&&x.artist&&x.tj)
      .filter(x=>{const key=x.rank+'|'+x.tj;if(seen.has(key))return false;seen.add(key);return true;})
      .sort((a,b)=>a.rank-b.rank).slice(0,100);
    if(!items.length)throw Error('해당 차트에 표시할 곡이 없습니다.');
    res.status(200).json({genre,items,fetchedAt:new Date().toISOString(),source:'TJ미디어 TOP100'});
  }catch(error){res.status(502).json({error:'TJ 차트 데이터를 가져오지 못했어요. 공식 사이트에서 확인해 주세요.'});}
};
