/* SpendSmart AI - Smart Demo AI (rule-based logic, NOT a generative model).
   Reads the same saved data as the dashboard on every question, so it is always up to date. */
(function () {
  "use strict";

  var EXP_KEY = "spendsmart_expenses_v1";
  var BUD_KEY = "spendsmart_budget_v1";
  /* To connect a real AI later: put your backend URL here (never a secret key).
     If it fails, the built-in logic below is used automatically. */
  var AI_API_URL = "";
  var memory = { waiting: false };

  /* ---------- reading the dashboard data ---------- */
  function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }

  function stats() {
    var all = [], now = new Date(), total = 0, cats = {};
    try { all = JSON.parse(localStorage.getItem(EXP_KEY) || "[]"); if (!Array.isArray(all)) all = []; } catch (e) { all = []; }
    var budget = Number(localStorage.getItem(BUD_KEY)) || 5000;
    var list = all.filter(function (e) {
      var d = new Date(e.date + "T12:00:00");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    list.forEach(function (e) {
      var a = Number(e.amount) || 0, c = e.category || "Others";
      total += a; cats[c] = (cats[c] || 0) + a;
    });
    var sorted = Object.keys(cats).map(function (c) { return [c, cats[c]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return { count: list.length, total: total, cats: sorted, top: sorted[0], budget: budget,
             left: budget - total, day: now.getDate(), days: days };
  }

  /* ---------- helpers ---------- */
  function has(t, words) { return words.some(function (w) { return t.indexOf(w) !== -1; }); }
  function amountIn(t) {
    t = t.toLowerCase().replace(/,/g, "");
    var m = t.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac)?/);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (m[2] === "k" || m[2] === "thousand") n *= 1000;
    if (m[2] === "lakh" || m[2] === "lakhs" || m[2] === "lac") n *= 100000;
    return n;
  }
  var NO_DATA = "I can't see any expenses for this month yet. Click **Add expense** on the dashboard, then ask me again.";

  /* ---------- the "brain": one function per skill ---------- */
  function planBudget(income, t) {
    var e = 50, w = 30, s = 20, note = "the 50/30/20 rule";
    if (has(t, ["rent", "emi", "loan", "hostel", "fees"])) { e = 60; w = 25; s = 15; note = "adjusted to 60/25/15 for your fixed costs"; }
    else if (has(t, ["save more", "aggressive", "goal"])) { e = 50; w = 20; s = 30; note = "adjusted to 50/20/30 to boost savings"; }
    var out = "**Smart budget for " + inr(income) + " a month** (" + note + ")\n\n" +
      "• Needs (food, travel, education): **" + inr(income * e / 100) + "** (" + e + "%)\n" +
      "• Wants (shopping, fun): **" + inr(income * w / 100) + "** (" + w + "%)\n" +
      "• Savings: **" + inr(income * s / 100) + "** (" + s + "%)\n\n" +
      "Weekly limit for wants: **" + inr(income * w / 100 / 4) + "**.";
    var st = stats();
    if (st.total > 0) out += "\n\nSo far this month you have spent " + inr(st.total) + ". " +
      (st.total > income * (e + w) / 100 ? "That is above this plan's spending limit, so it is time to trim." : "That fits inside this plan. Nice!");
    return out + "\n\nWant to save a specific amount? Ask: \"How can I save ₹2,000?\"";
  }

  function analyze() {
    var st = stats(); if (!st.count) return NO_DATA;
    var pct = Math.round(st.total / st.budget * 100);
    var out = "**Spending analysis (this month)**\n\n• Total spent: **" + inr(st.total) + "** across " + st.count + " transactions\n" +
      "• Monthly budget: **" + inr(st.budget) + "** (" + pct + "% used)\n• Remaining: **" + inr(st.left) + "**\n";
    out += st.left < 0 ? "• ⚠️ You are **over budget by " + inr(-st.left) + "**.\n" : "• ✅ You are within your budget.\n";
    var projected = st.total / st.day * st.days;
    out += "• At this pace you will spend about **" + inr(projected) + "** by month end" + (projected > st.budget ? " (that is over your budget)." : ".") + "\n";
    out += "\n**By category**\n" + st.cats.map(function (c) { return "• " + c[0] + ": " + inr(c[1]) + " (" + Math.round(c[1] / st.total * 100) + "%)"; }).join("\n");
    out += "\n\nHighest spending: **" + st.top[0] + "** (" + inr(st.top[1]) + ").";
    var wants = st.cats.filter(function (c) { return ["Shopping", "Entertainment", "Others", "Food"].indexOf(c[0]) > -1; });
    if (wants.length) out += " Easiest place to cut back: **" + wants[0][0] + "**.";
    return out;
  }

  function remaining() {
    var st = stats();
    var out = "**Budget remaining**\n\n" + inr(st.budget) + " budget − " + inr(st.total) + " spent = **" + inr(st.left) + "**";
    if (st.left < 0) return out + "\n\n⚠️ You are over budget by " + inr(-st.left) + ".";
    var daysLeft = Math.max(st.days - st.day + 1, 1);
    return out + "\n\nThat is about **" + inr(st.left / daysLeft) + " per day** for the remaining " + daysLeft + " days of this month.";
  }

  function saveTarget(t) {
    var st = stats();
    var target = amountIn(t) >= 100 ? amountIn(t) : Math.max(500, Math.round(st.budget * 0.1 / 100) * 100);
    if (!st.count) return "**Saving " + inr(target) + " more**\n\n• Set aside " + inr(target / 4) + " a week, about " + inr(target / 30) + " a day\n• Move it to savings on day 1, before you spend\n• Add your expenses and I can point at the exact categories to trim.";
    var cut = { Shopping: 0.4, Entertainment: 0.4, Others: 0.3, Food: 0.2, Transportation: 0.1, Education: 0 };
    var plan = [], got = 0;
    st.cats.forEach(function (c) {
      var r = cut[c[0]] != null ? cut[c[0]] : 0.2, amt = Math.min(c[1] * r, target - got);
      if (amt >= 20) { plan.push([c[0], amt, Math.round(r * 100)]); got += amt; }
    });
    var out = "**How to save an extra " + inr(target) + " next month**\n\nFrom your spending of " + inr(st.total) + " this month:\n\n" +
      plan.map(function (p) { return "• Trim **" + p[0] + "** by about " + inr(p[1]) + " (" + p[2] + "% less)"; }).join("\n");
    if (got < target - 1) out += "\n• Put aside **" + inr(target - got) + "** more as a fixed saving: " + inr((target - got) / 4) + " each week.";
    return out + "\n\nTip: keep a weekly spending limit of about " + inr(Math.max(st.budget - target, 0) / 4) + ".";
  }

  function tips() {
    var st = stats(), out = "**Smart saving tips**\n\n";
    if (st.top) out += "• Your biggest category is **" + st.top[0] + "** (" + inr(st.top[1]) + "). Set a cap for it first.\n";
    if (st.count && st.total > st.budget * 0.8) out += "• You have used " + Math.round(st.total / st.budget * 100) + "% of your budget. Pause non-essential spending.\n";
    return out + "• Save a fixed 20% of any money you receive, on the same day\n• Use weekly limits instead of monthly ones\n• Write down small daily spends like snacks and tea\n• Wait 24 hours before any non-essential purchase\n• Share subscriptions and use student discounts";
  }

  function ruleReply(raw) {
    var t = raw.toLowerCase().trim(), amt = amountIn(t);
    if (memory.waiting && amt > 0 && !has(t, ["analy", "remaining", "left"])) { memory.waiting = false; return planBudget(amt, t); }
    if (/^(hi|hello|hey|hii|good (morning|evening|afternoon))\b/.test(t)) return "Hi! I am **SpendSmart AI**. I can plan a budget, analyze your spending, check what is left and help you save. What would you like to do?";
    if (has(t, ["thank"])) return "Happy to help! Ask me anything else about your money.";
    if (has(t, ["analy", "spending", "spent", "breakdown", "overview"])) return analyze();
    if (has(t, ["remaining", "left", "how much budget", "balance"])) return remaining();
    if (has(t, ["save", "saving"]) && amt >= 100) return saveTarget(t);
    if (has(t, ["budget", "plan", "income", "salary", "pocket money", "allowance"]) && amt >= 100) return planBudget(amt, t);
    if (has(t, ["budget", "plan"])) { memory.waiting = true; return "Sure! What is your monthly income or pocket money? For example: \"₹20,000\"."; }
    if (has(t, ["tip"])) return tips();
    if (has(t, ["save", "saving", "reduce", "cut", "advice"])) return saveTarget(t);
    if (has(t, ["help", "what can you do"])) return "Try asking:\n• \"My monthly income is ₹25,000. Create a budget.\"\n• \"Analyze my spending.\"\n• \"How can I save ₹2,000 next month?\"\n• \"How much budget is remaining?\"\n• \"Give me smart saving tips.\"";
    return "I did not quite get that. I can help with **budget plans**, **spending analysis**, **remaining budget** and **saving tips**. Try one of the buttons below.";
  }

  async function reply(text) {
    if (AI_API_URL) {
      try {
        var r = await fetch(AI_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, summary: stats() }) });
        if (r.ok) { var j = await r.json(); if (j.reply) return j.reply; }
      } catch (e) { /* use built-in logic */ }
    }
    return ruleReply(text);
  }

  /* ---------- the chat screen ---------- */
  var chat = document.getElementById("aiChat");
  var input = document.getElementById("aiInput");
  if (!chat || !input) return;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
  function add(text, who) {
    var d = document.createElement("div");
    d.className = "ai-msg " + who; d.innerHTML = fmt(text);
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  async function send(text) {
    text = text.trim(); if (!text) return;
    add(text, "user"); input.value = "";
    var ty = document.createElement("div");
    ty.className = "ai-msg bot ai-typing"; ty.innerHTML = "<span></span><span></span><span></span>";
    chat.appendChild(ty); chat.scrollTop = chat.scrollHeight;
    var ans = await reply(text);
    await new Promise(function (r) { setTimeout(r, 650); });
    ty.remove(); add(ans, "bot");
  }

  document.getElementById("aiForm").addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  ["Analyze my spending", "Create a budget for ₹20,000", "How can I save money?", "How much budget is remaining?", "Give me smart saving tips"].forEach(function (q) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "ai-chip"; b.textContent = q;
    b.addEventListener("click", function () { send(q); });
    document.getElementById("aiChips").appendChild(b);
  });
  add("Hi! I am **SpendSmart AI**, your personal financial assistant. ✦\nI use your real dashboard data to plan budgets, analyze spending and find ways to save. Tap a question below or type your own.", "bot");
})();
