// ---------- 저장소 ----------
// 구조: { "YYYY-MM-DD": [{ id, name, part, sets: [{ reps, weight }] }] }
const STORAGE_KEY = "workout-records-v1";

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    showToast("저장 공간에 기록하지 못했어요");
    return false;
  }
}

const records = loadRecords();

// ---------- 날짜 ----------
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const PARTS = ["가슴", "등", "하체", "어깨", "팔", "복근", "유산소", "기타"];
// 달력 라벨용 부위 색 (style.css의 .part--N 과 순서가 같음)
const partClass = (part) => {
  const i = PARTS.indexOf(part);
  return i === -1 ? "part--none" : `part--${i}`;
};

const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`;
const isValidKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && key(parseKey(k)) === k;

const today = new Date();
let selected = new Date(today);
let calMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 무게는 소수점(2.5kg 등)까지 그대로 표시
const formatNum = (n) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

// 종목 비교용: 대소문자와 띄어쓰기 차이 무시 ("벤치 프레스" = "벤치프레스")
const normalize = (s) => s.toLowerCase().replace(/\s+/g, "");
const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// 두 날짜 키 사이의 일수 (서머타임 등으로 시간이 어긋나도 반올림으로 보정)
const daysBetween = (fromKey, toKey) => Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000);
const formatDaysAgo = (n) => (n === 0 ? "같은 날" : `${n}일 전`);

// ---------- 1RM 추정 (Epley) ----------
// 무게 × (1 + 횟수/30), 1회는 무게 그대로, 무게 0인 세트는 제외
function estimate1RM(set) {
  if (!(set.weight > 0) || !(set.reps >= 1)) return null;
  return set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
}

function best1RM(sets) {
  const values = sets.map(estimate1RM).filter((v) => v !== null);
  return values.length ? Math.max(...values) : null;
}

const format1RM = (v) =>
  `${v.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}kg`;

// 같은 종목의 가장 최근 기록
// - beforeKey 이전 날짜에서 찾음 (sameDay가 true면 같은 날짜도 포함)
// - excludeId: 자기 자신(수정 중인 기록)은 제외
function findLastRecord(name, beforeKey, { excludeId = null, sameDay = false } = {}) {
  const target = normalize(name);
  if (!target) return null;
  const dates = Object.keys(records)
    .filter((d) => (sameDay ? d <= beforeKey : d < beforeKey))
    .sort()
    .reverse();
  for (const date of dates) {
    const list = records[date];
    for (let i = list.length - 1; i >= 0; i--) {
      const ex = list[i];
      if (ex.id !== excludeId && normalize(ex.name) === target) return { date, ex };
    }
  }
  return null;
}

// 그날 한 부위 (기록 순서대로, 중복 없이). 부위를 안 고른 운동만 있으면 "운동"
function partsOfDay(dateKey) {
  const list = records[dateKey] || [];
  const parts = [...new Set(list.map((ex) => ex.part).filter(Boolean))];
  if (!parts.length && list.length) parts.push("운동");
  return parts;
}

// ---------- 달력 화면 ----------
// 칸이 좁아서 라벨은 최대 3줄: 3개 이하면 모두, 넘으면 2개 + "+N"
const MAX_LABELS = 3;

function renderCalendar() {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  $("monthLabel").textContent = `${y}년 ${m + 1}월`;

  const firstDay = new Date(y, m, 1).getDay();
  const lastDate = new Date(y, m + 1, 0).getDate();
  const todayKey = key(today);
  const cells = [];

  for (let i = 0; i < firstDay; i++) cells.push(`<li class="cal-cell cal-cell--empty"></li>`);

  for (let d = 1; d <= lastDate; d++) {
    const date = new Date(y, m, d);
    const k = key(date);
    const parts = partsOfDay(k);
    const shown = parts.length > MAX_LABELS ? parts.slice(0, MAX_LABELS - 1) : parts;
    const more = parts.length - shown.length;
    const weekday = date.getDay();
    const cls = ["cal-day"];
    if (k === todayKey) cls.push("is-today");
    if (weekday === 0) cls.push("is-sun");
    if (weekday === 6) cls.push("is-sat");
    if (parts.length) cls.push("has-record");
    if (drag?.active && k === drag.fromKey) cls.push("is-drag-source");
    if (drag?.active && k === drag.overKey) cls.push("is-drop-target");
    if (k === justPasted) cls.push("is-pasted");

    const label = `${formatDate(date)}${parts.length ? `, ${parts.join(", ")}` : ""}`;
    cells.push(`
      <li class="cal-cell">
        <button type="button" class="${cls.join(" ")}" data-date="${k}" aria-label="${escapeHtml(label)}">
          <span class="cal-day__num">${d}</span>
          <span class="cal-day__labels">
            ${shown.map((p) => `<span class="part ${partClass(p)}">${escapeHtml(p)}</span>`).join("")}
            ${more ? `<span class="part part--more">+${more}</span>` : ""}
          </span>
        </button>
      </li>`);
  }
  $("calendarGrid").innerHTML = cells.join("");
  justPasted = null; // 붙여넣은 칸 강조는 한 번만
  renderPlan();
}

// "오늘 뭐 할까": 부위별 마지막으로 한 날을 오래된 순으로 (오늘까지의 기록 기준)
function renderPlan() {
  const todayKey = key(today);
  const lastByPart = new Map();
  for (const date of Object.keys(records).sort()) {
    if (date > todayKey) break;
    for (const ex of records[date]) if (ex.part) lastByPart.set(ex.part, date);
  }

  const items = [...lastByPart]
    .map(([part, date]) => ({ part, days: daysBetween(date, todayKey) }))
    .sort((a, b) => b.days - a.days || PARTS.indexOf(a.part) - PARTS.indexOf(b.part));

  $("planList").innerHTML = items.length
    ? items
        .map(
          (x, i) => `
        <li class="plan__item${i === 0 ? " is-top" : ""}">
          <span class="part ${partClass(x.part)}">${escapeHtml(x.part)}</span>
          <span class="plan__days">${x.days === 0 ? "오늘" : `${x.days}일 전`}</span>
        </li>`
        )
        .join("")
    : `<li class="plan__empty">운동할 때 부위를 고르면 여기에 정리돼요.</li>`;
}

// 짧게 누르면 그날 기록 화면으로. 끌어서 놓은 직후 따라오는 click은 무시
let suppressClickUntil = 0;
$("calendarGrid").addEventListener("click", (e) => {
  if (performance.now() < suppressClickUntil) return;
  const btn = e.target.closest(".cal-day");
  if (btn) goToDay(btn.dataset.date);
});

// ---------- 끌어서 복사 ----------
// 기록 있는 날짜를 길게 누르면(0.4초) 미리보기가 떠오르고, 다른 날짜 칸에 놓으면 그날 운동을 뒤에 추가.
// 달력 좌우 가장자리에 머물면 이전/다음 달로 넘어감. 달력 밖이나 원래 날짜에 놓으면 아무 일도 없음.
const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 10; // 길게 누르기 전에 이만큼 움직이면 스크롤로 보고 취소
const EDGE_ZONE = 8; // 달력 안쪽으로 이 폭(px)까지 + 달력 바깥 여백이 달 넘김 구역
const EDGE_DELAY = 600; // 가장자리에 머무는 시간
const EDGE_REPEAT = 900; // 계속 머물면 이 간격으로 한 달씩 더 넘김
const SCROLL_ZONE = 72; // 화면 위/아래 끝에서 자동 스크롤

let drag = null; // { pointerId, fromKey, startX, startY, x, y, active, overKey, edge, timer, edgeTimer, raf }
let justPasted = null; // 방금 붙여넣은 날짜 (강조용)

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const shortDate = (k) => {
  const d = parseKey(k);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};
const vibrate = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

$("calendarGrid").addEventListener("pointerdown", (e) => {
  if (drag || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
  const btn = e.target.closest(".cal-day");
  if (!btn || !records[btn.dataset.date]?.length) return;

  drag = {
    pointerId: e.pointerId,
    pointerType: e.pointerType,
    fromKey: btn.dataset.date,
    startX: e.clientX,
    startY: e.clientY,
    x: e.clientX,
    y: e.clientY,
    active: false,
    overKey: null,
    edge: null,
  };
  drag.timer = setTimeout(startDrag, LONG_PRESS_MS);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", cancelDrag);
});

function startDrag() {
  drag.active = true;
  // 그리드는 달이 바뀔 때 다시 그려지므로, 바뀌지 않는 화면 요소에 포인터를 묶어 둠
  try {
    $("calendarView").setPointerCapture(drag.pointerId);
  } catch {}
  vibrate(30);
  window.getSelection()?.removeAllRanges();
  document.body.classList.add("is-dragging");

  const list = records[drag.fromKey];
  const names = list.slice(0, 3).map((ex) => `<li>${escapeHtml(ex.name)}<span>${ex.sets.length}세트</span></li>`);
  if (list.length > 3) names.push(`<li class="drag-ghost__more">외 ${list.length - 3}종목</li>`);
  const ghost = $("dragGhost");
  ghost.innerHTML = `<p class="drag-ghost__date">${shortDate(drag.fromKey)} 기록</p><ul>${names.join("")}</ul>`;
  ghost.classList.add("is-shown");

  moveGhost();
  renderCalendar();
  updateDropTarget();
  drag.raf = requestAnimationFrame(autoScroll);
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.active) {
    // 길게 누르기 전에 움직이면 스크롤하려는 것 → 끌기 취소
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > MOVE_TOLERANCE) cancelDrag();
    return;
  }
  moveGhost();
  updateEdge();
  updateDropTarget();
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (!drag.active) {
    finishDrag(); // 짧게 누름 → click 이벤트가 기록 화면으로 보냄
    return;
  }
  const { fromKey, overKey, overTrash } = drag;
  suppressClickUntil = performance.now() + 400;
  finishDrag();
  if (overTrash) deleteDay(fromKey);
  else if (overKey && overKey !== fromKey) pasteRecords(fromKey, overKey);
}

function cancelDrag() {
  if (!drag) return;
  if (drag.active) suppressClickUntil = performance.now() + 400;
  finishDrag();
}

function finishDrag() {
  const wasActive = drag.active;
  clearTimeout(drag.timer);
  clearTimeout(drag.edgeTimer);
  cancelAnimationFrame(drag.raf);
  try {
    $("calendarView").releasePointerCapture(drag.pointerId);
  } catch {}
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", cancelDrag);
  drag = null;

  document.body.classList.remove("is-dragging");
  $("dragGhost").classList.remove("is-shown");
  $("edgePrev").classList.remove("is-active");
  $("edgeNext").classList.remove("is-active");
  $("trash").classList.remove("is-over");
  if (wasActive) renderCalendar();
}

function moveGhost() {
  // 손가락에 가리지 않게 터치일 때는 위쪽에 띄우고, 화면 밖으로 나가지 않게 가둠
  const ghost = $("dragGhost");
  const w = ghost.offsetWidth;
  const h = ghost.offsetHeight;
  const margin = 8;
  const left = Math.min(Math.max(drag.x - w / 2, margin), innerWidth - w - margin);
  let top = drag.pointerType === "touch" ? drag.y - 28 - h : drag.y + 16;
  if (top < margin) top = drag.y + 28; // 위에 자리가 없으면 손가락 아래로
  ghost.style.transform = `translate(${left}px, ${top}px)`;
}

// 휴지통은 pointer-events가 없어서 좌표로 판단
function isOverTrash() {
  const r = $("trash").getBoundingClientRect();
  return drag.y >= r.top && drag.x >= r.left && drag.x <= r.right;
}

// 손가락 아래 날짜 칸(또는 휴지통) 찾아 강조 (원래 날짜·가장자리·달력 밖은 놓을 곳 아님)
function updateDropTarget() {
  const overTrash = isOverTrash();
  if (overTrash !== !!drag.overTrash) {
    drag.overTrash = overTrash;
    $("trash").classList.toggle("is-over", overTrash);
    if (overTrash) vibrate(20);
  }

  let k = null;
  if (!drag.edge && !overTrash) {
    const cell = document.elementFromPoint(drag.x, drag.y)?.closest("#calendarGrid .cal-day");
    if (cell && cell.dataset.date !== drag.fromKey) k = cell.dataset.date;
  }
  if (k === drag.overKey) return;
  document.querySelector(".cal-day.is-drop-target")?.classList.remove("is-drop-target");
  drag.overKey = k;
  if (k) {
    document.querySelector(`.cal-day[data-date="${k}"]`)?.classList.add("is-drop-target");
    vibrate(8);
  }
}

function updateEdge() {
  const rect = $("calendar").getBoundingClientRect();
  const inRows = drag.y >= rect.top && drag.y <= rect.bottom && !isOverTrash();
  const edge = !inRows
    ? null
    : drag.x <= rect.left + EDGE_ZONE
      ? "prev"
      : drag.x >= rect.right - EDGE_ZONE
        ? "next"
        : null;
  if (edge === drag.edge) return;

  clearTimeout(drag.edgeTimer);
  drag.edge = edge;
  $("edgePrev").classList.toggle("is-active", edge === "prev");
  $("edgeNext").classList.toggle("is-active", edge === "next");
  if (edge) drag.edgeTimer = setTimeout(flipMonth, EDGE_DELAY);
}

function flipMonth() {
  if (!drag?.edge) return;
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + (drag.edge === "prev" ? -1 : 1), 1);
  renderCalendar();
  vibrate(15);
  // 다시 시작하는 효과를 위해 강조를 껐다 켬
  const el = $(drag.edge === "prev" ? "edgePrev" : "edgeNext");
  el.classList.remove("is-active");
  void el.offsetWidth;
  el.classList.add("is-active");
  drag.edgeTimer = setTimeout(flipMonth, EDGE_REPEAT);
}

// 화면 위 끝, 또는 휴지통 바로 위로 끌면 천천히 스크롤 (끄는 동안 손으로는 스크롤이 막혀 있으므로)
function autoScroll() {
  if (!drag?.active) return;
  const bottom = $("trash").getBoundingClientRect().top; // 휴지통 위에서는 스크롤하지 않음
  let dy = 0;
  if (drag.y < SCROLL_ZONE) dy = -Math.ceil((SCROLL_ZONE - drag.y) / 6);
  else if (drag.y > bottom - SCROLL_ZONE && drag.y < bottom)
    dy = Math.ceil((drag.y - (bottom - SCROLL_ZONE)) / 6);
  if (dy) window.scrollBy(0, dy);
  // 손가락이 멈춰 있어도 화면(스크롤, 올라오는 휴지통)이 움직이면 놓을 곳이 바뀌므로 매 프레임 확인
  updateEdge();
  updateDropTarget();
  drag.raf = requestAnimationFrame(autoScroll);
}

// 끄는 동안(또는 길게 누르는 중) 스크롤·글자 선택·길게 누르기 메뉴 막기
window.addEventListener(
  "touchmove",
  (e) => {
    if (drag?.active) e.preventDefault();
  },
  { passive: false }
);
document.addEventListener("selectstart", (e) => {
  if (drag) e.preventDefault();
});
$("calendarGrid").addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("contextmenu", (e) => {
  if (drag?.active) e.preventDefault();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drag) cancelDrag();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && drag) cancelDrag();
});

// 그날 기록 전체 삭제 (확인 창 없이, 5초 동안 되돌리기 가능)
function deleteDay(dateKey) {
  const removed = records[dateKey];
  if (!removed?.length) return;
  delete records[dateKey];
  if (!saveRecords()) {
    records[dateKey] = removed;
    return;
  }
  render();
  showToast(`${shortDate(dateKey)} 기록 ${removed.length}종목을 삭제했어요`, {
    duration: 5000,
    action: {
      label: "되돌리기",
      onClick: () => {
        // 그사이 같은 날에 새 기록이 생겼으면 지운 기록을 앞에 되살림
        records[dateKey] = [...removed, ...(records[dateKey] || [])];
        saveRecords();
        justPasted = dateKey;
        render();
        showToast("삭제를 취소했어요");
      },
    },
  });
}

function pasteRecords(fromKey, toKey) {
  const source = records[fromKey] || [];
  if (!source.length) return;
  // 새 id로 깊은 복사 → 원본과 따로 수정·삭제됨
  const copies = source.map((ex) => ({
    id: newId(),
    name: ex.name,
    part: ex.part,
    sets: ex.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
  }));
  (records[toKey] ||= []).push(...copies); // 기존 기록 뒤에 추가
  if (!saveRecords()) {
    removeByIds(toKey, copies.map((c) => c.id));
    renderCalendar();
    return;
  }
  justPasted = toKey;
  renderCalendar();

  const ids = copies.map((c) => c.id);
  showToast(`${shortDate(toKey)}에 ${copies.length}종목을 복사했어요`, {
    duration: 5000,
    action: {
      label: "되돌리기",
      onClick: () => {
        removeByIds(toKey, ids);
        saveRecords();
        renderCalendar();
        showToast("복사를 취소했어요");
      },
    },
  });
}

// 붙여넣은 기록만 골라서 지움 (그 사이 다른 기록이 바뀌어도 안전)
function removeByIds(dateKey, ids) {
  const list = records[dateKey];
  if (!list) return;
  const rest = list.filter((ex) => !ids.includes(ex.id));
  if (rest.length) records[dateKey] = rest;
  else delete records[dateKey];
}

$("prevMonth").addEventListener("click", () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
$("nextMonth").addEventListener("click", () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar();
});
$("todayBtn").addEventListener("click", () => goToDay(key(today)));

// ---------- 하루 기록 화면 ----------
function renderDayHeader() {
  $("dayTitle").textContent = formatDate(selected);
}

function renderList() {
  const dateKey = key(selected);
  const list = records[dateKey] || [];
  $("workoutList").innerHTML = list
    .map((ex) => {
      const rm = best1RM(ex.sets);
      const prev = findLastRecord(ex.name, dateKey);
      return `
    <li class="swipe" data-id="${escapeHtml(ex.id)}">
    <button class="swipe__delete" type="button" tabindex="-1" aria-label="${escapeHtml(ex.name)} 삭제">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>
      삭제
    </button>
    <div class="card" data-id="${escapeHtml(ex.id)}" tabindex="0" role="button" aria-label="${escapeHtml(ex.name)} 수정, 왼쪽으로 밀면 삭제">
      <div class="card__head">
        <h2 class="card__title">${escapeHtml(ex.name)}</h2>
        <div class="card__meta">
          ${ex.part ? `<span class="card__tag">${escapeHtml(ex.part)}</span>` : ""}
          <span class="card__edit" aria-hidden="true">수정 ›</span>
        </div>
      </div>
      <div class="card__stats">
        ${rm !== null ? `<span class="stat">추정 1RM <strong>${format1RM(rm)}</strong></span>` : ""}
        ${
          prev
            ? `<span class="stat">직전 기록 <strong>${formatDaysAgo(daysBetween(prev.date, dateKey))}</strong></span>`
            : `<span class="stat stat--first">첫 기록</span>`
        }
      </div>
      <table class="sets">
        <thead><tr><th>세트</th><th>횟수</th><th>무게</th></tr></thead>
        <tbody>
          ${ex.sets
            .map(
              (s, i) =>
                `<tr><td>${i + 1}</td><td>${formatNum(s.reps)}<span class="unit">회</span></td><td>${formatNum(s.weight)}<span class="unit">kg</span></td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    </li>`;
    })
    .join("");
  openSwipeId = null;

  const allSets = list.flatMap((ex) => ex.sets);
  $("exerciseCount").textContent = list.length;
  $("setCount").textContent = allSets.length;
  $("totalVolume").textContent = formatNum(allSets.reduce((sum, s) => sum + s.reps * s.weight, 0));
  $("emptyState").hidden = list.length > 0;
  $("dayLabel").textContent = key(selected) === key(today) ? "오늘의 운동" : formatDate(selected);
}

