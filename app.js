// 화면 확인용 샘플 데이터 (날짜 키: YYYY-MM-DD)
const today = new Date();
const key = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return key(d);
};

const records = {
  [daysAgo(0)]: [
    { name: "벤치프레스", part: "가슴", sets: [{ reps: 10, weight: 60 }, { reps: 8, weight: 70 }, { reps: 6, weight: 75 }] },
    { name: "인클라인 덤벨프레스", part: "가슴", sets: [{ reps: 12, weight: 20 }, { reps: 10, weight: 22 }, { reps: 10, weight: 22 }] },
    { name: "케이블 플라이", part: "가슴", sets: [{ reps: 15, weight: 15 }, { reps: 15, weight: 15 }] },
  ],
  [daysAgo(2)]: [
    { name: "스쿼트", part: "하체", sets: [{ reps: 8, weight: 80 }, { reps: 8, weight: 80 }, { reps: 6, weight: 90 }] },
  ],
  [daysAgo(4)]: [
    { name: "데드리프트", part: "등", sets: [{ reps: 5, weight: 100 }, { reps: 5, weight: 100 }] },
  ],
};

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
let selected = new Date(today);
let weekStart = startOfWeek(today);

function startOfWeek(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

function renderWeek() {
  const week = document.getElementById("week");
  week.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const btn = document.createElement("button");
    btn.className = "day";
    if (key(d) === key(today)) btn.classList.add("is-today");
    if (key(d) === key(selected)) btn.classList.add("is-selected");
    if (records[key(d)]) btn.classList.add("has-record");
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
  document.getElementById("monthLabel").textContent = `${mid.getFullYear()}년 ${mid.getMonth() + 1}월`;
}

function renderList() {
  const list = records[key(selected)] || [];
  const ul = document.getElementById("workoutList");
  ul.innerHTML = list
    .map(
      (ex) => `
    <li class="card">
      <div class="card__head">
        <h2 class="card__title">${ex.name}</h2>
        <span class="card__tag">${ex.part}</span>
      </div>
      <table class="sets">
        <thead><tr><th>세트</th><th>횟수</th><th>무게</th></tr></thead>
        <tbody>
          ${ex.sets
            .map(
              (s, i) =>
                `<tr><td>${i + 1}</td><td>${s.reps}<span class="unit">회</span></td><td>${s.weight}<span class="unit">kg</span></td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    </li>`
    )
    .join("");

  const allSets = list.flatMap((ex) => ex.sets);
  document.getElementById("exerciseCount").textContent = list.length;
  document.getElementById("setCount").textContent = allSets.length;
  document.getElementById("totalVolume").textContent = allSets
    .reduce((sum, s) => sum + s.reps * s.weight, 0)
    .toLocaleString("ko-KR");
  document.getElementById("emptyState").hidden = list.length > 0;
  document.getElementById("dayLabel").textContent =
    key(selected) === key(today)
      ? "오늘의 운동"
      : `${selected.getMonth() + 1}월 ${selected.getDate()}일 (${DAY_NAMES[selected.getDay()]})`;
}

function render() {
  renderWeek();
  renderList();
}

document.getElementById("prevWeek").addEventListener("click", () => {
  weekStart.setDate(weekStart.getDate() - 7);
  renderWeek();
});
document.getElementById("nextWeek").addEventListener("click", () => {
  weekStart.setDate(weekStart.getDate() + 7);
  renderWeek();
});

// 아직 기능 없음: 안내 메시지만 표시
let toastTimer;
document.getElementById("addBtn").addEventListener("click", () => {
  const toast = document.getElementById("toast");
  toast.textContent = "운동 추가 기능은 준비 중이에요";
  toast.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-shown"), 1800);
});

render();
