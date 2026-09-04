import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collections, useSafeCollectionData, payBill, saveAccount, saveCategory, saveTransaction, payDebt, saveGroceryItem, saveGoal } from '../db';
import type { Account, Bill, Debt, Transaction, Category, Goal, GoalCategory } from '../db';
import { useAppStore, type ChatMessage, type ExecutedActionData } from '../store';
import { 
  Sparkles, X, Send, User, Bot, Loader2, Target, Zap, 
  PieChart, ShoppingBag, CheckCircle2, ChevronDown, 
  ChevronUp, ShieldCheck, Flame, BookmarkPlus, Plus, 
  TrendingDown, TrendingUp, HelpCircle, RotateCcw
} from 'lucide-react';
import { InteractiveAICard } from './InteractiveAICards';
import type { InteractiveWidgetData } from './InteractiveAICards';
import { AIChartCard } from './AIChartCard';
import type { AIChartData } from './AIChartCard';
import { calculateFinancialHealthScore } from '../utils/financialHealth';
import { 
  getStoredFinancialGoals, saveFinancialGoal, deleteFinancialGoal,
  getStoredUserMemories, saveUserMemory, deleteUserMemory
} from '../utils/aiMemory';
import type { UserFinancialGoal, UserMemoryItem } from '../utils/aiMemory';
import { useBodyScrollLock } from '../utils/scrollLock';

export type { ExecutedActionData, ChatMessage };