function render() {
  renderCalendar();
  renderDayHeader();
  renderList();
}

// 이전 날/다음 날은 기록을 남기지 않고(replace) 바꿔서, 뒤로가기 한 번이면 달력으로 돌아감
function shiftDay(delta) {
  const d = new Date(selected);
  d.setDate(d.getDate() + delta);
  location.replace(`#/day/${key(d)}`);
}
$("prevDay").addEventListener("click", () => shiftDay(-1));
$("nextDay").addEventListener("click", () => shiftDay(1));

// ---------- 화면 이동 (해시 라우팅) ----------
// #/day/YYYY-MM-DD → 기록 화면, 그 외 → 달력 화면
// 해시를 쓰면 file://로 열어도 폰/브라우저 뒤로가기가 그대로 동작함
let enteredFromCalendar = false;

function goToDay(dateKey) {
  enteredFromCalendar = true;
  location.hash = `#/day/${dateKey}`;
}

function goToCalendar() {
  // 달력에서 들어왔으면 뒤로가기와 똑같이 처리해서 기록이 쌓이지 않게 함
  if (enteredFromCalendar) history.back();
  else location.replace("#/");
}
$("backBtn").addEventListener("click", goToCalendar);

function route() {
  closeSheet();
  const match = location.hash.match(/^#\/day\/(\d{4}-\d{2}-\d{2})$/);

  if (match && isValidKey(match[1])) {
    selected = parseKey(match[1]);
    $("calendarView").hidden = true;
    $("dayView").hidden = false;
    renderDayHeader();
    renderList();
  } else {
    enteredFromCalendar = false;
    // 기록 화면에서 다른 달로 넘어갔다면 그 달을 보여줌
    calMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
    $("dayView").hidden = true;
    $("calendarView").hidden = false;
    renderCalendar();
  }
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);

// ---------- 토스트 ----------
// action: { label, onClick } 을 주면 버튼이 붙은 토스트 (되돌리기 등)
let toastTimer;
let toastActionHandler = null;

function hideToast() {
  $("toast").classList.remove("is-shown", "has-action");
  toastActionHandler = null;
}

function showToast(message, { duration = 1800, action = null } = {}) {
  const toast = $("toast");
  const btn = $("toastAction");
  $("toastText").textContent = message;
  btn.hidden = !action;
  btn.textContent = action?.label ?? "";
  toastActionHandler = action?.onClick ?? null;
  toast.classList.toggle("has-action", !!action);
  toast.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration);
}

