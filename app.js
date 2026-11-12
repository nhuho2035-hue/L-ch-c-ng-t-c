"use strict";
const $=i=>document.getElementById(i),DOW=["Chủ nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"],ROLE={admin:"Quản trị",user:"Nhập lịch",viewer:"Chỉ xem"};
let ME=null,PV=false,D={title:"",leaders:[],events:[],absences:[],updated:null},who="",ed=null,ws,forced=false;
const key=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const parse=k=>{const p=k.split("-");return new Date(+p[0],+p[1]-1,+p[2])};
const monday=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-(x.getDay()+6)%7);return x};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const fmt=d=>String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0");
const dmy=k=>{const p=k.split("-");return p[2]+"/"+p[1]+"/"+p[0]};
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nm=id=>(D.leaders.find(l=>l.id===id)||{}).name||"";
const byTime=(a,b)=>a.time.localeCompare(b.time);
const canEdit=()=>!!ME&&!ME.mustChange&&ME.role!=="viewer",isAdm=()=>!!ME&&!ME.mustChange&&ME.role==="admin";
const api=(p,b)=>fetch("/api/"+p,{method:b===undefined?"GET":"POST",headers:{"Content-Type":"application/json","X-Requested-With":"lich"},body:b===undefined?undefined:JSON.stringify(b)})
 .then(r=>r.json().then(j=>({s:r.status,j}))).then(r=>{if(r.s===401&&p!=="login"&&p!=="me"){ME=null;render();if(!PV)showLogin()}return r});
const load=poll=>api("data"+(poll?"?poll=1":"")).then(r=>{if(r.s===200){D=r.j;render()}}).catch(()=>{$("upd").textContent=location.protocol==="file:"?"Bạn đang mở trực tiếp file. Hãy chạy start.bat rồi mở http://localhost:3000":"Không kết nối được máy chủ"});
const apply=r=>{if(r.s===200&&r.j.events)D=r.j;else if(r.s!==401)alert(r.j.error||"Có lỗi xảy ra");render()};
function card(e){const ed_=canEdit(),ls=e.leaders.length?e.leaders.map(nm).filter(Boolean).join(", "):"Tập thể lãnh đạo";
 const clash=ed_&&e.leaders.length&&D.events.some(o=>o.id!==e.id&&o.date===e.date&&o.time===e.time&&o.leaders.some(l=>e.leaders.includes(l)));
 return '<div class="ev"><div class="t">'+esc(e.time)+'</div><div><h3>'+esc(e.title)+'</h3><p class="who">'+esc(ls)+'</p>'+(e.place?'<p class="m">Địa điểm: '+esc(e.place)+'</p>':"")+(e.people?'<p class="m">Thành phần: '+esc(e.people)+'</p>':"")+(e.note?'<p class="m">'+esc(e.note)+'</p>':"")+(clash?'<p class="w">Trùng giờ với lịch khác của cùng đồng chí</p>':"")+(ed_?'<div class="acts noprint"><button class="lk" data-e="'+esc(e.id)+'">Sửa</button><button class="lk" data-x="'+esc(e.id)+'">Xóa</button></div>':"")+'</div></div>'}