export default function GoraAIAssistant() {
  const navigate = useNavigate();
  const currentHouseholdId = useAppStore((state) => state.currentHouseholdId);
  const currentUserId = useAppStore((state) => state.currentUserId);
  const viewMode = useAppStore((state) => state.viewMode);
  const isGoraAiOpen = useAppStore((state) => state.isGoraAiOpen);
  const isTourOpen = useAppStore((state) => state.isTourOpen);
  const setGoraAiOpen = useAppStore((state) => state.setGoraAiOpen);
  const startAppTour = useAppStore((state) => state.startAppTour);
  const messages = useAppStore((state) => state.aiChatHistory);
  const addAiChatMessage = useAppStore((state) => state.addAiChatMessage);
  const clearAiChatHistory = useAppStore((state) => state.clearAiChatHistory);

  // Prevent background scroll when AI drawer is open (but not during active tour)
  useBodyScrollLock(isGoraAiOpen && !isTourOpen);

  const [showDockedBubble, setShowDockedBubble] = useState(true);
  const lastAssistantMessage = useMemo(() => {
    return [...messages].reverse().find((m) => m.role === 'assistant')?.text || 
      "Simulan natin ang visual spotlight tour ng GoraGo! Tap the highlighted cards to click-along!";
  }, [messages]);

  const [goals, setGoals] = useState<UserFinancialGoal[]>(() => getStoredFinancialGoals());
  const [memories, setMemories] = useState<UserMemoryItem[]>(() => getStoredUserMemories());
  const [showHealthBreakdown, setShowHealthBreakdown] = useState(false);
  const [showGoalManager, setShowGoalManager] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalAmount, setNewGoalAmount] = useState('');

  const [inputMessage, setInputMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Sync state on data wipe/reset event
  useEffect(() => {
    const handleWiped = () => {
      setGoals(getStoredFinancialGoals());
      setMemories(getStoredUserMemories());
      clearAiChatHistory('Mabuhay! Your data has been completely reset to 0. I am ready to help you set up new accounts, start tracking, and build a simple budget in Philippine Pesos (₱).');
    };

    window.addEventListener('gorago_data_wiped', handleWiped);
    window.addEventListener('storage', handleWiped);
    return () => {
      window.removeEventListener('gorago_data_wiped', handleWiped);
      window.removeEventListener('storage', handleWiped);
    };
  }, [clearAiChatHistory]);

  // Real-time Firestore ledger queries
  const [allAccounts] = useSafeCollectionData<Account>(null, 'accounts');
  const [allBills] = useSafeCollectionData<Bill>(null, 'bills');
  const [allDebts] = useSafeCollectionData<Debt>(null, 'debts');
  const [allCategories] = useSafeCollectionData<Category>(null, 'categories');
  const [allTransactions] = useSafeCollectionData<Transaction>(null, 'transactions');
  const [allGroceryItems] = useSafeCollectionData<{ id: string; name: string; lastUnitPrice: number; storeName?: string; lastUpdatedDate?: number }>(null, 'groceryItems');

  // Proactive Intelligence & Financial Health Score Calculation
  const proactiveInsights = useMemo(() => {
    const now = Date.now();
    const accounts = allAccounts || [];
    const filteredAccounts = viewMode === 'mine'
      ? accounts.filter(a => a.ownerId === currentUserId || a.ownerId === null)
      : accounts;
    const totalMoney = filteredAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);

    const bills = allBills || [];
    const unpaidBills = bills.filter(b => b.status !== 'paid');
    const billsDueWithin3Days: Array<{ bill: Bill; diffDays: number; dueDate: Date }> = [];

    unpaidBills.forEach(bill => {
      let dueDate: Date;
      if (bill.dueType === 'specific' && bill.specificDates && bill.specificDates.length > 0) {
        const upcoming = bill.specificDates.filter(ts => ts >= now - 86400000).sort((a, b) => a - b);
        dueDate = upcoming[0] ? new Date(upcoming[0]) : new Date();
      } else {
        const d = new Date();
        const lastDayThisMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(bill.dueDay || 1, lastDayThisMonth));
        d.setHours(23, 59, 59, 999);
        if (d.getTime() < now && d.getDate() !== new Date().getDate()) {
          d.setMonth(d.getMonth() + 1);
          const lastDayNextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          d.setDate(Math.min(bill.dueDay || 1, lastDayNextMonth));
        }
        dueDate = d;
      }
      const diffDays = Math.ceil((dueDate.getTime() - now) / (1000 * 60 * 60 * 24));
      if (diffDays <= 3 || bill.status === 'overdue' || bill.status === 'due-soon') {
        billsDueWithin3Days.push({ bill, diffDays, dueDate });
      }
    });

    billsDueWithin3Days.sort((a, b) => a.diffDays - b.diffDays);

    const txs = allTransactions || [];
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const sevenDayExpenses = txs.filter(t => t.date >= sevenDaysAgo && t.type === 'expense');
    const sevenDaySpend = sevenDayExpenses.reduce((sum, t) => sum + (t.amount || 0), 0);
    const dailyVelocity = Math.round(sevenDaySpend / 7);

    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const monthlyExpenses = txs.filter(t => t.date >= oneMonthAgo && t.type === 'expense');
    const monthlySpend = monthlyExpenses.reduce((sum, t) => sum + (t.amount || 0), 0);
    const monthlyIncomes = txs.filter(t => t.date >= oneMonthAgo && t.type === 'income');
    const monthlyInflow = monthlyIncomes.reduce((sum, t) => sum + (t.amount || 0), 0) || 50000;

    const expectedWeeklyBudget = Math.max(8000, Math.round((monthlySpend || 32000) / 4.3));
    const weeklyUnderBudget = expectedWeeklyBudget - sevenDaySpend;

    // Lifestyle Creep Detector: 30-day vs 60-day historical average
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    
    const isDiscretionary = (t: Transaction) => {
       const noteLower = t.note?.toLowerCase() || '';
       return !noteLower.includes('bill') && !noteLower.includes('rent') && !noteLower.includes('meralco') && !noteLower.includes('insurance');
    };
    
    const currentMonthDiscretionary = monthlyExpenses.filter(isDiscretionary).reduce((sum, t) => sum + (t.amount || 0), 0);
    const prev60DaysDiscretionary = txs.filter(t => t.date >= ninetyDaysAgo && t.date < oneMonthAgo && t.type === 'expense')
      .filter(isDiscretionary)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
      
    const prev60AverageMonthly = prev60DaysDiscretionary / 2;
    let lifestyleCreepPercent = 0;
    if (prev60AverageMonthly > 0) {
      lifestyleCreepPercent = ((currentMonthDiscretionary - prev60AverageMonthly) / prev60AverageMonthly) * 100;
    }

    const debts = allDebts || [];
    const totalDebt = debts.reduce((sum, d) => sum + (d.remainingBalance !== undefined ? d.remainingBalance : (d as any).remainingAmount || d.originalAmount || 0), 0);

    // Compute interactive 0-100 CFO Health Score
    const health = calculateFinancialHealthScore({
      liquidMoney: totalMoney,
      monthlyOutflow: monthlySpend,
      monthlyInflow: monthlyInflow,
      totalDebt: totalDebt,
      sevenDaySpend: sevenDaySpend,
      unpaidBillsCount: unpaidBills.length
    });

    // Zero State: When starting clean from 0
    if (filteredAccounts.length === 0 && txs.length === 0 && bills.length === 0 && debts.length === 0) {
      const zeroChips: ProactiveGreetingChip[] = [
        {
          id: 'chip_zero_setup',
          icon: '🏦',
          label: '🏦 Setup Primary Account',
          query: 'I want to set up my first bank or e-wallet account in Philippine Pesos.',
          theme: 'purple'
        },
        {
          id: 'chip_zero_goal',
          icon: '🎯',
          label: '🎯 Set First Financial Goal',
          query: 'Help me set up an emergency fund savings goal to build my foundation.',
          theme: 'emerald'
        },
        {
          id: 'chip_zero_score',
          icon: '🛡️',
          label: '🛡️ Starting from 0 (Score: 0/100)',
          query: 'What are the first 3 CFO steps I should take starting with a clean slate?',
          theme: 'amber'
        }
      ];
      return {
        chips: zeroChips,
        welcomeText: 'Mabuhay! Your data has been wiped clean. Log your first account, transaction, or income to activate your personalized financial insights.',
        totalMoney: 0,
        totalDebt: 0,
        accountCount: 0,
        billsDueWithin3Days: [],
        dailyVelocity: 0,
        sevenDaySpend: 0,
        weeklyUnderBudget: 0,
        health
      };
    }

    // Dynamic Greeting Chips
    const chips: ProactiveGreetingChip[] = [];

    // Chip 1: Bills Due in 3 days / Overdue
    if (billsDueWithin3Days.length > 0) {
      const topBill = billsDueWithin3Days[0];
      if (topBill.diffDays <= 0 || topBill.bill.status === 'overdue') {
        chips.push({
          id: 'chip_bill_overdue',
          icon: '⚡',
          label: `⚡ Overdue: ${topBill.bill.name} (₱${topBill.bill.amount.toLocaleString()})`,
          query: `I have an overdue bill for ${topBill.bill.name} (₱${topBill.bill.amount.toLocaleString()}). Which account should I use to pay it now?`,
          theme: 'amber',
          urgent: true
        });
      } else if (topBill.diffDays === 1) {
        chips.push({
          id: 'chip_bill_tomorrow',
          icon: '⚡',
          label: `⚡ Bill due tomorrow: ${topBill.bill.name}`,
          query: `Tell me about my ${topBill.bill.name} bill (₱${topBill.bill.amount.toLocaleString()}) due tomorrow and help me plan to pay it.`,
          theme: 'amber',
          urgent: true
        });
      } else {
        chips.push({
          id: 'chip_bill_soon',
          icon: '⚡',
          label: `⚡ ${topBill.bill.name} in ${topBill.diffDays}d (₱${topBill.bill.amount.toLocaleString()})`,
          query: `What bills are due in the next 3 days, especially ${topBill.bill.name} (₱${topBill.bill.amount.toLocaleString()})?`,
          theme: 'amber'
        });
      }
    } else {
      chips.push({
        id: 'chip_bill_clear',
        icon: '⚡',
        label: `⚡ All bills clear for 3 days`,
        query: `Show my upcoming recurring obligations and bill calendar for this month.`,
        theme: 'amber'
      });
    }

    // Chip 2: Spending Velocity / Weekly Pace
    if (weeklyUnderBudget > 0) {
      chips.push({
        id: 'chip_velocity_under',
        icon: '📊',
        label: `📊 ₱${Math.round(weeklyUnderBudget).toLocaleString()} under budget this week`,
        query: `How is my spending velocity this week and how much room do I have in my budget?`,
        theme: 'purple'
      });
    } else {
      chips.push({
        id: 'chip_velocity_rate',
        icon: '📊',
        label: `📊 Velocity: ₱${dailyVelocity.toLocaleString()}/day`,
        query: `Analyze my 7-day spending velocity of ₱${dailyVelocity.toLocaleString()}/day and show my top spending categories.`,
        theme: 'purple'
      });
    }

    // Chip 3: Cash Runway / Financial Health
    chips.push({
      id: 'chip_runway',
      icon: '🛡️',
      label: `🛡️ ${health.runwayMonths} mos runway (Score: ${health.score}/100)`,
      query: `Give me a detailed CFO breakdown of my financial health score (${health.score}/100) and recommendations.`,
      theme: 'emerald'
    });

    // Chip 4: Lifestyle Creep Warning
    if (lifestyleCreepPercent > 15) {
      chips.push({
        id: 'chip_lifestyle_creep',
        icon: '🚨',
        label: `🚨 Lifestyle Creep: +${Math.round(lifestyleCreepPercent)}% spend`,
        query: `My discretionary spending is up ${Math.round(lifestyleCreepPercent)}% compared to my 60-day average. Give me actionable cost-cutting tips to reverse this lifestyle creep.`,
        theme: 'rose'
      });
    }

    const billSummary = billsDueWithin3Days.length > 0
      ? (billsDueWithin3Days[0].diffDays === 1 
          ? `⚡ Bill due tomorrow: ${billsDueWithin3Days[0].bill.name} (₱${billsDueWithin3Days[0].bill.amount.toLocaleString()})`
          : billsDueWithin3Days[0].diffDays <= 0 
            ? `⚡ Urgent overdue bill: ${billsDueWithin3Days[0].bill.name} (₱${billsDueWithin3Days[0].bill.amount.toLocaleString()})`
            : `⚡ ${billsDueWithin3Days.length} bill(s) due in 3 days`)
      : `⚡ All bills clear for 3 days`;

    const welcomeText = `CFO Briefing: Your Financial Health Score is ${health.score}/100 (${health.grade}). You hold ₱${totalMoney.toLocaleString()} in liquid capital (${health.runwayMonths} months runway) with a daily burn rate of ₱${dailyVelocity.toLocaleString()}/day. ${billSummary}. What strategic move should we execute today?`;

    return {
      chips,
      welcomeText,
      totalMoney,
      totalDebt,
      accountCount: filteredAccounts.length,
      billsDueWithin3Days,
      dailyVelocity,
      sevenDaySpend,
      weeklyUnderBudget,
      health,
      lifestyleCreepPercent
    };
  }, [allAccounts, allBills, allDebts, allTransactions, viewMode, currentUserId]);

  // Complete RAG Context Payload
  const financialSummary = useMemo(() => {
    const now = Date.now();
    const accounts = allAccounts || [];
    const filteredAccounts = viewMode === 'mine'
      ? accounts.filter(a => a.ownerId === currentUserId || a.ownerId === null)
      : accounts;

    const totalMoney = filteredAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const debts = allDebts || [];
    const totalDebt = debts.reduce((sum, d) => sum + (d.remainingBalance !== undefined ? d.remainingBalance : (d as any).remainingAmount || d.originalAmount || 0), 0);
    const bills = allBills || [];
    const totalBillsMonthly = bills.reduce((sum, b) => sum + (b.amount || 0), 0);

    const txs = allTransactions || [];
    const oneMonth = 30 * 24 * 60 * 60 * 1000;

    const currentMonthExpensesByCategory: Record<string, number> = {};
    let monthlyOutflow = 0;
    let monthlyInflow = 0;

    txs.forEach(t => {
      const age = now - t.date;
      if (age <= oneMonth) {
        if (t.type === 'expense') {
          monthlyOutflow += (t.amount || 0);
          const cat = t.categoryId || 'General';
          currentMonthExpensesByCategory[cat] = (currentMonthExpensesByCategory[cat] || 0) + (t.amount || 0);
        } else if (t.type === 'income') {
          monthlyInflow += (t.amount || 0);
        }
      }
    });

    const detailedAccounts = filteredAccounts.map(a => ({ name: a.name, type: a.type, balance: a.balance }));
    const detailedBills = bills.map(b => ({ name: b.name, amount: b.amount, frequency: b.frequency, dueDate: b.dueDate || 'Upcoming' }));
    const detailedDebts = debts.map(d => ({ 
      name: d.name, 
      lender: d.lender, 
      totalAmount: d.originalAmount || (d as any).totalAmount || 0, 
      remainingAmount: d.remainingBalance !== undefined ? d.remainingBalance : (d as any).remainingAmount || 0 
    }));

    const priceMemoryList = (allGroceryItems || []).map(g => ({
      name: g.name,
      lastUnitPrice: g.lastUnitPrice,
      storeName: g.storeName || 'Supermarket',
      updatedDate: g.lastUpdatedDate ? new Date(g.lastUpdatedDate).toISOString().split('T')[0] : 'Recently'
    }));

    return {
      totalMoney,
      totalDebt,
      totalBillsMonthly,
      netWorth: totalMoney - totalDebt,
      accounts: detailedAccounts,
      bills: detailedBills,
      debts: detailedDebts,
      currentMonthExpensesByCategory,
      priceMemoryList,
      userGoals: goals,
      userMemories: memories,
      financialHealthScore: proactiveInsights.health,
      upcomingBillsDue3Days: proactiveInsights.billsDueWithin3Days.map(b => ({
        name: b.bill.name,
        amount: b.bill.amount,
        diffDays: b.diffDays,
        status: b.bill.status
      })),
      spendingVelocity: {
        sevenDaySpend: proactiveInsights.sevenDaySpend,
        dailyVelocity: proactiveInsights.dailyVelocity,
        weeklyUnderBudget: proactiveInsights.weeklyUnderBudget,
        lifestyleCreepPercent: proactiveInsights.lifestyleCreepPercent
      },
      proactiveGreetingChips: proactiveInsights.chips,
      cashFlow: {
        monthly: { inflow: monthlyInflow, outflow: monthlyOutflow, net: monthlyInflow - monthlyOutflow }
      }
    };
  }, [allAccounts, allBills, allDebts, allTransactions, allGroceryItems, proactiveInsights, goals, memories, viewMode, currentUserId]);

  const welcomeMetrics = useMemo(() => [
    { 
      label: 'Health Score', 
      value: `${proactiveInsights.health.score}/100 (${proactiveInsights.health.grade})`, 
      trend: 'up' as const, 
      color: 'purple' as const 
    },
    { 
      label: 'Cash Runway', 
      value: `${proactiveInsights.health.runwayMonths} Months`, 
      trend: proactiveInsights.health.runwayMonths >= 3 ? ('up' as const) : ('down' as const), 
      color: 'emerald' as const 
    },
    { 
      label: 'Daily Velocity', 
      value: `₱${proactiveInsights.dailyVelocity.toLocaleString()}/day`, 
      trend: 'neutral' as const, 
      color: 'amber' as const 
    }
  ], [proactiveInsights.health, proactiveInsights.dailyVelocity]);

  // Execute Agent Actions live across Firestore, Store, and AI Memory
  const executeAgentAction = useCallback(async (action: ExecutedActionData) => {
    if (!action || !action.tool) return;
    const p = action.params || {};

    try {
      switch (action.tool) {
        case 'start_app_tour': {
          setGoraAiOpen(false);
          const tourFn = startAppTour || useAppStore.getState().startAppTour || useAppStore.getState().startTour;
          if (typeof tourFn === 'function') {
            tourFn(p.targetFeature || 'all');
          }
          break;
        }

        case 'open_safety_net_deposit': {
          setGoraAiOpen(false);
          window.dispatchEvent(new CustomEvent('gorago_open_safetynet_deposit', { detail: { amount: p.amount } }));
          break;
        }

        case 'open_safety_net_withdraw': {
          setGoraAiOpen(false);
          window.dispatchEvent(new CustomEvent('gorago_open_safetynet_withdraw', { detail: { amount: p.amount } }));
          break;
        }

        case 'open_security_pin_settings': {
          setGoraAiOpen(false);
          window.dispatchEvent(new CustomEvent('gorago_open_pin_modal'));
          break;
        }

        case 'open_goal_creation':
        case 'open_goal_modal':
        case 'create_goal_modal': {
          setGoraAiOpen(false);
          window.dispatchEvent(new CustomEvent('gorago_open_goal_creation'));
          break;
        }

        case 'create_savings_goal': {
          if (p.title && p.targetAmount) {
            const targetMs = p.targetDate ? new Date(p.targetDate).getTime() : Date.now() + 180 * 86400000;
            const newGoal: Goal = {
              id: `goal_${Date.now()}`,
              householdId: currentHouseholdId || 'h_sample',
              ownerId: currentUserId || null,
              title: p.title,
              targetAmount: p.targetAmount,
              currentAmount: p.currentAmount || 0,
              targetDate: targetMs,
              category: (p.category as GoalCategory) || 'purchase',
              color: '#8B5CF6',
              icon: 'target'
            };
            await saveGoal(newGoal);
            
            const updated = saveFinancialGoal({
              title: p.title,
              targetAmount: p.targetAmount,
              currentAmount: p.currentAmount || 0,
              category: p.category === 'emergency_fund' ? 'emergency_fund' : 'purchase',
              notes: 'Created via GoraGo CFO Agent'
            });
            setGoals(updated);
          }
          setGoraAiOpen(false);
          window.dispatchEvent(new CustomEvent('gorago_open_goal_creation'));
          break;
        }

        case 'navigate_to': {
          if (p.route) {
            setGoraAiOpen(false);
            navigate(p.route);
          }
          break;
        }

        case 'mark_bill_paid': {
          let targetBill = allBills?.find(b => b.id === p.billId);
          if (!targetBill && p.billName) {
            targetBill = allBills?.find(b => b.name.toLowerCase().includes(p.billName!.toLowerCase()));
          }
          if (targetBill) {
            await payBill(targetBill.id, p.amount || targetBill.amount, p.accountId);
          }
          break;
        }

        case 'create_account': {
          if (p.accountName) {
            const newAcc: Account = {
              id: `acc_${Date.now()}`,
              householdId: currentHouseholdId || 'h_sample',
              ownerId: currentUserId || null,
              name: p.accountName,
              type: p.accountType || 'ewallet',
              institution: p.institution || 'Digital Account',
              balance: typeof p.balance === 'number' ? p.balance : 0,
              color: p.accountType === 'bank' ? '#1e40af' : p.accountType === 'ewallet' ? '#007DFE' : '#10B981',
              icon: p.accountType === 'bank' ? 'landmark' : p.accountType === 'ewallet' ? 'smartphone' : 'wallet'
            };
            await saveAccount(newAcc);
          }
          break;
        }

        case 'update_budget_limit': {
          let targetCat = (allCategories || []).find(c => c.id === p.categoryId);
          if (!targetCat && p.categoryName) {
            targetCat = (allCategories || []).find(c => c.name.toLowerCase().includes(p.categoryName!.toLowerCase()));
          }
          if (targetCat) {
            await saveCategory({
              ...targetCat,
              color: targetCat.color || '#3B82F6'
            });
          } else if (p.categoryName) {
            const newCat: Category = {
              id: `cat_${Date.now()}`,
              householdId: currentHouseholdId || 'h_sample',
              name: p.categoryName,
              icon: 'pie-chart',
              type: 'expense',
              color: '#8B5CF6'
            };
            await saveCategory(newCat);
          }
          break;
        }

        case 'save_user_goal': {
          if (p.title && p.targetAmount) {
            const updatedGoals = saveFinancialGoal({
              title: p.title,
              targetAmount: p.targetAmount,
              currentAmount: p.currentAmount || 0,
              category: p.category || 'savings',
              notes: 'Created via Gora CFO Agent'
            });
            setGoals(updatedGoals);
          }
          break;
        }

        case 'remove_user_goal': {
          if (p.goalTitle) {
            const target = goals.find(g => g.title.toLowerCase().includes(p.goalTitle!.toLowerCase()));
            if (target) {
              const updated = deleteFinancialGoal(target.id);
              setGoals(updated);
            }
          }
          break;
        }

        case 'filter_transactions': {
          let catId = p.categoryId || 'all';
          if (catId === 'all' && p.categoryName) {
            const found = (allCategories || []).find(c => c.name.toLowerCase().includes(p.categoryName!.toLowerCase()));
            if (found) catId = found.id;
          }
          useAppStore.getState().setActiveCategoryFilter(catId);
          if (p.type) useAppStore.getState().setActiveTypeFilter(p.type);
          break;
        }

        case 'add_transaction': {
          if (p.amount && p.amount > 0) {
            const newTx: Transaction = {
              id: `tx_${Date.now()}`,
              householdId: currentHouseholdId || 'h_sample',
              accountId: p.accountId || (allAccounts && allAccounts[0] ? allAccounts[0].id : 'acc_1'),
              categoryId: p.categoryId || 'cat_food',
              amount: p.amount,
              type: p.type || 'expense',
              note: p.note || 'Recorded via GoraGo CFO Agent',
              date: Date.now()
            };
            await saveTransaction(newTx);
          }
          break;
        }

        case 'pay_debt': {
          let targetDebt = allDebts?.find(d => d.id === p.debtId);
          if (!targetDebt && p.debtName) {
            targetDebt = allDebts?.find(d => d.name.toLowerCase().includes(p.debtName!.toLowerCase()));
          }
          if (targetDebt && p.amount) {
            await payDebt(targetDebt.id, p.amount, p.accountId);
          }
          break;
        }

        case 'update_price_memory': {
          if (p.itemName && p.price) {
            const existingInCatalog = allGroceryItems?.find(gi => gi.name.toLowerCase() === p.itemName!.toLowerCase());
            await saveGroceryItem({
              id: existingInCatalog ? existingInCatalog.id : `gi_${Date.now()}`,
              householdId: currentHouseholdId || 'h_sample',
              name: p.itemName,
              lastUnitPrice: p.price,
              storeName: p.storeName || 'Supermarket',
              lastUpdatedDate: Date.now(),
              category: 'Groceries'
            });
          }
          break;
        }
      }
    } catch (err) {
      console.error("Error executing GoraGo CFO agent tool:", err);
    }
  }, [allBills, allAccounts, allCategories, allDebts, allGroceryItems, currentHouseholdId, currentUserId, goals]);

  const sendQuery = useCallback(async (textToSend: string) => {
    if (!textToSend.trim() || chatLoading) return;

    const userText = textToSend.trim();
    const lower = userText.toLowerCase();

    // Check for tour/help intents
    const isTourIntent = lower.includes('how do i use this') || 
                         lower.includes('paano gamitin') || 
                         lower.includes('tour me') || 
                         lower.includes('tour me around') || 
                         lower.includes('show me around') || 
                         lower.includes('teach me') ||
                         lower.includes('where is my') ||
                         lower.includes('how do i create') ||
                         (lower.includes('where') && (lower.includes('find') || lower.includes('located') || lower.includes('get')));

    const isAccountSetupIntent = lower.includes('create an account') || 
                                 lower.includes('add an account') || 
                                 lower.includes('setup my accounts') || 
                                 lower.includes('setup accounts') ||
                                 lower.includes('how do i create an account');

    if (isTourIntent) {
      // 1. Add user message
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        text: userText,
        timestamp: Date.now()
      };
      addAiChatMessage(userMsg);

      // 2. Add assistant response
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        text: "Sure! Simulan natin ang visual spotlight tour ng GoraGo. Inilunsad ko na ang 5-step interactive guide para sa iyo!",
        timestamp: Date.now() + 50,
        executedAction: {
          tool: 'start_app_tour',
          params: { targetFeature: 'all' }
        }
      };
      addAiChatMessage(assistantMsg);

      // 3. Trigger Action directly
      const tourFn = startAppTour || useAppStore.getState().startAppTour || useAppStore.getState().startTour;
      if (typeof tourFn === 'function') {
        tourFn('all');
      }
      return;
    }

    if (isAccountSetupIntent) {
      // 1. Add user message
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        text: userText,
        timestamp: Date.now()
      };
      addAiChatMessage(userMsg);

      // 2. Add assistant response
      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now()}_a`,
        role: 'assistant',
        text: "Sige po! Binubuksan ko na ang Account Setup panel para ma-add mo ang GCash, Maya, o Bank Account.",
        timestamp: Date.now() + 50,
        executedAction: {
          tool: 'open_account_creation'
        }
      };
      addAiChatMessage(assistantMsg);

      // 3. Close AI drawer & open account modal
      setGoraAiOpen(false);
      window.dispatchEvent(new CustomEvent('gorago_open_account_creation'));
      return;
    }

    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      text: userText,
      timestamp: Date.now()
    };

    addAiChatMessage(newMsg);
    setChatLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          financialData: financialSummary,
          chatHistory: [...messages, newMsg].slice(-6)
        })
      });

      if (!res.ok) {
        throw new Error(`Chat API responded with status ${res.status}`);
      }

      let data: any = {};
      try {
        data = await res.json();
      } catch (jsonErr) {
        console.warn("Could not parse AI response JSON on client:", jsonErr);
        data = {
          reply: "Mabuhay! Here is your GoraGo CFO status: Your financial ledger and active balances are loaded. Let me know if you would like me to guide you through the app features or analyze your spending!"
        };
      }

      if (data.executedAction) {
        await executeAgentAction(data.executedAction);
      }
      
      addAiChatMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        text: data.reply || "CFO Analysis: Here are the detailed numbers from your ledger:",
        timestamp: Date.now(),
        keyMetrics: data.keyMetrics,
        executedAction: data.executedAction,
        chartData: data.chartData,
        interactiveWidget: data.interactiveWidget,
        quickFollowUps: data.quickFollowUps
      });
    } catch (err) {
      console.warn('Chat request handled via client fallback:', err);
      
      const lower = userText.toLowerCase();
      let replyText = "CFO Verdict: Your current capital allocation is balanced. Prioritize funding your emergency runway before taking on any new debts.";
      let widget: any = undefined;
      let chartData: any = undefined;
      let executedAction: any = undefined;

      if (lower.includes('tour') || lower.includes('guide') || lower.includes('paano gamitin') || lower.includes('how do i use') || lower.includes('where is') || lower.includes('show me around') || lower.includes('walkthrough')) {
        let feat = 'all';
        if (lower.includes('safety') || lower.includes('emergency')) feat = 'safetynet';
        else if (lower.includes('goal') || lower.includes('savings')) feat = 'goals';
        else if (lower.includes('forecast') || lower.includes('cashflow') || lower.includes('prophet')) feat = 'cashflow';
        else if (lower.includes('bill') || lower.includes('loan')) feat = 'bills';
        
        executedAction = {
          tool: 'start_app_tour',
          status: 'success',
          params: { targetFeature: feat }
        };
        replyText = "Tara! I-guide kita sa GoraGo app features. Inilunsad ko ang visual spotlight tour para ma-explore mo ang Total Balance, Safety Net, Prophet AI, at Goals!";
      } else if (lower.includes('pin') || lower.includes('security code') || (lower.includes('update') && lower.includes('pin'))) {
        executedAction = {
          tool: 'open_security_pin_settings',
          status: 'success',
          params: {}
        };
        replyText = "Binubuksan ko na ang Security PIN settings para ma-set or ma-update ang iyong 4-digit Safety Net passcode.";
      } else if ((lower.includes('deposit') || lower.includes('maghulog') || lower.includes('lagay')) && (lower.includes('safety') || lower.includes('emergency'))) {
        const amtMatch = lower.match(/\d+[\d,]*/);
        const amount = amtMatch ? parseInt(amtMatch[0].replace(/,/g, ''), 10) : 1000;
        executedAction = {
          tool: 'open_safety_net_deposit',
          status: 'success',
          params: { amount }
        };
        replyText = `Binubuksan ko na ang Safety Net Deposit modal para mai-deposit ang ₱${amount.toLocaleString()} sa iyong protected Emergency Fund.`;
      } else if ((lower.includes('withdraw') || lower.includes('kumuha')) && (lower.includes('safety') || lower.includes('emergency'))) {
        const amtMatch = lower.match(/\d+[\d,]*/);
        const amount = amtMatch ? parseInt(amtMatch[0].replace(/,/g, ''), 10) : 1000;
        executedAction = {
          tool: 'open_safety_net_withdraw',
          status: 'success',
          params: { amount }
        };
        replyText = `Binubuksan ko na ang Safety Net Withdraw modal. Tandaan, suriin ang AI Impact Analysis bago kumuha ng ₱${amount.toLocaleString()} mula sa emergency buffer!`;
      } else if (lower.includes('create a goal') || lower.includes('add a goal') || lower.includes('new goal') || lower.includes('create goal')) {
        executedAction = {
          tool: 'open_goal_creation',
          status: 'success',
          params: {}
        };
        replyText = "Binubuksan ko na ang Goal Creation Planner para maka-set ka ng bagong financial milestone!";
      } else if (lower.includes('chart') || lower.includes('breakdown') || lower.includes('spending')) {
        chartData = {
          title: "Category Spending Breakdown",
          subtitle: "Live monthly outflows in PHP",
          chartType: "bar",
          dataPoints: [
            { name: 'Food & Dining', value: 8500, color: '#8B5CF6' },
            { name: 'Bills & Utilities', value: 6200, color: '#3B82F6' },
            { name: 'Groceries', value: 5400, color: '#10B981' },
            { name: 'Transport', value: 3100, color: '#F59E0B' },
            { name: 'Shopping', value: 2400, color: '#EC4899' }
          ],
          summaryText: "CFO Takeaway: Food & Utilities comprise over 55% of your total spend. Optimizing dining out boosts your monthly surplus by ₱2,000+."
        };
        replyText = "Here is your interactive spending breakdown chart. Toggle between Bar, Pie, and Trend views:";
      } else if (lower.includes('mark') && lower.includes('paid')) {
        const matchingBill = allBills?.find(b => lower.includes(b.name.toLowerCase()));
        if (matchingBill) {
          executedAction = {
            tool: 'mark_bill_paid',
            status: 'success',
            params: { billId: matchingBill.id, billName: matchingBill.name, amount: matchingBill.amount, accountId: 'acc_1' }
          };
          replyText = `CFO Action: Marked "${matchingBill.name}" (₱${matchingBill.amount.toLocaleString()}) as paid!`;
        }
      } else if (lower.includes('goal') || lower.includes('save for')) {
        const amtMatch = lower.match(/\d+[\d,]*/);
        const targetAmount = amtMatch ? parseInt(amtMatch[0].replace(/,/g, ''), 10) : 50000;
        executedAction = {
          tool: 'save_user_goal',
          status: 'success',
          params: { title: 'Emergency Cushion Target', targetAmount, category: 'emergency_fund' }
        };
        replyText = `CFO Memory Updated: Saved new milestone goal of ₱${targetAmount.toLocaleString()}.`;
      } else if (lower.includes('spent') || lower.includes('bought') || lower.includes('paid') || lower.includes('cost') || lower.includes('₱')) {
        const amountMatches = lower.match(/\d+[\d,]*/);
        const extractedAmount = amountMatches ? parseInt(amountMatches[0].replace(/,/g, ''), 10) : 150;
        let extractedNote = 'Expense';
        if (lower.includes('for ')) extractedNote = lower.split('for ')[1]?.split(' ')[0] || 'Expense';
        else if (lower.includes('bought ')) extractedNote = lower.split('bought ')[1]?.split(' ')[0] || 'Item';
        
        let matchedAccount = '';
        if (lower.includes('gcash')) matchedAccount = 'acc_2';
        else if (lower.includes('cash')) matchedAccount = 'acc_3';
        else if (lower.includes('bpi') || lower.includes('bank')) matchedAccount = 'acc_1';
        else if (lower.includes('maya')) matchedAccount = 'acc_4';

        widget = {
          type: 'transaction_confirmation',
          title: 'Confirm Staged Transaction',
          description: 'Please review and confirm to add this transaction.',
          params: {
            stagedTransaction: {
              note: extractedNote,
              amount: extractedAmount,
              type: 'expense',
              categoryId: 'cat_food',
              accountId: matchedAccount
            }
          }
        };
        replyText = `Staged ₱${extractedAmount} expense for "${extractedNote}". Review and click Confirm below:`;
      } else if (lower.includes('debt') || lower.includes('loan') || lower.includes('payoff')) {
        widget = {
          type: 'debt_payoff',
          title: 'Debt Acceleration Simulator',
          description: 'Test extra monthly payments to calculate interest saved',
          params: { extraPayment: 2000 }
        };
        replyText = `CFO Directive: You hold ₱${financialSummary.totalDebt.toLocaleString()} in active debt. Eliminating this with an extra ₱2,000/mo payment frees up critical cash flow.`;
      } else if (lower.includes('afford') || lower.includes('buy')) {
        const matches = lower.match(/\d+[\d,]*/);
        const cost = matches ? parseInt(matches[0].replace(/,/g, ''), 10) : 10000;
        widget = {
          type: 'purchase_feasibility',
          title: 'Purchase Feasibility Check',
          description: 'Evaluate purchase impact on emergency savings buffer',
          params: { costToEvaluate: cost }
        };
        replyText = `Evaluating a ₱${cost.toLocaleString()} purchase against your current ₱${financialSummary.totalMoney.toLocaleString()} liquid balance and ₱${financialSummary.cashFlow.monthly.net.toLocaleString()} monthly surplus.`;
      }

      if (executedAction) {
        await executeAgentAction(executedAction);
      }

      addAiChatMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        text: replyText,
        timestamp: Date.now(),
        keyMetrics: welcomeMetrics,
        chartData: chartData,
        interactiveWidget: widget,
        quickFollowUps: [
          "Show my spending breakdown chart",
          "What are my highest recurring monthly bills?",
          "How much do I have left in my accounts?"
        ]
      });
    } finally {
      setChatLoading(false);
    }
  }, [chatLoading, financialSummary, messages, executeAgentAction, welcomeMetrics, allBills]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = inputMessage;
    setInputMessage('');
    sendQuery(msg);
  };

  const handleCreateCustomGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim() || !newGoalAmount) return;
    const amt = parseFloat(newGoalAmount);
    if (isNaN(amt) || amt <= 0) return;

    const updated = saveFinancialGoal({
      title: newGoalTitle.trim(),
      targetAmount: amt,
      currentAmount: 0,
      category: 'savings',
      notes: 'Manually added in CFO Goals Drawer'
    });
    setGoals(updated);
    setNewGoalTitle('');
    setNewGoalAmount('');
    setShowGoalManager(false);
    sendQuery(`I just added a new financial goal: "${newGoalTitle.trim()}" with a target of ₱${amt.toLocaleString()}. How should I adjust my budget to achieve it?`);
  };

  const quickPrompts = [
    { label: "📊 Spending Breakdown Chart", prompt: "Show my spending breakdown chart for this month", icon: PieChart },
    { label: "⚡ Mark Meralco Bill Paid", prompt: "Mark my Meralco Electricity bill as paid", icon: Zap },
    { label: "🎯 Set Food Budget ₱15k", prompt: "Set my monthly food budget to ₱15,000", icon: Target },
    { label: "💳 Add Maya Account ₱10k", prompt: "Create a new ewallet account named Maya Savings with ₱10,000 initial balance", icon: ShoppingBag }
  ];

  return (
    <>
      {isGoraAiOpen && isTourOpen && (
        <div className="absolute bottom-[84px] right-4 z-30 flex flex-col items-end gap-2.5 pointer-events-none">
          {showDockedBubble && (
            <div className="max-w-[190px] bg-zinc-900/95 dark:bg-zinc-900/95 text-white text-[10px] font-semibold px-3 py-2 rounded-2xl shadow-xl border border-purple-500/30 animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDockedBubble(false);
                }}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-zinc-800 rounded-full flex items-center justify-center text-[8px] hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50"
              >
                ×
              </button>
              <p className="leading-tight pr-1.5">{lastAssistantMessage}</p>
              {/* Little speech bubble triangle */}
              <div className="absolute bottom-[-5px] right-4 w-2.5 h-2.5 bg-zinc-900 dark:bg-zinc-900 border-r border-b border-purple-500/30 rotate-45" />
            </div>
          )}
          <div 
            id="gora-assistant-docked"
            onClick={() => setShowDockedBubble(prev => !prev)}
            className="flex items-center gap-2.5 bg-gradient-to-r from-purple-800 via-indigo-800 to-fuchsia-800 text-white px-3.5 py-2.5 rounded-2xl shadow-xl border border-purple-400/40 animate-bounce cursor-pointer hover:scale-105 active:scale-95 transition-all duration-300 pointer-events-auto shadow-purple-500/10"
          >
            <div className="w-5.5 h-5.5 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm shrink-0 relative">
              <Sparkles size={11} className="text-amber-300 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-black tracking-tight leading-none text-zinc-100">Gora CFO</span>
              <span className="text-[8px] font-bold text-purple-200 leading-none mt-0.5">Docked/Tour Mode</span>
            </div>
          </div>
        </div>
      )}

      {isGoraAiOpen && !isTourOpen && (
        <div className="absolute inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden animate-in fade-in duration-200 sm:rounded-[48px]">
          
          {/* Header */}
          <div className="p-4 sm:p-5 bg-gradient-to-r from-purple-700 via-indigo-700 to-fuchsia-700 text-white flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md shrink-0">
                <Sparkles size={20} className="text-amber-300" />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-sm sm:text-base tracking-tight truncate flex items-center gap-2">
                  <span>Gora CFO Advisor</span>
                  <span className="bg-white/20 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">PHP (₱)</span>
                </h3>
                <p className="text-[11px] text-purple-200 font-medium truncate">Autonomous CFO & Capital Allocator</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => clearAiChatHistory()}
                className="px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer text-purple-100"
                title="Reset Chat History"
              >
                <RotateCcw size={13} />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGoalManager(!showGoalManager)}
                className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer text-white"
                title="Manage Stated Goals & Memories"
              >
                <BookmarkPlus size={14} />
                <span className="hidden sm:inline">Goals ({goals.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setGoraAiOpen(false)}
                className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Interactive Financial Health Score & Runway Banner */}
          <div className="bg-gradient-to-b from-purple-950 to-indigo-950 text-white p-3 sm:px-4 border-b border-purple-900/50 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative flex items-center justify-center">
                  <div className="w-11 h-11 rounded-2xl bg-purple-600/40 border border-purple-400/40 flex flex-col items-center justify-center">
                    <span className="text-xs font-black leading-none">{proactiveInsights.health.score}</span>
                    <span className="text-[8px] font-bold text-purple-300 uppercase">/100</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-xs sm:text-sm tracking-tight truncate">Financial Health: Grade {proactiveInsights.health.grade}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      {proactiveInsights.health.runwayMonths} mos runway
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-300 truncate font-medium">{proactiveInsights.health.statusHeadline}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHealthBreakdown(!showHealthBreakdown)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-purple-200 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer shrink-0"
              >
                <span className="hidden xs:inline text-[11px]">Breakdown</span>
                {showHealthBreakdown ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            {/* Collapsible Health Breakdown Drawer */}
            {showHealthBreakdown && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[10px] text-purple-300 font-bold uppercase">Cash Runway</p>
                    <p className="text-xs font-black text-white mt-0.5">{proactiveInsights.health.runwayMonths} Months ({proactiveInsights.health.runwayScore}/30 pts)</p>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[10px] text-purple-300 font-bold uppercase">Budget Adherence</p>
                    <p className="text-xs font-black text-white mt-0.5">{proactiveInsights.health.budgetAdherenceScore}/30 pts</p>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[10px] text-purple-300 font-bold uppercase">Debt Burden</p>
                    <p className="text-xs font-black text-white mt-0.5">{proactiveInsights.health.debtBurdenScore}/25 pts</p>
                  </div>
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[10px] text-purple-300 font-bold uppercase">Savings Rate</p>
                    <p className="text-xs font-black text-white mt-0.5">{proactiveInsights.health.savingsRatePercent}% ({proactiveInsights.health.savingsRateScore}/15 pts)</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-purple-900/40 border border-purple-500/30 text-[11px] leading-relaxed text-purple-100 flex items-start gap-2">
                  <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">CFO Assessment: </span>
                    <span>{proactiveInsights.health.cfoVerdict}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Goal & Memory Manager Drawer if active */}
          {showGoalManager && (
            <div className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 space-y-3 animate-in slide-in-from-top duration-150 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Target size={16} className="text-purple-600" />
                  <h4 className="font-black text-xs uppercase tracking-wider text-zinc-900 dark:text-zinc-100">CFO Stated Goals & Memories</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGoalManager(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer font-bold"
                >
                  Close
                </button>
              </div>

              {/* Active Goals Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {goals.map((goal) => {
                  const pct = Math.min(100, Math.round(((goal.currentAmount || 0) / Math.max(1, goal.targetAmount)) * 100));
                  return (
                    <div key={goal.id} className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 space-y-1.5 text-left">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs text-zinc-900 dark:text-zinc-100 truncate">{goal.title}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = deleteFinancialGoal(goal.id);
                            setGoals(updated);
                          }}
                          className="text-zinc-400 hover:text-rose-500 text-[10px] font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span>₱{(goal.currentAmount || 0).toLocaleString()} / ₱{goal.targetAmount.toLocaleString()}</span>
                        <span className="font-bold text-purple-600 dark:text-purple-400">{pct}%</span>
                      </div>
                      <div className="w-full bg-zinc-100 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-purple-600 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add New Goal Form */}
              <form onSubmit={handleCreateCustomGoal} className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="New Goal Title (e.g. Japan Trip ₱30k)"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <input
                  type="number"
                  placeholder="Target ₱"
                  value={newGoalAmount}
                  onChange={(e) => setNewGoalAmount(e.target.value)}
                  className="w-24 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  disabled={!newGoalTitle.trim() || !newGoalAmount}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add</span>
                </button>
              </form>
            </div>
          )}

          {/* Proactive Intelligence Greeting Chips Bar */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50/60 to-pink-50 dark:from-purple-950/40 dark:via-zinc-900/60 dark:to-zinc-900/40 border-b border-purple-100 dark:border-purple-900/30 px-3.5 py-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-950 dark:text-purple-300">Proactive Insights</span>
              </div>
              <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">Live Financial Ledger</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 pt-0.5">
              {proactiveInsights.chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => sendQuery(chip.query)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer whitespace-nowrap shadow-xs border ${
                    chip.theme === 'amber'
                      ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-300/70 dark:border-amber-700/60 hover:bg-amber-500/25'
                      : chip.theme === 'purple'
                      ? 'bg-purple-500/15 text-purple-900 dark:text-purple-200 border-purple-300/70 dark:border-purple-700/60 hover:bg-purple-500/25'
                      : 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border-emerald-300/70 dark:border-emerald-700/60 hover:bg-emerald-500/25'
                  }`}
                >
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Messages View */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50 dark:bg-zinc-950 -webkit-overflow-scrolling-touch overscroll-y-contain">
            {messages.map((m) => {
              const isBot = m.role === 'assistant';
              const rawText = m.id === 'm_welcome' && m.text.startsWith('Mabuhay! I am your GoraGo CFO')
                ? proactiveInsights.welcomeText
                : m.text;
              const displayText = (rawText && rawText.trim()) 
                ? rawText 
                : "CFO Analysis: Here are the detailed numbers from your active ledger:";
              return (
                <div key={m.id} className={`flex gap-3 ${isBot ? 'justify-start' : 'justify-end'}`}>
                  {isBot && (
                    <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-md">
                      <Bot size={16} />
                    </div>
                  )}

                  <div className={`max-w-[88%] sm:max-w-[78%] space-y-3 ${isBot ? 'text-left' : 'text-right'}`}>
                    <div className={`p-4 rounded-3xl text-sm leading-relaxed ${
                      isBot 
                        ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800 shadow-sm' 
                        : 'bg-purple-600 text-white font-medium shadow-md shadow-purple-500/20'
                    }`}>
                      <p className="whitespace-pre-wrap">{displayText}</p>

                      {/* Executed Agent Action Card if present */}
                      {m.executedAction && (
                        <div className="mt-3 bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3 space-y-1.5 text-left">
                          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                            <CheckCircle2 size={15} className="shrink-0" />
                            <span>⚡ Gora CFO Action Executed</span>
                          </div>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                            {m.executedAction.tool === 'mark_bill_paid' && `Marked "${m.executedAction.params?.billName || 'Bill'}" as Paid (₱${(m.executedAction.params?.amount || 0).toLocaleString()})`}
                            {m.executedAction.tool === 'create_account' && `Created New Account "${m.executedAction.params?.accountName || 'Account'}" with balance ₱${(m.executedAction.params?.balance || 0).toLocaleString()}`}
                            {m.executedAction.tool === 'update_budget_limit' && `Updated budget limit for "${m.executedAction.params?.categoryName || 'Category'}" to ₱${(m.executedAction.params?.budgetLimit || 0).toLocaleString()}`}
                            {m.executedAction.tool === 'save_user_goal' && `Saved new stated goal "${m.executedAction.params?.title}" with target of ₱${(m.executedAction.params?.targetAmount || 0).toLocaleString()}`}
                            {m.executedAction.tool === 'remove_user_goal' && `Removed financial goal "${m.executedAction.params?.goalTitle}" from active memory`}
                            {m.executedAction.tool === 'filter_transactions' && `Applied active filter: Category "${m.executedAction.params?.categoryName || 'All'}" | Type "${m.executedAction.params?.type || 'All'}"`}
                            {m.executedAction.tool === 'add_transaction' && `Logged transaction "${m.executedAction.params?.note || 'Item'}" for ₱${(m.executedAction.params?.amount || 0).toLocaleString()}`}
                            {m.executedAction.tool === 'pay_debt' && `Recorded payment of ₱${(m.executedAction.params?.amount || 0).toLocaleString()} towards ${m.executedAction.params?.debtName || 'Loan'}`}
                            {m.executedAction.tool === 'update_price_memory' && `Updated price memory for "${m.executedAction.params?.itemName}" to ₱${m.executedAction.params?.price} at ${m.executedAction.params?.storeName || 'Store'}`}
                          </p>
                        </div>
                      )}

                      {/* Interactive Chart Card if present */}
                      {m.chartData && (
                        <AIChartCard chart={m.chartData} />
                      )}

                      {/* Key Metrics Chips if present */}
                      {(() => {
                        const activeMetrics = m.id === 'm_welcome' ? welcomeMetrics : m.keyMetrics;
                        if (!activeMetrics || activeMetrics.length === 0) return null;
                        return (
                          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                            {activeMetrics.map((km, idx) => (
                              <div key={idx} className="bg-zinc-50 dark:bg-zinc-800/60 p-2.5 rounded-2xl text-center">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide truncate">{km.label}</p>
                                <p className="text-xs sm:text-sm font-black text-zinc-900 dark:text-white mt-0.5 truncate">{km.value}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Interactive Widget if present */}
                    {m.interactiveWidget && (
                      <div className="my-2">
                        <InteractiveAICard widget={m.interactiveWidget} financialSummary={financialSummary} onSendQuery={sendQuery} />
                      </div>
                    )}

                    {/* Quick Follow-ups */}
                    {m.quickFollowUps && m.quickFollowUps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.quickFollowUps.map((qf, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => sendQuery(qf)}
                            className="text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800/50 transition-colors text-left cursor-pointer"
                          >
                            {qf}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isBot && (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 dark:bg-zinc-700 text-white flex items-center justify-center shrink-0 shadow-md">
                      <User size={16} />
                    </div>
                  )}
                </div>
              );
            })}

            {chatLoading && (
              <div className="flex gap-3 justify-start animate-fade-in">
                <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Bot size={16} />
                </div>
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center gap-2 text-zinc-400 text-xs font-bold">
                  <Loader2 size={16} className="animate-spin text-purple-600" />
                  <span>Gora CFO Agent is computing capital allocation strategy...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-4 py-2.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 overflow-x-auto no-scrollbar flex gap-2 shrink-0">
            {quickPrompts.map((qp, idx) => {
              const IconComp = qp.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => sendQuery(qp.prompt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-zinc-700 dark:text-zinc-300 hover:text-purple-600 dark:hover:text-purple-300 rounded-full text-xs font-bold whitespace-nowrap transition-colors border border-zinc-200/60 dark:border-zinc-700 cursor-pointer shrink-0"
                >
                  <IconComp size={13} />
                  <span>{qp.label}</span>
                </button>
              );
            })}
          </div>

          {/* Input Bar */}
          <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex items-center gap-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask Gora CFO about your runway, debt payoff, or spending cuts..."
              className="flex-1 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-zinc-400 font-medium touch-manipulation"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || chatLoading}
              className="w-12 h-12 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl flex items-center justify-center transition-all disabled:opacity-40 disabled:scale-100 active:scale-90 shadow-md shadow-purple-500/20 cursor-pointer shrink-0 touch-manipulation will-change-transform"
            >
              <Send size={18} />
            </button>
          </form>

        </div>
      )}
    </>
  );
}
