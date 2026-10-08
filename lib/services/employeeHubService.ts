import { differenceInDays, differenceInMonths, differenceInYears, addYears, format, parseISO } from "date-fns";

export interface EmployeeProfileData {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName: string;
  aadhaarNumber?: string | null;
  employeeId: string;
  designation: string;
  department: string;
  dateOfJoining: string | null;
  baseSalaryCents: number;
  joiningSalaryCents: number;
  fixedAllowanceCents: number;
  inTime: string | null;
  contactNumber: string | null;
  emergencyContactNumber: string | null;
  incrementAmountCents: number;
  incrementFrequencyMonths: number;
  nextIncrementDate: string | null;
  incrementPolicyNote: string | null;
  bloodGroup?: string | null;
}

export interface ServiceTenure {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  formatted: string; // e.g. "4 Years 3 Months"
  shortFormatted: string; // e.g. "4y 3m"
}

export interface CareerMilestone {
  id: string;
  title: string;
  targetYears: number;
  targetDate: string; // YYYY-MM-DD
  isCompleted: boolean;
  isCurrentNext: boolean;
  iconType: "join" | "one_year" | "three_years" | "five_years" | "ten_years" | "fifteen_years";
  badgeEmoji: string;
  description: string;
}

export interface NextMilestoneInfo {
  milestone: CareerMilestone;
  daysRemaining: number;
  progressPercent: number; // 0 to 100
  isReachedToday: boolean;
  congratulationsText: string;
}

export interface IncrementHistoryItem {
  id: string;
  effectiveDate: string;
  previousSalaryCents: number;
  newSalaryCents: number;
  incrementAmountCents: number;
  reason: string;
  approvedBy?: string;
}

export interface SalaryProjectionPoint {
  year: number;
  calendarYear: number;
  monthlySalary: number;
  annualCTC: number;
  cumulativeIncrement: number;
}

export interface AchievementItem {
  id: string;
  badgeKey: string;
  title: string;
  description: string;
  category: "tenure" | "excellence" | "growth" | "skill";
  achievedDate: string | null;
  isUnlocked: boolean;
  iconName: string;
  emoji: string;
}

export interface EmployeeNotice {
  id: string;
  title: string;
  message: string;
  priority: "urgent" | "high" | "normal" | "low";
  targetAudienceType: "all" | "role" | "department" | "employee";
  targetAudienceValue?: string | null;
  isPinned: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------------------

export function calculateServiceTenure(joiningDateStr?: string | null): ServiceTenure {
  if (!joiningDateStr) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      formatted: "Not specified",
      shortFormatted: "—",
    };
  }

  const joinDate = new Date(joiningDateStr);
  const now = new Date();

  if (isNaN(joinDate.getTime()) || joinDate > now) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      formatted: "Just joined",
      shortFormatted: "< 1m",
    };
  }

  let years = now.getFullYear() - joinDate.getFullYear();
  let months = now.getMonth() - joinDate.getMonth();
  let days = now.getDate() - joinDate.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = differenceInDays(now, joinDate);

  let formatted = "";
  if (years > 0 && months > 0) {
    formatted = `${years} ${years === 1 ? "Year" : "Years"} ${months} ${months === 1 ? "Month" : "Months"}`;
  } else if (years > 0) {
    formatted = `${years} ${years === 1 ? "Year" : "Years"}`;
  } else if (months > 0) {
    formatted = `${months} ${months === 1 ? "Month" : "Months"}${days > 0 ? ` ${days} Days` : ""}`;
  } else {
    formatted = `${days} ${days === 1 ? "Day" : "Days"}`;
  }

  const shortFormatted = years > 0 ? `${years}y ${months}m` : `${months}m ${days}d`;

  return {
    years,
    months,
    days,
    totalDays,
    formatted,
    shortFormatted,
  };
}