function render(){
 const wk=key(ws),we=key(addDays(ws,6)),today=key(new Date()),e6=addDays(ws,6);
 $("ttl").textContent=D.title;$("rng").textContent="Từ ngày "+fmt(ws)+"/"+ws.getFullYear()+" đến ngày "+fmt(e6)+"/"+e6.getFullYear();
 $("upd").textContent=D.updated?"Cập nhật lúc: "+new Date(D.updated).toLocaleString("vi-VN"):"";
 $("meBar").hidden=!ME;$("meTxt").textContent=ME?ME.name+" ("+ROLE[ME.role]+")":"";$("bLogin").hidden=!!ME;
 $("admb").hidden=!canEdit();$("aLead").hidden=$("aUsers").hidden=$("aLog").hidden=!isAdm();
 $("who").innerHTML='<option value="">Tất cả lãnh đạo</option>'+D.leaders.map(l=>'<option value="'+esc(l.id)+'"'+(l.id===who?" selected":"")+'>'+esc(l.name)+'</option>').join("");
 const ab=D.absences.filter(a=>a.from<=we&&a.to>=wk&&(!who||a.leader===who));
 $("abs").innerHTML=ab.length?'<div class="abs"><h2>Lãnh đạo đi công tác</h2>'+ab.map(a=>"<p>• "+esc(nm(a.leader))+(a.reason?" – "+esc(a.reason):"")+" (từ ngày "+dmy(a.from)+" đến ngày "+dmy(a.to)+")"+(canEdit()?' <button class="lk noprint" data-xa="'+esc(a.id)+'">Xóa</button>':"")+"</p>").join("")+"</div>":"";
 let h="";
 for(let i=0;i<7;i++){const d=addDays(ws,i),k=key(d);
  const es=D.events.filter(e=>e.date===k&&(!who||!e.leaders.length||e.leaders.includes(who))).sort(byTime);
  h+='<section class="day'+(k===today?" today":"")+'" id="d'+k+'"><h2>'+DOW[d.getDay()]+", "+fmt(d)+"</h2>";
  if(!es.length)h+='<p class="none">Chưa có lịch</p>';
  [["Sáng",e=>e.time<"12:00"],["Chiều",e=>e.time>="12:00"]].forEach(p=>{const l=es.filter(p[1]);if(l.length)h+='<div class="part">'+p[0]+"</div>"+l.map(card).join("")});
  h+="</section>"}
 $("week").innerHTML=h}
// ---- đăng nhập, đổi mật khẩu ----
function showLogin(){$("lp").value="";$("lerr").textContent="";$("lc").hidden=!PV;if(!$("login").open)$("login").showModal();$("lu").focus()}
function showPw(f){forced=f;$("pwT").textContent=f?"Bạn cần đổi mật khẩu trước khi sử dụng":"Đổi mật khẩu";$("pwC").hidden=f;["po","pn","pn2"].forEach(i=>$(i).value="");$("perr").textContent="";if(!$("pw").open)$("pw").showModal();$("po").focus()}
$("login").oncancel=e=>{if(!ME&&!PV)e.preventDefault()};$("pw").oncancel=e=>{if(forced)e.preventDefault()};$("lc").onclick=()=>$("login").close();$("pwC").onclick=()=>$("pw").close();
$("lgo").onclick=()=>api("login",{username:$("lu").value,password:$("lp").value}).then(r=>{if(r.s===200){ME=r.j.user;$("lp").value="";$("login").close();render();if(ME.mustChange)showPw(true);else load()}else $("lerr").textContent=r.j.error||"Không đăng nhập được"});
$("lp").onkeydown=$("lu").onkeydown=e=>{if(e.key==="Enter")$("lgo").click()};
$("pwS").onclick=()=>{if($("pn").value!==$("pn2").value){$("perr").textContent="Hai mật khẩu mới không khớp";return}
 api("password",{old:$("po").value,password:$("pn").value}).then(r=>{if(r.s===200){ME=r.j.user;forced=false;$("pw").close();render();load()}else $("perr").textContent=r.j.error||"Có lỗi xảy ra"})};
