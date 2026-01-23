"use server";

import { UserStats } from "@/app/actions/groq";

/**
 * AEROENGINE (VDOT-based Training Logic)
 * Scientifically derived training plans using the Daniels VDOT model.
 */

// --- MATH UTILS ---

function paceToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    // Clean string: remove "Sub", "sub", spaces, etc.
    const clean = timeStr.replace(/[Ss]ub/g, '').trim();
    const parts = clean.split(":").map(Number);

    if (parts.length === 3) {
        // HH:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
        // MM:SS
        return parts[0] * 60 + parts[1];
    }
    // Fallback if just a number (assume minutes)
    return parts[0] * 60;
}

function secondsToPace(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

/**
 * Calculates VDOT from race results.
 * Formula: VO2 = -4.60 + 0.182258 * v + 0.000104 * v^2
 * f = 0.8 + 0.189439 * exp(-0.012778 * t) + 0.298955 * exp(-0.193260 * t)
 * VDOT = VO2 / f
 */
function calculateVDOT(timeSec: number, distKm: number): number {
    const t = timeSec / 60; // time in minutes
    const v = (distKm * 1000) / t; // velocity in m/min

    const vo2 = -4.60 + 0.182258 * v + 0.000104 * Math.pow(v, 2);
    const f = 0.8 + 0.189439 * Math.exp(-0.012778 * t) + 0.298955 * Math.exp(-0.193260 * t);

    const vdot = vo2 / f;

    // --- SAFETY CLAMPING ---
    // VDOT 15: ~40 min 5k (Beginner)
    // VDOT 85: World Class Elite
    return Math.max(15, Math.min(85, vdot));
}

/**
 * Returns velocity (m/min) for a specific % of VO2 Max.
 * Uses the inverse of the VO2 formula (quadratic solution).
 * v = (-0.182258 + sqrt(0.182258^2 - 4 * 0.000104 * (-4.60 - reqVO2))) / (2 * 0.000104)
 */
function getVelocityForIntensity(vdot: number, intensity: number): number {
    const reqVO2 = vdot * intensity;
    const a = 0.000104;
    const b = 0.182258;
    const c = -4.60 - reqVO2;

    return (-b + Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a);
}

function velocityToPaceSecPerKm(v: number): number {
    return 60 / (v / 1000);
}

/**
 * Estimates training paces using the scientific VDOT model.
 */
function getCalculatedPacesFromVDOT(vdot: number) {
    // Daniels Training Intensities (Approx)
    // Easy: 65-74% (using midpoint ~70%)
    // Threshold: 86-88% (using ~87%)
    // Interval: 95-100% (using ~97%)

    const easyPace = velocityToPaceSecPerKm(getVelocityForIntensity(vdot, 0.70));
    const thresholdPace = velocityToPaceSecPerKm(getVelocityForIntensity(vdot, 0.87));
    const intervalPace = velocityToPaceSecPerKm(getVelocityForIntensity(vdot, 1.00));

    // Wider Easy Range
    const easyMin = velocityToPaceSecPerKm(getVelocityForIntensity(vdot, 0.74));
    const easyMax = velocityToPaceSecPerKm(getVelocityForIntensity(vdot, 0.65));

    return {
        vdot,
        easy: { min: easyMin, max: easyMax },
        tempo: { min: thresholdPace * 0.98, max: thresholdPace * 1.02 },
        intervals: intervalPace,
        long: { min: Math.max(easyMin, 240), max: easyMax }, // Ensure long runs aren't insanely fast (>4:00/km) for most
    };
}

function getCalculatedPaces(best5k: string) {
    const pbSec = paceToSeconds(best5k);
    const vdot = calculateVDOT(pbSec, 5);
    return getCalculatedPacesFromVDOT(vdot);
}


// --- TEMPLATES ---

type WorkoutType = "easy" | "long" | "intervals" | "tempo" | "rest" | "hills" | "race" | "time-trial";

type PlanPhase = "Foundation" | "Build" | "Assessment" | "Peak" | "Taper";

interface DayTemplate {
    day: string;
    type: WorkoutType;
    intensity: "easy" | "medium" | "high";
    distFactor: number; // multiplier for baseline mileage
}

const WEEKLY_STRUCTURES: Record<string, DayTemplate[]> = {
    "beginner": [
        { day: "Day 1", type: "easy", intensity: "easy", distFactor: 0.25 },
        { day: "Day 2", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Day 3", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Day 4", type: "intervals", intensity: "high", distFactor: 0.25 },
        { day: "Day 5", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Day 6", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Day 7", type: "long", intensity: "medium", distFactor: 0.35 },
    ],
    "intermediate": [
        { day: "Day 1", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Day 2", type: "intervals", intensity: "high", distFactor: 0.2 },
        { day: "Day 3", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Day 4", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Day 5", type: "tempo", intensity: "medium", distFactor: 0.2 },
        { day: "Day 6", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Day 7", type: "long", intensity: "high", distFactor: 0.3 },
    ],
    "elite": [
        { day: "Day 1", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Day 2", type: "intervals", intensity: "high", distFactor: 0.15 },
        { day: "Day 3", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Day 4", type: "tempo", intensity: "medium", distFactor: 0.2 },
        { day: "Day 5", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Day 6", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Day 7", type: "long", intensity: "high", distFactor: 0.15 },
    ],
};

// --- ENGINE ---

function buildDynamicStructure(stats: UserStats): DayTemplate[] {
    const daysPerWeek = stats.daysPerWeek || 4;
    const longRunDay = stats.longRunDay || "Sunday";
    const selectedRunDays = stats.selectedRunDays || [];

    // Map day names to indices (0=Monday, 6=Sunday) - Monday first!
    const dayToIndex: Record<string, number> = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
        "Friday": 4, "Saturday": 5, "Sunday": 6
    };
    const longRunIndex = dayToIndex[longRunDay];

    // Priority-based workout sequence (DNA: Beginners get intensity but fewer sessions)
    const workoutPriority: WorkoutType[] = stats.goal === "beginner"
        ? ["intervals", "tempo", "easy", "easy"]
        : stats.goal === "intermediate"
            ? ["intervals", "tempo", "easy", "easy", "easy"]
            : ["intervals", "tempo", "intervals", "easy", "easy", "easy"];

    // 1. Identify active days
    const activeDays: number[] = [];
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    for (let i = 0; i < 7; i++) {
        const fullDayName = dayNames[i];
        if (selectedRunDays.length > 0) {
            if (selectedRunDays.includes(fullDayName)) activeDays.push(i);
        } else {
            // Default to spread if no days selected
            activeDays.push(i);
        }
    }

    // 2. Count Quality, Easy, and Long days
    let qCount = 0;
    let eCount = 0;
    const hasLong = activeDays.includes(longRunIndex);

    const plannedStructure: { index: number, type: WorkoutType }[] = [];

    // Assign Long Run first
    if (hasLong) {
        plannedStructure.push({ index: longRunIndex, type: "long" });
    }

    // Assign others from priority until activeDays or daysPerWeek exhausted
    const otherActiveDays = activeDays.filter(d => d !== longRunIndex);
    let assignedCount = hasLong ? 1 : 0;

    const qualityTypes: WorkoutType[] = ["intervals", "tempo"];
    const pool = [...workoutPriority];

    for (const d of otherActiveDays) {
        if (assignedCount >= daysPerWeek) break;

        // Find next workout that doesn't violate "side-by-side" rule
        // Quality runs (intervals, tempo) should not be next to EACH OTHER or the LONG RUN
        let workoutIdx = -1;
        const prevWorkout = plannedStructure.find(p => p.index === d - 1);
        const nextWorkout = plannedStructure.find(p => p.index === d + 1);

        const isPrevIntense = prevWorkout && (qualityTypes.includes(prevWorkout.type) || prevWorkout.type === "long");
        const isNextIntense = nextWorkout && (qualityTypes.includes(nextWorkout.type) || nextWorkout.type === "long");

        if (isPrevIntense || isNextIntense) {
            // Try to find a non-quality workout first
            workoutIdx = pool.findIndex(t => !qualityTypes.includes(t));
        }

        if (workoutIdx === -1) workoutIdx = 0; // Take next from priority

        const type = pool.splice(workoutIdx, 1)[0] || "easy";
        plannedStructure.push({ index: d, type });

        if (qualityTypes.includes(type)) qCount++;
        else eCount++;

        assignedCount++;
    }

    // 3. Ratios (DNA: 35% Quality, 25% Easy, 40% Long)
    const Q_RATIO = 0.35;
    const E_RATIO = 0.25;
    const L_RATIO = hasLong ? 0.40 : 0;

    // Redstribute if any count is 0
    let adjQRat = qCount > 0 ? Q_RATIO : 0;
    let adjERat = eCount > 0 ? E_RATIO : 0;
    let adjLRat = hasLong ? L_RATIO : 0;

    // Normalization
    const totalRatio = adjQRat + adjERat + adjLRat;
    adjQRat /= totalRatio;
    adjERat /= totalRatio;
    adjLRat /= totalRatio;

    // Build the 7-day week
    const week: DayTemplate[] = [];
    for (let i = 0; i < 7; i++) {
        const dayPlan = plannedStructure.find(p => p.index === i);
        if (dayPlan) {
            let distFactor = 0;
            if (dayPlan.type === "long") distFactor = adjLRat;
            else if (dayPlan.type === "intervals" || dayPlan.type === "tempo") distFactor = adjQRat / qCount;
            else distFactor = adjERat / eCount;

            week.push({
                day: `Day ${i + 1}`,
                type: dayPlan.type,
                intensity: (dayPlan.type === "easy" || dayPlan.type === "rest") ? "easy" : "high",
                distFactor
            });
        } else {
            week.push({ day: `Day ${i + 1}`, type: "rest", intensity: "easy", distFactor: 0 });
        }
    }

    return week;
}

// --- ENGINE UTILS ---

/**
 * Determines training phase based on Runna logic.
 */
function getPhase(week: number, total: number): PlanPhase {
    if (week <= 2) return "Foundation";
    if (week === 8) return "Assessment";
    if (week >= total - 1) return "Taper";
    if (week < 8) return "Build";
    return "Peak";
}

/**
 * Estimates equivalent race time for a different distance using Riegel's Formula.
 * T2 = T1 * (D2/D1)^1.07 (Using 1.07 for more realistic non-elite scaling)
 */
function getEquivalentPace(best5k: string, targetDistKm: number): number {
    const pbSec = paceToSeconds(best5k);
    const eqTotalSec = pbSec * Math.pow(targetDistKm / 5, 1.07);
    return eqTotalSec / targetDistKm;
}

// --- ENGINE ---
// ... (buildDynamicStructure remains the same)

export async function generateEnginePlan(stats: UserStats, variant: "steady" | "performance" | "health") {
    const paces = getCalculatedPaces(stats.best5kTime);
    const structure = buildDynamicStructure(stats);

    // --- AMBITIOUS GOAL DETECTION (VDOT-Based) ---
    const targetDistKm = getDistanceKm(stats.targetDistance);
    const targetSeconds = stats.targetTime ? paceToSeconds(stats.targetTime) : null;

    // 1. Current VDOT (Actual Fitness)
    const currentVDOT = paces.vdot;

    // 2. Goal VDOT (Required Fitness for target)
    let goalVDOT = currentVDOT;
    if (targetSeconds) {
        goalVDOT = calculateVDOT(targetSeconds, targetDistKm);
    } else {
        // Assume 3% improvement if no goal time is set
        goalVDOT = currentVDOT * 1.03;
    }

    // Gap: Positive = Goal requires HIGHER VDOT (ambitious)
    const ambitiousVDOTGap = goalVDOT - currentVDOT;

    // Base weeks by distance (Optimized for Runna-style phasing)
    const baseWeeks: Record<string, number> = {
        "5km": 13,
        "10km": 13,
        "Half Marathon": 16,
        "Full Marathon": 18
    };

    let totalWeeks = baseWeeks[stats.targetDistance] || 13;

    // If goal VDOT is significantly higher than current VDOT, extend the plan
    if (ambitiousVDOTGap > 5) { // Extremely ambitious (+5 VDOT levels is huge)
        totalWeeks = Math.max(totalWeeks, 24);
    } else if (ambitiousVDOTGap > 2) { // Ambitious (+2-5 VDOT levels)
        totalWeeks = stats.targetDistance === "Full Marathon" ? 22 : 18;
    }

    const baseKm = stats.goal === "beginner" ? 18 : stats.goal === "intermediate" ? 35 : 55;
    const multMap = { "5km": 1.3, "10km": 1.6, "Half Marathon": 2.2, "Full Marathon": 2.8 } as const;
    let peakKm = baseKm * (multMap[stats.targetDistance as keyof typeof multMap] || 1.3);

    // --- LEVEL-BASED VOLUME CAPS ---
    if (stats.goal === "beginner") {
        if (stats.targetDistance === "5km") peakKm = Math.min(peakKm, 25);
        if (stats.targetDistance === "10km") peakKm = Math.min(peakKm, 35);
    }

    const weeks = [];

    for (let w = 1; w <= totalWeeks; w++) {
        const phase = getPhase(w, totalWeeks);
        let weekMultiplier = 1;
        const progress = w / totalWeeks;

        // --- PHASE-BASED VOLUME MODIFIERS ---
        switch (phase) {
            case "Foundation":
                // Week 1: 50%, Week 2: 60%
                weekMultiplier = 0.4 + (w * 0.1);
                break;
            case "Build":
                // Gradual growth from 0.7 to 0.9 before Benchmark
                const buildPhaseProgress = (w - 2) / (8 - 2);
                weekMultiplier = 0.7 + (buildPhaseProgress * 0.2);
                break;
            case "Assessment":
                // Drop volume for Time Trial (Benchmark)
                weekMultiplier = 0.65;
                break;
            case "Peak":
                // Reach 1.0 peak (with extra damping for non-performance plans handled later)
                const peakPhaseProgress = (w - 8) / (totalWeeks - 2 - 8);
                weekMultiplier = 0.9 + (peakPhaseProgress * 0.1);
                break;
            case "Taper":
                // Marathon has a 3-week taper, others 2 weeks
                const taperWeeks = stats.targetDistance === "Full Marathon" ? 3 : 2;
                const taperIndex = w - (totalWeeks - taperWeeks); // 1, 2, or 3

                if (taperWeeks === 3) {
                    weekMultiplier = taperIndex === 1 ? 0.7 : taperIndex === 2 ? 0.5 : 0.3;
                } else {
                    weekMultiplier = taperIndex === 1 ? 0.5 : 0.3;
                }
                break;
        }

        // --- VARIANT SCALING ---
        if (variant === "performance") weekMultiplier *= 1.1;
        if (variant === "health") {
            weekMultiplier *= 0.85; // Lower overall floor for health-focused plans
        }

        const weekKm = peakKm * weekMultiplier;
        const currentPlanVDOT = currentVDOT + (ambitiousVDOTGap * progress);
        const paceSharpening = w < totalWeeks - 2 ? 1.0 : 0.99;
        const weeklyPaces = getCalculatedPacesFromVDOT(currentPlanVDOT);
        const workoutScale = 0.7 + (progress * 0.3);

        // --- QUALITY ALTERNATION LOGIC (For 3-day plans) ---
        const isAlternatingWeek = w % 2 === 0;

        const days = structure.map(t => {
            // --- WORKOUT TYPE LOGIC (Alternation + Safety) ---
            let workoutType = t.type;

            // 1. Quality Alternation for 3-day plans
            if ((stats.daysPerWeek ?? 3) <= 3 && (t.type === "intervals" || t.type === "tempo")) {
                workoutType = isAlternatingWeek ? "tempo" : "intervals";
            }

            // 2. Week 1 Safety Conversion (All intensity -> Easy)
            const finalType = w === 1 && (workoutType === "intervals" || workoutType === "tempo" || workoutType === "long")
                ? "easy"
                : workoutType;

            const baseDist = Math.round((weekKm * t.distFactor) * 10) / 10;

            let targetPace = "";
            let paceSec = weeklyPaces.easy.min;
            let description = "";
            let hrZone = "Zone 2";

            // --- TAPER LOGIC ---
            const isTaper = w >= totalWeeks - 1;
            const taperDistFactor = isTaper ? 0.6 : 1.0;
            const finalDist = t.type === "long" || t.type === "easy" ? baseDist * taperDistFactor : baseDist;

            let structuredWorkout = "";

            // --- PHASE LABELING ---
            const typeLabel = t.type.charAt(0).toUpperCase() + t.type.slice(1);
            const phaseSuffix = phase === "Foundation" ? " (Foundation)" :
                phase === "Assessment" ? " (Assessment)" :
                    phase === "Taper" ? " (Taper)" : "";
            const workoutTitle = `${typeLabel}${phaseSuffix}`;

            switch (t.type) {
                case "easy": {
                    const easyRange = weeklyPaces.easy.max - weeklyPaces.easy.min;
                    const dayIndex = structure.indexOf(t);
                    const variation = (dayIndex % 3) * 0.33;
                    paceSec = weeklyPaces.easy.min + (easyRange * variation);
                    targetPace = secondsToPace(paceSec);
                    const easyPace = secondsToPace(weeklyPaces.easy.max);
                    hrZone = "Zone 2";

                    let phaseDescription = "Focus on recovery and building your aerobic base.";
                    if (phase === "Foundation") phaseDescription = "Low impact to let your body adapt to the new plan.";
                    if (phase === "Taper") phaseDescription = "Short and easy to keep the legs moving while shedding fatigue.";

                    description = `💡 ${workoutTitle}: ${phaseDescription}\n- 5m Warmup Pace: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Easy Run Pace: ${targetPace}\n- 5m Cooldown Pace: ${easyPace}\n- HR: ${hrZone}`;
                    structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}\n\nCooldown\n- 5m ${easyPace}`;
                    break;
                }

                case "long": {
                    const easyPace = secondsToPace(weeklyPaces.easy.max);
                    if (w === 1) {
                        const easyRange = weeklyPaces.easy.max - weeklyPaces.easy.min;
                        const dayIndex = structure.indexOf(t);
                        const variation = (dayIndex % 3) * 0.33;
                        paceSec = weeklyPaces.easy.min + (easyRange * variation);
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 2";
                        description = `- 5m Warmup Pace: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Easy Run Pace: ${targetPace}\n- 5m Cooldown Pace: ${easyPace}`;
                        structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}\n\nCooldown\n- 5m ${easyPace}`;
                    } else {
                        paceSec = weeklyPaces.long.min;
                        targetPace = secondsToPace(weeklyPaces.long.min);
                        hrZone = "Zone 2-3";

                        if (stats.targetDistance === "Full Marathon") {
                            // Marathon Pace blocks in peak weeks
                            if (phase === "Peak" && w % 2 === 0) {
                                const mpPace = secondsToPace(paceSec * 0.92); // Approx 8% faster than long run
                                const easyDist = Math.round(finalDist * 0.6 * 10) / 10;
                                const mpDist = Math.round((finalDist - easyDist) * 10) / 10;
                                description = `🏃 MARATHON PACE BLOCK\n- 5m Warmup: ${easyPace}\n- ${easyDist}km Easy: ${targetPace}\n- ${mpDist}km @ Goal Marathon Pace: ${mpPace}\n- 5m Cooldown: ${easyPace}`;
                                structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${easyDist}km ${targetPace}\n- ${mpDist}km ${mpPace}\n\nCooldown\n- 5m ${easyPace}`;
                            } else {
                                description = `- 5m Warmup: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Steady Long Run: ${targetPace}\n- 5m Cooldown: ${easyPace}`;
                                structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}\n\nCooldown\n- 5m ${easyPace}`;
                            }
                        } else if (stats.targetDistance === "Half Marathon") {
                            if (phase === "Peak" && w % 3 === 0) {
                                const hmPace = secondsToPace(paceSec * 0.94);
                                const easyDist = Math.round(finalDist * 0.7 * 10) / 10;
                                const hmDist = Math.round((finalDist - easyDist) * 10) / 10;
                                description = `🏃 HALF MARATHON PACE FINISH\n- 5m Warmup: ${easyPace}\n- ${easyDist}km Easy: ${targetPace}\n- ${hmDist}km @ Goal HM Pace: ${hmPace}\n- 5m Cooldown: ${easyPace}`;
                                structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${easyDist}km ${targetPace}\n- ${hmDist}km ${hmPace}\n\nCooldown\n- 5m ${easyPace}`;
                            } else {
                                description = `- 5m Warmup: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Long Run: ${targetPace}\n- 5m Cooldown: ${easyPace}`;
                                structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}\n\nCooldown\n- 5m ${easyPace}`;
                            }
                        } else {
                            description = `- 5m Warmup Pace: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Long Run Pace: ${targetPace}\n- 5m Cooldown Pace: ${easyPace}`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}\n\nCooldown\n- 5m ${easyPace}`;
                        }
                    }
                    break;
                }

                case "intervals": {
                    const easyPace = secondsToPace(weeklyPaces.easy.max);
                    if (w === 1) {
                        const easyRange = weeklyPaces.easy.max - weeklyPaces.easy.min;
                        const dayIndex = structure.indexOf(t);
                        const variation = (dayIndex % 3) * 0.33;
                        paceSec = weeklyPaces.easy.min + (easyRange * variation);
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 2";
                        description = `- 5m Warmup Pace: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Easy Run (Intro) Pace: ${targetPace}\n- 5m Cooldown Pace: ${easyPace}`;
                        structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}\n\nCooldown\n- 5m ${easyPace}`;
                    } else {
                        paceSec = weeklyPaces.intervals * paceSharpening;
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 4-5";

                        const isSpeedDay = stats.targetDistance === "5km" || stats.targetDistance === "10km";
                        let reps = stats.goal === "beginner" ? 6 : stats.goal === "intermediate" ? 8 : 12;
                        reps = Math.round(reps * workoutScale);

                        if (phase === "Taper") {
                            // Taper Intervals: Maintain intensity, drop volume by 50%
                            const taperReps = Math.max(2, Math.round(reps * 0.5));
                            description = `🔥 TAPER INTERVALS (Speed Maintenance)\n- 5m Warmup Pace: ${easyPace}\n${taperReps}x\n- 400m Pace: ${targetPace}\n- 2m Recovery\n- 5m Cooldown Pace: ${easyPace}\n- HR: ${hrZone}`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set ${taperReps}x\n- 400m ${targetPace}\n- 2m recovery\n\nCooldown\n- 5m ${easyPace}`;
                        } else if (isSpeedDay) {
                            description = `- 5m Warmup Pace: ${easyPace}\n${reps}x\n- 400m Pace: ${targetPace}\n- 90s Recovery\n- 5m Cooldown Pace: ${easyPace}\n- HR: ${hrZone}`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set ${reps}x\n- 400m ${targetPace}\n- 90s recovery\n\nCooldown\n- 5m ${easyPace}`;
                        } else {
                            // Steady State for HM/FM
                            const repDist = "1km";
                            const adjReps = Math.max(3, Math.round(reps * 0.5));
                            const threshPace = secondsToPace(weeklyPaces.tempo.max * paceSharpening);
                            description = `🛡️ STEADY STATE (Aerobic Power)\n- 5m Warmup Pace: ${easyPace}\n${adjReps}x\n- ${repDist} Pace: ${threshPace}\n- 2m Recovery\n- 5m Cooldown Pace: ${easyPace}\n- HR: Zone 4 (Threshold)`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set ${adjReps}x\n- ${repDist} ${threshPace}\n- 2m recovery\n\nCooldown\n- 5m ${easyPace}`;
                        }
                    }
                    break;
                }

                case "tempo": {
                    // Week 1 Safety: No tempo in Week 1
                    if (w === 1) {
                        const easyRange = weeklyPaces.easy.max - weeklyPaces.easy.min;
                        const dayIndex = structure.indexOf(t);
                        const variation = (dayIndex % 3) * 0.33;
                        paceSec = weeklyPaces.easy.min + (easyRange * variation);
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 2";
                        description = `💡 ${workoutTitle}: Foundation Week intro. Keeping it easy.\n- ${Math.round(finalDist * 10) / 10}km Easy Run (Intro) Pace: ${targetPace}\n- HR: ${hrZone}`;
                        structuredWorkout = `Warmup\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}`;
                    } else {
                        paceSec = weeklyPaces.tempo.min * paceSharpening;
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 3-4";
                        const tempoDist = Math.max(3, Math.round(finalDist * 0.75 * workoutScale));
                        const easyPace = secondsToPace(weeklyPaces.easy.max);

                        description = `💡 ${workoutTitle}: Build your threshold and ability to hold speed.\n- 2km Warmup Pace: ${easyPace}\n- ${tempoDist}km Tempo Pace: ${targetPace}\n- 2km Cooldown Pace: ${easyPace}\n- HR: ${hrZone} (Comfortably Hard)`;
                        structuredWorkout = `Warmup\n- 2km ${easyPace}\n\nMain Set\n- ${tempoDist}km ${targetPace}\n\nCooldown\n- 2km ${easyPace}`;
                    }
                    break;
                }

                case "rest":
                    description = "Rest Day";
                    structuredWorkout = "";
                    break;
            }

            const duration = t.type === "rest" ? 0 : Math.round(finalDist * (paceSec / 60)) + 10;

            if (w === totalWeeks && t.day === "Day 7") {
                return {
                    day: t.day,
                    type: "race",
                    description: `🏁 RACE DAY: Go out and smash your ${stats.targetDistance}! You've trained hard for this moment. Good luck!`,
                    distance: getDistanceKm(stats.targetDistance),
                    duration: 0,
                    target_pace: "GOAL PACE"
                };
            }

            // --- BENCHMARK LOGIC (Week 8) ---
            if (w === 8 && (t.type === "intervals" || t.type === "tempo")) {
                return {
                    day: t.day,
                    type: "time-trial",
                    description: `⏱️ BENCHMARK: 5k Time Trial\n- Warmup: 15m Easy\n- Main Set: 5km at MAXIMUM sustainable effort\n- Cooldown: 10m Easy\n- 💡 Reasoning: This mid-plan test helps us measure your progress and recalibrate your future targets.`,
                    distance: 5,
                    duration: 45,
                    target_pace: "MAX EFFORT",
                    structured_workout: `Warmup\n- 15m Easy\n\nMain Set\n- 5km Max Effort\n\nCooldown\n- 10m Easy`
                };
            }

            // --- PACING SAFETY CHECK ---
            // Ensure long run pace isn't faster than easy run pace for beginners to prevent burnout
            if (stats.goal === "beginner" && t.type === "long") {
                paceSec = Math.max(paceSec, weeklyPaces.easy.min);
                targetPace = secondsToPace(paceSec);
            }

            return {
                day: t.day,
                type: finalType,
                description,
                distance: finalDist,
                duration,
                target_pace: targetPace,
                structured_workout: structuredWorkout
            };
        });

        weeks.push({
            week_number: w,
            days
        });
    }

    return { weeks, total_weeks: totalWeeks };
}

/**
 * Recalibrates the plan based on a benchmark result.
 * Currently a placeholder for future adaptive integration.
 */
export async function recalibratePlan(vdot: number) {
    // Logic will go here to update the user's data context and trigger a plan refresh
    return { success: true, newVdot: vdot };
}

function getDistanceKm(dist: string): number {
    if (dist === "10km") return 10;
    if (dist === "Half Marathon") return 21.1;
    if (dist === "Full Marathon") return 42.2;
    return 5;
}