$("toastAction").addEventListener("click", () => {
  const handler = toastActionHandler;
  hideToast(); // 두 번 눌러도 한 번만 실행
  handler?.();
});

// ---------- 추가/수정 시트 ----------
const form = $("exerciseForm");
const setRows = $("setRows");
const deleteBtn = $("deleteBtn");
const searchInput = $("searchInput");
const customInput = $("customInput");

let editingId = null; // null이면 새로 추가
let editingDate = null; // 시트를 연 시점의 날짜 키
let selectedPart = "";
let selectedName = "";
let pickerOpen = true; // 종목을 고르면 목록을 접고 지난 기록을 바로 보여줌
let deleteArmed = false;
let saving = false;

// ---------- 부위별 종목 목록 ----------
const DEFAULT_EXERCISES = {
  가슴: ["벤치프레스", "인클라인 벤치프레스", "덤벨프레스", "인클라인 덤벨프레스", "체스트프레스 머신", "펙덱 플라이", "케이블 크로스오버", "딥스", "푸시업"],
  등: ["데드리프트", "풀업", "랫풀다운", "바벨로우", "덤벨로우", "시티드 케이블로우", "티바로우", "암풀다운"],
  하체: ["스쿼트", "레그프레스", "런지", "레그익스텐션", "레그컬", "루마니안 데드리프트", "힙쓰러스트", "카프레이즈"],
  어깨: ["오버헤드프레스", "덤벨 숄더프레스", "사이드 레터럴 레이즈", "프론트 레이즈", "리어 델트 플라이", "페이스풀", "슈러그"],
  팔: ["바벨컬", "덤벨컬", "해머컬", "케이블 푸시다운", "라잉 트라이셉스 익스텐션", "오버헤드 익스텐션"],
  복근: ["크런치", "레그레이즈", "플랭크", "행잉 레그레이즈", "케이블 크런치", "러시안 트위스트"],
  유산소: ["러닝머신", "사이클", "로잉머신", "스텝밀", "줄넘기"],
  기타: [],
};

