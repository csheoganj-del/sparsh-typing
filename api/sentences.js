module.exports=async function(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Use POST'}));}
  const db=require('./_db');
  const user=db.verifyToken((req.headers.authorization||'').replace(/^Bearer\s+/i,''));
  if(!user){res.statusCode=401;return res.end(JSON.stringify({error:'Sign in for AI practice'}));}
  try {
    let account=null;
    try { account=await db.getUser(user.username); }
    catch(e){console.error('sentence account check skipped', e && e.message); account={username:user.username};}
    if(!account){res.statusCode=401;return res.end(JSON.stringify({error:'Sign in again'}));}
    let body=req.body;
    if(!body){let text='';for await(const chunk of req){text+=chunk;if(text.length>20000)throw Error('Request too large');}body=JSON.parse(text||'{}');}
    if(typeof body==='string')body=JSON.parse(body);
    if(JSON.stringify(body).length>20000)throw Error('Request too large');
    const result=await require('./_sentences').generate(body);
    res.end(JSON.stringify(result));
  }catch(e){console.error('sentence generation failed', e && e.message);res.statusCode=503;res.end(JSON.stringify({error:'AI sentence generation is unavailable. Retry or use the practice fallback.',reason:/^AI (provider HTTP \d+|validation failed:|is not configured)/.test(e.message)?e.message.slice(0,120):'generation_error'}));}
};
