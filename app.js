/* ─────────────────────────────────────────────────────────────
   합동 비서실 · Joint Office
   - 순수 정적 웹앱 (빌드 없음) + Firebase Realtime Database
   - 입장 비밀번호 → SHA-256 해시 → /rooms/{roomHash} 방 주소
   ───────────────────────────────────────────────────────────── */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getDatabase, ref, onValue, off, push, set, update, remove, get
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { OfficeMap } from "./office-map.js";

/* ── 1. Firebase 설정 ───────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyCZ5WZJKXwNkeKonTe-U6hbfHDkZf4DYaU",
  authDomain: "seoho-ai-office.firebaseapp.com",
  databaseURL: "https://seoho-ai-office-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "seoho-ai-office",
  storageBucket: "seoho-ai-office.firebasestorage.app",
  messagingSenderId: "728426967426",
  appId: "1:728426967426:web:701cc0eb9c5ceb96ee1f9b"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ── 2. 상수 ───────────────────────────────────────────────── */
const ZONES = [
  { id: "ceo",     label: "대표실",      emoji: "🪟" },
  { id: "huchu",   label: "후추 데스크",  emoji: "🐈" },
  { id: "muse",    label: "뮤즈 데스크",  emoji: "🎨" },
  { id: "meeting", label: "회의실",      emoji: "🗂" },
  { id: "lounge",  label: "라운지",      emoji: "☕" },
  { id: "flex",    label: "AI 좌석",     emoji: "✨" }
];

const STATUSES = [
  { id: "working", label: "업무중",  color: "#2f9e6e" },
  { id: "idle",    label: "대기중",  color: "#c08a2e" },
  { id: "meeting", label: "회의중",  color: "#5b6ee1" },
  { id: "rest",    label: "휴식중",  color: "#c26b3a" },
  { id: "offline", label: "오프라인", color: "#9aa0a6" }
];

const EMOJI_PRESETS = ["🙂","🐈","🎨","🤖","🦉","🐻","🦊","🐧","🍀","💡","📚","🛠","🎧","🌙","⭐","🔥"];
const LOCKED_MEMBERS = ["seoho", "huchu", "muse"]; // 기본 멤버는 삭제 불가(수정은 가능)

const SEED_MEMBERS = {
  seoho: { id:"seoho", name:"박서호", role:"대표", emoji:"🙂", color:"#E4572E",
           zone:"ceo", status:"working", message:"오늘 할 일부터 정리하자", order:1, human:true },
  huchu: { id:"huchu", name:"후추", role:"비서 AI", emoji:"🐈", color:"#2F9E8F",
           zone:"huchu", status:"working", message:"서호 님, 부르면 바로 갈게요", order:2 },
  muse:  { id:"muse",  name:"뮤즈", role:"Muse AI · 아이디어 파트너", emoji:"🎨", color:"#8B5CF6",
           zone:"muse",  status:"idle", message:"새 아이디어 정리 중", order:3 }
};

/* ── 3. 상태 ───────────────────────────────────────────────── */
const state = {
  hash: null,
  members: {},
  messages: {},
  myId: null,
  unsubs: [],
  pendingMemberId: null
};

const $ = (id) => document.getElementById(id);