// 내가 직접 추가한 종목: { 부위: [이름, ...] }
const CUSTOM_KEY = "workout-custom-exercises-v1";
const customExercises = (() => {
  try {
    const data = JSON.parse(localStorage.getItem(CUSTOM_KEY));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
})();

function saveCustomExercises() {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customExercises));
    return true;
  } catch {
    showToast("저장 공간에 기록하지 못했어요");
    return false;
  }
}

const isCustom = (part, name) => (customExercises[part] || []).some((n) => normalize(n) === normalize(name));

// 종목별 마지막으로 한 날짜 (부위 상관없이 이름 기준, 기록하려는 날짜까지만)
function lastDoneDates(untilKey) {
  const map = new Map();
  for (const date of Object.keys(records).sort()) {
    if (date > untilKey) break;
    for (const ex of records[date]) if (ex.id !== editingId) map.set(normalize(ex.name), date);
  }
  return map;
}

// 한 부위의 종목 목록: 기본 종목 + 내가 추가한 종목 + 기록에 그 부위로 저장된 종목.
// 최근에 한 종목이 앞에(최근 순), 안 해 본 종목은 기본 → 내가 추가한 순서.
function exercisesForPart(part) {
  const done = lastDoneDates(editingDate);
  const items = new Map();
  const add = (name, origin) => {
    const k = normalize(name);
    if (!k || items.has(k)) return;
    items.set(k, { name, origin, order: items.size, last: done.get(k) || null });
  };
  (DEFAULT_EXERCISES[part] || []).forEach((n) => add(n, "default"));
  (customExercises[part] || []).forEach((n) => add(n, "custom"));
  for (const date of Object.keys(records)) {
    for (const ex of records[date]) if (ex.part === part) add(ex.name, "record");
  }
  return [...items.values()].sort((a, b) => {
    if (a.last && b.last) return b.last.localeCompare(a.last);
    if (a.last || b.last) return a.last ? -1 : 1;
    return a.order - b.order;
  });
}

