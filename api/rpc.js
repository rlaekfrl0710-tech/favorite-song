const GAS_URL = 'https://script.google.com/macros/s/AKfycbzlteZsUJ8i33shUI5QT0WTNDJ3ufjET0uEId4NDLYslR9uXzFJBRbKrI8Z_LPL2R5cNQ/exec';
const COOKIE='__Host-karaoke';
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const reply=(status,value)=>res.status(status).json(value);
  if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{ok:false,error:'POST 요청이 필요해요'});}
  let origin;try{origin=new URL(req.headers.origin).host;}catch{return reply(403,{ok:false,error:'허용되지 않은 요청'});}
  if(origin!==req.headers.host)return reply(403,{ok:false,error:'허용되지 않은 요청'});
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||Array.isArray(body))throw Error();}catch{return reply(400,{ok:false,error:'잘못된 요청'});}
  if(!['status','session','login','logout','read','write'].includes(body.action))return reply(400,{ok:false,error:'지원하지 않는 요청'});
  const match=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  const token=match?match.slice(COOKIE.length+1):'';
  if(!['status','login'].includes(body.action)&&!token)return reply(401,{ok:false,error:'AUTH_REQUIRED'});
  if(body.action==='login'&&(typeof body.password!=='string'||body.password.length<6||body.password.length>128))return reply(400,{ok:false,error:'비밀번호는 6~128자로 입력해 주세요'});
  try{
    const upstream=await fetch(process.env.GAS_URL||GAS_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:body.action,token,password:body.action==='login'?body.password:undefined,payload:body.action==='write'?body.payload:undefined}),signal:AbortSignal.timeout(45000)});
    if(!upstream.ok)throw Error('UPSTREAM');
    const result=await upstream.json();
    if(!result.ok){const expired=String(result.error).includes('AUTH_REQUIRED');if(expired)res.setHeader('Set-Cookie',COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');return reply(expired?401:400,{ok:false,error:result.error});}
    if(body.action==='login'){
      if(typeof result.data?.token!=='string'||!/^[a-zA-Z0-9-]{40,150}$/.test(result.data.token))throw Error('UPSTREAM');
      res.setHeader('Set-Cookie',COOKIE+'='+result.data.token+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=7776000');
      result.data={ok:true};
    }
    if(body.action==='logout')res.setHeader('Set-Cookie',COOKIE+'=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
    return reply(200,result);
  }catch{return reply(502,{ok:false,error:'데이터 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
};
