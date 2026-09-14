(() => {
  const cfg = window.OFFICE_CONFIG || {};
  const configured = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const state = {
    dashboard: null,
    members: [],
    selectedMember: null,
    adminPin: "",
    selectedStatus: null,
    monthly: null,
    monthSelection: "all",
    monthCursor: null,
    selectedDay: null
  };

  // 빨 → 주 → 노 → 초 → 파 → 남 → 보 느낌으로 멤버 순서에 따라 배정
  const palette = [
    ["#d76b6b","#ec8c82"], // red
    ["#df8548","#efa269"], // orange
    ["#c8a13d","#ddbf5b"], // yellow
    ["#66976d","#83b389"], // green
    ["#5d91bd","#79abd2"], // blue
    ["#6573ad","#7f8cc3"], // indigo
    ["#8a6ead","#a18ac1"], // violet
    ["#c37491","#d68da6"], // rose
    ["#5e9a91","#79b1a8"], // teal
    ["#9a835e","#b09a72"]  // earth
  ];

  const demo = {
    today: "2026-09-13",
    month: "2026-09",
    generated_at: "미리보기 모드 · Supabase 연결 후 실시간 데이터가 표시됩니다.",
    members: [
      {id:"1",name:"에단",active:true,today_status:"근무중",today_detail:"09:00 출근",leave_remaining:3.5,infractions:1,unexcused_absences:0,penalty_absences:0,exit_candidate:false},
      {id:"2",name:"하퍼",active:true,today_status:"지각 · 근무중",today_detail:"09:18 출근",leave_remaining:4,infractions:2,unexcused_absences:0,penalty_absences:0,exit_candidate:false},
      {id:"3",name:"노아",active:true,today_status:"휴가",today_detail:"휴가",leave_remaining:2,infractions:3,unexcused_absences:0,penalty_absences:1,exit_candidate:false},
      {id:"4",name:"루카",active:true,today_status:"정상",today_detail:"09:00–17:00",leave_remaining:3,infractions:0,unexcused_absences:0,penalty_absences:0,exit_candidate:false},
      {id:"5",name:"클로이",active:true,today_status:"병결",today_detail:"병결",leave_remaining:4,infractions:1,unexcused_absences:0,penalty_absences:0,exit_candidate:false},
      {id:"6",name:"리암",active:true,today_status:"공가",today_detail:"채용 일정",leave_remaining:4,infractions:0,unexcused_absences:0,penalty_absences:0,exit_candidate:false},
      {id:"7",name:"소피",active:true,today_status:"근무중",today_detail:"09:00 출근",leave_remaining:4,infractions:0,unexcused_absences:0,penalty_absences:0,exit_candidate:false}
    ]
  };

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  const colors = i => palette[i % palette.length];
  const colorStyle = i => {
    const [a,b] = colors(i);
    return `background:linear-gradient(145deg,${a},${b})`;
  };

  function toast(msg){
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.add("hidden"), 2700);
  }

  function simplifiedStatus(raw){
    const s = String(raw || "");
    if (/휴무/.test(s)) return "휴무";
    if (/근무중|외출중/.test(s)) return "출근";
    if (/정상|지각|조퇴|외출|주말 퇴근/.test(s)) return "퇴근";
    return "결근";
  }

  function statusClass(s){
    if(s === "출근") return "status-in";
    if(s === "퇴근") return "status-out";
    if(s === "휴무") return "status-off";
    return "status-absent";
  }

  function publicDetail(member){
    const s = simplifiedStatus(member.today_status);
    if(s === "결근") return "";
    return member.today_detail || "";
  }

  async function rpc(name, params = {}){
    if(!sb) throw new Error("Supabase가 아직 연결되지 않았습니다.");
    const { data, error } = await sb.rpc(name, params);
    if(error) throw new Error(error.message);
    return data;
  }

  function render(){
    const d = state.dashboard || demo;
    state.members = d.members || [];

    $("updatedAt").textContent = d.generated_at;
    $("todayLabel").textContent = formatDateWithWeekday(d.today);
    $("monthLabel").textContent = `${d.month} 누적 기준`;

    $("todayMembers").innerHTML = state.members.length ? state.members.map((m,i) => {
      const s = simplifiedStatus(m.today_status);
      const detail = publicDetail(m);
      return `<article class="member-card">
        <div class="avatar" style="${colorStyle(i)}">${esc(m.name.slice(0,1))}</div>
        <div class="member-main">
          <div class="member-name">${esc(m.name)}</div>
          ${detail ? `<div class="member-detail">${esc(detail)}</div>` : ""}
        </div>
        <span class="badge ${statusClass(s)}">${esc(s)}</span>
      </article>`;
    }).join("") : `<div class="empty">등록된 멤버가 없습니다.</div>`;

    renderMonthlyAttendance();

    renderClockMembers();
    renderAdminMembers();
    fillAdminMemberSelect();

    if(state.selectedMember){
      const stillExists = state.members.some(m => m.id === state.selectedMember);
      if(!stillExists){
        state.selectedMember = null;
        $("clockActionPanel").classList.add("hidden");
      } else {
        updateSelectedMemberPanel();
      }
    }
  }


  function parseDateLocal(ymd){
    const [y,m,d] = String(ymd).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateWithWeekday(ymd){
    if(!ymd) return "";
    const d = parseDateLocal(ymd);
    const weekday = ["일","월","화","수","목","금","토"][d.getDay()];
    return `${ymd} (${weekday})`;
  }

  function ymdLocal(date){
    const y = date.getFullYear();
    const m = String(date.getMonth()+1).padStart(2,"0");
    const d = String(date.getDate()).padStart(2,"0");
    return `${y}-${m}-${d}`;
  }

  function addDays(date, n){
    const x = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function dayCategoryLabel(day){
    if(!day) return "";
    const map = {
      present:"출근",
      issue:"지각·조퇴·외출",
      leave:"휴가",
      half:"반가",
      excused:"인정부재",
      absent:"결근",
      pending:"미출근",
      future:"",
      weekend:""
    };
    return map[day.category] || "";
  }

  function makeDemoMonthly(){
    const month = demo.month;
    const [y,m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const today = parseDateLocal(demo.today);

    return {
      month,
      members: demo.members.map((member, mi) => {
        const days = [];
        let attended = 0;
        for(let d=1; d<=last; d++){
          const date = new Date(y,m-1,d);
          const dateText = ymdLocal(date);
          const dow = date.getDay();
          let category = "future";
          let status = "";
          let completed = false;

          if(dow === 0 || dow === 6){
            category = "weekend";
          }else if(date > today){
            category = "future";
          }else{
            const code = (d + mi * 2) % 17;
            if(code === 0){
              category = "leave"; status = "휴가"; completed = true;
            }else if(code === 5){
              category = "issue"; status = "지각"; completed = true; attended++;
            }else if(code === 11 && mi % 2 === 0){
              category = "excused"; status = "공가"; completed = true;
            }else if(code === 13 && mi === 4){
              category = "absent"; status = "결근"; completed = true;
            }else{
              category = dateText === demo.today ? "present" : "present";
              status = dateText === demo.today ? "근무중" : "정상";
              completed = dateText !== demo.today;
              attended++;
            }
          }

          const hasWork = ["present","issue","half"].includes(category);
          days.push({
            date:dateText,
            category,
            status,
            completed,
            infractions:category==="issue"?1:0,
            unexcused:category==="absent",
            first_in:hasWork ? (category==="issue" ? "09:18:00" : "09:00:00") : null,
            last_out:hasWork && completed ? "17:00:00" : null,
            minutes:hasWork ? (completed ? (category==="issue" ? 462 : 480) : 210) : 0
          });
        }

        return {
          id:member.id,
          name:member.name,
          attended_days:attended,
          leave_remaining:member.leave_remaining,
          infractions:member.infractions,
          unexcused_absences:member.unexcused_absences,
          penalty_absences:member.penalty_absences,
          exit_candidate:member.exit_candidate,
          days
        };
      })
    };
  }

  function monthNumber(monthText){
    return Number(String(monthText || "").split("-")[1] || 0);
  }

  function monthDisplay(monthText){
    const [y,m] = String(monthText || "").split("-");
    return `${y}년 ${Number(m)}월`;
  }

  function shiftMonth(monthText, offset){
    const [y,m] = String(monthText).split("-").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  }

  function formatClock(value){
    if(!value) return "—";
    return String(value).slice(0,5);
  }

  function formatMinutes(value){
    const minutes = Number(value || 0);
    if(minutes <= 0) return "0시간";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if(h && m) return `${h}시간 ${m}분`;
    if(h) return `${h}시간`;
    return `${m}분`;
  }

  function categoryText(day){
    if(!day) return "기록 없음";
    if(day.category === "present") return "출근";
    if(day.category === "issue") return day.status || "지각·조퇴·외출";
    if(day.category === "leave") return "휴가";
    if(day.category === "half") return "반가";
    if(day.category === "excused") return day.status || "공가·병결";
    if(day.category === "absent") return "결근";
    if(day.category === "pending") return "미출근";
    return "기록 없음";
  }

  function renderDayDetail(selected, dayMaps, monthly){
    const detail = $("calendarDayDetail");
    if(!detail) return;

    if(!selected){
      detail.innerHTML = `
        <div class="day-detail-empty">
          멤버를 선택하면 날짜별 출퇴근 시간과 근무시간을 확인할 수 있어요.
        </div>
      `;
      return;
    }

    if(!state.selectedDay){
      detail.innerHTML = `
        <div class="day-detail-empty">
          날짜를 눌러 그날의 출근 · 퇴근 · 근무시간을 확인해보세요.
        </div>
      `;
      return;
    }

    const day = dayMaps.get(selected.id)?.get(state.selectedDay);
    const d = parseDateLocal(state.selectedDay);
    const weekday = ["일","월","화","수","목","금","토"][d.getDay()];
    const dateLabel = `${d.getMonth()+1}월 ${d.getDate()}일 (${weekday})`;

    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    if(!day || day.category === "future"){
      detail.innerHTML = `
        <div class="day-detail-head">
          <strong>${dateLabel}</strong>
          <span>기록 없음</span>
        </div>
        <div class="day-detail-empty compact">이 날에는 근무 기록이 없어요.</div>
        ${isWeekend ? `
          <div class="weekend-calendar-note">
            주말은 4시간 근무 기준을 적용하지 않고, 출근한 경우 출근으로 처리해요.
          </div>
        ` : ""}
      `;
      return;
    }

    if(day.category === "weekend"){
      detail.innerHTML = `
        <div class="day-detail-head">
          <strong>${dateLabel}</strong>
          <span class="day-detail-status weekend">주말</span>
        </div>
        <div class="day-detail-empty compact">이 날에는 출근 기록이 없어요.</div>
        <div class="weekend-calendar-note">
          주말은 4시간 근무 기준을 적용하지 않고, 출근한 경우 출근으로 처리해요.
        </div>
      `;
      return;
    }

    const hasTime = Boolean(day.first_in || day.last_out || Number(day.minutes || 0));
    detail.innerHTML = `
      <div class="day-detail-head">
        <strong>${dateLabel}</strong>
        <span class="day-detail-status ${esc(day.category)}">${esc(categoryText(day))}</span>
      </div>
      ${hasTime ? `
        <div class="day-time-grid">
          <div class="day-time-item">
            <span>출근</span>
            <b>${esc(formatClock(day.first_in))}</b>
          </div>
          <div class="day-time-item">
            <span>퇴근</span>
            <b>${esc(formatClock(day.last_out))}</b>
          </div>
          <div class="day-time-item emphasized">
            <span>총 근무시간</span>
            <b>${esc(formatMinutes(day.minutes))}</b>
          </div>
        </div>
      ` : `
        <div class="day-detail-empty compact">${esc(categoryText(day))}로 처리된 날이에요.</div>
      `}
      ${isWeekend ? `
        <div class="weekend-calendar-note">
          주말은 4시간 근무 기준을 적용하지 않고, 출근한 경우 출근으로 처리해요.
        </div>
      ` : ""}
    `;
  }

  async function loadMonthly(monthText){
    const MIN_MONTH = "2026-09";
    const currentMonth = state.dashboard?.month || new Date().toISOString().slice(0,7);

    if(monthText < MIN_MONTH) monthText = MIN_MONTH;
    if(monthText > currentMonth) monthText = currentMonth;

    state.monthCursor = monthText;
    state.selectedDay = null;

    if(!configured){
      const demoMonthly = makeDemoMonthly();
      // 미리보기에서는 월 구조만 이동시키고 데이터는 현재 샘플을 사용
      state.monthly = {...demoMonthly, month:monthText};
      renderMonthlyAttendance();
      return;
    }

    try{
      state.monthly = await rpc("rpc_monthly_attendance", {
        p_month: `${monthText}-01`
      });
      renderMonthlyAttendance();
    }catch(e){
      toast(`월간 기록을 불러오지 못했습니다: ${e.message}`);
    }
  }

  function renderMonthlyAttendance(){
    const box = $("monthlyCalendar");
    const tabs = $("monthMemberTabs");
    const summary = $("monthlySummary");
    const legend = $("calendarLegend");
    if(!box || !tabs || !summary) return;

    const fallbackMonth = state.monthCursor || state.dashboard?.month || new Date().toISOString().slice(0,7);
    const monthly = state.monthly || (
      configured
        ? {
            month:fallbackMonth,
            members:(state.members || []).map(m => ({
              id:m.id,
              name:m.name,
              attended_days:0,
              leave_remaining:m.leave_remaining ?? 4,
              infractions:m.infractions ?? 0,
              unexcused_absences:m.unexcused_absences ?? 0,
              penalty_absences:m.penalty_absences ?? 0,
              exit_candidate:Boolean(m.exit_candidate),
              days:[]
            }))
          }
        : makeDemoMonthly()
    );

    if(!state.monthCursor) state.monthCursor = monthly.month;
    const members = monthly.members || [];
    const monthNo = monthNumber(monthly.month);

    if($("monthTitle")) $("monthTitle").textContent = `${monthNo}월 출석`;
    if($("monthSubtitle")) $("monthSubtitle").textContent = `하루씩 채워지는 ${monthNo}월의 기록을 확인해보세요.`;
    if($("monthLabel")) $("monthLabel").textContent = monthDisplay(monthly.month);

    const MIN_MONTH = "2026-09";
    const currentMonth = state.dashboard?.month || new Date().toISOString().slice(0,7);
    const prevBtn = $("prevMonthBtn");
    const nextBtn = $("nextMonthBtn");
    if(prevBtn) prevBtn.disabled = monthly.month <= MIN_MONTH;
    if(nextBtn) nextBtn.disabled = monthly.month >= currentMonth;

    if(state.monthSelection !== "all" && !members.some(m => m.id === state.monthSelection)){
      state.monthSelection = "all";
      state.selectedDay = null;
    }

    tabs.innerHTML = [
      `<button class="month-member-tab ${state.monthSelection==="all"?"active":""}" data-month-member="all">전체</button>`,
      ...members.map((m,i) => `
        <button class="month-member-tab ${state.monthSelection===m.id?"active":""}" data-month-member="${esc(m.id)}">
          <span class="tab-color" style="${colorStyle(i)}"></span>${esc(m.name)}
        </button>
      `)
    ].join("");

    tabs.querySelectorAll("[data-month-member]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.monthSelection = btn.dataset.monthMember;
        state.selectedDay = null;
        renderMonthlyAttendance();
      });
    });

    const monthStart = parseDateLocal(`${monthly.month}-01`);
    const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 1);
    const monthEnd = addDays(nextMonth,-1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    const gridEnd = addDays(monthEnd, 6-monthEnd.getDay());

    const selected = state.monthSelection === "all"
      ? null
      : members.find(m => m.id === state.monthSelection);

    const dayMaps = new Map(
      members.map(m => [m.id, new Map((m.days||[]).map(d => [d.date,d]))])
    );

    const categoryClass = category => {
      const map = {
        present:"state-present",
        issue:"state-issue",
        leave:"state-leave",
        half:"state-half",
        excused:"state-excused",
        absent:"state-absent",
        pending:"state-pending"
      };
      return map[category] || "";
    };

    const cells = [];

    for(let date = new Date(gridStart); date <= gridEnd; date = addDays(date,1)){
      const dateText = ymdLocal(date);
      const inMonth = date.getMonth() === monthStart.getMonth();
      const dow = date.getDay();
      const weekendClass = dow===0 ? " sunday" : dow===6 ? " saturday" : "";
      const dayNum = date.getDate();

      if(!inMonth){
        cells.push(`
          <div class="calendar-day compact outside${weekendClass}" aria-hidden="true">
            <span class="date-circle">${dayNum}</span>
          </div>
        `);
        continue;
      }

      if(!selected){
        const dayRecords = members.map(m => dayMaps.get(m.id)?.get(dateText)).filter(Boolean);
        const categories = new Set();

        dayRecords.forEach(d => {
          if(d.category==="present") categories.add("present");
          if(d.category==="issue") categories.add("issue");
          if(d.category==="leave") categories.add("leave");
          if(d.category==="half") categories.add("half");
          if(d.category==="excused") categories.add("excused");
          if(d.category==="absent") categories.add("absent");
        });

        const dots = ["present","issue","leave","half","excused","absent"]
          .filter(c => categories.has(c))
          .map(c => `<i class="aggregate-dot ${c}"></i>`)
          .join("");

        cells.push(`
          <div class="calendar-day compact overview${weekendClass}">
            <span class="date-circle">${dayNum}</span>
            <span class="aggregate-dots">${dots}</span>
          </div>
        `);
      }else{
        const day = dayMaps.get(selected.id)?.get(dateText);
        const category = day?.category || (dow===0 || dow===6 ? "weekend" : "future");
        const cls = categoryClass(category);
        const selectable = Boolean(day) && (
          category !== "future" || dow===0 || dow===6
        );

        cells.push(`
          <div class="calendar-day compact personal${weekendClass}">
            ${selectable ? `
              <button type="button"
                class="date-circle day-select ${cls} ${state.selectedDay===dateText?"selected-day":""}"
                data-day="${dateText}"
                title="${esc(day?.status || "")}">
                ${dayNum}
              </button>
            ` : `
              <span class="date-circle ${cls}">${dayNum}</span>
            `}
          </div>
        `);
      }
    }

    box.innerHTML = cells.join("");

    box.querySelectorAll("[data-day]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.selectedDay = btn.dataset.day;
        renderMonthlyAttendance();
      });
    });

    renderDayDetail(selected, dayMaps, monthly);

    if(legend){
      legend.innerHTML = `
        <div class="simple-legend calendar-simple-legend">
          <span><i class="legend-circle present"></i>출근</span>
          <span><i class="legend-circle issue"></i>지각·조퇴·외출</span>
          <span><i class="legend-circle leave"></i>휴가</span>
          <span><i class="legend-circle half"></i>반가</span>
          <span><i class="legend-circle excused"></i>공가·병결</span>
          <span><i class="legend-circle absent"></i>결근</span>
        </div>
      `;
    }

    if(!selected){
      summary.innerHTML = `
        <div class="summary-intro">
          <div class="summary-eyebrow">MONTHLY OVERVIEW</div>
          <h3>${monthNo}월, 모두 얼마나 꾸준히 나오고 있을까요?</h3>
          <p>멤버를 선택하면 개인별 ${monthNo}월 출석 기록과 날짜별 근무시간을 자세히 볼 수 있어요.</p>
        </div>

        <div class="overall-member-list">
          ${members.map((m,i)=>`
            <button class="overall-member-card" data-open-member="${esc(m.id)}">
              <span class="overall-member-identity">
                <span class="summary-avatar large" style="${colorStyle(i)}">${esc(m.name.slice(0,1))}</span>
                <span class="overall-member-main">
                  <strong>${esc(m.name)}</strong>
                  <small>${monthNo}월 ${esc(m.attended_days)}일 출근</small>
                </span>
              </span>

              <span class="overall-member-stats">
                <span class="overall-member-metric">
                  <span class="metric-content">
                    <b>${esc(m.leave_remaining)}일</b>
                    <small>잔여 휴가</small>
                  </span>
                </span>
                <span class="overall-member-metric issue-metric">
                  <span class="metric-content">
                    <b>${esc(m.infractions)}회</b>
                    <small>지각·조퇴·외출</small>
                  </span>
                </span>
                <span class="overall-member-metric ${m.exit_candidate?"danger-text":""}">
                  <span class="metric-content">
                    <b>${esc(m.penalty_absences)}회</b>
                    <small>누적결근</small>
                  </span>
                </span>
              </span>

              <span class="row-arrow">›</span>
            </button>
          `).join("") || `<div class="empty">등록된 멤버가 없습니다.</div>`}
        </div>

      `;

      summary.querySelectorAll("[data-open-member]").forEach(btn => {
        btn.addEventListener("click", () => {
          state.monthSelection = btn.dataset.openMember;
          state.selectedDay = null;
          renderMonthlyAttendance();
        });
      });
    }else{
      const idx = members.findIndex(m => m.id === selected.id);

      summary.innerHTML = `
        <div class="personal-summary-top">
          <div class="summary-person-title">
            <span class="summary-avatar xlarge" style="${colorStyle(Math.max(0,idx))}">${esc(selected.name.slice(0,1))}</span>
            <div>
              <div class="summary-eyebrow">MONTHLY RECORD</div>
              <h3>${esc(selected.name)}의 ${monthNo}월</h3>
            </div>
          </div>
        </div>

        <div class="personal-big-message">
          <strong>${monthNo}월에는 <em>${esc(selected.attended_days)}일</em> 출근했어요.</strong>
          <p>날짜를 누르면 그날 몇 시에 출근하고 퇴근했는지, 총 얼마나 근무했는지 확인할 수 있어요.</p>
        </div>

        <div class="personal-stat-list">
          <div class="personal-stat-row">
            <span>잔여 휴가</span>
            <b>${esc(selected.leave_remaining)}일</b>
          </div>
          <div class="personal-stat-row">
            <span>지각 · 조퇴 · 외출</span>
            <b>${esc(selected.infractions)}회</b>
          </div>
          <div class="personal-stat-row">
            <span>무단결근</span>
            <b>${esc(selected.unexcused_absences)}회</b>
          </div>
          <div class="personal-stat-row ${selected.exit_candidate?"danger":""}">
            <span>누적결근</span>
            <b>${esc(selected.penalty_absences)}회</b>
          </div>
        </div>

      `;
    }
  }

  function renderClockMembers(){
    $("clockMembers").innerHTML = state.members.length ? state.members.map((m,i) => {
      const selected = state.selectedMember === m.id ? " selected" : "";
      const s = simplifiedStatus(m.today_status);
      return `<button type="button" class="clock-member-card${selected}" data-member-id="${esc(m.id)}">
        <div class="avatar" style="${colorStyle(i)}">${esc(m.name.slice(0,1))}</div>
        <div class="member-main">
          <div class="member-name">${esc(m.name)}</div>
          <div class="clock-status">${esc(s)}</div>
        </div>
      </button>`;
    }).join("") : `<div class="empty">등록된 멤버가 없습니다.</div>`;

    document.querySelectorAll(".clock-member-card").forEach(btn => {
      btn.addEventListener("click", () => selectClockMember(btn.dataset.memberId));
    });
  }

  function selectClockMember(id){
    state.selectedMember = id;
    renderClockMembers();
    updateSelectedMemberPanel();
    $("clockActionPanel").classList.remove("hidden");
  }

  function updateSelectedMemberPanel(){
    const idx = state.members.findIndex(m => m.id === state.selectedMember);
    const m = state.members[idx];
    if(!m) return;

    const simple = simplifiedStatus(m.today_status);
    $("selectedMemberName").textContent = m.name;
    $("selectedMemberState").textContent = simple;
    $("selectedMemberState").className = `selected-badge ${statusClass(simple)}`;
    $("selectedAvatar").textContent = m.name.slice(0,1);
    $("selectedAvatar").style = colorStyle(Math.max(0,idx));
  }

  function renderAdminMembers(){
    if(!$("adminMemberList")) return;

    $("adminMemberList").innerHTML = state.members.length ? state.members.map((m,i) => `
      <div class="admin-member-item">
        <div class="avatar" style="${colorStyle(i)}">${esc(m.name.slice(0,1))}</div>
        <div class="name">${esc(m.name)}</div>
        <button class="mini-delete" data-delete-member="${esc(m.id)}">삭제</button>
      </div>
    `).join("") : `<div class="empty">등록된 멤버가 없습니다.</div>`;

    document.querySelectorAll("[data-delete-member]").forEach(btn => {
      btn.addEventListener("click", () => deleteMember(btn.dataset.deleteMember));
    });
  }

  function fillAdminMemberSelect(){
    const current = $("editMember").value;
    const opts = state.members.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
    $("editMember").innerHTML = opts || `<option value="">멤버 없음</option>`;
    if(current && state.members.some(m => m.id === current)) $("editMember").value = current;
  }

  async function refresh(){
    if(!configured){
      state.dashboard = demo;
      if(!state.monthCursor) state.monthCursor = demo.month;
      state.monthly = makeDemoMonthly();
      state.monthly.month = state.monthCursor;
      render();
      return;
    }

    try{
      state.dashboard = await rpc("rpc_dashboard");
      if(!state.monthCursor) state.monthCursor = state.dashboard.month;
      render();
    }catch(e){
      toast(`멤버 데이터를 불러오지 못했습니다: ${e.message}`);
      return;
    }

    try{
      state.monthly = await rpc("rpc_monthly_attendance", {
        p_month: `${state.monthCursor}-01`
      });
      renderMonthlyAttendance();
    }catch(e){
      state.monthly = null;
      renderMonthlyAttendance();
      console.warn("Monthly attendance load failed:", e);
    }
  }


  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      ["dashboard","clock","admin"].forEach(v => {
        $("view-"+v).classList.toggle("hidden", v !== btn.dataset.view);
      });
    });
  });

  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!state.selectedMember){
        toast("먼저 내 카드를 선택해주세요.");
        return;
      }
      if(!configured){
        toast("미리보기 모드입니다.");
        return;
      }
      btn.disabled = true;
      try{
        await rpc("rpc_member_punch", {
          p_member: state.selectedMember,
          p_action: btn.dataset.action
        });
        await refresh();
        toast("기록했습니다.");
      }catch(e){
        toast(e.message);
      }
      btn.disabled = false;
    });
  });

  $("adminLoginBtn").addEventListener("click", async () => {
    const pin = $("adminPin").value.trim();
    if(!pin){
      toast("관리자 PIN을 입력해주세요.");
      return;
    }

    if(!configured){
      if(pin !== "1004"){
        toast("관리자 PIN이 올바르지 않습니다.");
        return;
      }
      state.adminPin = pin;
      $("adminLoginPanel").classList.add("hidden");
      $("adminPanel").classList.remove("hidden");
      toast("미리보기 관리자 화면입니다.");
      return;
    }

    try{
      const ok = await rpc("rpc_admin_login",{p_pin:pin});
      if(!ok) throw new Error("관리자 PIN이 올바르지 않습니다.");
      state.adminPin = pin;
      $("adminLoginPanel").classList.add("hidden");
      $("adminPanel").classList.remove("hidden");
      toast("관리자 모드가 열렸습니다.");
    }catch(e){
      toast(e.message);
    }
  });

  $("addMemberBtn").addEventListener("click", async () => {
    const name = $("newMemberName").value.trim();
    if(!name){
      toast("닉네임을 입력해주세요.");
      return;
    }
    if(!configured){
      toast("미리보기 모드입니다.");
      return;
    }
    try{
      await rpc("rpc_admin_add_member",{
        p_admin_pin: state.adminPin,
        p_name: name
      });
      $("newMemberName").value = "";
      await refresh();
      toast("멤버를 추가했습니다.");
    }catch(e){
      if(String(e.message || "").includes("이미 사용 중인 닉네임")){
        await refresh();
        toast("이미 등록된 멤버입니다. 목록을 새로 불러왔어요.");
      }else{
        toast(e.message);
      }
    }
  });

  async function deleteMember(id){
    const m = state.members.find(x => x.id === id);
    if(!m) return;
    if(!confirm(`${m.name} 멤버를 삭제할까요?\n기존 근태 기록은 보존됩니다.`)) return;

    if(!configured){
      toast("미리보기 모드입니다.");
      return;
    }

    try{
      await rpc("rpc_admin_delete_member",{
        p_admin_pin: state.adminPin,
        p_member: id
      });
      await refresh();
      toast("멤버를 삭제했습니다.");
    }catch(e){
      toast(e.message);
    }
  }



  function formatPickerDate(value){
    if(!value) return "날짜 선택";
    const [y,m,d] = value.split("-").map(Number);
    return `${y}. ${m}. ${d}.`;
  }

  function formatPickerMonth(value){
    if(!value) return "월 선택";
    const [y,m] = value.split("-").map(Number);
    return `${y}년 ${m}월`;
  }

  function syncPickerDisplays(){
    const date = $("editDate")?.value || "";
    const inTime = $("editIn")?.value || "";
    const outTime = $("editOut")?.value || "";
    const month = $("resetMonth")?.value || "";

    if($("editDateDisplay")) $("editDateDisplay").textContent = formatPickerDate(date);

    if($("editInDisplay")){
      $("editInDisplay").textContent = inTime || "시간 선택";
      $("editInDisplay").classList.toggle("picker-placeholder", !inTime);
    }

    if($("editOutDisplay")){
      $("editOutDisplay").textContent = outTime || "시간 선택";
      $("editOutDisplay").classList.toggle("picker-placeholder", !outTime);
    }

    if($("resetMonthDisplay")) $("resetMonthDisplay").textContent = formatPickerMonth(month);
  }

  ["editDate","editIn","editOut","resetMonth"].forEach(id => {
    $(id)?.addEventListener("change", syncPickerDisplays);
    $(id)?.addEventListener("input", syncPickerDisplays);
  });

  function isWeekendDate(dateText){
    if(!dateText) return false;
    const d = parseDateLocal(dateText);
    const day = d.getDay();
    return day === 0 || day === 6;
  }

  function updateWeekendAdminState(){
    const date = $("editDate")?.value;
    const weekend = isWeekendDate(date);
    const notice = $("weekendStatusNotice");
    const saveBtn = $("saveStatusBtn");

    document.querySelectorAll(".status-option").forEach(btn => {
      btn.disabled = weekend;
      if(weekend) btn.classList.remove("active");
    });

    if(weekend){
      state.selectedStatus = null;
      notice?.classList.remove("hidden");
      if(saveBtn) saveBtn.disabled = true;
    }else{
      notice?.classList.add("hidden");
      if(saveBtn) saveBtn.disabled = false;
    }
  }

  $("editDate")?.addEventListener("change", updateWeekendAdminState);

  document.querySelectorAll(".status-option").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".status-option").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedStatus = btn.dataset.status;
    });
  });

  $("saveStatusBtn").addEventListener("click", async () => {
    const date = $("editDate").value;
    const member = $("editMember").value;

    if(!date || !member){
      toast("날짜와 멤버를 선택해주세요.");
      return;
    }
    if(isWeekendDate(date)){
      toast("주말에는 휴가·반가·병결·공가·무단결근 처리를 할 수 없습니다. 출근 기록만 가능합니다.");
      return;
    }
    if(!state.selectedStatus){
      toast("처리할 근태 항목을 선택해주세요.");
      return;
    }
    if(!configured){
      toast("미리보기 모드입니다.");
      return;
    }

    try{
      await rpc("rpc_admin_set_day",{
        p_admin_pin: state.adminPin,
        p_member: member,
        p_date: date,
        p_status: state.selectedStatus
      });
      state.selectedStatus = null;
      document.querySelectorAll(".status-option").forEach(b => b.classList.remove("active"));
      await refresh();
      toast("근태 처리를 저장했습니다.");
    }catch(e){
      toast(e.message);
    }
  });

  $("clearStatusBtn").addEventListener("click", async () => {
    const date = $("editDate").value;
    const member = $("editMember").value;
    if(!date || !member){
      toast("날짜와 멤버를 선택해주세요.");
      return;
    }
    if(!configured){
      toast("미리보기 모드입니다.");
      return;
    }

    try{
      await rpc("rpc_admin_clear_status",{
        p_admin_pin: state.adminPin,
        p_member: member,
        p_date: date
      });
      state.selectedStatus = null;
      document.querySelectorAll(".status-option").forEach(b => b.classList.remove("active"));
      await refresh();
      toast("근태 지정을 해제했습니다.");
    }catch(e){
      toast(e.message);
    }
  });

  $("saveTimesBtn").addEventListener("click", async () => {
    const date = $("editDate").value;
    const member = $("editMember").value;
    const inTime = $("editIn").value;
    const outTime = $("editOut").value;

    if(!date || !member){
      toast("날짜와 멤버를 선택해주세요.");
      return;
    }
    if(!inTime || !outTime){
      toast("출근 시간과 퇴근 시간을 모두 입력해주세요.");
      return;
    }
    if(outTime <= inTime){
      toast("퇴근 시간은 출근 시간보다 늦어야 합니다.");
      return;
    }
    if(!configured){
      toast("미리보기 모드입니다.");
      return;
    }

    try{
      await rpc("rpc_admin_set_times",{
        p_admin_pin: state.adminPin,
        p_member: member,
        p_date: date,
        p_in: inTime,
        p_out: outTime
      });
      await refresh();
      toast("출퇴근 시간을 수정했습니다.");
    }catch(e){
      toast(e.message);
    }
  });

  $("clearPunchBtn").addEventListener("click", async () => {
    const date = $("editDate").value;
    const member = $("editMember").value;
    if(!date || !member){
      toast("날짜와 멤버를 선택해주세요.");
      return;
    }
    if(!confirm("해당 날짜의 출퇴근 기록을 삭제할까요?")) return;
    if(!configured){
      toast("미리보기 모드입니다.");
      return;
    }

    try{
      await rpc("rpc_admin_clear_punch",{
        p_admin_pin: state.adminPin,
        p_member: member,
        p_date: date
      });
      $("editIn").value = "";
      $("editOut").value = "";
      syncPickerDisplays();
      await refresh();
      toast("출퇴근 기록을 삭제했습니다.");
    }catch(e){
      toast(e.message);
    }
  });



  $("resetMonthBtn")?.addEventListener("click", async () => {
    const month = $("resetMonth")?.value;
    if(!month){
      toast("초기화할 월을 선택해주세요.");
      return;
    }

    if(!confirm(`${month.replace("-", "년 ")}월의 근태 기록을 모두 초기화할까요?\n멤버는 삭제되지 않습니다.`)){
      return;
    }

    if(!configured){
      toast("미리보기 모드에서는 초기화할 수 없습니다.");
      return;
    }

    try{
      await rpc("rpc_admin_reset_month", {
        p_admin_pin: state.adminPin,
        p_month: `${month}-01`
      });

      state.selectedDay = null;
      if(state.monthCursor === month){
        state.monthly = null;
      }
      await refresh();
      toast(`${Number(month.split("-")[1])}월 기록을 초기화했습니다.`);
    }catch(e){
      toast(e.message);
    }
  });

  $("resetAllBtn")?.addEventListener("click", async () => {
    if(!confirm("모든 멤버의 전체 근태 기록을 초기화할까요?\n멤버 목록은 유지되고, 출퇴근·휴가·결근 기록만 삭제됩니다.")){
      return;
    }
    if(!confirm("정말 전체 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.")){
      return;
    }

    if(!configured){
      toast("미리보기 모드에서는 초기화할 수 없습니다.");
      return;
    }

    try{
      await rpc("rpc_admin_reset_all", {
        p_admin_pin: state.adminPin
      });

      state.selectedDay = null;
      state.monthly = null;
      await refresh();
      toast("전체 근태 기록을 초기화했습니다.");
    }catch(e){
      toast(e.message);
    }
  });

  $("prevMonthBtn")?.addEventListener("click", () => {
    const MIN_MONTH = "2026-09";
    const base = state.monthCursor || state.dashboard?.month || new Date().toISOString().slice(0,7);
    const prev = shiftMonth(base,-1);
    if(prev >= MIN_MONTH) loadMonthly(prev);
  });

  $("nextMonthBtn")?.addEventListener("click", () => {
    const base = state.monthCursor || state.dashboard?.month || new Date().toISOString().slice(0,7);
    const current = state.dashboard?.month || new Date().toISOString().slice(0,7);
    const next = shiftMonth(base,1);
    if(next <= current) loadMonthly(next);
  });

  function init(){
    $("brandName").textContent = cfg.BRAND_NAME || "OFFICE 09";
    $("brandSub").textContent = cfg.BRAND_SUBTITLE || "함께 출근하고, 각자의 하루를 시작하는 곳";

    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    $("editDate").value = local;
    if($("resetMonth")) $("resetMonth").value = local.slice(0,7);
    syncPickerDisplays();
    updateWeekendAdminState();

    refresh();

    if(sb){
      sb.channel("office-refresh")
        .on("postgres_changes",{
          event:"UPDATE",
          schema:"public",
          table:"refresh_signal"
        },() => refresh())
        .subscribe();

      setInterval(refresh,60000);
    }
  }

  init();
})();