$("partChips").innerHTML = PARTS.map(
  (p) => `<button type="button" class="chip" data-part="${p}" aria-pressed="false">${p}</button>`
).join("");

$("partChips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  if (chip.dataset.part !== selectedPart) {
    selectPart(chip.dataset.part);
    searchInput.value = "";
  }
  pickerOpen = true;
  renderPicker();
});

$("pickerToggle").addEventListener("click", () => {
  pickerOpen = !pickerOpen;
  renderPicker();
});

function selectPart(part) {
  selectedPart = part;
  document.querySelectorAll("#partChips .chip").forEach((c) => {
    c.setAttribute("aria-pressed", String(c.dataset.part === part));
  });
}

function highlight(name, raw) {
  const i = raw ? name.toLowerCase().indexOf(raw.toLowerCase()) : -1;
  if (i === -1) return escapeHtml(name);
  return (
    escapeHtml(name.slice(0, i)) +
    `<mark>${escapeHtml(name.slice(i, i + raw.length))}</mark>` +
    escapeHtml(name.slice(i + raw.length))
  );
}

function renderPicker() {
  $("pickedName").textContent = selectedName || "선택 안 함";
  $("pickedName").classList.toggle("is-empty", !selectedName);
  const open = pickerOpen || !selectedName;
  const toggle = $("pickerToggle");
  toggle.hidden = !selectedName;
  toggle.textContent = open ? "접기" : "변경";
  $("pickerHint").hidden = !open || !!selectedPart;
  $("picker").hidden = !open || !selectedPart;
  if ($("picker").hidden) return;

  const raw = searchInput.value.trim();
  const q = normalize(raw);
  const items = exercisesForPart(selectedPart).filter((x) => normalize(x.name).includes(q));

  $("exList").innerHTML = items
    .map((x) => {
      const picked = normalize(x.name) === normalize(selectedName);
      const ago = x.last ? daysBetween(x.last, editingDate) : null;
      const agoText = ago === null ? "" : ago === 0 ? "오늘" : `${ago}일 전`;
      return `<li><button type="button" class="ex-item${picked ? " is-picked" : ""}${
        x.origin === "custom" ? " is-custom" : ""
      }" data-name="${escapeHtml(x.name)}" data-origin="${x.origin}" aria-pressed="${picked}">
        <span class="ex-item__name">${highlight(x.name, raw)}</span>
        ${agoText ? `<span class="ex-item__ago">${agoText}</span>` : ""}
      </button></li>`;
    })
    .join("");

  const empty = $("exEmpty");
  empty.hidden = items.length > 0;
  empty.innerHTML = items.length
    ? ""
    : raw
      ? `<p>'${escapeHtml(raw)}'에 맞는 종목이 없어요.</p><button type="button" class="ex-empty__add" id="searchToCustom">'${escapeHtml(raw)}' 새 종목으로 추가</button>`
      : `<p>아직 종목이 없어요. 아래에서 직접 추가해 보세요.</p>`;
}

