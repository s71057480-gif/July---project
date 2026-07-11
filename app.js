const STORAGE_KEY = "laundry-helper-v2";

const defaultState = {
  schedules: [],
  inventory: [],
  members: ["나"],
  tasks: [],
  favoriteLocations: [],
  settings: {
    inventoryThresholdPercent: 30,
    taskCutoffTime: "21:00",
    starterSetupDone: false
  }
};

const calendarState = {
  mode: "month",
  cursor: startOfDay(new Date())
};

let state = loadState();
let notifiedKeys = new Set();
let notifyTimer = null;
let locationCatalog = [];
let weatherState = {
  rain: 20,
  humidity: 45,
  dust: "보통",
  pm10: 0,
  placeLabel: "",
  updatedAt: ""
};

const el = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  weatherFetchBtn: document.getElementById("weatherFetchBtn"),
  toggleFavoriteBtn: document.getElementById("toggleFavoriteBtn"),
  favoriteStatus: document.getElementById("favoriteStatus"),
  locationSelect: document.getElementById("locationSelect"),
  weatherResult: document.getElementById("weatherResult"),
  weatherFacts: document.getElementById("weatherFacts"),
  weatherMeta: document.getElementById("weatherMeta"),
  notifPermissionBtn: document.getElementById("notifPermissionBtn"),
  notifStatus: document.getElementById("notifStatus"),
  scheduleForm: document.getElementById("scheduleForm"),
  scheduleDate: document.getElementById("scheduleDate"),
  scheduleTime: document.getElementById("scheduleTime"),
  schedulePhase: document.getElementById("schedulePhase"),
  scheduleStatus: document.getElementById("scheduleStatus"),
  scheduleRepeat: document.getElementById("scheduleRepeat"),
  scheduleNote: document.getElementById("scheduleNote"),
  scheduleList: document.getElementById("scheduleList"),
  monthViewBtn: document.getElementById("monthViewBtn"),
  weekViewBtn: document.getElementById("weekViewBtn"),
  calendarPrevBtn: document.getElementById("calendarPrevBtn"),
  calendarNextBtn: document.getElementById("calendarNextBtn"),
  calendarLabel: document.getElementById("calendarLabel"),
  calendarGrid: document.getElementById("calendarGrid"),
  fabricInput: document.getElementById("fabricInput"),
  labelCodeInput: document.getElementById("labelCodeInput"),
  careGuideBtn: document.getElementById("careGuideBtn"),
  careResult: document.getElementById("careResult"),
  itemForm: document.getElementById("itemForm"),
  itemName: document.getElementById("itemName"),
  itemTotal: document.getElementById("itemTotal"),
  itemCurrent: document.getElementById("itemCurrent"),
  inventoryList: document.getElementById("inventoryList"),
  memberForm: document.getElementById("memberForm"),
  memberName: document.getElementById("memberName"),
  taskForm: document.getElementById("taskForm"),
  taskTitle: document.getElementById("taskTitle"),
  taskAssignee: document.getElementById("taskAssignee"),
  taskTime: document.getElementById("taskTime"),
  taskList: document.getElementById("taskList"),
  rulesForm: document.getElementById("rulesForm"),
  inventoryThresholdInput: document.getElementById("inventoryThresholdInput"),
  taskCutoffInput: document.getElementById("taskCutoffInput"),
  rulesMeta: document.getElementById("rulesMeta"),
  todayStartBtn: document.getElementById("todayStartBtn"),
  panelZone: document.getElementById("panelZone")
};

init();

function init() {
  initializeLocationFavorites();
  applyStarterSetupIfNeeded();
  ensureShareSeedData();
  renderLocationSelectOptions();

  bindTabEvents();
  bindHomeEvents();
  bindNotificationEvents();
  bindScheduleEvents();
  bindCalendarEvents();
  bindCareEvents();
  bindInventoryEvents();
  bindShareEvents();
  bindRuleEvents();

  const now = new Date();
  el.scheduleDate.value = toDateInputValue(now);
  el.scheduleTime.value = toTimeInputValue(now);

  renderAll();
  renderWeatherRecommendation();
  renderCareGuide();
  renderRules();
  updateFavoriteStatus();
  updateNotificationStatus();
  startNotificationLoop();
  fetchWeatherAndApply();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    const parsedSettings = parsed.settings || {};
    return {
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
      inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
      members: Array.isArray(parsed.members) && parsed.members.length ? parsed.members : ["나"],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      favoriteLocations: Array.isArray(parsed.favoriteLocations) ? parsed.favoriteLocations : [],
      settings: {
        inventoryThresholdPercent: clamp(Number(parsedSettings.inventoryThresholdPercent || 30), 5, 80),
        taskCutoffTime: /^\d{2}:\d{2}$/.test(parsedSettings.taskCutoffTime || "") ? parsedSettings.taskCutoffTime : "21:00",
        starterSetupDone: Boolean(parsedSettings.starterSetupDone)
      }
    };
  } catch (error) {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindTabEvents() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.target;
      activatePanel(target);
    });
  });
}