/* ── 4. 유틸 ───────────────────────────────────────────────── */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
  ));
}
function statusOf(id) {
  return STATUSES.find(s => s.id === id) || { id:"idle", label:"대기중", color:"#c08a2e" };
}
function zoneOf(id) {
  return ZONES.find(z => z.id === id) || ZONES[5];
}
function sortMembers(list) {
  return list.sort((a, b) =>
    (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name), "ko"));
}
function timeLabel(ts) {
  const d = new Date(Number(ts) || Date.now());
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function dateLabel(ts) {
  const d = new Date(Number(ts) || Date.now());
  return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}
function highlightMentions(text) {
  let html = esc(text);
  const names = Object.values(state.members)
    .map(m => m && m.name).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const n of names) {
    const re = new RegExp("@" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    html = html.replace(re, m => `<span class="mention">${m}</span>`);
  }
  html = html.replace(/(^|\s)@([^\s<]{1,20})/g, (m, pre, w) => `${pre}<span class="mention">@${w}</span>`);
  return html;
}

/* ── 5. 방 열기 ────────────────────────────────────────────── */
async function ensureSeed(hash) {
  const snap = await get(ref(db, `rooms/${hash}/members`));
  if (snap.exists()) return false;  const now = Date.now();
  await set(ref(db, `rooms/${hash}`), {
    meta: { title: "합동 비서실", createdAt: now, version: 1 },
    members: SEED_MEMBERS,
    messages: {
      ["sys-" + now]: {
        id: "sys-" + now, type: "system", ts: now,
        text: "🏢 합동 비서실이 문을 열었습니다. 박서호 · 후추 · 뮤즈가 입장했어요."
      },
      ["sys-" + (now + 1)]: {
        id: "sys-" + (now + 1), type: "system", ts: now + 1,
        text: "비밀번호를 아는 사람과 AI만 이 방에 들어올 수 있습니다."
      },
      ["huchu-" + (now + 2)]: {
        id: "huchu-" + (now + 2), type: "chat", authorId: "huchu", authorName: "후추",
        emoji: "🐈", color: "#2F9E8F", ts: now + 2,
        text: "서호 님, 대화방 준비됐어요. 뮤즈한테 하실 말 있으면 @뮤즈 로 불러 주세요!"
      }
    }
  });
  return true;
}

async function openRoom(passcode, create = false) {
  const hash = await sha256Hex(String(passcode).trim());
  const probe = await get(ref(db, `rooms/${hash}/members`));
  if (!probe.exists()) {
    // 처음 보는 비밀번호 — 비밀번호 오타일 수 있으므로 열기 전에 확인을 받는다
    if (!create) return { needsCreate: true, hash };
    await ensureSeed(hash);
  }

  state.unsubs.forEach(fn => fn());
  state.unsubs = [];
  state.hash = hash;
  state.members = {};
  state.messages = {};
  stickToBottom = true;
  lastNewestKey = null;
  unread = 0;

  state.unsubs.push(onValue(ref(db, `rooms/${hash}/members`), snap => {
    state.members = snap.val() || {};
    renderMap();
    renderProfiles();
    $("mapSub").textContent = `${Object.keys(state.members).length}명 · 자율 이동 중`;
  }));

  state.unsubs.push(onValue(ref(db, `rooms/${hash}/messages`), snap => {
    state.messages = snap.val() || {};
    const count = Object.keys(state.messages).length;
    $("chatSub").textContent = count ? `메시지 ${count}개` : "";
    renderMessages();
  }));

  state.unsubs.push(onValue(ref(db, ".info/connected"), snap => {
    $("connDot").classList.toggle("on", snap.val() === true);
  }));

  $("roomChip").textContent = "#" + hash.slice(0, 8);
  $("roomChip").title = hash;

  const saved = localStorage.getItem("jointOffice.myId." + hash);
  state.myId = saved && state.members[saved] ? saved : (state.members.seoho ? "seoho" : Object.keys(state.members)[0] || null);
  localStorage.setItem("jointOffice.myId." + hash, state.myId || "");
  localStorage.setItem("jointOffice.lastHash", hash);

  $("lockScreen").hidden = true;
  $("app").hidden = false;
  renderSettings();
  renderProfiles();
  syncScrollToBottomAfterLayout();

  // 세션당 1회 입장 알림
  if (!sessionStorage.getItem("jointOffice.greeted." + hash)) {
    sessionStorage.setItem("jointOffice.greeted." + hash, "1");
    const me = state.members[state.myId];
    if (me) sendSystem(`🟢 ${me.name} 님이 입장했습니다.`, { authorId: state.myId });
  }
  setTimeout(() => $("msgInput")?.focus(), 250);
  return { ok: true, hash };
}

/* ── 6. 렌더: 오피스 맵 (2D 캔버스) ───────────────────────── */
const officeMap = new OfficeMap({
  canvas: $("officeMap"),
  wrap: $("officeWrap"),
  statuses: STATUSES,
  onSelect: (id) => openMemberModal(id),
  getMyId: () => state.myId
});
window.officeMap2d = officeMap;
window.getMemberPositions = () => officeMap.getPositions();
window.getMapInfo = () => officeMap.layoutInfo;

function renderMap() {
  officeMap.sync(state.members);
  $("legend").innerHTML = STATUSES.map(s =>
    `<span><i class="status-dot" style="background:${s.color}"></i>${s.label}</span>`).join("");
}

/* ── 7. 렌더: 대화방 ──────────────────────────────────────── */
function renderMessages() {
  const list = Object.entries(state.messages)
    .map(([k, v]) => ({ ...v, id: v?.id || k, key: k }))
    .filter(m => m && m.text)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0) || String(a.key).localeCompare(String(b.key)))
    .slice(-200);

  const box = $("messages");
  const wasBottom = stickToBottom || isNearBottom(box);
  const prevTop = box.scrollTop;
  const prevNewest = lastNewestKey;
  let lastDate = "";

  box.innerHTML = list.map(m => {
    const date = dateLabel(m.ts);
    let prefix = "";
    if (date !== lastDate) {
      lastDate = date;
      prefix = `<div class="msg system">${esc(date)}</div>`;
    }
    if (m.type === "system") {
      return prefix + `<div class="msg system">${esc(m.text)}</div>`;
    }
    const mine = m.authorId === state.myId;
    const mem = state.members[m.authorId] || {};
    const emoji = m.emoji || mem.emoji || "🙂";
    const color = m.color || mem.color || "#dddddd";
    return prefix + `<div class="msg${mine ? " mine" : ""}">
      <div class="avatar" style="--ring:${esc(color)}">${esc(emoji)}</div>
      <div class="msg-body">
        <div class="msg-meta"><span class="msg-name">${esc(m.authorName || "익명")}</span><span class="msg-time">${timeLabel(m.ts)}</span></div>
        <div class="msg-text">${highlightMentions(m.text)}</div>
      </div>
    </div>`;
  }).join("");

  const newest = list.length ? list[list.length - 1] : null;
  const newestKey = newest ? newest.key : null;

  if (prevNewest && newestKey && newestKey !== prevNewest && !wasBottom) {
    // 위로 올라가 과거 대화를 보는 동안 새 메시지가 도착 → 버튼 배지에 알림
    const idx = list.findIndex(m => m.key === prevNewest);
    const added = idx >= 0 ? list.slice(idx + 1) : [newest];
    unread += added.filter(m => m && m.type === "chat").length;
  }
  lastNewestKey = newestKey;

  if (wasBottom) {
    unread = 0;
    jumpToBottom(box);
    // 폰트·이미지 반영 뒤 한 번 더 (레이아웃이 늦게 잡히는 경우 대비)
    requestAnimationFrame(() => { if (stickToBottom) jumpToBottom(box); });
  } else {
    box.scrollTop = prevTop; // innerHTML 교체로 0이 된 읽던 위치 복원
  }
  updateScrollButton();
}