function pickExercise(name) {
  selectedName = name;
  pickerOpen = false;
  clearError();
  renderPicker();
  renderHistory();
}

searchInput.addEventListener("input", renderPicker);

$("exList").addEventListener("click", (e) => {
  const item = e.target.closest(".ex-item");
  if (!item || performance.now() < suppressExClickUntil) return;
  pickExercise(item.dataset.name);
});

$("exEmpty").addEventListener("click", (e) => {
  if (!e.target.closest("#searchToCustom")) return;
  customInput.value = searchInput.value.trim();
  addCustomExercise();
});

// 직접 입력 → 그 부위 목록에 추가하고 바로 선택
function addCustomExercise() {
  const name = customInput.value.trim().replace(/\s+/g, " ");
  if (!selectedPart) return fail("부위를 먼저 골라 주세요.", null);
  if (!name) return fail("추가할 종목 이름을 입력해 주세요.", customInput);

  const existing = exercisesForPart(selectedPart).find((x) => normalize(x.name) === normalize(name));
  if (existing) {
    showToast("이미 목록에 있는 종목이에요");
  } else {
    (customExercises[selectedPart] ||= []).push(name);
    if (!saveCustomExercises()) {
      customExercises[selectedPart].pop();
      return null;
    }
    showToast(`${selectedPart} 목록에 추가했어요`);
  }
  customInput.value = "";
  searchInput.value = "";
  pickExercise(existing ? existing.name : name);
  return true;
}
$("customAddBtn").addEventListener("click", addCustomExercise);

// 내가 추가한 종목은 길게 누르면 목록에서 삭제 (기록은 그대로, 되돌리기 가능)
const EX_LONG_PRESS_MS = 500;
let exPress = null;
let suppressExClickUntil = 0;

$("exList").addEventListener("pointerdown", (e) => {
  const item = e.target.closest(".ex-item");
  if (!item || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
  exPress = {
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    timer: setTimeout(() => {
      suppressExClickUntil = performance.now() + 600;
      exPress = null;
      removeCustomExercise(item.dataset.name, item.dataset.origin);
    }, EX_LONG_PRESS_MS),
  };
});
$("exList").addEventListener("pointermove", (e) => {
  if (exPress && Math.hypot(e.clientX - exPress.x, e.clientY - exPress.y) > 10) {
    clearTimeout(exPress.timer);
    exPress = null;
  }
});
["pointerup", "pointercancel", "pointerleave"].forEach((type) =>
  $("exList").addEventListener(type, () => {
    if (exPress) clearTimeout(exPress.timer);
    exPress = null;
  })
);
$("exList").addEventListener("contextmenu", (e) => e.preventDefault());

function removeCustomExercise(name, origin) {
  vibrate(20);
  if (origin !== "custom") {
    showToast(origin === "default" ? "기본 종목은 지울 수 없어요" : "기록에서 온 종목은 지울 수 없어요");
    return;
  }
  const part = selectedPart;
  const list = customExercises[part] || [];
  const index = list.findIndex((n) => normalize(n) === normalize(name));
  if (index === -1) return;
  list.splice(index, 1);
  if (!saveCustomExercises()) {
    list.splice(index, 0, name);
    return;
  }
  renderPicker();
  // 그 부위로 저장된 기록이 있으면 기록에서 온 종목으로 계속 보임
  const stillShown = exercisesForPart(part).some((x) => normalize(x.name) === normalize(name));
  showToast(stillShown ? "내 종목에서 지웠어요 (기록에 있어 목록엔 남아요)" : `${name}${objectParticle(name)} 목록에서 지웠어요`, {
    duration: 5000,
    action: {
      label: "되돌리기",
      onClick: () => {
        const now = (customExercises[part] ||= []);
        now.splice(Math.min(index, now.length), 0, name);
        saveCustomExercises();
        renderPicker();
        showToast("되돌렸어요");
      },
    },
  });
}

// ---------- 지난 기록 ----------
function renderHistory() {
  const box = $("historyBox");
  // 같은 날 먼저 한 기록도 참고할 수 있게 포함, 수정 중인 기록 자신은 제외
  const last = findLastRecord(selectedName, editingDate, { excludeId: editingId, sameDay: true });
  if (!last) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const rm = best1RM(last.ex.sets);
  box.hidden = false;
  box.innerHTML = `
    <div class="history__head">
      <p class="history__title">지난 기록<span class="history__date">${formatDate(parseKey(last.date))} · ${formatDaysAgo(daysBetween(last.date, editingDate))}</span></p>
      <button type="button" class="history__apply" id="applyHistory">세트 불러오기</button>
    </div>
    <ol class="history__sets">
      ${last.ex.sets
        .map((s, i) => `<li><span>${i + 1}세트</span>${formatNum(s.weight)}kg × ${formatNum(s.reps)}회</li>`)
        .join("")}
    </ol>
    ${rm !== null ? `<p class="history__rm">추정 1RM <strong>${format1RM(rm)}</strong></p>` : ""}`;
  $("applyHistory").addEventListener("click", () => {
    setRows.innerHTML = "";
    last.ex.sets.forEach((s) => addSetRow(s.reps, s.weight));
    if (!selectedPart && last.ex.part) selectPart(last.ex.part);
    clearError();
    showToast("지난 세트를 불러왔어요");
  });
}


function addSetRow(reps = "", weight = "") {
  const li = document.createElement("li");
  li.className = "set-row";
  li.innerHTML = `
    <span class="set-row__no"></span>
    <input class="input" data-field="reps" type="number" inputmode="numeric" min="1" step="1" placeholder="0" aria-label="횟수" enterkeyhint="next">
    <input class="input" data-field="weight" type="number" inputmode="decimal" min="0" step="0.5" placeholder="0" aria-label="무게(kg)" enterkeyhint="next">
    <button class="remove-set" type="button" aria-label="세트 삭제">−</button>`;
  li.querySelector('[data-field="reps"]').value = reps;
  li.querySelector('[data-field="weight"]').value = weight;
  setRows.appendChild(li);
  renumberSets();
  return li;
}

function renumberSets() {
  const rows = [...setRows.children];
  rows.forEach((row, i) => {
    row.querySelector(".set-row__no").textContent = i + 1;
    row.querySelector(".remove-set").disabled = rows.length === 1;
  });
  // 마지막 입력칸에서는 키보드 Enter가 "완료"로 보이게
  setRows.querySelectorAll("input").forEach((input, i, all) => {
    input.setAttribute("enterkeyhint", i === all.length - 1 ? "done" : "next");
  });
}

setRows.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-set");
  if (!btn || btn.disabled) return;
  btn.closest(".set-row").remove();
  renumberSets();
});

