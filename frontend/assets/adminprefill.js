function qs(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}
function setStatus(msg, isError=false) {
  const el = document.getElementById("statusBox");
  el.textContent = msg;
  el.style.borderColor = isError ? "rgba(180,35,24,.35)" : "rgba(0,0,0,.08)";
  el.style.background = isError ? "rgba(180,35,24,.06)" : "#f6f7fb";
}

let DATA = null;
const repeatCounters = {};           // groupId -> max repeatIndex
const removedRepeats = new Set();    // `${groupId}:${repeatIndex}`

function makeItemMap(items) {
  const m = new Map();
  for (const it of items) {
    const ri = Number.isFinite(it.repeatIndex) ? it.repeatIndex : 0;
    m.set(`${it.questionId}|${ri}`, it.value ?? "");
  }
  return m;
}

function buildInput(q, value) {
  const t = String(q.answerType || "").toLowerCase();

  if (t.includes("note") || t.includes("long") || t.includes("textarea")) {
    const ta = document.createElement("textarea");
    ta.value = value ?? "";
    return ta;
  }

  if (t.includes("number") || t.includes("tal")) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.value = value ?? "";
    return inp;
  }

  if (t.includes("bool") || t.includes("yesno") || t.includes("ja") || t.includes("nej")) {
    const sel = document.createElement("select");
    sel.innerHTML = `
      <option value="">—</option>
      <option value="true">Ja</option>
      <option value="false">Nej</option>
    `;
    sel.value = (value === true || value === "true") ? "true" : (value === false || value === "false") ? "false" : (value ?? "");
    return sel;
  }

  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = value ?? "";
  return inp;
}

function initRepeatCounters() {
  Object.keys(repeatCounters).forEach(k => delete repeatCounters[k]);

  const groupByQuestion = new Map();
  for (const q of (DATA.questions || [])) groupByQuestion.set(q.id, q.groupId);

  for (const g of (DATA.groups || [])) repeatCounters[g.id] = 0;

  for (const it of (DATA.items || [])) {
    const gid = groupByQuestion.get(it.questionId);
    if (!gid) continue;
    const ri = Number.isFinite(it.repeatIndex) ? it.repeatIndex : 0;
    if (ri > (repeatCounters[gid] ?? 0)) repeatCounters[gid] = ri;
  }
}

function renderSurvey() {
  const root = document.getElementById("surveyRoot");
  root.innerHTML = "";

  const groups = [...(DATA.groups || [])].sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0));
  const questions = [...(DATA.questions || [])];

  const qByGroup = new Map();
  for (const q of questions) {
    if (!qByGroup.has(q.groupId)) qByGroup.set(q.groupId, []);
    qByGroup.get(q.groupId).push(q);
  }
  for (const [gid, arr] of qByGroup.entries()) arr.sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0));

  const itemMap = makeItemMap(DATA.items || []);

  for (const g of groups) {
    const card = document.createElement("div");
    card.className = "card";

    const titleRow = document.createElement("div");
    titleRow.className = "group-title";

    const h2 = document.createElement("h2");
    h2.textContent = g.name || "(gruppe)";
    titleRow.appendChild(h2);

    const right = document.createElement("div");
    right.className = "row";

    if (g.repeatable) {
      const addBtn = document.createElement("button");
      addBtn.className = "btn";
      addBtn.textContent = "+ Tilføj";
      addBtn.onclick = () => {
        const next = (repeatCounters[g.id] ?? 0) + 1;
        repeatCounters[g.id] = next;
        renderSurvey();
        setTimeout(() => document.getElementById(`repeat_${g.id}_${next}`)?.scrollIntoView({ behavior:"smooth", block:"start" }), 50);
      };
      right.appendChild(addBtn);
    } else {
      const badge = document.createElement("span");
      badge.className = "muted";
      badge.textContent = "Fast gruppe";
      right.appendChild(badge);
    }

    titleRow.appendChild(right);
    card.appendChild(titleRow);

    const qs = qByGroup.get(g.id) || [];
    if (!qs.length) {
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = "Ingen spørgsmål i gruppen.";
      card.appendChild(p);
      root.appendChild(card);
      continue;
    }

    const maxRI = g.repeatable ? (repeatCounters[g.id] ?? 0) : 0;

    for (let ri = 0; ri <= maxRI; ri++) {
      const removedKey = `${g.id}:${ri}`;
      if (removedRepeats.has(removedKey)) continue;

      const block = document.createElement("div");
      block.className = g.repeatable ? "repeat-block" : "";
      block.id = `repeat_${g.id}_${ri}`;

      if (g.repeatable) {
        const head = document.createElement("div");
        head.className = "repeat-head";

        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = (ri === 0) ? "Standard" : `Gentagelse ${ri}`;
        head.appendChild(tag);

        if (ri > 0) {
          const delBtn = document.createElement("button");
          delBtn.className = "btn danger";
          delBtn.textContent = "Fjern";
          delBtn.title = "Skjuler gentagelsen og sletter værdier ved gem.";
          delBtn.onclick = () => { removedRepeats.add(removedKey); renderSurvey(); };
          head.appendChild(delBtn);
        }

        block.appendChild(head);
      }

      const grid = document.createElement("div");
      grid.className = "grid";

      for (const q of qs) {
        const field = document.createElement("div");

        const lab = document.createElement("label");
        lab.textContent = q.text || "(spørgsmål)";
        field.appendChild(lab);

        if (q.explanation) {
          const ex = document.createElement("div");
          ex.className = "muted";
          ex.style.marginBottom = "6px";
          ex.textContent = q.explanation;
          field.appendChild(ex);
        }

        const key = `${q.id}|${ri}`;
        const val = itemMap.get(key) ?? "";

        const input = buildInput(q, val);
        input.dataset.questionId = q.id;
        input.dataset.groupId = g.id;
        input.dataset.repeatIndex = String(ri);
        field.appendChild(input);

        grid.appendChild(field);
      }

      block.appendChild(grid);
      card.appendChild(block);
    }

    root.appendChild(card);
  }
}

