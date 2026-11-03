// Search public karaoke metadata via the documented third-party Manana API.
// This does not access or copy the private database of noraebang.app.
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const q=String(req.query.q||'').trim().slice(0,80);
  if(q.length<2)return res.status(400).json({error:'검색어를 2글자 이상 입력해 주세요.'});
  const search=async(brand,field)=>{
    const url=new URL('https://api.manana.kr/v2/karaoke/search.json');
    url.searchParams.set('brand',brand);url.searchParams.set(field,q);url.searchParams.set('limit','20');
    const response=await fetch(url,{signal:AbortSignal.timeout(6500),headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('검색 서비스 응답 오류');
    const json=await response.json();
    return (Array.isArray(json.data)?json.data:[]).filter(x=>x&&x.no&&x.title).map(x=>({title:String(x.title).trim(),artist:String(x.singer||'').trim(),brand,number:String(x.no).trim()}));
  };
  try{
    const calls=await Promise.allSettled(['tj','kumyoung'].flatMap(brand=>['title','singer'].map(field=>search(brand,field))));
    const ok=calls.filter(x=>x.status==='fulfilled');
    if(!ok.length)throw Error('외부 검색 서비스가 응답하지 않아요.');
    const records=ok.flatMap(x=>x.value);
    const normalize=s=>s.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
    const grouped=new Map();
    for(const x of records){
      const key=normalize(x.title)+'|'+normalize(x.artist);
      if(!grouped.has(key))grouped.set(key,{title:x.title,artist:x.artist,tj:'',ky:''});
      const song=grouped.get(key),field=x.brand==='tj'?'tj':'ky';
      if(!song[field])song[field]=x.number;
    }
    const items=[...grouped.values()].slice(0,60);
    return res.status(200).json({items,partial:ok.length<calls.length});
  }catch(e){return res.status(502).json({error:'노래방 검색 서비스 연결에 실패했어요. 잠시 후 다시 시도해 주세요.'});}
};