$("addSetBtn").addEventListener("click", () => {
  // 직전 세트 값을 그대로 복사해 두면 같은 무게로 반복할 때 편함
  const last = setRows.lastElementChild;
  const reps = last?.querySelector('[data-field="reps"]').value ?? "";
  const weight = last?.querySelector('[data-field="weight"]').value ?? "";
  addSetRow(reps, weight).querySelector('[data-field="reps"]').focus();
});

function openSheet(exercise) {
  editingId = exercise?.id ?? null;
  editingDate = key(selected);
  form.reset();
  clearError();
  setRows.innerHTML = "";

  $("sheetTitle").textContent = exercise ? "운동 수정" : "운동 추가";
  $("sheetDate").textContent = formatDate(selected);
  // 저장된 기록의 종목·부위는 그대로 (부위 없이 저장된 옛 기록도 이름은 유지)
  selectedName = exercise?.name ?? "";
  pickerOpen = !exercise;
  selectPart(exercise?.part ?? "");
  if (exercise) exercise.sets.forEach((s) => addSetRow(s.reps, s.weight));
  else addSetRow();
  renderPicker();
  renderHistory();

  deleteBtn.hidden = !exercise;
  disarmDelete();

  document.body.classList.add("sheet-open");
  $("exList").scrollTop = 0;
  form.querySelector(".sheet__body").scrollTop = 0;
}

function closeSheet() {
  document.body.classList.remove("sheet-open");
  document.activeElement?.blur();
}

$("addBtn").addEventListener("click", () => openSheet(null));
$("closeSheet").addEventListener("click", closeSheet);
$("backdrop").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("sheet-open")) closeSheet();
});

function openCard(card) {
  const ex = (records[key(selected)] || []).find((x) => x.id === card.dataset.id);
  if (ex) openSheet(ex);
}
$("workoutList").addEventListener("click", (e) => {
  const del = e.target.closest(".swipe__delete");
  if (del) {
    deleteExercise(key(selected), del.closest(".swipe").dataset.id);
    return;
  }
  const card = e.target.closest(".card");
  if (!card || performance.now() < suppressCardClickUntil) return;
  // 삭제 버튼이 열려 있으면 누를 때 먼저 닫기만 함
  if (openSwipeId) {
    setSwipeOpen(null);
    return;
  }
  openCard(card);
});
$("workoutList").addEventListener("keydown", (e) => {
  if (!e.target.classList.contains("card")) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openCard(e.target);
  } else if (e.key === "Delete") {
    deleteExercise(key(selected), e.target.dataset.id);
  }
});

// ---------- 운동 카드 밀어서 삭제 ----------
// 왼쪽으로 밀면 뒤에 있던 삭제 버튼이 드러남. 세로로 움직이면 평소처럼 스크롤.
const DELETE_W = 88;
let swipe = null; // { pointerId, li, card, startX, startY, base, dx, mode: null | "h" }
let openSwipeId = null;
let suppressCardClickUntil = 0;

function setSwipeOpen(id) {
  openSwipeId = id;
  document.querySelectorAll("#workoutList .swipe").forEach((li) => {
    const open = li.dataset.id === id;
    li.classList.toggle("is-open", open);
    li.querySelector(".card").style.transform = open ? `translateX(-${DELETE_W}px)` : "";
    li.querySelector(".swipe__delete").tabIndex = open ? 0 : -1;
  });
}

$("workoutList").addEventListener("pointerdown", (e) => {
  const card = e.target.closest(".card");
  if (!card || swipe || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
  const li = card.closest(".swipe");
  // 다른 카드가 열려 있으면 닫음
  if (openSwipeId && openSwipeId !== li.dataset.id) setSwipeOpen(null);
  swipe = {
    pointerId: e.pointerId,
    li,
    card,
    startX: e.clientX,
    startY: e.clientY,
    base: li.classList.contains("is-open") ? -DELETE_W : 0,
    dx: 0,
    mode: null,
  };
});

$("workoutList").addEventListener("pointermove", (e) => {
  if (!swipe || e.pointerId !== swipe.pointerId) return;
  const dx = e.clientX - swipe.startX;
  const dy = e.clientY - swipe.startY;
  if (!swipe.mode) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      swipe = null; // 세로 스크롤
      return;
    }
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
    swipe.mode = "h";
    swipe.li.classList.add("is-swiping");
    try {
      swipe.card.setPointerCapture(e.pointerId);
    } catch {}
  }
  swipe.dx = dx;
  // 오른쪽으로는 안 열리고, 삭제 버튼 폭을 넘으면 저항감 있게 조금만 더 밀림
  let x = swipe.base + dx;
  if (x > 0) x = 0;
  if (x < -DELETE_W) x = -DELETE_W - (-DELETE_W - x) / 3;
  swipe.card.style.transform = `translateX(${x}px)`;
});