export function computeMilestones(joiningDateStr?: string | null): {
  milestones: CareerMilestone[];
  nextMilestone: NextMilestoneInfo | null;
} {
  if (!joiningDateStr) {
    return { milestones: [], nextMilestone: null };
  }

  const joinDate = new Date(joiningDateStr);
  if (isNaN(joinDate.getTime())) return { milestones: [], nextMilestone: null };

  const now = new Date();

  const milestoneConfigs = [
    { targetYears: 0, title: "Joined the company", iconType: "join" as const, emoji: "🎉", desc: "Started the journey with the company." },
    { targetYears: 1, title: "1 Year Completed", iconType: "one_year" as const, emoji: "⭐", desc: "First year milestone completed." },
    { targetYears: 3, title: "3 Years Completed", iconType: "three_years" as const, emoji: "🏅", desc: "Three years of dedicated service." },
    { targetYears: 5, title: "5 Years Completed", iconType: "five_years" as const, emoji: "🏆", desc: "Five years pillar milestone." },
    { targetYears: 10, title: "10 Years Completed", iconType: "ten_years" as const, emoji: "💎", desc: "A full decade of excellence." },
    { targetYears: 15, title: "15 Years Completed", iconType: "fifteen_years" as const, emoji: "👑", desc: "Fifteen years legend milestone." },
  ];

  const milestones: CareerMilestone[] = [];
  let nextMilestoneItem: CareerMilestone | null = null;
  let prevMilestoneDate = joinDate;

  for (const cfg of milestoneConfigs) {
    const targetDate = addYears(joinDate, cfg.targetYears);
    const isCompleted = now >= targetDate;
    const isNext = !isCompleted && !nextMilestoneItem;

    const milestone: CareerMilestone = {
      id: `ms_${cfg.targetYears}`,
      title: cfg.title,
      targetYears: cfg.targetYears,
      targetDate: format(targetDate, "yyyy-MM-dd"),
      isCompleted,
      isCurrentNext: isNext,
      iconType: cfg.iconType,
      badgeEmoji: cfg.emoji,
      description: cfg.desc,
    };

    if (isNext) {
      nextMilestoneItem = milestone;
    }

    milestones.push(milestone);
  }

  let nextInfo: NextMilestoneInfo | null = null;

  if (nextMilestoneItem) {
    const targetDate = new Date(nextMilestoneItem.targetDate);
    const daysRemaining = Math.max(0, differenceInDays(targetDate, now));
    const previousYears = milestones
      .filter((m) => m.targetYears < nextMilestoneItem!.targetYears)
      .pop();

    const startDate = previousYears ? new Date(previousYears.targetDate) : joinDate;
    const totalIntervalDays = Math.max(1, differenceInDays(targetDate, startDate));
    const daysElapsed = Math.max(0, differenceInDays(now, startDate));
    const progressPercent = Math.min(100, Math.max(0, Math.round((daysElapsed / totalIntervalDays) * 100)));

    nextInfo = {
      milestone: nextMilestoneItem,
      daysRemaining,
      progressPercent,
      isReachedToday: daysRemaining === 0,
      congratulationsText: `🎉 ${nextMilestoneItem.title}!`,
    };
  } else if (milestones.length > 0) {
    // All milestones completed
    const last = milestones[milestones.length - 1];
    nextInfo = {
      milestone: last,
      daysRemaining: 0,
      progressPercent: 100,
      isReachedToday: true,
      congratulationsText: `🎉 ${last.title}! Veteran Legend`,
    };
  }

  return { milestones, nextMilestone: nextInfo };
}

export function generateSalaryProjection(
  currentMonthlySalary: number,
  incrementAmount: number = 2000,
  yearsToProject: number = 5,
  currentCalendarYear: number = new Date().getFullYear()
): SalaryProjectionPoint[] {
  const points: SalaryProjectionPoint[] = [];

  for (let i = 0; i <= yearsToProject; i++) {
    const projectedMonthly = currentMonthlySalary + i * incrementAmount;
    points.push({
      year: i,
      calendarYear: currentCalendarYear + i,
      monthlySalary: projectedMonthly,
      annualCTC: projectedMonthly * 12,
      cumulativeIncrement: i * incrementAmount,
    });
  }

  return points;
}

export const STANDARD_ACHIEVEMENTS_CATALOG: Omit<AchievementItem, "id" | "achievedDate" | "isUnlocked">[] = [
  {
    badgeKey: "first_year",
    title: "1 Year Milestone",
    description: "Completed your first 365 days of exemplary contribution.",
    category: "tenure",
    iconName: "Sparkles",
    emoji: "🎉",
  },
  {
    badgeKey: "three_years",
    title: "3 Years Completed",
    description: "Loyalty and steady performance over three glorious years.",
    category: "tenure",
    iconName: "Award",
    emoji: "⭐",
  },
  {
    badgeKey: "five_years",
    title: "5 Year Pillar",
    description: "Half a decade of steadfast leadership and company building.",
    category: "tenure",
    iconName: "Trophy",
    emoji: "🏆",
  },
  {
    badgeKey: "ten_years",
    title: "10 Year Legend",
    description: "A full decade of stellar loyalty and operational excellence.",
    category: "tenure",
    iconName: "Gem",
    emoji: "💎",
  },
  {
    badgeKey: "outstanding_attendance",
    title: "Outstanding Attendance",
    description: "Zero late check-ins for 3 consecutive months.",
    category: "excellence",
    iconName: "Zap",
    emoji: "⚡",
  },
  {
    badgeKey: "promotion",
    title: "Role Advancement",
    description: "Promoted to higher operational responsibilities.",
    category: "growth",
    iconName: "Rocket",
    emoji: "🚀",
  },
  {
    badgeKey: "training_completed",
    title: "Certified Specialist",
    description: "Successfully mastered all core operational safety and brew certifications.",
    category: "skill",
    iconName: "BookOpen",
    emoji: "📚",
  },
  {
    badgeKey: "customer_champion",
    title: "Customer Champion",
    description: "Recognized multiple times for outstanding customer service feedback.",
    category: "excellence",
    iconName: "Heart",
    emoji: "❤️",
  },
  {
    badgeKey: "team_player",
    title: "Team Player of the Quarter",
    description: "Always stepping up to cover shifts and support fellow staff members.",
    category: "growth",
    iconName: "Users",
    emoji: "🤝",
  },
];
