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
    if (k === copySource) cls.push("is-source");
    if (k === justPasted) cls.push("is-pasted");

    const label = `${formatDate(date)}${parts.length ? `, ${parts.join(", ")}` : ""}${
      k === copySource ? ", 복사 원본" : ""
    }`;
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
  renderCopyBar();
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

$("calendarGrid").addEventListener("click", (e) => {
  const btn = e.target.closest(".cal-day");
  if (!btn) return;
  if (copyMode) handleCopyClick(btn.dataset.date);
  else goToDay(btn.dataset.date);
});

// ---------- 기록 복사 ----------
// 1단계: 기록이 있는 날짜를 눌러 원본 선택 → 2단계: 누르는 날짜마다 원본 운동을 뒤에 추가
// 원본을 다시 누르면 선택 취소, 토글을 끄면 복사 모드 종료
let copyMode = false;
let copySource = null; // 원본 날짜 키
let justPasted = null; // 방금 붙여넣은 날짜 (강조용)

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const shortDate = (k) => {
  const d = parseKey(k);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

function setCopyMode(on) {
  copyMode = on;
  copySource = null;
  renderCalendar();
}

function renderCopyBar() {
  $("copyToggle").setAttribute("aria-pressed", String(copyMode));
  $("calendar").classList.toggle("is-copy", copyMode);
  $("calendarView").classList.toggle("is-copy", copyMode);
  $("copyGuide").textContent = !copyMode
    ? ""
    : copySource
      ? `${shortDate(copySource)} 기록을 붙여넣을 날짜를 고르세요`
      : "복사할 날짜를 고르세요";
}

function handleCopyClick(dateKey) {
  if (!copySource) {
    if (!records[dateKey]?.length) {
      showToast("기록이 있는 날짜를 골라 주세요");
      return;
    }
    copySource = dateKey;
    renderCalendar();
    return;
  }
  if (dateKey === copySource) {
    copySource = null; // 원본을 다시 누르면 다른 원본을 고를 수 있게
    renderCalendar();
    return;
  }
  pasteRecords(copySource, dateKey);
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
  showToast(`${shortDate(toKey)}에 ${copies.length}종목을 붙여넣었어요`, {
    duration: 5000,
    action: {
      label: "되돌리기",
      onClick: () => {
        removeByIds(toKey, ids);
        saveRecords();
        renderCalendar();
        showToast("붙여넣기를 취소했어요");
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

$("copyToggle").addEventListener("click", () => setCopyMode(!copyMode));

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
    <li class="card" data-id="${escapeHtml(ex.id)}" tabindex="0" role="button" aria-label="${escapeHtml(ex.name)} 수정">
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
    </li>`;
    })
    .join("");

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
const nameInput = $("nameInput");
const setRows = $("setRows");
const deleteBtn = $("deleteBtn");

let editingId = null; // null이면 새로 추가
let editingDate = null; // 시트를 연 시점의 날짜 키
let selectedPart = "";
let deleteArmed = false;
let saving = false;

$("partChips").innerHTML = PARTS.map(
  (p) => `<button type="button" class="chip" data-part="${p}" aria-pressed="false">${p}</button>`
).join("");

$("partChips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  selectPart(selectedPart === chip.dataset.part ? "" : chip.dataset.part);
});

function selectPart(part) {
  selectedPart = part;
  document.querySelectorAll(".chip").forEach((c) => {
    c.setAttribute("aria-pressed", String(c.dataset.part === part));
  });
}

// ---------- 종목 추천 / 지난 기록 ----------
// 지금까지 쓴 종목 목록 (최근에 한 종목이 앞으로, 부위는 마지막 기록 기준)
function knownExercises() {
  const map = new Map();
  for (const date of Object.keys(records).sort()) {
    for (const ex of records[date]) {
      map.set(normalize(ex.name), { name: ex.name, part: ex.part, date });
    }
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function renderSuggestions() {
  const raw = nameInput.value.trim();
  const q = normalize(raw);
  const items = knownExercises()
    .filter((x) => normalize(x.name) !== q && normalize(x.name).includes(q))
    .slice(0, 8);

  $("suggestList").innerHTML = items
    .map((x) => {
      const i = raw ? x.name.toLowerCase().indexOf(raw.toLowerCase()) : -1;
      const label =
        i === -1
          ? escapeHtml(x.name)
          : escapeHtml(x.name.slice(0, i)) +
            `<mark>${escapeHtml(x.name.slice(i, i + raw.length))}</mark>` +
            escapeHtml(x.name.slice(i + raw.length));
      return `<button type="button" class="suggest__item" data-name="${escapeHtml(x.name)}" data-part="${escapeHtml(x.part || "")}">${label}</button>`;
    })
    .join("");
}

function renderHistory() {
  const box = $("historyBox");
  // 같은 날 먼저 한 기록도 참고할 수 있게 포함, 수정 중인 기록 자신은 제외
  const last = findLastRecord(nameInput.value, editingDate, { excludeId: editingId, sameDay: true });
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

function updateNameHelpers() {
  renderSuggestions();
  renderHistory();
}

// input 이벤트는 한글 조합 중에도 발생하므로 글자를 치는 동안 바로 걸러짐
nameInput.addEventListener("input", () => {
  nameInput.classList.remove("is-invalid");
  updateNameHelpers();
});

$("suggestList").addEventListener("click", (e) => {
  const item = e.target.closest(".suggest__item");
  if (!item) return;
  nameInput.value = item.dataset.name;
  if (!selectedPart && item.dataset.part) selectPart(item.dataset.part);
  updateNameHelpers();
  setRows.querySelector('[data-field="reps"]')?.focus();
});

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
  form.querySelectorAll("input").forEach((input, i, all) => {
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
  nameInput.value = exercise?.name ?? "";
  selectPart(exercise?.part ?? "");
  if (exercise) exercise.sets.forEach((s) => addSetRow(s.reps, s.weight));
  else addSetRow();
  updateNameHelpers();

  deleteBtn.hidden = !exercise;
  disarmDelete();

  document.body.classList.add("sheet-open");
  // 새로 추가할 때만 바로 키보드를 띄움
  if (!exercise) setTimeout(() => nameInput.focus(), 250);
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
  const card = e.target.closest(".card");
  if (card) openCard(card);
});
$("workoutList").addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("card")) {
    e.preventDefault();
    openCard(e.target);
  }
});

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

  const inputs = [...form.querySelectorAll("input")];
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
    el.focus();
  }
  return null;
}

function readForm() {
  clearError();
  const name = nameInput.value.trim();
  if (!name) return fail("종목 이름을 입력해 주세요.", nameInput);

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