$("bLogin").onclick=showLogin;$("aPw").onclick=()=>showPw(false);
$("aOut").onclick=()=>api("logout",{}).then(()=>{ME=null;D={title:D.title,leaders:[],events:[],absences:[],updated:null};render();if(PV)load();else showLogin()});
// ---- điều hướng ----
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
$("who").onchange=()=>{who=$("who").value;render()};
$("prev").onclick=()=>{ws=addDays(ws,-7);render()};$("next").onclick=()=>{ws=addDays(ws,7);render()};
$("bToday").onclick=()=>{ws=monday(new Date());render();const el=$("d"+key(new Date()));if(el)el.scrollIntoView()};
$("bPrint").onclick=()=>print();$("bReload").onclick=()=>load();
// ---- nhập lịch ----
function openEv(e){ed=e?e.id:null;$("evT").textContent=e?"Sửa lịch":"Thêm lịch";
 $("eLead").innerHTML=D.leaders.map(l=>'<label class="ck"><input type="checkbox" value="'+esc(l.id)+'"'+(e&&e.leaders.includes(l.id)?" checked":"")+"> "+esc(l.name)+"</label>").join("");
 $("eTitle").value=e?e.title:"";$("eDate").value=e?e.date:key(new Date());$("eTime").value=e?e.time:"07:30";$("ePlace").value=e?e.place:"";$("ePeople").value=e?e.people:"";$("eNote").value=e?e.note:"";$("ev").showModal()}
$("aEv").onclick=()=>openEv(null);
$("week").onclick=e=>{const b=e.target.closest("button");if(!b)return;
 if(b.dataset.e)openEv(D.events.find(x=>x.id===b.dataset.e));
 if(b.dataset.x&&confirm("Xóa lịch này?"))api("event/delete",{id:b.dataset.x}).then(apply)};
$("abs").onclick=e=>{const b=e.target.closest("[data-xa]");if(b&&confirm("Xóa nội dung này?"))api("absence/delete",{id:b.dataset.xa}).then(apply)};
$("eSave").onclick=()=>{const t=$("eTitle").value.trim();if(!t){$("eTitle").focus();return}if(!$("eDate").value){$("eDate").focus();return}
 const o={id:ed||undefined,title:t,leaders:[...$("eLead").querySelectorAll("input:checked")].map(i=>i.value),date:$("eDate").value,time:$("eTime").value||"07:30",place:$("ePlace").value,people:$("ePeople").value,note:$("eNote").value};
 api("event",o).then(r=>{if(r.s===200){$("ev").close();ws=monday(parse(o.date))}apply(r)})};
$("aAbs").onclick=()=>{$("aWho").innerHTML=D.leaders.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name)+"</option>").join("");$("aFrom").value=$("aTo").value=key(new Date());$("aWhy").value="";$("abd").showModal()};
$("aSave").onclick=()=>{const f=$("aFrom").value,t=$("aTo").value;if(!f||!t||t<f){alert("Hãy chọn khoảng ngày hợp lệ");return}
 api("absence",{leader:$("aWho").value,from:f,to:t,reason:$("aWhy").value}).then(r=>{if(r.s===200)$("abd").close();apply(r)})};
// ---- đơn vị và lãnh đạo (quản trị) ----
const lList=()=>{$("lList").innerHTML=D.leaders.map(l=>'<div class="ld"><span>'+esc(l.name)+'</span><button class="lk" data-dl="'+esc(l.id)+'">Xóa</button></div>').join("")};
$("aLead").onclick=()=>{$("lTitle").value=D.title;lList();$("ld").showModal()};
$("lList").onclick=e=>{const b=e.target.closest("[data-dl]");if(b){D.leaders=D.leaders.filter(l=>l.id!==b.dataset.dl);lList()}};
$("lAdd").onclick=()=>{const n=$("lNew").value.trim();if(n){D.leaders.push({id:"n"+Date.now().toString(36),name:n});$("lNew").value="";lList()}};
$("lSave").onclick=()=>api("leaders",{title:$("lTitle").value,leaders:D.leaders}).then(r=>{if(r.s===200)$("ld").close();apply(r)});
$("lCancel").onclick=()=>{$("ld").close();load()};
// ---- tài khoản (quản trị) ----
function uList(){api("users").then(r=>{if(r.s!==200)return;$("uList").innerHTML=r.j.users.map(u=>{const n=esc(u.username);
 return '<div class="ld"><div><b>'+n+"</b> – "+esc(u.name)+"<br><small>"+(u.disabled?"Đã khóa · ":"")+(u.mustChange?"Chờ đổi mật khẩu":"")+'</small><br><select data-urole="'+n+'">'+["admin","user","viewer"].map(k=>'<option value="'+k+'"'+(u.role===k?" selected":"")+">"+ROLE[k]+"</option>").join("")+'</select></div><div><button class="lk" data-ur="'+n+'">Đặt lại MK</button><button class="lk" data-ud="'+n+'" data-dis="'+(u.disabled?0:1)+'">'+(u.disabled?"Mở khóa":"Khóa")+'</button><button class="lk" data-ux="'+n+'">Xóa</button></div></div>'}).join("")})}