function bindHomeEvents() {
  el.weatherFetchBtn.addEventListener("click", fetchWeatherAndApply);
  el.locationSelect.addEventListener("change", () => {
    updateFavoriteStatus();
    fetchWeatherAndApply();
  });
  el.toggleFavoriteBtn.addEventListener("click", toggleFavoriteLocation);

  el.todayStartBtn.addEventListener("click", () => {
    const now = new Date();
    state.schedules.push({
      id: crypto.randomUUID(),
      date: toDateInputValue(now),
      time: toTimeInputValue(now),
      phase: "세탁",
      status: "진행 중",
      repeat: "none",
      note: "빠른 시작"
    });
    saveState();
    renderSchedule();
    renderCalendar();
    activatePanel("schedule");
  });
}

function initializeLocationFavorites() {
  locationCatalog = Array.from(el.locationSelect.options).map((option) => ({
    value: option.value,
    text: option.textContent || option.value,
    group: option.parentElement?.label || "기타"
  }));
  renderLocationSelectOptions();
}

function renderLocationSelectOptions() {
  if (!locationCatalog.length) return;

  const selected = el.locationSelect.value || locationCatalog[0].value;
  const favorites = state.favoriteLocations.filter((value) => locationCatalog.some((item) => item.value === value));
  const grouped = new Map();

  locationCatalog.forEach((item) => {
    if (favorites.includes(item.value)) return;
    if (!grouped.has(item.group)) grouped.set(item.group, []);
    grouped.get(item.group).push(item);
  });

  const favoriteMarkup = favorites.length
    ? `<optgroup label="즐겨찾기">${favorites
      .map((value) => {
        const match = locationCatalog.find((item) => item.value === value);
        return match ? `<option value="${match.value}">${match.text}</option>` : "";
      })
      .join("")}</optgroup>`
    : "";

  const groupedMarkup = Array.from(grouped.entries())
    .map(([label, items]) => `<optgroup label="${label}">${items.map((item) => `<option value="${item.value}">${item.text}</option>`).join("")}</optgroup>`)
    .join("");

  el.locationSelect.innerHTML = `${favoriteMarkup}${groupedMarkup}`;
  el.locationSelect.value = locationCatalog.some((item) => item.value === selected) ? selected : locationCatalog[0].value;
}

function toggleFavoriteLocation() {
  const current = el.locationSelect.value;
  if (!current) return;

  if (state.favoriteLocations.includes(current)) {
    state.favoriteLocations = state.favoriteLocations.filter((value) => value !== current);
  } else {
    state.favoriteLocations = [current, ...state.favoriteLocations].slice(0, 5);
  }

  saveState();
  renderLocationSelectOptions();
  el.locationSelect.value = current;
  updateFavoriteStatus();
}

function updateFavoriteStatus() {
  const current = el.locationSelect.value;
  const isFavorite = state.favoriteLocations.includes(current);
  el.toggleFavoriteBtn.textContent = isFavorite ? "즐겨찾기 해제" : "자주 쓰는 지역으로 저장";

  if (!state.favoriteLocations.length) {
    el.favoriteStatus.textContent = "즐겨찾기 지역이 없습니다.";
    return;
  }

  el.favoriteStatus.textContent = `즐겨찾기: ${state.favoriteLocations.join(", ")}`;
}

function applyStarterSetupIfNeeded() {
  if (state.settings.starterSetupDone) return;

  const now = new Date();
  const today = toDateInputValue(now);

  if (!state.favoriteLocations.length && el.locationSelect.value) {
    state.favoriteLocations = [el.locationSelect.value];
  }

  if (!state.schedules.length) {
    state.schedules.push(
      {
        id: crypto.randomUUID(),
        date: today,
        time: "09:00",
        phase: "세탁",
        status: "예정",
        repeat: "none",
        note: "주간 기본 세탁"
      },
      {
        id: crypto.randomUUID(),
        date: toDateInputValue(addDays(now, 2)),
        time: "19:30",
        phase: "건조",
        status: "예정",
        repeat: "none",
        note: "수건 건조"
      },
      {
        id: crypto.randomUUID(),
        date: toDateInputValue(addDays(now, 4)),
        time: "20:30",
        phase: "정리",
        status: "예정",
        repeat: "none",
        note: "옷장 정리"
      }
    );
  }

  if (!state.inventory.length) {
    state.inventory.push(
      { id: crypto.randomUUID(), name: "액체세제", total: 2000, current: 650, updatedAt: today },
      { id: crypto.randomUUID(), name: "유연제", total: 1800, current: 420, updatedAt: today }
    );
  }

  if (state.members.length === 1 && state.members[0] === "나") {
    state.members.push("엄마", "룸메이트");
  }

  if (!state.tasks.length) {
    state.tasks.push(
      {
        id: crypto.randomUUID(),
        title: "수건 세탁",
        assignee: state.members[0] || "나",
        time: `${today}T19:00`,
        done: false
      },
      {
        id: crypto.randomUUID(),
        title: "유연제 보충 확인",
        assignee: state.members[1] || state.members[0] || "나",
        time: `${today}T20:30`,
        done: false
      }
    );
  }

  state.settings.starterSetupDone = true;
  saveState();
}