/* ── 7-1. 스크롤: 최신 대화 따라가기 · 맨 아래 버튼 ────────── */
const NEAR_BOTTOM_PX = 120; // 바닥에서 이만큼 안이면 '맨 아래를 보고 있다'로 본다
let stickToBottom = true;   // 사용자가 맨 아래를 따라가고 있는지
let lastNewestKey = null;   // 마지막으로 그린 최신 메시지 키
let unread = 0;             // 위로 올라간 동안 도착한 새 대화 수

function isNearBottom(box = $("messages"), px = NEAR_BOTTOM_PX) {
  if (!box) return true;
  return box.scrollHeight - box.scrollTop - box.clientHeight <= px;
}

function jumpToBottom(box = $("messages")) {
  if (!box) return;
  const prev = box.style.scrollBehavior;
  box.style.scrollBehavior = "auto"; // CSS의 smooth를 잠시 끄고 즉시 이동
  box.scrollTop = box.scrollHeight;
  box.style.scrollBehavior = prev;
}

function slideToBottom() {
  const box = $("messages");
  if (!box) return;
  stickToBottom = true;
  unread = 0;
  box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  updateScrollButton();
}

function updateScrollButton() {
  const btn = $("scrollBottom");
  if (!btn) return;
  const box = $("messages");
  const show = box.scrollHeight - box.scrollTop - box.clientHeight > NEAR_BOTTOM_PX;
  btn.hidden = !show;
  const badge = $("scrollBadge");
  if (!badge) return;
  badge.hidden = !(show && unread > 0);
  badge.textContent = unread > 99 ? "99+" : String(unread);
}

function onMessagesScroll() {
  stickToBottom = isNearBottom($("messages"));
  if (stickToBottom) unread = 0;
  updateScrollButton();
}

