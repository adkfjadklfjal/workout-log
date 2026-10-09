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

const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const formatDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`;

function startOfWeek(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

const today = new Date();
let selected = new Date(today);
let weekStart = startOfWeek(today);

const $ = (id) => document.getElementById(id);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 무게는 소수점(2.5kg 등)까지 그대로 표시
const formatNum = (n) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

// ---------- 화면 그리기 ----------
function renderWeek() {
  const week = $("week");
  week.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    if (key(d) === key(today)) btn.classList.add("is-today");
    if (key(d) === key(selected)) btn.classList.add("is-selected");
    if (records[key(d)]?.length) btn.classList.add("has-record");
    btn.innerHTML = `<span class="day__name">${DAY_NAMES[i]}</span><span class="day__num">${d.getDate()}</span><span class="day__dot"></span>`;
    btn.addEventListener("click", () => {
      selected = d;
      render();
    });
    const li = document.createElement("li");
    li.appendChild(btn);
    week.appendChild(li);
  }
  const mid = new Date(weekStart);
  mid.setDate(mid.getDate() + 3);
  $("monthLabel").textContent = `${mid.getFullYear()}년 ${mid.getMonth() + 1}월`;
}

function renderList() {
  const list = records[key(selected)] || [];
  $("workoutList").innerHTML = list
    .map(
      (ex) => `
    <li class="card" data-id="${escapeHtml(ex.id)}" tabindex="0" role="button" aria-label="${escapeHtml(ex.name)} 수정">
      <div class="card__head">
        <h2 class="card__title">${escapeHtml(ex.name)}</h2>
        <div class="card__meta">
          ${ex.part ? `<span class="card__tag">${escapeHtml(ex.part)}</span>` : ""}
          <span class="card__edit" aria-hidden="true">수정 ›</span>
        </div>
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
    </li>`
    )
    .join("");

  const allSets = list.flatMap((ex) => ex.sets);
  $("exerciseCount").textContent = list.length;
  $("setCount").textContent = allSets.length;
  $("totalVolume").textContent = formatNum(allSets.reduce((sum, s) => sum + s.reps * s.weight, 0));
  $("emptyState").hidden = list.length > 0;
  $("dayLabel").textContent = key(selected) === key(today) ? "오늘의 운동" : formatDate(selected);
}

function render() {
  renderWeek();
  renderList();
}

$("prevWeek").addEventListener("click", () => {
  weekStart.setDate(weekStart.getDate() - 7);
  renderWeek();
});
$("nextWeek").addEventListener("click", () => {
  weekStart.setDate(weekStart.getDate() + 7);
  renderWeek();
});

// ---------- 토스트 ----------
let toastTimer;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-shown"), 1800);
}

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
const normalize = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

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

// 같은 종목의 가장 최근 기록 (지금 수정 중인 기록과 이후 날짜는 제외)
function findLastRecord(name) {
  const target = normalize(name);
  if (!target) return null;
  const dates = Object.keys(records)
    .filter((d) => d <= editingDate)
    .sort()
    .reverse();
  for (const date of dates) {
    const list = records[date];
    for (let i = list.length - 1; i >= 0; i--) {
      const ex = list[i];
      if (ex.id !== editingId && normalize(ex.name) === target) return { date, ex };
    }
  }
  return null;
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
  const last = findLastRecord(nameInput.value);
  if (!last) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `
    <div class="history__head">
      <p class="history__title">지난 기록<span class="history__date">${formatDate(parseKey(last.date))}</span></p>
      <button type="button" class="history__apply" id="applyHistory">세트 불러오기</button>
    </div>
    <ol class="history__sets">
      ${last.ex.sets
        .map((s, i) => `<li><span>${i + 1}세트</span>${formatNum(s.weight)}kg × ${formatNum(s.reps)}회</li>`)
        .join("")}
    </ol>`;
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
    list.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ...data });
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

render();
