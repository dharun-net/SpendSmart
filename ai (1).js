/* SpendSmart AI v2 - Smart Demo AI (rule-based reasoning on your real data, NOT a generative model).
   Understands categories, amounts, time words and follow-ups, and calculates from your dashboard data. */
(function () {
  "use strict";
  var EXP_KEY = "spendsmart_expenses_v1", BUD_KEY = "spendsmart_budget_v1";
  var AI_API_URL = ""; /* later: your own backend URL (never a secret key). Falls back to the logic below. */
  var ctx = { last: null, cat: null, waiting: false };

  var CATS = {
    Food: ["food", "eat", "eating", "lunch", "dinner", "breakfast", "snack", "snacks", "canteen", "tea", "coffee", "meal", "meals", "restaurant", "swiggy", "zomato"],
    Transportation: ["transport", "transportation", "travel", "bus", "auto", "cab", "uber", "ola", "petrol", "metro", "train", "commute"],
    Education: ["education", "study", "book", "books", "course", "fees", "exam", "stationery", "tuition"],
    Shopping: ["shopping", "shop", "clothes", "dress", "shoes", "amazon", "myntra"],
    Entertainment: ["entertainment", "movie", "movies", "game", "games", "netflix", "music", "party", "fun", "outing"],
    Others: ["others", "misc", "miscellaneous"]
  };
  var BENCH = { Food: 0.30, Transportation: 0.15, Education: 0.20, Shopping: 0.10, Entertainment: 0.10, Others: 0.10 };
  var CAT_TIPS = {
    Food: "carry lunch from home 3 days a week and limit eating out to twice a week",
    Transportation: "get a monthly pass and share rides with friends",
    Education: "buy second-hand books and use the library or free online notes",
    Shopping: "use a 48-hour rule: wait two days before buying anything non-essential",
    Entertainment: "split subscriptions with friends and pick free campus events",
    Others: "review these entries and give each one a proper category"
  };

  function inr(n) { return "₹" + Math.round(n).toLocaleString("en-IN"); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function has(t, w) { return w.some(function (x) { return t.indexOf(x) !== -1; }); }
  function amountIn(t) {
    t = t.toLowerCase().replace(/,/g, "");
    var m = t.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac)?/);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (m[2] === "k" || m[2] === "thousand") n *= 1000;
    if (m[2] === "lakh" || m[2] === "lakhs" || m[2] === "lac") n *= 100000;
    return n;
  }
  function catIn(t) {
    var k, i, re;
    for (k in CATS) for (i = 0; i < CATS[k].length; i++) {
      re = new RegExp("\\b" + CATS[k][i] + "\\b"); if (re.test(t)) return k;
    }
    return null;
  }
  function pctIn(t) { var m = t.match(/(\d+)\s*(%|percent)/); return m ? Number(m[1]) : 0; }

  /* ---------- data ---------- */
  function S() {
    var all = [], now = new Date();
    try { all = JSON.parse(localStorage.getItem(EXP_KEY) || "[]"); if (!Array.isArray(all)) all = []; } catch (e) { all = []; }
    var items = all.map(function (e) {
      return { desc: e.description || "Expense", amount: Number(e.amount) || 0, category: e.category || "Others", date: new Date(e.date + "T12:00:00") };
    }).filter(function (e) { return !isNaN(e.date); });
    var month = items.filter(function (e) { return e.date.getMonth() === now.getMonth() && e.date.getFullYear() === now.getFullYear(); });
    var total = 0, cats = {};
    month.forEach(function (e) { total += e.amount; cats[e.category] = (cats[e.category] || 0) + e.amount; });
    var sorted = Object.keys(cats).map(function (c) { return [c, cats[c]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var budget = Number(localStorage.getItem(BUD_KEY)) || 5000;
    var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return {
      month: month, count: month.length, total: total, cats: cats, sorted: sorted, top: sorted[0], budget: budget, left: budget - total,
      day: now.getDate(), days: days, daysLeft: Math.max(days - now.getDate() + 1, 1),
      today: month.filter(function (e) { return e.date.toDateString() === now.toDateString(); }),
      week: items.filter(function (e) { var d = (now - e.date) / 864e5; return d >= -1 && d <= 7; })
    };
  }
  function sum(l) { return l.reduce(function (a, e) { return a + e.amount; }, 0); }
  function line(e) { return "• " + e.desc + " (" + e.category + "): " + inr(e.amount); }
  var NO_DATA = "I can't see any expenses for this month yet. Click **Add expense** on the dashboard, then ask me again.";

  /* ---------- skills ---------- */
  function planBudget(income, t) {
    var e = 50, w = 30, s = 20, note = "the 50/30/20 rule";
    if (has(t, ["rent", "emi", "loan", "hostel", "fees"])) { e = 60; w = 25; s = 15; note = "adjusted to 60/25/15 for your fixed costs"; }
    else if (has(t, ["save more", "aggressive", "goal"])) { e = 50; w = 20; s = 30; note = "adjusted to 50/20/30 to boost savings"; }
    var st = S();
    var out = "**Smart budget for " + inr(income) + " a month** (" + note + ")\n\n" +
      "• Needs (food, travel, education): **" + inr(income * e / 100) + "** (" + e + "%)\n" +
      "• Wants (shopping, fun): **" + inr(income * w / 100) + "** (" + w + "%)\n" +
      "• Savings: **" + inr(income * s / 100) + "** (" + s + "%)\n\nWeekly limit for wants: **" + inr(income * w / 100 / 4) + "**.";
    if (st.count) out += "\n\nYour dashboard budget is " + inr(st.budget) + (income > st.budget ? ", well below this income, so there is room to save the difference." : ", which is higher than this income can support. Consider lowering it.") +
      " You have spent " + inr(st.total) + " this month.";
    return out;
  }

  function analyze() {
    var s = S(); if (!s.count) return NO_DATA;
    var pct = Math.round(s.total / s.budget * 100), proj = s.total / s.day * s.days;
    var out = pick(["Here is your spending picture.", "Let me break it down for you.", "I went through your numbers."]) + "\n\n" +
      "• Spent: **" + inr(s.total) + "** across " + s.count + " transactions (" + pct + "% of " + inr(s.budget) + ")\n• Remaining: **" + inr(s.left) + "**\n";
    out += s.left < 0 ? "• ⚠️ **Over budget by " + inr(-s.left) + "**\n" : "• ✅ Within budget\n";
    out += "• Month-end forecast: about **" + inr(proj) + "**" + (proj > s.budget ? " (over budget by " + inr(proj - s.budget) + " at this pace)" : " (on track)") + "\n\n**By category**\n" +
      s.sorted.map(function (c) { return "• " + c[0] + ": " + inr(c[1]) + " (" + Math.round(c[1] / s.total * 100) + "%)"; }).join("\n");
    out += "\n\n**Insight:** **" + s.top[0] + "** is your biggest category. To trim it, " + CAT_TIPS[s.top[0]] + ".";
    return out;
  }

  function health() {
    var s = S(); if (!s.count) return NO_DATA;
    var pace = (s.total / s.budget) / (s.day / s.days), score, why = [];
    score = s.left < 0 ? 25 : Math.round(Math.max(30, Math.min(98, 100 - (pace - 0.6) * 55)));
    why.push(pace <= 1 ? "Your spending pace is on or below your budget pace." : "You are spending " + Math.round((pace - 1) * 100) + "% faster than your budget allows.");
    if (s.count >= 3 && s.top[1] / s.total > 0.6) { score -= 8; why.push("**" + s.top[0] + "** takes " + Math.round(s.top[1] / s.total * 100) + "% of everything. Spread it out."); }
    var label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Needs attention" : "At risk";
    return "**Financial health score: " + score + "/100 (" + label + ")**\n\n• " + why.join("\n• ") + "\n• You have " + inr(s.left) + " left for " + s.daysLeft + " days (about " + inr(Math.max(s.left, 0) / s.daysLeft) + " a day).";
  }

  function remaining() {
    var s = S(), out = pick(["Here is where you stand.", "Quick check on your budget."]) + "\n\n" + inr(s.budget) + " budget − " + inr(s.total) + " spent = **" + inr(s.left) + "**";
    if (s.left < 0) return out + "\n\n⚠️ You are over budget by " + inr(-s.left) + ". Pause non-essential spending.";
    return out + "\n\nThat is about **" + inr(s.left / s.daysLeft) + " a day** (" + inr(s.left / s.daysLeft * 7) + " a week) for the next " + s.daysLeft + " days.";
  }

  function afford(amt) {
    var s = S(), after = s.left - amt, dayNow = Math.max(s.left, 0) / s.daysLeft, dayAfter = Math.max(after, 0) / s.daysLeft;
    if (amt > s.left) return "**Not this month.** " + inr(amt) + " is more than the " + inr(Math.max(s.left, 0)) + " you have left. Waiting for next month or saving " + inr(amt / 4) + " a week would get you there.";
    var share = Math.round(amt / s.left * 100);
    return (share > 50 ? "**Possible, but it is a big bite.**" : "**Yes, you can afford it.**") + "\n\n• It uses " + share + "% of your remaining " + inr(s.left) + "\n• You would have **" + inr(after) + "** left\n• Your daily allowance drops from " + inr(dayNow) + " to **" + inr(dayAfter) + "**" +
      (share > 50 ? "\n\nIf it is not essential, consider waiting a few days." : "");
  }

  function catQuery(cat) {
    var s = S(), v = s.cats[cat] || 0, items = s.month.filter(function (e) { return e.category === cat; });
    if (!v) return "You have not spent anything on **" + cat + "** this month. 🎉";
    var share = Math.round(v / s.total * 100), bench = BENCH[cat] * s.budget;
    var big = items.slice().sort(function (a, b) { return b.amount - a.amount; })[0];
    return "**" + cat + " this month: " + inr(v) + "**\n\n• " + share + "% of your total spending, " + items.length + " transaction" + (items.length > 1 ? "s" : "") + "\n• Average: " + inr(v / items.length) + "\n• Largest: " + big.desc + " (" + inr(big.amount) + ")\n• A typical student budget gives " + cat + " about " + inr(bench) + ", so you are " + (v > bench ? "**above** that by " + inr(v - bench) : "**within** that") + ".";
  }

  function whatIf(cat, pct, t) {
    var s = S(); if (!s.count) return NO_DATA;
    cat = cat || (s.top && s.top[0]); pct = pct || 25;
    var v = s.cats[cat] || 0, saved = v * pct / 100;
    if (!v) return "You have no **" + cat + "** spending to cut this month.";
    return "**If you cut " + cat + " by " + pct + "%:**\n\n• You save **" + inr(saved) + "** a month\n• That is **" + inr(saved * 12) + "** over a year\n• Your remaining budget would be " + inr(s.left + saved) + "\n\nTip: to do it, " + CAT_TIPS[cat] + ".";
  }

  function saveTarget(t) {
    var s = S(), a = amountIn(t), target = a >= 100 ? a : Math.max(500, Math.round(s.budget * 0.1 / 100) * 100);
    if (!s.count) return "**Saving " + inr(target) + " more**\n\n• Set aside " + inr(target / 4) + " a week or " + inr(target / 30) + " a day\n• Move it to savings on day 1, before you spend\n• Add your expenses so I can point at exact categories to trim.";
    var cut = { Shopping: 0.4, Entertainment: 0.4, Others: 0.3, Food: 0.2, Transportation: 0.1, Education: 0 }, plan = [], got = 0;
    s.sorted.forEach(function (c) {
      var r = cut[c[0]] != null ? cut[c[0]] : 0.2, x = Math.min(c[1] * r, target - got);
      if (x >= 20) { plan.push("• Trim **" + c[0] + "** by about " + inr(x) + " (" + Math.round(r * 100) + "% less): " + CAT_TIPS[c[0]]); got += x; }
    });
    var out = "**Plan to save an extra " + inr(target) + " next month**\n\nBased on your " + inr(s.total) + " of spending:\n\n" + plan.join("\n");
    if (got < target - 1) out += "\n• Auto-save **" + inr(target - got) + "** more: " + inr((target - got) / 4) + " each week.";
    else out += "\n\nThis adds up to **" + inr(got) + "**, which reaches your goal.";
    return out;
  }

  function topExpense() {
    var s = S(); if (!s.count) return NO_DATA;
    var big = s.month.slice().sort(function (a, b) { return b.amount - a.amount; })[0];
    return "**Biggest single expense:** " + big.desc + " (" + big.category + ") at **" + inr(big.amount) + "**.\n**Biggest category:** " + s.top[0] + " at **" + inr(s.top[1]) + "** (" + Math.round(s.top[1] / s.total * 100) + "% of spending).";
  }
  function period(t) {
    var s = S(), wk = has(t, ["week", "7 days"]), l = wk ? s.week : s.today;
    if (!l.length) return "You have no expenses recorded " + (wk ? "in the last 7 days." : "today. Nice and quiet!");
    return "**" + (wk ? "Last 7 days" : "Today") + ": " + inr(sum(l)) + "** across " + l.length + " transaction" + (l.length > 1 ? "s" : "") + "\n\n" + l.slice(0, 6).map(line).join("\n");
  }
  function daily() {
    var s = S(); if (s.left <= 0) return "You have already used your whole budget, so your safe daily limit is ₹0 until next month.";
    return "To stay within budget, spend at most **" + inr(s.left / s.daysLeft) + " per day** (**" + inr(s.left / s.daysLeft * 7) + " per week**) for the next " + s.daysLeft + " days.";
  }
  function recent() {
    var s = S(); if (!s.count) return NO_DATA;
    return "**Your latest transactions**\n\n" + s.month.slice().sort(function (a, b) { return b.date - a.date; }).slice(0, 5).map(line).join("\n");
  }
  function forecast() {
    var s = S(); if (!s.count) return NO_DATA;
    var p = s.total / s.day * s.days;
    return "At your current pace (" + inr(s.total / s.day) + " a day) you will spend about **" + inr(p) + "** by the end of the month, " + (p > s.budget ? "which is **" + inr(p - s.budget) + " over** your budget. Cut about " + inr((p - s.budget) / s.daysLeft) + " a day to stay on track." : "which is " + inr(s.budget - p) + " **under** your budget. Great!");
  }
  function tips() {
    var s = S(), out = "**Smart saving tips**\n\n";
    if (s.count && s.top) out += "• Your biggest category is **" + s.top[0] + "**: " + CAT_TIPS[s.top[0]] + "\n";
    if (s.count && s.total > s.budget * 0.8) out += "• You have used " + Math.round(s.total / s.budget * 100) + "% of your budget, so pause non-essentials.\n";
    return out + "• Save 20% of any money you receive on the same day\n• Use weekly limits instead of monthly ones\n• Record small daily spends like tea and snacks\n• Wait 24 hours before non-essential purchases";
  }
  function more() {
    var s = S();
    if (ctx.last === "health" || ctx.last === "analyze") return s.count ? "To improve this, start with **" + s.top[0] + "**: " + CAT_TIPS[s.top[0]] + ". Then set a weekly limit of " + inr(Math.max(s.left, 0) / s.daysLeft * 7) + ". Want me to calculate savings if you cut it by 25%?" : NO_DATA;
    if (ctx.last === "save") return "A simple extra step: pick one no-spend day each week. It usually saves " + inr(Math.max(s.budget * 0.03, 100)) + " a month without feeling restrictive.";
    return tips();
  }

  var DEFAULT_CHIPS = ["Analyze my spending", "Create a budget for ₹20,000", "How can I save money?", "How much budget is remaining?", "Give me smart saving tips"];
  var NEXT = {
    analyze: ["How is my financial health?", "How can I save ₹2,000?", "Where does my money go?"],
    health: ["How can I improve it?", "Forecast my month-end spending", "What can I spend per day?"],
    budget: ["Analyze my spending", "How can I save ₹2,000?", "How much budget is remaining?"],
    remaining: ["What can I spend per day?", "Forecast my month-end spending", "Can I afford ₹500?"],
    save: ["What if I cut shopping by 30%?", "Analyze my spending", "Give me smart saving tips"],
    cat: ["What if I cut it by 25%?", "Analyze my spending", "What was my biggest expense?"],
    other: DEFAULT_CHIPS.slice(0, 3)
  };

  /* ---------- understanding the question ---------- */
  function ruleReply(raw) {
    var t = raw.toLowerCase().trim(), amt = amountIn(t), cat = catIn(t), r, k = "other";
    if (ctx.waiting && amt > 0) { ctx.waiting = false; ctx.last = "budget"; return [planBudget(amt, t), "budget"]; }
    if (/^(hi|hello|hey|hii|yo|good (morning|evening|afternoon))\b/.test(t)) return [pick(["Hi there!", "Hello!", "Hey!"]) + " I am **SpendSmart AI**. Ask me to analyze your spending, plan a budget, or check if you can afford something.", "other"];
    if (has(t, ["thank"])) return ["You are welcome! I am here whenever you need a money check-in.", "other"];
    if (has(t, ["who are you", "what are you", "what can you do", "help"])) return ["I am **SpendSmart AI**, a rule-based assistant that reads your dashboard data. I can:\n• Analyze spending and score your financial health\n• Plan budgets from any income\n• Check if you can afford something\n• Answer questions like \"how much did I spend on food?\"\n• Show what-if savings and month-end forecasts", "other"];
    if (/^(yes|yeah|ok|okay|sure|more|tell me more|why|how)\??$/.test(t) || has(t, ["tell me more", "how can i improve", "explain"])) { return [more(), ctx.last || "other"]; }
    if (has(t, ["afford", "can i buy", "can i spend", "should i buy", "can i get", "worth buying"]) && amt >= 1) { ctx.last = "afford"; return [afford(amt), "remaining"]; }
    if (has(t, ["what if", "if i cut", "if i reduce", "cut down", "spend less on", "reduce my", "cut my"])) { ctx.last = "whatif"; return [whatIf(cat || ctx.cat, pctIn(t)), "save"]; }
    if (has(t, ["health", "score", "how am i doing", "on track", "overspend", "am i spending too"])) { ctx.last = "health"; return [health(), "health"]; }
    if (has(t, ["forecast", "predict", "month end", "end of the month", "end of month", "projection"])) { ctx.last = "forecast"; return [forecast(), "remaining"]; }
    if (has(t, ["biggest", "largest", "highest", "most expensive", "where does my money", "where is my money", "top expense"])) { ctx.last = "top"; return [topExpense(), "analyze"]; }
    if (has(t, ["today", "this week", "last week", "past week", "7 days"]) && has(t, ["spend", "spent", "expense", "much"])) { ctx.last = "period"; return [period(t), "analyze"]; }
    if (has(t, ["per day", "daily", "each day", "every day", "per week", "weekly limit"])) { ctx.last = "daily"; return [daily(), "remaining"]; }
    if (has(t, ["recent", "latest", "last few", "list my", "show my transactions"])) { ctx.last = "recent"; return [recent(), "analyze"]; }
    if (cat && !has(t, ["save", "saving", "budget for"])) { ctx.cat = cat; ctx.last = "cat"; return [catQuery(cat), "cat"]; }
    if (has(t, ["remaining", "left", "how much budget", "balance"])) { ctx.last = "remaining"; return [remaining(), "remaining"]; }
    if (has(t, ["analy", "spending", "spent", "breakdown", "overview", "summary", "expenses"])) { ctx.last = "analyze"; return [analyze(), "analyze"]; }
    if (has(t, ["save", "saving", "savings"]) && amt >= 100) { ctx.last = "save"; return [saveTarget(t), "save"]; }
    if (has(t, ["budget", "plan", "income", "salary", "pocket money", "allowance"]) && amt >= 100) { ctx.last = "budget"; return [planBudget(amt, t), "budget"]; }
    if (has(t, ["budget", "plan"])) { ctx.waiting = true; return ["Sure! What is your monthly income or pocket money? For example: \"₹20,000\".", "other"]; }
    if (has(t, ["tip", "advice", "suggest"])) { ctx.last = "tips"; return [tips(), "save"]; }
    if (has(t, ["save", "saving", "reduce", "cut"])) { ctx.last = "save"; return [saveTarget(t), "save"]; }
    var s = S();
    return ["I am a rule-based assistant, so I work best with money questions. I did not catch that one." + (s.count ? " Meanwhile, a quick snapshot: you have spent **" + inr(s.total) + "** of **" + inr(s.budget) + "** this month." : "") + "\n\nTry: \"How much did I spend on food?\", \"Can I afford ₹500?\" or \"What if I cut shopping by 30%?\"", "other"];
  }

  async function reply(text) {
    if (AI_API_URL) {
      try {
        var s = S(), r = await fetch(AI_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, summary: { total: s.total, budget: s.budget, left: s.left, categories: s.cats } }) });
        if (r.ok) { var j = await r.json(); if (j.reply) return [j.reply, "other"]; }
      } catch (e) { /* use built-in logic */ }
    }
    return ruleReply(text);
  }

  /* ---------- chat screen ---------- */
  var chat = document.getElementById("aiChat"), input = document.getElementById("aiInput"), chips = document.getElementById("aiChips");
  if (!chat || !input) return;
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
  function add(text, who) {
    var d = document.createElement("div"); d.className = "ai-msg " + who; d.innerHTML = fmt(text);
    chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
  }
  function setChips(list) {
    chips.innerHTML = "";
    list.forEach(function (q) {
      var b = document.createElement("button"); b.type = "button"; b.className = "ai-chip"; b.textContent = q;
      b.addEventListener("click", function () { send(q); }); chips.appendChild(b);
    });
  }
  async function send(text) {
    text = text.trim(); if (!text) return;
    add(text, "user"); input.value = "";
    var ty = document.createElement("div"); ty.className = "ai-msg bot ai-typing"; ty.innerHTML = "<span></span><span></span><span></span>";
    chat.appendChild(ty); chat.scrollTop = chat.scrollHeight;
    var res = await reply(text);
    await new Promise(function (r) { setTimeout(r, 650); });
    ty.remove(); add(res[0], "bot"); setChips(NEXT[res[1]] || NEXT.other);
  }
  document.getElementById("aiForm").addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });
  setChips(DEFAULT_CHIPS);
  add("Hi! I am **SpendSmart AI**, your personal financial assistant. ✦\nI read your real dashboard data to analyze spending, plan budgets, score your financial health and check if you can afford things. Tap a question or type your own.", "bot");
})();