const uDone=r=>{if(r.s!==200)alert(r.j.error||"Có lỗi xảy ra");uList()};
$("aUsers").onclick=()=>{uList();$("ud").showModal()};
$("uList").onclick=e=>{const b=e.target.closest("button");if(!b)return;
 if(b.dataset.ur){const pw=prompt("Nhập mật khẩu tạm mới (từ 8 ký tự, có chữ và số). Người dùng sẽ phải đổi ngay khi đăng nhập:");if(pw)api("users/update",{username:b.dataset.ur,password:pw}).then(r=>{if(r.s===200)alert("Đã đặt lại mật khẩu");uDone(r)})}
 if(b.dataset.ud)api("users/update",{username:b.dataset.ud,disabled:b.dataset.dis==="1"}).then(uDone);
 if(b.dataset.ux&&confirm("Xóa tài khoản "+b.dataset.ux+"?"))api("users/delete",{username:b.dataset.ux}).then(uDone)};
$("uList").onchange=e=>{const s=e.target.closest("[data-urole]");if(s)api("users/update",{username:s.dataset.urole,role:s.value}).then(uDone)};
$("nAdd").onclick=()=>api("users/create",{username:$("nu").value,name:$("nn").value,role:$("nr").value,password:$("np").value}).then(r=>{if(r.s===200){["nu","nn","np"].forEach(i=>$(i).value="")}uDone(r)});
$("aLog").onclick=()=>api("audit").then(r=>{if(r.s!==200)return;$("logText").textContent=r.j.lines.map(l=>new Date(l.t).toLocaleString("vi-VN")+" | "+l.u+" | "+l.a+(l.d?" | "+l.d:"")+" | "+l.ip).join("\n")||"Chưa có hoạt động";$("log").showModal()});
// ---- tra cứu ----
$("bFind").onclick=()=>{$("q").value="";$("qr").innerHTML="";$("find").showModal();$("q").focus()};
$("q").oninput=()=>{const q=$("q").value.trim().toLowerCase();
 const r=q?D.events.filter(e=>[e.title,e.place,e.people,e.note,...e.leaders.map(nm)].join(" ").toLowerCase().includes(q)).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,40):[];
 $("qr").innerHTML=r.length?r.map(e=>'<button class="hit" data-go="'+esc(e.date)+'"><b>'+dmy(e.date)+" "+esc(e.time)+"</b> "+esc(e.title)+"</button>").join(""):q?'<p class="m">Không tìm thấy.</p>':""};
$("qr").onclick=e=>{const b=e.target.closest("[data-go]");if(b){ws=monday(parse(b.dataset.go));$("find").close();render();const el=$("d"+b.dataset.go);if(el)el.scrollIntoView()}};
// ---- khởi động ----
ws=monday(new Date());render();
api("me").then(r=>{ME=r.j.user;PV=r.j.publicView;render();if(ME&&ME.mustChange)showPw(true);else if(ME||PV)load();else showLogin()}).catch(()=>{$("upd").textContent=location.protocol==="file:"?"Bạn đang mở trực tiếp file. Hãy chạy start.bat rồi mở http://localhost:3000":"Không kết nối được máy chủ"});
setInterval(()=>{if(!document.querySelector("dialog[open]")&&(ME||PV))load(true)},60000);