function endSwipe(e, cancelled) {
  if (!swipe || e.pointerId !== swipe.pointerId) return;
  const { mode, li, base, dx } = swipe;
  swipe = null;
  if (mode !== "h") return;
  li.classList.remove("is-swiping");
  suppressCardClickUntil = performance.now() + 300;
  const open = cancelled ? base !== 0 : base + dx < -DELETE_W / 2;
  setSwipeOpen(open ? li.dataset.id : null);
}
$("workoutList").addEventListener("pointerup", (e) => endSwipe(e, false));
$("workoutList").addEventListener("pointercancel", (e) => endSwipe(e, true));

// 카드 밖을 누르면 열린 삭제 버튼 닫기
document.addEventListener("pointerdown", (e) => {
  if (openSwipeId && !e.target.closest("#workoutList .swipe.is-open")) setSwipeOpen(null);
});

// 마지막 글자 받침에 따라 "을"/"를" (한글이 아니면 "을(를)")
function objectParticle(word) {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (!(code >= 0 && code <= 11171)) return "을(를)";
  return code % 28 ? "을" : "를";
}

// 운동 하나 삭제 (5초 동안 되돌리기 가능, 원래 자리로 복구)
function deleteExercise(dateKey, id) {
  const list = records[dateKey] || [];
  const index = list.findIndex((ex) => ex.id === id);
  if (index === -1) return;
  const [removed] = list.splice(index, 1);
  if (!list.length) delete records[dateKey];
  if (!saveRecords()) {
    (records[dateKey] ||= []).splice(index, 0, removed);
    return;
  }
  render();
  showToast(`${removed.name}${objectParticle(removed.name)} 삭제했어요`, {
    duration: 5000,
    action: {
      label: "되돌리기",
      onClick: () => {
        const now = (records[dateKey] ||= []);
        now.splice(Math.min(index, now.length), 0, removed);
        saveRecords();
        render();
        showToast("삭제를 취소했어요");
      },
    },
  });
}

// ---------- Enter 처리 (한글 IME 중복 방지) ----------
// 한글 조합 중 Enter는 조합 확정용 keydown(isComposing / keyCode 229)이 한 번 더 들어오므로 무시.
// 브라우저 기본 "Enter = 폼 제출"도 막고 직접 처리해서 두 번 제출되지 않게 함.
let composing = false;
form.addEventListener("compositionstart", () => (composing = true));
form.addEventListener("compositionend", () => {
  // Safari는 compositionend 직후에 Enter keydown이 오므로 한 틱 늦게 해제
  setTimeout(() => (composing = false), 0);
});

form.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
  e.preventDefault();
  if (e.isComposing || e.keyCode === 229 || composing || e.repeat) return;

  // 검색칸: 걸러진 첫 종목 선택 / 직접 입력칸: 목록에 추가
  if (e.target === searchInput) {
    const first = $("exList").querySelector(".ex-item");
    if (first) {
      pickExercise(first.dataset.name);
      searchInput.blur();
    }
    return;
  }
  if (e.target === customInput) {
    if (addCustomExercise()) customInput.blur();
    return;
  }

  // 세트 칸: 다음 칸으로, 마지막 칸이면 저장
  const inputs = [...setRows.querySelectorAll("input")];
  const next = inputs[inputs.indexOf(e.target) + 1];
  if (next) next.focus();
  else form.requestSubmit();
});

// ---------- 저장 ----------
function clearError() {
  $("formError").textContent = "";
  form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
}

function fail(message, el) {
  $("formError").textContent = message;
  if (el) {
    el.classList.add("is-invalid");
    if (el.matches("input")) el.focus();
    else el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  return null;
}

function readForm() {
  clearError();
  // 직접 입력칸에 쓰고 '추가'를 안 눌렀어도 저장할 때 목록에 추가하고 선택
  if (!selectedName && customInput.value.trim() && !addCustomExercise()) return null;
  const name = selectedName.trim();
  if (!name) return fail(selectedPart ? "종목을 골라 주세요." : "부위와 종목을 골라 주세요.", $("exerciseField"));

  const sets = [];
  for (const row of setRows.children) {
    const repsEl = row.querySelector('[data-field="reps"]');
    const weightEl = row.querySelector('[data-field="weight"]');
    // 둘 다 비어 있는 세트는 건너뜀
    if (repsEl.value === "" && weightEl.value === "") continue;

    const reps = Number(repsEl.value);
    if (!Number.isInteger(reps) || reps < 1) return fail("횟수는 1 이상의 정수로 입력해 주세요.", repsEl);
    const weight = weightEl.value === "" ? 0 : Number(weightEl.value);
    if (!Number.isFinite(weight) || weight < 0) return fail("무게는 0 이상으로 입력해 주세요.", weightEl);
    sets.push({ reps, weight });
  }
  if (!sets.length) return fail("세트를 하나 이상 입력해 주세요.", setRows.querySelector("input"));

  return { name, part: selectedPart, sets };
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (saving) return;
  const data = readForm();
  if (!data) return;

  saving = true;
  const list = (records[editingDate] ||= []);
  if (editingId) {
    const ex = list.find((x) => x.id === editingId);
    if (ex) Object.assign(ex, data);
  } else {
    list.push({ id: newId(), ...data });
  }

  if (saveRecords()) {
    showToast(editingId ? "수정했어요" : "추가했어요");
  }
  closeSheet();
  render();
  saving = false;
});

// ---------- 삭제 (실수 방지를 위해 두 번 눌러야 삭제) ----------
function disarmDelete() {
  deleteArmed = false;
  deleteBtn.textContent = "삭제";
  deleteBtn.classList.remove("is-confirm");
}

deleteBtn.addEventListener("click", () => {
  if (!deleteArmed) {
    deleteArmed = true;
    deleteBtn.textContent = "정말 삭제";
    deleteBtn.classList.add("is-confirm");
    return;
  }
  const list = records[editingDate] || [];
  const idx = list.findIndex((x) => x.id === editingId);
  if (idx !== -1) list.splice(idx, 1);
  if (!list.length) delete records[editingDate];

  if (saveRecords()) showToast("삭제했어요");
  closeSheet();
  render();
});

route();