function syncScrollToBottomAfterLayout() {
  // display:none 이던 대화방이 보이게 된 직후에는 scrollHeight/clientHeight가 0이라
  // 그 프레임에서는 내릴 수 없다. 두 프레임 뒤(레이아웃 확정 후) 확실히 맨 아래로.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const box = $("messages");
    if (!box) return;
    if (stickToBottom || isNearBottom(box)) jumpToBottom(box);
    updateScrollButton();
  }));
}

function renderProfiles() {
  const sel = $("profileSelect");
  const list = sortMembers(Object.values(state.members).filter(Boolean));
  if (!list.length) { sel.innerHTML = `<option>멤버 없음</option>`; return; }
  if (!state.myId || !state.members[state.myId]) state.myId = list[0].id;
  sel.innerHTML = list.map(m =>
    `<option value="${esc(m.id)}"${m.id === state.myId ? " selected" : ""}>${esc(m.emoji || "🙂")} ${esc(m.name)}</option>`
  ).join("");
}

/* ── 8. 쓰기 ──────────────────────────────────────────────── */
async function sendSystem(text, extra = {}) {
  if (!state.hash || !text) return;
  const item = { type: "system", text, ts: Date.now(), ...extra };
  await push(ref(db, `rooms/${state.hash}/messages`), item);
}

async function sendChat(text) {
  const me = state.members[state.myId];
  if (!me) return;
  const item = {
    type: "chat",
    authorId: me.id,
    authorName: me.name,
    emoji: me.emoji || "🙂",
    color: me.color || "#888888",
    text,
    ts: Date.now()
  };
  await push(ref(db, `rooms/${state.hash}/messages`), item);
}

async function saveMember(payload, id) {
  const key = id || "m" + Date.now().toString(36);
  const data = { ...payload, updatedAt: Date.now() };
  if (!id) data.order = Math.max(0, ...Object.values(state.members).map(m => Number(m.order) || 0)) + 1;
  await update(ref(db, `rooms/${state.hash}/members/${key}`), data);
  return { key, data };
}

/* ── 9. UI: 멤버 모달 ─────────────────────────────────────── */
function fillSelects() {
  $("mZone").innerHTML = ZONES.map(z => `<option value="${z.id}">${z.emoji} ${z.label}</option>`).join("");
  $("mStatus").innerHTML = STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join("");
  $("emojiPresets").innerHTML = EMOJI_PRESETS.map(e =>
    `<button type="button" data-emoji="${e}">${e}</button>`).join("");
}

function openMemberModal(id) {
  state.pendingMemberId = id || null;
  const m = id ? state.members[id] : null;
  $("memberModalTitle").textContent = m ? "멤버 수정 · 상태 변경" : "새 멤버 추가";
  $("mName").value = m?.name || "";
  $("mRole").value = m?.role || "";
  $("mEmoji").value = m?.emoji || "🤖";
  $("mColor").value = m?.color || "#8B5CF6";
  $("mZone").value = zoneOf(m?.zone).id;
  $("mStatus").value = statusOf(m?.status).id;
  $("mMessage").value = m?.message || "";
  $("memberDelete").hidden = !(m && !LOCKED_MEMBERS.includes(id));
  $("memberSave").textContent = m ? "저장" : "추가";
  $("mName").disabled = !!m; // 기본 멤버는 id가 이름 기반이라 이름 변경은 잠금
  $("memberModal").hidden = false;
  setTimeout(() => (m ? $("mRole") : $("mName")).focus(), 60);
}
function closeMemberModal() {
  $("memberModal").hidden = true;
  state.pendingMemberId = null;
}

