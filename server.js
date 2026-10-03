import express from "express";
import path from "node:path";
import {fileURLToPath} from "node:url";
import pg from "pg";

const {Pool}=pg;
const app=express();
const PORT=Number(process.env.PORT)||3000;
const ROUTER_URL=(process.env.MAX_ROUTER_URL||"https://max-router-production.up.railway.app/v1").replace(/\\/+$/,"");
const ROUTER_KEY=process.env.MAX_ROUTER_API_KEY||"";
const EDITOR_URL=process.env.MAX_EDITOR_URL||"https://max-editor-production-7fef.up.railway.app";
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}):null;
const root=path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(root,"public"),{index:"index.html"}));

async function dbInit(){
  if(!pool)return;
  await pool.query(`CREATE TABLE IF NOT EXISTS maru_conversations(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_key TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Chat baru',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS maru_messages(
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES maru_conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS maru_conv_user_idx ON maru_conversations(user_key)");
  await pool.query("CREATE INDEX IF NOT EXISTS maru_msg_conv_idx ON maru_messages(conversation_id)");
}
const userKey=req=>String(req.headers["x-maru-user"]||"anonymous").slice(0,200);
const routerHeaders=()=>ROUTER_KEY?{"Content-Type":"application/json","Authorization":"Bearer "+ROUTER_KEY}:{"Content-Type":"application/json"};

app.get("/api/health",async(req,res)=>{
  let database="not_configured";
  if(pool){try{await pool.query("SELECT 1");database="postgres"}catch{database="error"}}
  res.json({ok:true,service:"Maru AI",database,router:ROUTER_URL,editor:EDITOR_URL,routerKeyConfigured:Boolean(ROUTER_KEY),uptime:Math.floor(process.uptime())});
});
app.get("/api/config",(req,res)=>res.json({routerUrl:ROUTER_URL,editorUrl:EDITOR_URL}));
app.get("/api/models",async(req,res)=>{
  try{const r=await fetch(ROUTER_URL+"/models",{headers:routerHeaders()});const body=await r.text();res.status(r.status).type("application/json").send(body)}
  catch(e){res.status(502).json({error:"MAX Router tidak dapat dihubungi.",detail:e.message})}
});
app.post("/api/chat",async(req,res)=>{
  try{
    const r=await fetch(ROUTER_URL+"/chat/completions",{method:"POST",headers:routerHeaders(),body:JSON.stringify(req.body),signal:AbortSignal.timeout(180000)});
    res.status(r.status);
    for(const h of ["content-type","cache-control"])if(r.headers.get(h))res.setHeader(h,r.headers.get(h));
    if(!r.body)return res.end(await r.text());
    const reader=r.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;res.write(Buffer.from(value))}}finally{reader.releaseLock()}res.end();
  }catch(e){if(!res.headersSent)res.status(502).json({error:"Gagal meneruskan ke MAX Router.",detail:e.message});else res.end()}
});
app.get("/api/conversations",async(req,res)=>{
  if(!pool)return res.json([]);
  try{const r=await pool.query("SELECT id,title,created_at,updated_at FROM maru_conversations WHERE user_key=$1 ORDER BY updated_at DESC",[userKey(req)]);res.json(r.rows)}
  catch(e){res.status(500).json({error:e.message})}
});
app.get("/api/conversations/:id/messages",async(req,res)=>{
  if(!pool)return res.json([]);
  try{const r=await pool.query("SELECT id,role,content,created_at FROM maru_messages WHERE conversation_id=$1 ORDER BY id",[req.params.id]);res.json(r.rows)}
  catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/conversations",async(req,res)=>{
  if(!pool)return res.status(503).json({error:"PostgreSQL belum tersedia"});
  try{const r=await pool.query("INSERT INTO maru_conversations(user_key,title) VALUES($1,$2) RETURNING *",[userKey(req),String(req.body?.title||"Chat baru").slice(0,200)]);res.status(201).json(r.rows[0])}
  catch(e){res.status(500).json({error:e.message})}
});
app.post("/api/conversations/:id/messages",async(req,res)=>{
  if(!pool)return res.status(503).json({error:"PostgreSQL belum tersedia"});
  try{
    const r=await pool.query("INSERT INTO maru_messages(conversation_id,role,content) SELECT id,$2,$3 FROM maru_conversations WHERE id=$1 AND user_key=$4 RETURNING *",[req.params.id,String(req.body?.role||"user"),String(req.body?.content||""),userKey(req)]);
    if(!r.rowCount)return res.status(404).json({error:"Percakapan tidak ditemukan"});
    await pool.query("UPDATE maru_conversations SET updated_at=NOW() WHERE id=$1",[req.params.id]);res.status(201).json(r.rows[0]);
  }catch(e){res.status(500).json({error:e.message})}
});
app.get("*",(req,res)=>res.sendFile(path.join(root,"public","index.html")));

dbInit().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("[Maru AI] ready on "+PORT))).catch(e=>{console.error(e);process.exit(1)});