function ensureShareSeedData() {
  if (state.tasks.length) return;
  if (!state.members.length) state.members = ["나"];

  const today = toDateInputValue(new Date());
  state.tasks.push(
    {
      id: crypto.randomUUID(),
      title: "수건 세탁",
      assignee: state.members[0] || "나",
      time: `${today}T19:00`,
      done: false
    },
    {
      id: crypto.randomUUID(),
      title: "유연제 보충 확인",
      assignee: state.members[1] || state.members[0] || "나",
      time: `${today}T20:30`,
      done: false
    }
  );
  saveState();
}

async function fetchWeatherAndApply() {
  const locationName = (el.locationSelect.value || "").trim();
  if (!locationName) {
    el.weatherMeta.textContent = "지역을 선택해주세요.";
    return;
  }

  el.weatherMeta.textContent = "날씨 데이터를 불러오는 중입니다...";

  try {
    const location = await resolveLocation(locationName);
    if (!location) {
      el.weatherMeta.textContent = "입력한 지역을 찾지 못했습니다. 예: 서울, 부산, 대구";
      return;
    }

    const lat = Number(location.latitude);
    const lon = Number(location.longitude);

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=relative_humidity_2m,precipitation_probability&timezone=auto`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10`;

    const [weatherRes, airRes] = await Promise.all([fetch(weatherUrl), fetch(airUrl)]);
    if (!weatherRes.ok || !airRes.ok) throw new Error("API error");

    const weatherData = await weatherRes.json();
    const airData = await airRes.json();

    const rain = Math.round(Number(weatherData.current?.precipitation_probability ?? 0));
    const humidity = Math.round(Number(weatherData.current?.relative_humidity_2m ?? 0));
    const pm10 = Number(airData.current?.pm10 ?? 0);

    weatherState.rain = clamp(rain, 0, 100);
    weatherState.humidity = clamp(humidity, 0, 100);
    weatherState.pm10 = Math.round(pm10);
    weatherState.dust = pm10 <= 30 ? "좋음" : pm10 <= 80 ? "보통" : "나쁨";

    renderWeatherRecommendation();
    const updatedAt = weatherData.current?.time ? formatDateTime(weatherData.current.time) : "방금";
    const placeLabel = [location.name, location.admin1, location.country].filter(Boolean).join(", ");
    weatherState.placeLabel = placeLabel;
    weatherState.updatedAt = updatedAt;
    el.weatherMeta.textContent = `실시간 데이터 반영 완료 · ${placeLabel} · PM10 ${Math.round(pm10)} · 기준 ${updatedAt}`;
  } catch (error) {
    el.weatherMeta.textContent = "실시간 날씨를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}

async function resolveLocation(inputName) {
  const rawKey = (inputName || "").replace(/\s+/g, "");
  const normalized = normalizeLocation(inputName);
  const cityMap = {
    "서울": { name: "Seoul", admin1: "Seoul", country: "Korea", latitude: 37.5665, longitude: 126.978 },
    "부산": { name: "Busan", admin1: "Busan", country: "Korea", latitude: 35.1796, longitude: 129.0756 },
    "인천": { name: "Incheon", admin1: "Incheon", country: "Korea", latitude: 37.4563, longitude: 126.7052 },
    "대구": { name: "Daegu", admin1: "Daegu", country: "Korea", latitude: 35.8722, longitude: 128.6025 },
    "대전": { name: "Daejeon", admin1: "Daejeon", country: "Korea", latitude: 36.3504, longitude: 127.3845 },
    "광주": { name: "Gwangju", admin1: "Gwangju", country: "Korea", latitude: 35.1595, longitude: 126.8526 },
    "울산": { name: "Ulsan", admin1: "Ulsan", country: "Korea", latitude: 35.5384, longitude: 129.3114 },
    "세종": { name: "Sejong", admin1: "Sejong", country: "Korea", latitude: 36.48, longitude: 127.289 },
    "수원": { name: "Suwon", admin1: "Gyeonggi", country: "Korea", latitude: 37.2636, longitude: 127.0286 },
    "고양": { name: "Goyang", admin1: "Gyeonggi", country: "Korea", latitude: 37.6584, longitude: 126.832 },
    "용인": { name: "Yongin", admin1: "Gyeonggi", country: "Korea", latitude: 37.2411, longitude: 127.1776 },
    "성남": { name: "Seongnam", admin1: "Gyeonggi", country: "Korea", latitude: 37.4201, longitude: 127.1262 },
    "부천": { name: "Bucheon", admin1: "Gyeonggi", country: "Korea", latitude: 37.5034, longitude: 126.766 },
    "안산": { name: "Ansan", admin1: "Gyeonggi", country: "Korea", latitude: 37.3219, longitude: 126.8309 },
    "안양": { name: "Anyang", admin1: "Gyeonggi", country: "Korea", latitude: 37.3943, longitude: 126.9568 },
    "남양주": { name: "Namyangju", admin1: "Gyeonggi", country: "Korea", latitude: 37.636, longitude: 127.2165 },
    "화성": { name: "Hwaseong", admin1: "Gyeonggi", country: "Korea", latitude: 37.1995, longitude: 126.8311 },
    "평택": { name: "Pyeongtaek", admin1: "Gyeonggi", country: "Korea", latitude: 36.9921, longitude: 127.1129 },
    "의정부": { name: "Uijeongbu", admin1: "Gyeonggi", country: "Korea", latitude: 37.738, longitude: 127.0339 },
    "파주": { name: "Paju", admin1: "Gyeonggi", country: "Korea", latitude: 37.7599, longitude: 126.7803 },
    "김포": { name: "Gimpo", admin1: "Gyeonggi", country: "Korea", latitude: 37.6153, longitude: 126.7156 },
    "하남": { name: "Hanam", admin1: "Gyeonggi", country: "Korea", latitude: 37.5393, longitude: 127.2149 },
    "시흥": { name: "Siheung", admin1: "Gyeonggi", country: "Korea", latitude: 37.3802, longitude: 126.8031 },
    "광명": { name: "Gwangmyeong", admin1: "Gyeonggi", country: "Korea", latitude: 37.4786, longitude: 126.8646 },
    "군포": { name: "Gunpo", admin1: "Gyeonggi", country: "Korea", latitude: 37.3617, longitude: 126.9352 },
    "오산": { name: "Osan", admin1: "Gyeonggi", country: "Korea", latitude: 37.1498, longitude: 127.0772 },
    "이천": { name: "Icheon", admin1: "Gyeonggi", country: "Korea", latitude: 37.2723, longitude: 127.435 },
    "구리": { name: "Guri", admin1: "Gyeonggi", country: "Korea", latitude: 37.5944, longitude: 127.1296 },
    "안성": { name: "Anseong", admin1: "Gyeonggi", country: "Korea", latitude: 37.0079, longitude: 127.2799 },
    "양주": { name: "Yangju", admin1: "Gyeonggi", country: "Korea", latitude: 37.7853, longitude: 127.0458 },
    "춘천": { name: "Chuncheon", admin1: "Gangwon", country: "Korea", latitude: 37.8813, longitude: 127.7298 },
    "원주": { name: "Wonju", admin1: "Gangwon", country: "Korea", latitude: 37.3422, longitude: 127.9202 },
    "강릉": { name: "Gangneung", admin1: "Gangwon", country: "Korea", latitude: 37.7519, longitude: 128.8761 },
    "속초": { name: "Sokcho", admin1: "Gangwon", country: "Korea", latitude: 38.207, longitude: 128.5918 },
    "고성(강원)": { name: "Goseong", admin1: "Gangwon", country: "Korea", latitude: 38.3804, longitude: 128.4676 },
    "청주": { name: "Cheongju", admin1: "Chungbuk", country: "Korea", latitude: 36.6424, longitude: 127.489 },
    "천안": { name: "Cheonan", admin1: "Chungnam", country: "Korea", latitude: 36.8151, longitude: 127.1139 },
    "충주": { name: "Chungju", admin1: "Chungbuk", country: "Korea", latitude: 36.991, longitude: 127.9259 },
    "제천": { name: "Jecheon", admin1: "Chungbuk", country: "Korea", latitude: 37.1326, longitude: 128.1907 },
    "아산": { name: "Asan", admin1: "Chungnam", country: "Korea", latitude: 36.7898, longitude: 127.0017 },
    "서산": { name: "Seosan", admin1: "Chungnam", country: "Korea", latitude: 36.7849, longitude: 126.4503 },
    "공주": { name: "Gongju", admin1: "Chungnam", country: "Korea", latitude: 36.4465, longitude: 127.119 },
    "전주": { name: "Jeonju", admin1: "Jeonbuk", country: "Korea", latitude: 35.8242, longitude: 127.148 },
    "군산": { name: "Gunsan", admin1: "Jeonbuk", country: "Korea", latitude: 35.9677, longitude: 126.7369 },
    "익산": { name: "Iksan", admin1: "Jeonbuk", country: "Korea", latitude: 35.9483, longitude: 126.9577 },
    "남원": { name: "Namwon", admin1: "Jeonbuk", country: "Korea", latitude: 35.4164, longitude: 127.3904 },
    "목포": { name: "Mokpo", admin1: "Jeonnam", country: "Korea", latitude: 34.8118, longitude: 126.3922 },
    "여수": { name: "Yeosu", admin1: "Jeonnam", country: "Korea", latitude: 34.7604, longitude: 127.6622 },
    "순천": { name: "Suncheon", admin1: "Jeonnam", country: "Korea", latitude: 34.9507, longitude: 127.4872 },
    "광양": { name: "Gwangyang", admin1: "Jeonnam", country: "Korea", latitude: 34.9407, longitude: 127.6959 },
    "포항": { name: "Pohang", admin1: "Gyeongbuk", country: "Korea", latitude: 36.019, longitude: 129.3435 },
    "창원": { name: "Changwon", admin1: "Gyeongnam", country: "Korea", latitude: 35.2281, longitude: 128.6811 },
    "김해": { name: "Gimhae", admin1: "Gyeongnam", country: "Korea", latitude: 35.2285, longitude: 128.8893 },
    "진주": { name: "Jinju", admin1: "Gyeongnam", country: "Korea", latitude: 35.1802, longitude: 128.1076 },
    "구미": { name: "Gumi", admin1: "Gyeongbuk", country: "Korea", latitude: 36.1196, longitude: 128.3446 },
    "경주": { name: "Gyeongju", admin1: "Gyeongbuk", country: "Korea", latitude: 35.8562, longitude: 129.2247 },
    "안동": { name: "Andong", admin1: "Gyeongbuk", country: "Korea", latitude: 36.5684, longitude: 128.7294 },
    "김천": { name: "Gimcheon", admin1: "Gyeongbuk", country: "Korea", latitude: 36.1398, longitude: 128.1136 },
    "통영": { name: "Tongyeong", admin1: "Gyeongnam", country: "Korea", latitude: 34.8544, longitude: 128.4332 },
    "거제": { name: "Geoje", admin1: "Gyeongnam", country: "Korea", latitude: 34.8806, longitude: 128.6211 },
    "양산": { name: "Yangsan", admin1: "Gyeongnam", country: "Korea", latitude: 35.3351, longitude: 129.0378 },
    "고성(경남)": { name: "Goseong", admin1: "Gyeongnam", country: "Korea", latitude: 34.973, longitude: 128.3224 },
    "제주": { name: "Jeju", admin1: "Jeju", country: "Korea", latitude: 33.4996, longitude: 126.5312 },
    "서귀포": { name: "Seogwipo", admin1: "Jeju", country: "Korea", latitude: 33.2541, longitude: 126.5601 }
  };

  if (cityMap[rawKey]) return cityMap[rawKey];
  if (cityMap[normalized]) return cityMap[normalized];

  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputName)}&count=1&language=ko&format=json`;
  const geoRes = await fetch(geocodingUrl);
  if (!geoRes.ok) return null;
  const geoData = await geoRes.json();
  return geoData.results?.[0] || null;
}

function normalizeLocation(name) {
  return name
    .replace(/\s+/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/시$|광역시$|특별시$|특별자치시$|특별자치도$/g, "");
}

function renderWeatherRecommendation() {
  const rain = weatherState.rain;
  const humidity = weatherState.humidity;
  const dust = weatherState.dust;

  let score = 100;
  score -= rain * 0.5;
  score -= Math.max(0, humidity - 40) * 0.6;
  if (dust === "보통") score -= 10;
  if (dust === "나쁨") score -= 25;
  score = Math.max(0, Math.round(score));

  let title = "실외 건조 추천";
  let detail = "환기 좋은 시간대에 실외 건조를 진행하세요.";

  if (score < 45) {
    title = "실내 건조 추천";
    detail = "제습기 또는 선풍기를 함께 사용하면 건조 시간을 줄일 수 있어요.";
  } else if (score < 70) {
    title = "혼합 전략 추천";
    detail = "초반 1~2시간은 실외, 이후 실내 마무리 건조가 효율적입니다.";
  }

  el.weatherResult.innerHTML = `
    <h3>${title}</h3>
    <p>세탁 적합도 점수: <strong>${score}점</strong></p>
    <p>${detail}</p>
  `;

  el.weatherFacts.innerHTML = `
    <span class="fact-chip">강수 ${rain}%</span>
    <span class="fact-chip">습도 ${humidity}%</span>
    <span class="fact-chip">미세먼지 ${dust}</span>
  `;
}

function bindRuleEvents() {
  el.rulesForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const threshold = clamp(Number(el.inventoryThresholdInput.value), 5, 80);
    const cutoff = el.taskCutoffInput.value || "21:00";

    state.settings.inventoryThresholdPercent = threshold;
    state.settings.taskCutoffTime = cutoff;
    saveState();

    renderRules();
    renderInventory();
    renderTasks();
  });
}

function renderRules() {
  el.inventoryThresholdInput.value = String(state.settings.inventoryThresholdPercent);
  el.taskCutoffInput.value = state.settings.taskCutoffTime;
  el.rulesMeta.textContent = `재고 ${state.settings.inventoryThresholdPercent}% 이하 보충 · 공유 보드 ${state.settings.taskCutoffTime} 전 완료 체크`;
}

function bindNotificationEvents() {
  el.notifPermissionBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      el.notifStatus.textContent = "이 브라우저는 알림을 지원하지 않습니다.";
      return;
    }
    const result = await Notification.requestPermission();
    updateNotificationStatus();
    if (result === "granted") {
      notify("빨래도우미", "알림이 활성화되었습니다.");
    }
  });
}

function updateNotificationStatus() {
  if (!("Notification" in window)) {
    el.notifStatus.textContent = "알림 미지원 브라우저";
    return;
  }

  const map = {
    granted: "알림 권한: 허용됨",
    denied: "알림 권한: 차단됨",
    default: "알림 권한: 미요청"
  };
  el.notifStatus.textContent = map[Notification.permission] || "알림 권한 상태 미확인";
}

function startNotificationLoop() {
  if (notifyTimer) clearInterval(notifyTimer);
  checkScheduleNotifications();
  notifyTimer = setInterval(checkScheduleNotifications, 60000);
}

function checkScheduleNotifications() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const horizonStart = new Date(now.getTime() - 60 * 1000);
  const horizonEnd = new Date(now.getTime() + 5 * 60 * 1000);
  const occurrences = expandSchedulesForRange(state.schedules, addDays(now, -1), addDays(now, 60));

  occurrences.forEach((occ) => {
    if (occ.status === "완료") return;
    if (occ.when < horizonStart || occ.when > horizonEnd) return;
    const key = `${occ.baseId}-${occ.when.toISOString().slice(0, 16)}`;
    if (notifiedKeys.has(key)) return;

    notify("빨래 일정 알림", `${occ.phase} 일정이 곧 시작됩니다. (${formatDateTime(occ.when.toISOString())})`);
    notifiedKeys.add(key);
  });
}

function notify(title, body) {
  try {
    new Notification(title, { body });
  } catch (error) {
    console.error(error);
  }
}

function bindScheduleEvents() {
  el.scheduleForm.addEventListener("submit", (event) => {
    event.preventDefault();

    state.schedules.push({
      id: crypto.randomUUID(),
      date: el.scheduleDate.value,
      time: el.scheduleTime.value,
      phase: el.schedulePhase.value,
      status: el.scheduleStatus.value,
      repeat: el.scheduleRepeat.value,
      note: el.scheduleNote.value.trim()
    });

    saveState();
    el.scheduleForm.reset();
    const now = new Date();
    el.scheduleDate.value = toDateInputValue(now);
    el.scheduleTime.value = toTimeInputValue(now);
    el.scheduleRepeat.value = "none";
    renderSchedule();
    renderCalendar();
  });

  el.scheduleList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const id = button.dataset.id;
    if (button.dataset.action === "delete") {
      state.schedules = state.schedules.filter((item) => item.id !== id);
    }

    if (button.dataset.action === "next") {
      const row = state.schedules.find((item) => item.id === id);
      if (row) row.status = row.status === "예정" ? "진행 중" : "완료";
    }

    saveState();
    renderSchedule();
    renderCalendar();
  });
}

function renderSchedule() {
  if (!state.schedules.length) {
    el.scheduleList.innerHTML = "<li class='empty'>일정이 없습니다. 오늘 할 일을 추가해보세요.</li>";
    return;
  }

  const sorted = [...state.schedules].sort((a, b) => scheduleDateTime(a).localeCompare(scheduleDateTime(b)));

  el.scheduleList.innerHTML = sorted
    .map((item) => {
      const repeatText = repeatLabel(item.repeat);
      return `
        <li class="list-row">
          <div>
            <strong>${item.date} ${item.time || "00:00"}</strong> · ${item.phase} · <span class="pill ${statusClass(item.status)}">${item.status}</span>
            <p>${item.note || "메모 없음"} · ${repeatText}</p>
          </div>
          <div class="actions">
            ${item.status !== "완료" ? `<button class="ghost-btn" data-action="next" data-id="${item.id}">다음 단계</button>` : ""}
            <button class="danger-btn" data-action="delete" data-id="${item.id}">삭제</button>
          </div>
        </li>
      `;
    })
    .join("");
}

function statusClass(status) {
  if (status === "예정") return "pill-plan";
  if (status === "진행 중") return "pill-run";
  return "pill-done";
}

function repeatLabel(value) {
  if (value === "weekly") return "매주 반복";
  if (value === "biweekly") return "격주 반복";
  if (value === "monthly") return "매월 반복";
  return "반복 없음";
}

function bindCalendarEvents() {
  el.monthViewBtn.addEventListener("click", () => {
    calendarState.mode = "month";
    renderCalendar();
  });

  el.weekViewBtn.addEventListener("click", () => {
    calendarState.mode = "week";
    renderCalendar();
  });

  el.calendarPrevBtn.addEventListener("click", () => {
    calendarState.cursor = calendarState.mode === "month"
      ? new Date(calendarState.cursor.getFullYear(), calendarState.cursor.getMonth() - 1, 1)
      : addDays(calendarState.cursor, -7);
    renderCalendar();
  });

  el.calendarNextBtn.addEventListener("click", () => {
    calendarState.cursor = calendarState.mode === "month"
      ? new Date(calendarState.cursor.getFullYear(), calendarState.cursor.getMonth() + 1, 1)
      : addDays(calendarState.cursor, 7);
    renderCalendar();
  });
}

function renderCalendar() {
  el.monthViewBtn.classList.toggle("active", calendarState.mode === "month");
  el.weekViewBtn.classList.toggle("active", calendarState.mode === "week");

  if (!state.schedules.length) {
    el.calendarLabel.textContent = "일정 없음";
    el.calendarGrid.innerHTML = "<div class='empty'>일정을 추가하면 캘린더에 표시됩니다.</div>";
    return;
  }

  const mode = calendarState.mode;
  const start = mode === "month" ? startOfWeek(new Date(calendarState.cursor.getFullYear(), calendarState.cursor.getMonth(), 1)) : startOfWeek(calendarState.cursor);
  const end = mode === "month" ? addDays(start, 41) : addDays(start, 6);

  const occurrences = expandSchedulesForRange(state.schedules, start, end);

  if (mode === "month") {
    el.calendarLabel.textContent = `${calendarState.cursor.getFullYear()}년 ${calendarState.cursor.getMonth() + 1}월`;
    renderMonthGrid(start, occurrences);
  } else {
    const weekEnd = addDays(start, 6);
    el.calendarLabel.textContent = `${formatDate(start)} - ${formatDate(weekEnd)}`;
    renderWeekGrid(start, occurrences);
  }
}

function renderMonthGrid(gridStart, occurrences) {
  const days = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(gridStart, i));
  }

  const isCurrentMonth = (date) => date.getMonth() === calendarState.cursor.getMonth();

  el.calendarGrid.className = "calendar-grid month";
  el.calendarGrid.innerHTML = days
    .map((day) => {
      const key = dateKey(day);
      const list = occurrences.filter((item) => dateKey(item.when) === key);
      const chips = list.slice(0, 3).map((item) => `<span class="calendar-chip ${statusClass(item.status)}">${item.phase}</span>`).join("");
      const more = list.length > 3 ? `<span class="calendar-more">+${list.length - 3}</span>` : "";

      return `
        <article class="calendar-cell ${isCurrentMonth(day) ? "" : "muted"}">
          <header>${day.getDate()}</header>
          <div class="calendar-items">${chips}${more}</div>
        </article>
      `;
    })
    .join("");
}

function renderWeekGrid(start, occurrences) {
  const days = [];
  for (let i = 0; i < 7; i += 1) days.push(addDays(start, i));

  el.calendarGrid.className = "calendar-grid week";
  el.calendarGrid.innerHTML = days
    .map((day) => {
      const key = dateKey(day);
      const list = occurrences.filter((item) => dateKey(item.when) === key);
      const rows = list.length
        ? list.map((item) => `<li><span class="calendar-chip ${statusClass(item.status)}">${item.phase}</span> ${item.time} ${item.note ? `· ${item.note}` : ""}</li>`).join("")
        : "<li class='meta'>일정 없음</li>";

      return `
        <article class="calendar-week-cell">
          <header>${day.getMonth() + 1}/${day.getDate()} (${"일월화수목금토"[day.getDay()]})</header>
          <ul>${rows}</ul>
        </article>
      `;
    })
    .join("");
}

function expandSchedulesForRange(schedules, startDate, endDate) {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);
  const out = [];

  schedules.forEach((base) => {
    const first = parseScheduleDate(base.date, base.time);
    if (!first) return;

    if (base.repeat === "none" || !base.repeat) {
      if (first >= start && first <= end) {
        out.push({ ...base, when: first, baseId: base.id, time: base.time || "00:00" });
      }
      return;
    }

    let cursor = new Date(first);
    const maxIteration = 500;
    let safe = 0;

    while (cursor <= end && safe < maxIteration) {
      if (cursor >= start) {
        out.push({
          ...base,
          when: new Date(cursor),
          baseId: base.id,
          time: `${String(cursor.getHours()).padStart(2, "0")}:${String(cursor.getMinutes()).padStart(2, "0")}`
        });
      }

      if (base.repeat === "weekly") cursor = addDays(cursor, 7);
      if (base.repeat === "biweekly") cursor = addDays(cursor, 14);
      if (base.repeat === "monthly") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), cursor.getHours(), cursor.getMinutes());
      safe += 1;
    }
  });

  return out.sort((a, b) => a.when.getTime() - b.when.getTime());
}

function bindCareEvents() {
  el.careGuideBtn.addEventListener("click", renderCareGuide);
}

function renderCareGuide() {
  const fabric = el.fabricInput.value;
  const code = (el.labelCodeInput.value || "").toUpperCase();

  const guideMap = {
    "면": { temp: "30~40도", mode: "표준", dry: "자연 건조", caution: "진한 색상 분리 세탁" },
    "울": { temp: "찬물", mode: "울 코스", dry: "평건조", caution: "강한 탈수 금지" },
    "데님": { temp: "30도", mode: "약한 코스", dry: "뒤집어서 건조", caution: "단독 세탁 권장" },
    "합성섬유": { temp: "30도", mode: "합성 코스", dry: "저온 건조", caution: "고온 건조 금지" },
    "린넨": { temp: "30도 이하", mode: "약한 코스", dry: "그늘 건조", caution: "구김 방지 위해 즉시 펼치기" }
  };

  const pick = guideMap[fabric];
  const extra = code.includes("30") ? "라벨 코드상 저온 세탁이 적합합니다." : "라벨 코드에 맞춰 건조 단계를 확인하세요.";

  el.careResult.innerHTML = `
    <h3>${fabric} 맞춤 가이드</h3>
    <p>물 온도: <strong>${pick.temp}</strong></p>
    <p>세탁 코스: <strong>${pick.mode}</strong></p>
    <p>건조 방식: <strong>${pick.dry}</strong></p>
    <p>주의사항: ${pick.caution}</p>
    <p class="sub-note">${extra}</p>
  `;
}

function bindInventoryEvents() {
  el.itemForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const total = Number(el.itemTotal.value);
    const current = Number(el.itemCurrent.value);

    if (current > total) {
      alert("남은 양은 전체 용량보다 클 수 없습니다.");
      return;
    }

    state.inventory.push({
      id: crypto.randomUUID(),
      name: el.itemName.value.trim(),
      total,
      current,
      updatedAt: new Date().toISOString().slice(0, 10)
    });

    saveState();
    el.itemForm.reset();
    renderInventory();
  });

  el.inventoryList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = button.dataset.id;
    const item = state.inventory.find((row) => row.id === id);
    if (!item) return;

    if (button.dataset.action === "use") item.current = Math.max(0, item.current - 1);
    if (button.dataset.action === "refill") item.current = Math.min(item.total, item.current + 1);
    if (button.dataset.action === "delete") {
      state.inventory = state.inventory.filter((row) => row.id !== id);
      saveState();
      renderInventory();
      return;
    }

    item.updatedAt = new Date().toISOString().slice(0, 10);
    saveState();
    renderInventory();
  });
}

function renderInventory() {
  if (!state.inventory.length) {
    el.inventoryList.innerHTML = "<li class='empty'>등록된 소모품이 없습니다.</li>";
    return;
  }

  el.inventoryList.innerHTML = state.inventory
    .map((item) => {
      const ratio = Math.round((item.current / item.total) * 100);
      const lowThreshold = state.settings.inventoryThresholdPercent;
      const low = ratio <= lowThreshold;
      return `
        <li class="list-row">
          <div>
            <strong>${item.name}</strong>
            <p>${item.current}/${item.total} (${ratio}%) · 최근 사용 ${item.updatedAt}</p>
            <div class="progress"><span style="width:${ratio}%"></span></div>
            ${low ? `<p class='alert alert-strong'>재고 ${lowThreshold}% 이하입니다. 지금 보충을 권장해요.</p>` : ""}
          </div>
          <div class="actions">
            <button class="ghost-btn" data-action="use" data-id="${item.id}">-1 사용</button>
            <button class="ghost-btn" data-action="refill" data-id="${item.id}">+1 보충</button>
            <button class="danger-btn" data-action="delete" data-id="${item.id}">삭제</button>
          </div>
        </li>
      `;
    })
    .join("");
}

function bindShareEvents() {
  el.memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el.memberName.value.trim();
    if (!name || state.members.includes(name)) return;
    state.members.push(name);
    saveState();
    el.memberForm.reset();
    renderMembers();
  });

  el.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.tasks.push({
      id: crypto.randomUUID(),
      title: el.taskTitle.value.trim(),
      assignee: el.taskAssignee.value,
      time: el.taskTime.value,
      done: false
    });
    saveState();
    el.taskForm.reset();
    renderTasks();
  });

  el.taskList.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "done") {
      const task = state.tasks.find((item) => item.id === id);
      if (task) task.done = !task.done;
    }
    if (button.dataset.action === "delete") {
      state.tasks = state.tasks.filter((item) => item.id !== id);
    }
    saveState();
    renderTasks();
  });
}

function renderMembers() {
  el.taskAssignee.innerHTML = state.members.map((name) => `<option value="${name}">${name}</option>`).join("");
}

function renderTasks() {
  if (!state.tasks.length) {
    el.taskList.innerHTML = "<li class='empty'>배정된 작업이 없습니다.</li>";
    return;
  }

  const sorted = [...state.tasks].sort((a, b) => a.time.localeCompare(b.time));
  el.taskList.innerHTML = sorted
    .map(
      (task) => {
        const assigneeClass = assigneeColorClass(task.assignee);
        const deadlineInfo = buildDeadlineInfo(task);
        return `
      <li class="list-row ${task.done ? "done" : ""}">
        <div>
          <strong>${task.title}</strong>
          <p><span class="assignee-tag ${assigneeClass}">${task.assignee}</span> · ${formatDateTime(task.time)}</p>
          ${deadlineInfo}
        </div>
        <div class="actions">
          <button class="ghost-btn" data-action="done" data-id="${task.id}">${task.done ? "되돌리기" : "완료"}</button>
          <button class="danger-btn" data-action="delete" data-id="${task.id}">삭제</button>
        </div>
      </li>
    `;
      }
    )
    .join("");
}

function assigneeColorClass(name) {
  const paletteSize = 6;
  const score = Array.from(name || "").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return `assignee-tag-${(score % paletteSize) + 1}`;
}

function buildDeadlineInfo(task) {
  if (task.done) return `<p class="sub-note">완료 처리됨</p>`;

  const cutoffTime = state.settings.taskCutoffTime;
  const [hour, minute] = cutoffTime.split(":").map(Number);
  const targetDate = new Date(task.time);
  if (Number.isNaN(targetDate.getTime())) return "";

  const deadline = new Date(targetDate);
  deadline.setHours(hour, minute || 0, 0, 0);
  const now = new Date();

  if (now > deadline) {
    return `<p class="alert alert-strong">마감(${cutoffTime})이 지났어요. 완료 체크가 필요합니다.</p>`;
  }

  return `<p class="sub-note">마감 규칙: ${cutoffTime} 전 완료 체크</p>`;
}

function activatePanel(id) {
  el.tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.target === id));
  el.panels.forEach((panel) => panel.classList.toggle("active", panel.id === id));

  if (el.panelZone) {
    el.panelZone.classList.remove("panel-zone--schedule", "panel-zone--care", "panel-zone--inventory", "panel-zone--share");
    el.panelZone.classList.add(`panel-zone--${id}`);
  }
}

function renderAll() {
  renderSchedule();
  renderCalendar();
  renderInventory();
  renderMembers();
  renderTasks();
  renderRules();
}

function scheduleDateTime(item) {
  return `${item.date || ""}T${item.time || "00:00"}`;
}

function parseScheduleDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const value = `${dateStr}T${timeStr || "00:00"}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  return addDays(d, -day);
}

function formatDate(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "시간 미지정";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