async function loadAll() {
  removedRepeats.clear();
  DATA = null;
  document.getElementById("surveyRoot").innerHTML = "";
  setStatus("Indlæser…");

  const instanceId = qs("id");
  const code = qs("code");

  if (!instanceId && !code) {
    setStatus("Indtast code eller id for at åbne en instans.", false);
    document.getElementById("openBox").style.display = "block";
    document.getElementById("openGo").onclick = () => {
      const c = (document.getElementById("openCode").value || "").trim();
      const i = (document.getElementById("openId").value || "").trim();
      if (i) location.href = `adminprefill.html?id=${encodeURIComponent(i)}`;
      else if (c) location.href = `adminprefill.html?code=${encodeURIComponent(c)}`;
      else alert("Indtast enten code eller id.");
    };
    return;
  }

  document.getElementById("openBox").style.display = "none";

  const res = await fetch("/api/admin-survey-load", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ instanceId, code })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(body);
    setStatus(body?.message || ("Load fejlede: HTTP " + res.status), true);
    return;
  }

  DATA = body;
  initRepeatCounters();
  renderSurvey();

  const inst = DATA.instance || {};
  document.getElementById("subtitle").textContent =
    `Survey: ${inst.customerName || ""}  •  Code: ${inst.code || ""}  •  Status: ${inst.status || ""}`;

  setStatus("Klar.");
}

async function saveAll() {
  if (!DATA?.instance?.id) {
    setStatus("Kan ikke gemme: surveyinstance mangler.", true);
    return;
  }

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  setStatus("Gemmer…");

  try {
    const answers = [];
    document.querySelectorAll("[data-question-id]").forEach(el => {
      const questionId = el.dataset.questionId;
      const groupId = el.dataset.groupId;
      const repeatIndex = parseInt(el.dataset.repeatIndex || "0", 10);
      const value = (el.tagName === "SELECT") ? el.value : (el.value ?? "");
      answers.push({ questionId, groupId, repeatIndex, value });
    });

    const removed = [];
    for (const key of removedRepeats) {
      const [groupId, riStr] = key.split(":");
      removed.push({ groupId, repeatIndex: parseInt(riStr, 10) });
    }

    const res = await fetch("/api/admin-survey-save", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ instanceId: DATA.instance.id, answers, removed })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(body);
      setStatus(body?.message || ("Save fejlede: HTTP " + res.status), true);
      return;
    }

    await loadAll();
    setStatus(`Gemt. Oprettet: ${body.created ?? 0}, Opdateret: ${body.updated ?? 0}, Slettet: ${body.deleted ?? 0}`);
  } catch (e) {
    console.error(e);
    setStatus("Save fejlede: " + (e?.message || e), true);
  } finally {
    saveBtn.disabled = false;
  }
}

document.getElementById("reloadBtn").onclick = loadAll;
document.getElementById("saveBtn").onclick = saveAll;

loadAll();
