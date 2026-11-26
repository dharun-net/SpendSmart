const STORAGE_KEY = "spendsmart_expenses_v1";
const BUDGET_KEY = "spendsmart_budget_v1";
const categories = {
  Food: { icon: "🍜", color: "#8b79f6" },
  Transportation: { icon: "🚌", color: "#5c9bf5" },
  Education: { icon: "📚", color: "#27b98a" },
  Shopping: { icon: "🛍️", color: "#f3a34b" },
  Entertainment: { icon: "🎧", color: "#ed7d9a" },
  Others: { icon: "✦", color: "#9aa4b8" }
};
let expenses = loadExpenses();
let budget = Number(localStorage.getItem(BUDGET_KEY)) || 5000;
let chart = null;

const $ = (id) => document.getElementById(id);
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
function loadExpenses() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  localStorage.setItem(BUDGET_KEY, String(budget));
}
function currentMonthExpenses() {
  const now = new Date();
  return expenses.filter(e => {
    const d = new Date(`${e.date}T12:00:00`);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
}
function render() {
  const monthItems = currentMonthExpenses();
  const total = monthItems.reduce((sum, e) => sum + Number(e.amount), 0);
  const remaining = budget - total;
  const percent = budget > 0 ? Math.min((total / budget) * 100, 100) : 0;
  $("budgetValue").textContent = money(budget);
  $("spentValue").textContent = money(total);
  $("remainingValue").textContent = money(remaining);
  $("remainingValue").style.color = remaining < 0 ? "#e16b75" : "";
  $("countValue").textContent = monthItems.length;
  $("remainingHint").textContent = remaining < 0 ? "Over your budget" : "Available to spend";
  $("budgetPercent").textContent = `${Math.round(percent)}%`;
  $("ringPercent").textContent = `${Math.round(percent)}%`;
  $("budgetProgress").style.width = `${percent}%`;
  $("budgetRing").style.background = `conic-gradient(${total > budget ? "#e16b75" : "#705cf6"} ${percent * 3.6}deg, #eceaf8 0deg)`;
  $("budgetMessage").textContent = total === 0 ? "Add your expenses to see how you're doing against your budget." :
    total > budget ? `You've exceeded your budget by ${money(total - budget)}. Review your spending.` :
    percent >= 80 ? `You're getting close to your limit. ${money(remaining)} left to spend.` :
    `You have ${money(remaining)} left. Nice work keeping track!`;
  renderTransactions();
  renderChart(monthItems);
  renderInsight(total, remaining, percent, monthItems);
}
function renderTransactions() {
  const rows = $("transactionRows");
  const sorted = [...expenses].sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id).slice(0,7);
  if (!sorted.length) {
    rows.innerHTML = '<tr class="empty-row"><td colspan="5">No expenses yet. Add your first one above!</td></tr>';
    return;
  }
  rows.innerHTML = sorted.map(e => {
    const cat = categories[e.category] || categories.Others;
    const date = new Date(`${e.date}T12:00:00`).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
    return `<tr>
      <td><div class="transaction-name"><span class="category-icon">${cat.icon}</span>${escapeHTML(e.description)}</div></td>
      <td>${escapeHTML(e.category)}</td><td>${date}</td>
      <td class="amount">${money(Number(e.amount))}</td>
      <td><button class="delete-btn" data-delete="${e.id}" aria-label="Delete ${escapeHTML(e.description)}" title="Delete">×</button></td>
    </tr>`;
  }).join("");
}
function renderChart(items) {
  const totals = {};
  items.forEach(e => totals[e.category] = (totals[e.category] || 0) + Number(e.amount));
  const labels = Object.keys(totals);
  $("chartEmpty").style.display = labels.length ? "none" : "grid";
  $("chartLegend").innerHTML = labels.map(label => `<span class="legend-item"><i class="legend-dot" style="background:${categories[label]?.color || "#9aa4b8"}"></i>${label} <b>${money(totals[label])}</b></span>`).join("");
  if (chart) chart.destroy();
  if (!labels.length || !window.Chart) return;
  chart = new Chart($("expenseChart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: labels.map(k => totals[k]), backgroundColor: labels.map(k => categories[k]?.color || "#9aa4b8"), borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "70%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${money(ctx.raw)}` } } } }
  });
}
function renderInsight(total, remaining, percent, items) {
  if (!items.length) {
    $("insightTitle").textContent = "Your journey starts here";
    $("insightText").textContent = "Add your first expense and SpendSmart will help you understand your spending habits.";
  } else if (remaining < 0) {
    $("insightTitle").textContent = "Budget exceeded";
    $("insightText").textContent = `You're ${money(Math.abs(remaining))} over your monthly budget. Check your recent transactions and plan your next spend.`;
  } else if (percent >= 80) {
    $("insightTitle").textContent = "Take a little pause";
    $("insightText").textContent = `You've used ${Math.round(percent)}% of your budget. Try to keep the remaining ${money(remaining)} for essentials.`;
  } else {
    const biggest = Object.entries(items.reduce((a,e) => (a[e.category]=(a[e.category]||0)+Number(e.amount),a),{})).sort((a,b)=>b[1]-a[1])[0];
    $("insightTitle").textContent = "You're building a good habit";
    $("insightText").textContent = biggest ? `${biggest[0]} is your biggest spending category so far at ${money(biggest[1])}. Keep tracking to spot patterns.` : "Keep recording your expenses to discover your spending patterns.";
  }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function openModal() {
  $("expenseModal").classList.add("show");
  $("expenseModal").setAttribute("aria-hidden","false");
  $("dateInput").value = todayISO();
  $("amountInput").focus();
}
function closeModal() {
  $("expenseModal").classList.remove("show");
  $("expenseModal").setAttribute("aria-hidden","true");
  $("expenseForm").reset();
  $("formError").textContent = "";
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2400);
}

$("todayLabel").textContent = new Date().toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"numeric" });
$("openExpenseBtn").addEventListener("click", openModal);
$("closeModalBtn").addEventListener("click", closeModal);
$("expenseModal").addEventListener("click", e => { if (e.target === $("expenseModal")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
$("expenseForm").addEventListener("submit", e => {
  e.preventDefault();
  const amount = Number($("amountInput").value);
  const date = $("dateInput").value;
  const description = $("descriptionInput").value.trim();
  if (!Number.isFinite(amount) || amount <= 0 || !date || !description) {
    $("formError").textContent = "Please enter a valid amount, date and description.";
    return;
  }
  expenses.push({ id: Date.now(), amount, category: $("categoryInput").value, date, description });
  save(); render(); closeModal(); toast("Expense saved successfully!");
});
$("transactionRows").addEventListener("click", e => {
  const button = e.target.closest("[data-delete]");
  if (!button) return;
  const id = Number(button.dataset.delete);
  expenses = expenses.filter(item => item.id !== id);
  save(); render(); toast("Transaction deleted.");
});
$("editBudgetBtn").addEventListener("click", () => {
  const answer = prompt("Enter your monthly budget in rupees:", String(budget));
  if (answer === null) return;
  const next = Number(answer);
  if (!Number.isFinite(next) || next <= 0) { toast("Please enter a budget greater than ₹0."); return; }
  budget = next; save(); render(); toast("Monthly budget updated.");
});
$("viewAllBtn").addEventListener("click", () => {
  $("transactions").scrollIntoView({ behavior:"smooth" });
  toast(`Showing your ${expenses.length} saved transaction${expenses.length === 1 ? "" : "s"} (latest 7 displayed).`);
});
$("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click", () => $("sidebar").classList.remove("open")));
render();
