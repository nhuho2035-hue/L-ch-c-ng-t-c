// API lịch công tác trên Netlify Functions, dữ liệu lưu bằng Netlify Blobs.
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

export const config = { path: '/api/*' };

const SECRET = process.env.SESSION_SECRET || '';
const BOOT = (process.env.ADMIN_PASSWORD || '').trim();
const PUBLIC_VIEW = process.env.PUBLIC_VIEW === '1';
const REGION = process.env.BLOBS_REGION || 'ap-southeast-1';
const IDLE = 30 * 60e3, MAX = 12 * 3600e3;
const R = { viewer: 1, user: 2, admin: 3 }, okRole = r => r === 'admin' || r === 'user' || r === 'viewer';

const store = () => getStore({ name: 'lich-cong-tac', consistency: 'strong', region: REGION });
const get = async (k, init) => (await store().get(k, { type: 'json', consistency: 'strong' })) ?? init();
const initData = () => ({ title: 'Lịch làm việc của lãnh đạo Đảng ủy xã ...', leaders: [{ id: 'l1', name: 'Bí thư Đảng ủy' }, { id: 'l2', name: 'Phó Bí thư thường trực' }, { id: 'l3', name: 'Phó Bí thư, Chủ tịch UBND' }, { id: 'l4', name: 'Chủ tịch HĐND' }, { id: 'l5', name: 'Chủ tịch UBMTTQ' }], events: [], absences: [], updated: null });
// đọc – sửa – ghi có kiểm tra phiên bản (etag); xung đột thì đọc lại và làm lại
async function rw(key, init, mut) {
  const st = store();
  for (let i = 0; i < 6; i++) {
    const cur = await st.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const val = cur ? cur.data : init();
    const r = await mut(val);
    if (r && r.abort) return r;
    const w = await st.setJSON(key, val, cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    if (w.modified) return { val };
  }
  throw new Error('Xung đột ghi dữ liệu, hãy thử lại');
}
const S = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const reD = /^\d{4}-\d{2}-\d{2}$/, reT = /^([01]\d|2[0-3]):[0-5]\d$/, reId = /^[a-z0-9]{2,20}$/i, uid = () => crypto.randomBytes(6).toString('hex');
const strong = p => p.length >= 8 && p.length <= 100 && /[A-Za-z]/.test(p) && /\d/.test(p);
const pub = u => ({ username: u.username, name: u.name, role: u.role, mustChange: !!u.mustChange });
// mật khẩu: băm scrypt có muối
const hash = (pw, s = crypto.randomBytes(16).toString('hex')) => s + ':' + crypto.scryptSync(pw, s, 64).toString('hex');
const verify = (pw, st) => { const [s, h] = st.split(':'), a = crypto.scryptSync(pw, s, 64), b = Buffer.from(h, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const DUMMY = hash('x');
// phiên đăng nhập: cookie HttpOnly có chữ ký HMAC, không cần lưu phía máy chủ
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); };
const unsign = t => { const [b, s] = String(t).split('.'); if (!b || !s) return null; const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url'), x = Buffer.from(s), y = Buffer.from(e); if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return null; try { return JSON.parse(Buffer.from(b, 'base64url').toString()); } catch { return null; } };
const json = (c, o, h) => { const x = new Headers(h || {}); x.set('Content-Type', 'application/json; charset=utf-8'); x.set('Cache-Control', 'no-store'); return new Response(JSON.stringify(o), { status: c, headers: x }); };
const setCookie = (h, p) => h.set('Set-Cookie', 'sid=' + (p ? sign(p) : '') + '; HttpOnly; Secure; SameSite=Strict; Path=/' + (p ? '' : '; Max-Age=0'));
const key = k => k.replace(/[^a-z0-9:.@_-]/gi, '_').slice(0, 100);
const locked = async k => { const f = await get('fail-' + key(k), () => null); return !!f && f.n >= 5 && Date.now() - f.t < 300000; };
const fail = k => rw('fail-' + key(k), () => ({ n: 0, t: 0 }), f => { if (Date.now() - f.t > 300000) f.n = 0; f.n++; f.t = Date.now(); });
const clearFail = k => store().delete('fail-' + key(k));
const audit = async (ip, u, a, d) => { try { await rw('audit', () => [], l => { l.push({ t: new Date().toISOString(), u, ip, a, d: S(d, 300) }); if (l.length > 500) l.splice(0, l.length - 500); }); } catch (e) { console.error('audit', e.message); } };
const upd = mut => rw('users', () => [], mut);

export default async (req, context) => {
  try { return await main(req, context); } catch (e) { console.error(e); return json(500, { error: 'Lỗi máy chủ, hãy thử lại' }); }
};

async function main(req, context) {
  if (SECRET.length < 32) return json(500, { error: 'Máy chủ chưa cấu hình SESSION_SECRET (tối thiểu 32 ký tự)' });
  const url = new URL(req.url), p = url.pathname;
  if (!p.startsWith('/api/')) return json(404, { error: 'Không tìm thấy' });
  const A = p.slice(5), POST = req.method === 'POST', hdr = new Headers();
  const I = S((context && context.ip) || req.headers.get('x-nf-client-connection-ip') || '?', 60);
  const deny = (c, m) => json(c, { error: m }, hdr);
  let b = {};
  if (POST) {
    const o = req.headers.get('origin');
    if (o) { let h; try { h = new URL(o).host; } catch { } if (h !== url.host) return deny(403, 'Nguồn yêu cầu không hợp lệ'); }
    if (req.headers.get('x-requested-with') !== 'lich') return deny(403, 'Yêu cầu không hợp lệ');
    if (+(req.headers.get('content-length') || 0) > 2e5) return deny(413, 'Dữ liệu quá lớn');
    try { b = await req.json(); if (!b || typeof b !== 'object') b = {}; } catch { return deny(400, 'Yêu cầu không hợp lệ'); }
  }
  // nhận diện người dùng từ cookie
  let me = null, tp = null;
  const m = /(?:^|; )sid=([A-Za-z0-9_.-]+)/.exec(req.headers.get('cookie') || '');
  if (m) {
    const t = unsign(m[1]), n = Date.now();
    if (t && n < t.exp && n - t.seen <= IDLE) {
      const us = await get('users', () => null), u = us && us.find(x => x.username === t.u);
      if (u && !u.disabled && u.ver === t.ver) { me = u; tp = t; }
    }
  }
  if (me && !url.searchParams.has('poll') && Date.now() - tp.seen > 60000) setCookie(hdr, { ...tp, seen: Date.now() });
  const need = l => { if (!me) return deny(401, 'Cần đăng nhập'); if (me.mustChange) return deny(403, 'Cần đổi mật khẩu trước khi sử dụng'); if (R[me.role] < R[l]) return deny(403, 'Bạn không có quyền thực hiện thao tác này'); return null; };
  const un_ = me && me.username;
  const mutData = async (mut, act, detail) => {
    const o = await rw('data', initData, d => { const r = mut(d); if (r && r.abort) return r; d.updated = new Date().toISOString(); });
    if (o.abort) return deny(o.c, o.m);
    try { await store().setJSON('backup-' + o.val.updated.slice(0, 10), o.val); } catch { }
    await audit(I, un_, act, typeof detail === 'function' ? detail() : detail);
    return json(200, o.val, hdr);
  };
  let bad;
  switch ((POST ? 'POST ' : 'GET ') + A) {
    case 'GET me': return json(200, { user: me ? pub(me) : null, publicView: PUBLIC_VIEW }, hdr);
    case 'POST login': {
      const un = S(b.username, 40).toLowerCase(), pw = String(b.password || '').slice(0, 200), ki = 'ip:' + I, ku = 'u:' + un;
      if (await locked(ki) || await locked(ku)) return deny(429, 'Nhập sai nhiều lần, hãy thử lại sau 5 phút');
      let us = await get('users', () => null);
      if (!us) {
        if (!BOOT) return deny(500, 'Chưa cấu hình ADMIN_PASSWORD cho lần chạy đầu');
        us = [{ username: 'admin', name: 'Quản trị viên', role: 'admin', pass: hash(BOOT), mustChange: true, disabled: false, ver: 1 }];
        const w = await store().setJSON('users', us, { onlyIfNew: true });
        if (!w.modified) us = await get('users', () => []);
      }
      const u = us.find(x => x.username === un), good = u ? verify(pw, u.pass) : (verify(pw, DUMMY), false);
      if (!good || u.disabled) { await fail(ki); await fail(ku); await audit(I, un, 'Đăng nhập sai', ''); return deny(401, 'Sai tên đăng nhập hoặc mật khẩu'); }
      await clearFail(ki); await clearFail(ku);
      const n = Date.now(); setCookie(hdr, { u: un, ver: u.ver, exp: n + MAX, seen: n });
      await audit(I, un, 'Đăng nhập', ''); return json(200, { user: pub(u) }, hdr);
    }
    case 'POST logout': setCookie(hdr, null); if (me) await audit(I, un_, 'Đăng xuất', ''); return json(200, { ok: 1 }, hdr);
    case 'POST password': {
      if (!me) return deny(401, 'Cần đăng nhập');
      const old = String(b.old || ''), np = String(b.password || '');
      if (await locked('u:' + me.username)) return deny(429, 'Nhập sai nhiều lần, hãy thử lại sau 5 phút');
      if (!verify(old, me.pass)) { await fail('u:' + me.username); return deny(400, 'Mật khẩu hiện tại không đúng'); }
      if (!strong(np)) return deny(400, 'Mật khẩu mới cần từ 8 ký tự và có cả chữ lẫn số');
      if (np === old || np.toLowerCase() === me.username) return deny(400, 'Mật khẩu mới phải khác mật khẩu cũ và tên đăng nhập');
      let nu; const o = await upd(us => { const u = us.find(x => x.username === me.username); if (!u) return { abort: 1, c: 404, m: 'Không có tài khoản' }; u.pass = hash(np); u.mustChange = false; u.ver = (u.ver || 1) + 1; nu = u; });
      if (o.abort) return deny(o.c, o.m);
      setCookie(hdr, { u: nu.username, ver: nu.ver, exp: tp.exp, seen: Date.now() });
      await audit(I, me.username, 'Đổi mật khẩu', ''); return json(200, { user: pub(nu) }, hdr);
    }
    case 'GET data': if (!PUBLIC_VIEW && !(me && !me.mustChange)) return deny(401, 'Cần đăng nhập'); return json(200, await get('data', initData), hdr);
    case 'POST event': {
      if ((bad = need('user'))) return bad;
      const e = { id: reId.test(b.id) ? b.id : uid(), title: S(b.title, 300), leaders: Array.isArray(b.leaders) ? b.leaders.slice(0, 30).map(x => S(x, 20)) : [], date: S(b.date, 10), time: S(b.time, 5), place: S(b.place, 200), people: S(b.people, 300), note: S(b.note, 300) };
      if (!e.title || !reD.test(e.date) || !reT.test(e.time)) return deny(400, 'Thiếu hoặc sai nội dung, ngày, giờ');
      let isNew = false;
      return mutData(d => { e.leaders = e.leaders.filter(x => d.leaders.some(l => l.id === x)); const i = d.events.findIndex(x => x.id === e.id); if (i < 0 && d.events.length >= 20000) return { abort: 1, c: 400, m: 'Quá nhiều lịch' }; isNew = i < 0; if (i < 0) d.events.push(e); else d.events[i] = e; }, 'Thêm hoặc sửa lịch', () => (isNew ? 'Thêm: ' : 'Sửa: ') + e.date + ' ' + e.time + ' ' + e.title);
    }
    case 'POST event/delete': {
      if ((bad = need('user'))) return bad;
      let t = '';
      return mutData(d => { const e = d.events.find(x => x.id === b.id); if (!e) return { abort: 1, c: 404, m: 'Không có lịch này' }; t = e.date + ' ' + e.time + ' ' + e.title; d.events = d.events.filter(x => x !== e); }, 'Xóa lịch', () => t);
    }
    case 'POST absence': {
      if ((bad = need('user'))) return bad;
      const a = { id: reId.test(b.id) ? b.id : uid(), leader: S(b.leader, 20), from: S(b.from, 10), to: S(b.to, 10), reason: S(b.reason, 300) };
      if (!reD.test(a.from) || !reD.test(a.to) || a.to < a.from) return deny(400, 'Thiếu hoặc sai thông tin');
      return mutData(d => { if (!d.leaders.some(l => l.id === a.leader)) return { abort: 1, c: 400, m: 'Thiếu hoặc sai thông tin' }; if (d.absences.length >= 5000) return { abort: 1, c: 400, m: 'Quá nhiều bản ghi' }; d.absences = d.absences.filter(x => x.id !== a.id).concat(a); }, 'Thêm lãnh đạo đi công tác', a.from + ' → ' + a.to);
    }
    case 'POST absence/delete': { if ((bad = need('user'))) return bad; return mutData(d => { d.absences = d.absences.filter(x => x.id !== b.id); }, 'Xóa lãnh đạo đi công tác', ''); }
    case 'POST leaders': {
      if ((bad = need('admin'))) return bad;
      return mutData(d => {
        const old = new Set(d.leaders.map(l => l.id));
        const L = (Array.isArray(b.leaders) ? b.leaders : []).slice(0, 60).map(l => ({ id: l && old.has(l.id) ? l.id : uid(), name: S(l && l.name, 100) })).filter(l => l.name);
        const keep = new Set(L.map(l => l.id)); d.title = S(b.title, 200); d.leaders = L;
        d.events.forEach(e => e.leaders = e.leaders.filter(x => keep.has(x))); d.absences = d.absences.filter(a => keep.has(a.leader));
      }, 'Sửa tiêu đề và danh sách lãnh đạo', '');
    }
    case 'GET users': { if ((bad = need('admin'))) return bad; const us = await get('users', () => []); return json(200, { users: us.map(u => ({ ...pub(u), disabled: !!u.disabled })) }, hdr); }
    case 'POST users/create': {
      if ((bad = need('admin'))) return bad;
      const un = S(b.username, 30).toLowerCase(), pw = String(b.password || '');
      if (!/^[a-z0-9._-]{3,30}$/.test(un)) return deny(400, 'Tên đăng nhập 3-30 ký tự: chữ thường không dấu, số, dấu . _ -');
      if (!okRole(b.role)) return deny(400, 'Vai trò không hợp lệ');
      if (!strong(pw)) return deny(400, 'Mật khẩu tạm cần từ 8 ký tự và có cả chữ lẫn số');
      const o = await upd(us => { if (us.some(x => x.username === un)) return { abort: 1, c: 400, m: 'Tên đăng nhập đã tồn tại' }; us.push({ username: un, name: S(b.name, 80) || un, role: b.role, pass: hash(pw), mustChange: true, disabled: false, ver: 1 }); });
      if (o.abort) return deny(o.c, o.m);
      await audit(I, un_, 'Tạo tài khoản', un + ' (' + b.role + ')'); return json(200, { ok: 1 }, hdr);
    }
    case 'POST users/update': {
      if ((bad = need('admin'))) return bad;
      const target = S(b.username, 30); let info = '';
      if ('password' in b && !strong(String(b.password))) return deny(400, 'Mật khẩu tạm cần từ 8 ký tự và có cả chữ lẫn số');
      const o = await upd(us => {
        const u = us.find(x => x.username === target); if (!u) return { abort: 1, c: 404, m: 'Không có tài khoản này' }; const self = u.username === me.username;
        if ('role' in b) { if (!okRole(b.role)) return { abort: 1, c: 400, m: 'Vai trò không hợp lệ' }; if (self && b.role !== 'admin') return { abort: 1, c: 400, m: 'Không thể tự hạ quyền của chính mình' }; u.role = b.role; }
        if ('disabled' in b) { if (self && b.disabled) return { abort: 1, c: 400, m: 'Không thể tự khóa tài khoản của chính mình' }; u.disabled = !!b.disabled; }
        if ('name' in b) u.name = S(b.name, 80) || u.username;
        if ('password' in b) { u.pass = hash(String(b.password)); u.mustChange = true; }
        if ('role' in b || 'disabled' in b || 'password' in b) u.ver = (u.ver || 1) + 1;
        info = u.username + ' ' + Object.keys(b).filter(k => k !== 'username' && k !== 'password').join(',') + ('password' in b ? ' đặt lại mật khẩu' : '');
      });
      if (o.abort) return deny(o.c, o.m);
      await audit(I, un_, 'Cập nhật tài khoản', info); return json(200, { ok: 1 }, hdr);
    }
    case 'POST users/delete': {
      if ((bad = need('admin'))) return bad;
      const target = S(b.username, 30);
      const o = await upd(us => { if (target === me.username) return { abort: 1, c: 400, m: 'Không thể tự xóa tài khoản của chính mình' }; const i = us.findIndex(x => x.username === target); if (i < 0) return { abort: 1, c: 404, m: 'Không có tài khoản này' }; us.splice(i, 1); });
      if (o.abort) return deny(o.c, o.m);
      await audit(I, un_, 'Xóa tài khoản', target); return json(200, { ok: 1 }, hdr);
    }
    case 'GET audit': { if ((bad = need('admin'))) return bad; const l = await get('audit', () => []); return json(200, { lines: l.slice(-200).reverse() }, hdr); }
    default: return deny(404, 'Không tìm thấy');
  }
}
