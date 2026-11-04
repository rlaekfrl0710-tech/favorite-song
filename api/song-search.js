// Public TJ / KY metadata search (Manana v2). Japanese queries also try Korean readings.
// Search is optional: manual title, artist and karaoke number entry always remains available.
const kanaRows=[
'あいうえお|아이우에오','かきくけこ|카키쿠케코','さしすせそ|사시스세소',
'たちつてと|타치츠테토','なにぬねの|나니누네노','はひふへほ|하히후헤호',
'まみむめも|마미무메모','やゆよ|야유요','らりるれろ|라리루레로',
'わをん|와오ㄴ','がぎぐげご|가기구게고','ざじずぜぞ|자지즈제조',
'だぢづでど|다지즈데도','ばびぶべぼ|바비부베보','ぱぴぷぺぽ|파피푸페포'
];
const kanaMap=new Map();
for(const row of kanaRows){
  const [kana,hangul]=row.split('|');
  // Hangul output is tokenized below to avoid splitting compound syllables.
  const tokens=Array.from(hangul);
  Array.from(kana).forEach((k,i)=>kanaMap.set(k,tokens[i]||''));
}
const digraphs={'きゃ':'캬','きゅ':'큐','きょ':'쿄','しゃ':'샤','しゅ':'슈','しょ':'쇼','ちゃ':'챠','ちゅ':'츄','ちょ':'쵸','にゃ':'냐','にゅ':'뉴','にょ':'뇨','ひゃ':'햐','ひゅ':'휴','ひょ':'효','みゃ':'먀','みゅ':'뮤','みょ':'묘','りゃ':'랴','りゅ':'류','りょ':'료','ぎゃ':'갸','ぎゅ':'규','ぎょ':'교','じゃ':'쟈','じゅ':'쥬','じょ':'죠','びゃ':'뱌','びゅ':'뷰','びょ':'뵤','ぴゃ':'퍄','ぴゅ':'퓨','ぴょ':'표'};
function toHiragana(value){return value.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));}
function kanaToKorean(value){
  const s=toHiragana(value);let out='';
  for(let i=0;i<s.length;i++){
    if(s[i]==='っ'){continue;}
    if(s[i]==='ー'){continue;}
    const pair=s.slice(i,i+2);
    if(digraphs[pair]){out+=digraphs[pair];i++;continue;}
    out+=kanaMap.get(s[i])??s[i];
  }
  return out.replace(/ㄴ(?=[^가-힣]|$)/g,'ㄴ');
}
const knownAliases=new Map([
 ['アイドル','아이돌'],['夜に駆ける','요루니카케루'],['群青','군청'],
 ['残酷な天使のテーゼ','잔혹한천사의테제'],['紅蓮華','홍련화'],
 ['怪物','괴물'],['青のすみか','푸르름이사는곳'],['ホシアイ','호시아이']
]);
function queryVariants(query){
  const variants=[query,query.normalize('NFKC')];
  const hira=toHiragana(query);
  if(hira!==query)variants.push(hira);
  const reading=kanaToKorean(query);
  if(reading!==query&&/[가-힣]/.test(reading))variants.push(reading);
  const alias=knownAliases.get(query);
  if(alias)variants.push(alias);
  return [...new Set(variants.map(x=>x.trim()).filter(x=>x.length>=2))].slice(0,4);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  const q=String(req.query.q||'').trim().slice(0,80);
  if(q.length<2)return res.status(400).json({error:'검색어를 2글자 이상 입력해 주세요.'});
  const search=async(brand,field,term)=>{
    const url=new URL('https://api.manana.kr/v2/karaoke/search.json');
    url.searchParams.set('brand',brand);
    url.searchParams.set(field,term);
    url.searchParams.set('limit','30');
    const response=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});
    if(!response.ok)throw Error('검색 서비스 응답 오류');
    const json=await response.json();
    return (Array.isArray(json.data)?json.data:[])
      .filter(x=>x&&x.no&&x.title&&x.brand===brand)
      .map(x=>({title:String(x.title).trim(),artist:String(x.singer||'').trim(),brand,number:String(x.no).trim()}));
  };
  const searchTerm=async term=>Promise.allSettled(['tj','kumyoung'].flatMap(brand=>['title','singer'].map(field=>search(brand,field,term))));
  try{
    const initial=await searchTerm(q);
    let settled=[...initial],records=initial.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
    // Additional Japanese/Korean reading variants only when the initial query returns no matches.
    if(!records.length){
      const variants=queryVariants(q).filter(term=>term!==q).slice(0,3);
      const expanded=await Promise.all(variants.map(searchTerm));
      settled.push(...expanded.flat());
      records=settled.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
    }
    const ok=settled.filter(x=>x.status==='fulfilled');
    if(!ok.length)throw Error('외부 검색 서비스가 응답하지 않아요.');
    const normalize=s=>s.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
    const grouped=new Map();
    for(const x of records){
      const key=normalize(x.title)+'|'+normalize(x.artist);
      if(!grouped.has(key))grouped.set(key,{title:x.title,artist:x.artist,tj:'',ky:''});
      const song=grouped.get(key),field=x.brand==='tj'?'tj':'ky';
      if(!song[field])song[field]=x.number;
    }
    return res.status(200).json({items:[...grouped.values()].slice(0,60),partial:ok.length<settled.length,expanded:settled.length>4});
  }catch(e){return res.status(502).json({error:'노래방 검색 서비스 연결에 실패했어요. 잠시 후 다시 시도해 주세요.'});}
};
