const state={messages:[],models:[],model:"",history:JSON.parse(localStorage.getItem("maru.history")||"[]"),routerUrl:"",editorUrl:"",busy:false};
const $=id=>document.getElementById(id);
const messages=$("messages"),input=$("input"),send=$("send");

async function json(url,options){const r=await fetch(url,options);const t=await r.text();let d={};try{d=JSON.parse(t)}catch{}if(!r.ok)throw new Error(d.error||d.message||"HTTP "+r.status);return d}

function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function renderMessage(role,content,streaming=false){
  const row=document.createElement("div");row.className="message-row "+role;
  if(role==="assistant"){
    row.innerHTML='<div class="avatar">M</div><div class="assistant-content"><div class="message-bubble">'+escapeHtml(content)+(streaming?'<span class="typing"> ▌</span>':"")+"</div></div>";
  }else row.innerHTML='<div class="message-bubble">'+escapeHtml(content)+"</div>";
  messages.appendChild(row);messages.scrollTop=messages.scrollHeight;return row;
}
function resetWelcome(){const w=messages.querySelector(".welcome");if(w)w.remove()}
function addHistory(){
  if(!state.messages.length)return;
  const title=state.messages.find(x=>x.role==="user")?.content?.slice(0,48)||"Chat baru";
  state.history=[{title,messages:state.messages.slice(-20)},...state.history.filter(x=>x.title!==title)].slice(0,30);
  localStorage.setItem("maru.history",JSON.stringify(state.history));renderHistory();
}
function renderHistory(){
  $("history").innerHTML="";
  state.history.forEach((h,i)=>{const b=document.createElement("button");b.textContent=h.title;b.onclick=()=>{state.messages=h.messages.map(x=>({...x}));resetWelcome();messages.innerHTML="";state.messages.forEach(x=>renderMessage(x.role,x.content));};$("history").appendChild(b)});
}
function setConnection(ok,text){$("connectionDot").className="connection-dot "+(ok?"ok":"bad");$("connectionText").textContent=text}

async function loadConfig(){
  const c=await json("/api/config");state.routerUrl=c.routerUrl;state.editorUrl=c.editorUrl;
  $("editorLink").href=c.editorUrl;$("openEditor").href=c.editorUrl;$("editorCardLink").href=c.editorUrl;
}
async function loadModels(){
  try{
    const d=await json("/api/models");state.models=Array.isArray(d.data)?d.data:[];
    if(!state.models.length)throw new Error("Tidak ada model");
    if(!state.model||!state.models.some(m=>m.id===state.model))state.model=state.models[0].id;
    setConnection(true,"MAX Router terhubung");renderModelMenu();
  }catch(e){setConnection(false,"MAX Router belum siap");renderModelMenu(e.message)}
}
function renderModelMenu(error=""){
  $("modelButton").innerHTML=escapeHtml(state.model||"Pilih model")+" <span>⌄</span>";
  const menu=$("modelMenu");menu.innerHTML="";
  if(error){menu.innerHTML='<div class="muted">'+escapeHtml(error)+"</div>";return}
  state.models.slice(0,100).forEach(m=>{const b=document.createElement("button");b.textContent=m.id;b.onclick=()=>{state.model=m.id;menu.classList.add("hidden");renderModelMenu()};menu.appendChild(b)});
}
async function sendMessage(){
  const text=input.value.trim();if(!text||state.busy)return;
  resetWelcome();input.value="";input.style.height="auto";state.busy=true;send.disabled=true;
  state.messages.push({role:"user",content:text});renderMessage("user",text);
  const row=renderMessage("assistant","",true);const bubble=row.querySelector(".message-bubble");
  let answer="";
  try{
    const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:state.model,messages:state.messages,stream:true})});
    if(!response.ok){const t=await response.text();let d={};try{d=JSON.parse(t)}catch{}throw new Error(d.error||"MAX Router HTTP "+response.status)}
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
    while(true){
      const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
      const parts=buffer.split("\n");buffer=parts.pop()||"";
      for(const line of parts){if(!line.startsWith("data:"))continue;const data=line.slice(5).trim();if(data==="[DONE]")continue;try{const j=JSON.parse(data);const delta=j.choices?.[0]?.delta?.content||j.choices?.[0]?.message?.content||"";if(delta){answer+=delta;bubble.innerHTML=escapeHtml(answer)+"<span class='typing'> ▌</span>";messages.scrollTop=messages.scrollHeight}}catch{}}
    }
    bubble.innerHTML=escapeHtml(answer||"MAX Router tidak mengembalikan teks.");state.messages.push({role:"assistant",content:answer||"MAX Router tidak mengembalikan teks."});addHistory();
  }catch(e){bubble.innerHTML=escapeHtml("Error: "+e.message);state.messages.push({role:"assistant",content:"Error: "+e.message})}
  finally{state.busy=false;send.disabled=false;input.focus()}
}
$("composer").addEventListener("submit",e=>{e.preventDefault();sendMessage()});
input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}});
input.addEventListener("input",()=>{input.style.height="auto";input.style.height=Math.min(input.scrollHeight,220)+"px"});
$("modelButton").onclick=()=>$("modelMenu").classList.toggle("hidden");
document.addEventListener("click",e=>{if(!e.target.closest(".model-wrap"))$("modelMenu").classList.add("hidden")});
document.querySelectorAll(".quick-grid button").forEach(b=>b.onclick=()=>{input.value=b.dataset.prompt;input.focus()});
$("newChat").onclick=()=>{state.messages=[];messages.innerHTML='<div class="welcome"><div class="welcome-mark">M</div><h1>Apa yang ingin kamu kerjakan?</h1><p>Mulai percakapan baru dengan Maru AI.</p></div>';input.focus()};
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
function switchView(view){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));$(view+"View").classList.add("active");document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===view));}
$("mobileMenu").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");
$("refreshStatus").onclick=loadStatus;
async function loadStatus(){
  const cards=$("statusCards");cards.innerHTML='<div class="status-card"><strong>Memeriksa…</strong><span>Memuat status komponen</span></div>';
  try{const h=await json("/api/health");cards.innerHTML=[
    ["Maru AI","ONLINE","Server aplikasi aktif"],
    ["MAX Router",h.routerKeyConfigured?"SIAP":"AKSES PUBLIK / BELUM DISET","Endpoint: "+h.router],
    ["MAX Editor","TERHUBUNG","Endpoint: "+h.editor]
  ].map(x=>'<div class="status-card"><strong>'+escapeHtml(x[0])+' · '+escapeHtml(x[1])+'</strong><span>'+escapeHtml(x[2])+"</span></div>").join("")}catch(e){cards.innerHTML='<div class="status-card"><strong>Gagal</strong><span>'+escapeHtml(e.message)+"</span></div>"}
}
renderHistory();
(async()=>{try{await loadConfig();await loadModels();await loadStatus()}catch(e){setConnection(false,e.message)}})();