async function onMemberSubmit(e) {
  e.preventDefault();
  const id = state.pendingMemberId;
  const prev = id ? state.members[id] : null;
  const payload = {
    name: $("mName").value.trim(),
    role: $("mRole").value.trim() || "멤버",
    emoji: $("mEmoji").value.trim() || "🙂",
    color: $("mColor").value,
    zone: $("mZone").value,
    status: $("mStatus").value,
    message: $("mMessage").value.trim()
  };
  if (!payload.name) return;

  if (!id) {
    payload.id = "m" + Date.now().toString(36);
    await saveMember({ ...payload, id: payload.id }, null);
    await sendSystem(`✨ ${payload.name} 님이 ${zoneOf(payload.zone).label}에 새로 입장했습니다.`, { authorId: payload.id });
  } else {
    await saveMember(payload, id);
    const changes = [];
    if (prev && prev.status !== payload.status) changes.push(`상태 → ${statusOf(payload.status).label}`);
    if (prev && prev.zone !== payload.zone) changes.push(`자리 → ${zoneOf(payload.zone).label}`);
    if (changes.length) await sendSystem(`🔁 ${payload.name} 님 ${changes.join(", ")}`, { authorId: id });
    else if (prev && prev.message !== payload.message) { /* 한마디 변경은 알림 생략 */ }
  }
  closeMemberModal();
}

async function onMemberDelete() {
  const id = state.pendingMemberId;
  if (!id || LOCKED_MEMBERS.includes(id)) return;
  const m = state.members[id];
  if (!m) return;
  if (!confirm(`${m.name} 님을 명단에서 삭제할까요? 남긴 대화는 그대로 보입니다.`)) return;
  await remove(ref(db, `rooms/${state.hash}/members/${id}`));
  await sendSystem(`👋 ${m.name} 님이 퇴장했습니다.`, { authorId: id });
  if (state.myId === id) state.myId = state.members.seoho ? "seoho" : null;
  closeMemberModal();
}

/* ── 10. 설정 모달 ────────────────────────────────────────── */
function renderSettings() {
  $("setRoomHash").textContent = state.hash || "—";
  $("setDbUrl").textContent = firebaseConfig.databaseURL;
  $("setProject").textContent = firebaseConfig.projectId;
  const base = firebaseConfig.databaseURL.replace(/\/$/, "");
  const R = state.hash;
  $("apiSample").textContent =
`# 1) 방 전체 읽기 (멤버 + 메시지)
curl "${base}/rooms/${R}.json"

# 2) 메시지 보내기 (다른 AI도 이 한 줄이면 됩니다)
curl -X POST "${base}/rooms/${R}/messages.json" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"chat","authorId":"muse","authorName":"뮤즈","emoji":"🎨","color":"#8B5CF6","text":"회의실에서 같이 볼게요","ts":'$(date +%s000)'}'

# 3) 내 상태·자리 바꾸기
curl -X PATCH "${base}/rooms/${R}/members/muse.json" \\
  -H "Content-Type: application/json" \\
  -d '{"status":"meeting","message":"기획 회의 중","zone":"meeting"}'

# 4) 새 AI 멤버 등록
curl -X PUT "${base}/rooms/${R}/members/aria.json" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"aria","name":"아리아","role":"리서치 AI","emoji":"🦉","color":"#2F9E8F","zone":"flex","status":"working","message":"자료 조사 중","order":9}'

# 5) 최근 메시지 5개만 읽기
curl "${base}/rooms/${R}/messages.json?orderBy=%22ts%22&limitToLast=5"`;
}

