import { listQuestions, createSurvey } from "./api.js";

const elLoading = document.getElementById("loading");
const elList = document.getElementById("list");
const elErr = document.getElementById("err");
const elResult = document.getElementById("result");
const elLinkOut = document.getElementById("linkOut");
const elOpenBtn = document.getElementById("openBtn");

const expiresAt = document.getElementById("expiresAt");
const templateVersion = document.getElementById("templateVersion");

document.getElementById("reloadBtn").addEventListener("click", load);
document.getElementById("createBtn").addEventListener("click", onCreate);

document.getElementById("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText(elLinkOut.value);
  alert("Link kopieret.");
});

async function load() {
  elErr.style.display = "none";
  elResult.style.display = "none";
  elLoading.style.display = "block";
  elList.innerHTML = "";

  try {
    const questions = await listQuestions();

    // grupper efter ich_group (valg)
    const groups = new Map();
    for (const q of questions) {
      const g = q.group ?? "Uden gruppe";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(q);
    }

    for (const [g, qs] of groups.entries()) {
      const wrap = document.createElement("div");
      wrap.style.margin = "12px 0";

      const h = document.createElement("h3");
      h.textContent = g;
      wrap.appendChild(h);

      const tbl = document.createElement("div");
      tbl.style.display = "grid";
      tbl.style.gridTemplateColumns = "48px 90px 1fr 160px 90px";
      tbl.style.gap = "8px";
      tbl.style.alignItems = "center";

      // header
      tbl.appendChild(cell("✓", true));
      tbl.appendChild(cell("#", true));
      tbl.appendChild(cell("Tekst", true));
      tbl.appendChild(cell("Type", true));
      tbl.appendChild(cell("Required", true));

      // rows (sort på ich_number hvis den findes)
      qs.sort((a, b) => Number(a.number ?? 0) - Number(b.number ?? 0));

      for (const q of qs) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "qpick";
        cb.dataset.id = q.id;
        cb.checked = true;

        tbl.appendChild(cb);
        tbl.appendChild(cell(String(q.number ?? "")));
        tbl.appendChild(cell(q.text ?? ""));
        tbl.appendChild(cell(q.answertype ?? ""));
        tbl.appendChild(cell(q.isrequired ? "Ja" : "Nej"));
      }

      wrap.appendChild(tbl);
      elList.appendChild(wrap);
    }
  } catch (e) {
    showErr(e);
  } finally {
    elLoading.style.display = "none";
  }
}

function cell(text, isHeader = false) {
  const d = document.createElement("div");
  d.textContent = text;
  if (isHeader) d.style.fontWeight = "700";
  return d;
}

async function onCreate() {
  elErr.style.display = "none";
  elResult.style.display = "none";

  const selected = [...document.querySelectorAll(".qpick:checked")]
    .map(x => x.dataset.id);

  if (selected.length === 0) {
    alert("Vælg mindst ét spørgsmål.");
    return;
  }

  try {
    // datetime-local → ISO hvis udfyldt
    const exp = expiresAt.value ? new Date(expiresAt.value).toISOString() : null;

    const res = await createSurvey({
      questionIds: selected,
      expiresAt: exp,
      templateVersion: Number(templateVersion.value || 1)
    });

    // res: { token }
    const origin = location.origin;
    const link = `${origin}/kundeinfo.html?t=${encodeURIComponent(res.token)}`;

    elLinkOut.value = link;
    elOpenBtn.href = link;
    elResult.style.display = "block";
  } catch (e) {
    showErr(e);
  }
}

function showErr(e) {
  console.error(e);
  elErr.style.display = "block";
  elErr.innerHTML = `<b>Fejl:</b> ${escapeHtml(e?.message || String(e))}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

load();