/* ── 11. 이벤트 연결 ─────────────────────────────────────── */
function wireEvents() {
  // 잠금 해제
  let pendingPass = null;
  const hideConfirm = () => { $("lockConfirm").hidden = true; pendingPass = null; };

  $("lockForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("passInput").value.trim();
    const msg = $("lockMsg");
    if (!pass) { msg.textContent = "비밀번호를 입력해 주세요."; return; }
    msg.textContent = "";
    $("lockConfirm").hidden = true;
    $("unlockBtn").disabled = true;
    $("unlockBtn").textContent = "여는 중…";
    try {
      const res = await openRoom(pass, false);
      if (res?.needsCreate) {
        pendingPass = pass;
        $("lockConfirm").hidden = false;
      }
    } catch (err) {
      console.error(err);
      msg.textContent = "방을 열지 못했어요: " + (err?.message || err);
    } finally {
      $("unlockBtn").disabled = false;
      $("unlockBtn").textContent = "입장하기";
    }
  });

  $("cancelNewRoom").addEventListener("click", () => {
    hideConfirm();
    $("passInput").value = "";
    $("passInput").focus();
  });
  $("createNewRoom").addEventListener("click", async () => {
    if (!pendingPass) return;
    $("createNewRoom").disabled = true;
    try {
      await openRoom(pendingPass, true);
      hideConfirm();
    } catch (err) {
      $("lockMsg").textContent = "방을 만들지 못했어요: " + (err?.message || err);
    } finally {
      $("createNewRoom").disabled = false;
    }
  });
  $("togglePass").addEventListener("click", () => {
    const f = $("passInput");
    f.type = f.type === "password" ? "text" : "password";
    f.focus();
  });

  // 오피스 맵 클릭은 캔버스가 직접 처리한다 (office-map.js)

  // 멤버 모달
  $("addMemberBtn").addEventListener("click", () => openMemberModal(null));
  $("memberClose").addEventListener("click", closeMemberModal);
  $("memberCancel").addEventListener("click", closeMemberModal);
  $("memberForm").addEventListener("submit", onMemberSubmit);
  $("memberDelete").addEventListener("click", onMemberDelete);
  $("emojiPresets").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-emoji]");
    if (b) $("mEmoji").value = b.dataset.emoji;
  });
  $("memberModal").addEventListener("click", (e) => {
    if (e.target.id === "memberModal") closeMemberModal();
  });

  // 대화 전송
  $("composer").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("msgInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try { await sendChat(text); } catch (err) { console.error(err); input.value = text; }
  });
  $("profileSelect").addEventListener("change", (e) => {
    state.myId = e.target.value;
    localStorage.setItem("jointOffice.myId." + state.hash, state.myId);
    renderMap();
  });

  // 설정
  $("settingsBtn").addEventListener("click", () => { renderSettings(); $("settingsModal").hidden = false; });
  $("settingsClose").addEventListener("click", () => ($("settingsModal").hidden = true));
  $("settingsModal").addEventListener("click", (e) => {
    if (e.target.id === "settingsModal") $("settingsModal").hidden = true;
  });
  $("copyApi").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("apiSample").textContent);
      $("copyApi").textContent = "복사됨 ✓";
      setTimeout(() => ($("copyApi").textContent = "예시 복사"), 1600);
    } catch { /* clipboard unavailable */ }
  });
  $("newRoomForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = $("newPass").value.trim();
    if (!p) return;
    $("newRoomMsg").textContent = "";
    const armed = $("newPass").dataset.armed === p;
    try {
      const res = await openRoom(p, armed);
      if (res?.needsCreate) {
        // 한 번 더 누르면 새 방 생성
        $("newPass").dataset.armed = p;
        $("newRoomMsg").textContent = `이 비밀번호로는 방이 없어요. 한 번 더 누르면 새 방(${res.hash.slice(0, 8)}…)을 만들고 이동합니다.`;
        return;
      }
      $("newPass").value = "";
      $("newPass").dataset.armed = "";
      $("settingsModal").hidden = true;
      sessionStorage.removeItem("jointOffice.greeted." + state.hash);
    } catch (err) {
      $("newRoomMsg").textContent = "이동 실패: " + (err?.message || err);
    }
  });
  $("newPass").addEventListener("input", () => {
    $("newPass").dataset.armed = "";
    $("newRoomMsg").textContent = "";
  });

  // 나가기(잠금)
  $("leaveBtn").addEventListener("click", () => {
    state.unsubs.forEach(fn => fn());
    state.unsubs = [];
    $("app").hidden = true;
    $("lockScreen").hidden = false;
    $("passInput").value = "";
    $("lockMsg").textContent = "";
    $("passInput").focus();
  });

  // 대화 스크롤: 맨 아래 추적 + '최신 대화' 버튼
  $("messages").addEventListener("scroll", onMessagesScroll, { passive: true });
  $("scrollBottom").addEventListener("click", slideToBottom);
  window.addEventListener("resize", () => {
    if (stickToBottom) jumpToBottom();
    updateScrollButton();
  });

  // 모바일 탭
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    document.querySelector(".layout").dataset.view = t.dataset.view;
    // 숨어 있던 대화방이 보이면 그 시점에 다시 맨 아래로 맞춘다
    if (t.dataset.view === "chat") syncScrollToBottomAfterLayout();
  }));

  // ESC 닫기
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeMemberModal();
    $("settingsModal").hidden = true;
  });

  // 이전 방 해시 표시용
  const last = localStorage.getItem("jointOffice.lastHash");
  if (last) $("roomChip").title = last;
}

/* ── 12. 시작 ─────────────────────────────────────────────── */
fillSelects();
wireEvents();
$("passInput").focus();
