"use server";

import { UserStats } from "@/app/actions/groq";

/**
 * DETERMINISTIC RUNNING ENGINE (inspired by Runna/Pfitzinger)
 * This file replaces the core scheduling logic of the AI.
 */

// --- MATH UTILS ---

function paceToSeconds(paceStr: string): number {
    const parts = paceStr.split(":").map(Number);
    return parts[0] * 60 + (parts[1] || 0);
}

function secondsToPace(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

/**
 * Estimates training paces using a simplified VDOT model.
 * Adjusted to prevent walking-pace recommendations.
 */
function getCalculatedPaces(best5k: string) {
    const pbSec = paceToSeconds(best5k);
    const pbSecPerKm = pbSec / 5;

    // Calculate base paces
    const easyMin = pbSecPerKm * 1.25; // Reduced from 1.35
    const easyMax = pbSecPerKm * 1.45; // Reduced from 1.55

    // Cap easy pace at 9:30/km (570 seconds) to prevent walking pace
    const cappedEasyMax = Math.min(easyMax, 570);

    return {
        easy: { min: easyMin, max: cappedEasyMax },
        tempo: { min: pbSecPerKm * 1.10, max: pbSecPerKm * 1.15 }, // Tightened from 1.12-1.18
        intervals: pbSecPerKm * 0.98, // Slightly faster than 5k pace
        long: { min: pbSecPerKm * 1.30, max: Math.min(pbSecPerKm * 1.50, 570) }, // Reduced and capped
    };
}

// --- TEMPLATES ---

type WorkoutType = "easy" | "long" | "intervals" | "tempo" | "rest" | "hills" | "race";

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

    // Base workout types based on level (excluding long run, which is handled separately)
    // Easy runs first for recovery, then quality sessions
    const workoutPriority: WorkoutType[] = stats.goal === "beginner"
        ? ["easy", "intervals", "easy"]
        : stats.goal === "intermediate"
            ? ["easy", "intervals", "tempo", "easy"]
            : ["easy", "intervals", "tempo", "easy", "easy"];

    // Build the 7-day week (Sunday to Saturday)
    const week: DayTemplate[] = [];
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    let workoutIndex = 0;

    for (let i = 0; i < 7; i++) {
        const dayName = `Day ${i + 1}`;
        const fullDayName = dayNames[i];

        // Check if this day is available for running
        const isDayAvailable = selectedRunDays.length > 0
            ? selectedRunDays.includes(fullDayName)
            : true; // If no specific days selected, all days are available

        if (i === longRunIndex && isDayAvailable) {
            // Long run day
            week.push({ day: dayName, type: "long", intensity: "high", distFactor: 0.35 });
        } else if (isDayAvailable && workoutIndex < workoutPriority.length) {
            // Running day - use the workout priority list
            const type = workoutPriority[workoutIndex];
            const distFactor = type === "intervals" ? 0.2 : type === "tempo" ? 0.2 : 0.15;
            week.push({ day: dayName, type, intensity: type === "easy" ? "easy" : "high", distFactor });
            workoutIndex++;
        } else {
            // Rest day
            week.push({ day: dayName, type: "rest", intensity: "easy", distFactor: 0 });
        }
    }

    return week;
}

/**
 * Estimates equivalent race time for a different distance using Riegel's Formula
 * T2 = T1 * (D2/D1)^1.06
 */
function getEquivalentPace(best5k: string, targetDistKm: number): number {
    const pbSec = paceToSeconds(best5k);
    const eqTotalSec = pbSec * Math.pow(targetDistKm / 5, 1.06);
    return eqTotalSec / targetDistKm;
}

// --- ENGINE ---
// ... (buildDynamicStructure remains the same)

export async function generateEnginePlan(stats: UserStats, variant: "steady" | "performance" | "health") {
    const paces = getCalculatedPaces(stats.best5kTime);
    const structure = buildDynamicStructure(stats);

    // --- AMBITIOUS GOAL DETECTION (Riegel-Adjusted) ---
    const targetDistKm = getDistanceKm(stats.targetDistance);
    const targetSeconds = stats.targetTime ? paceToSeconds(stats.targetTime) : null;

    // 1. Calculate the pace the user is CAPABLE of today at this target distance
    const eqPaceSec = getEquivalentPace(stats.best5kTime, targetDistKm);

    // 2. Calculate the pace they WANT to run
    // If no target time provided, we assume they want to slightly improve (2% faster than equivalent)
    const goalPaceSec = targetSeconds ? targetSeconds / targetDistKm : eqPaceSec * 0.98;

    // Gap: Positive = Goal is FASTER than their today-equivalent (ambitious)
    // Negative = Goal is SLOWER than their today-equivalent (conservative)
    const ambitiousPaceGap = eqPaceSec - goalPaceSec;

    let totalWeeks = stats.targetDistance === "Full Marathon" ? 16 : 12;

    // If goal pace is significantly faster than their today-equivalent, extend the plan
    // for a safer build-up and more time for physiological adaptation.
    if (ambitiousPaceGap > 25) { // Very ambitious (e.g. 25s/km faster than equivalent)
        totalWeeks = 24;
    } else if (ambitiousPaceGap > 10) { // Ambitious (e.g. 10s/km faster than equivalent)
        totalWeeks = stats.targetDistance === "Full Marathon" ? 22 : 18;
    }

    const baseKm = stats.goal === "beginner" ? 20 : stats.goal === "intermediate" ? 35 : 55;
    const multMap = { "5km": 1.4, "10km": 1.7, "Half Marathon": 2.2, "Full Marathon": 2.8 } as const;
    const peakKm = baseKm * (multMap[stats.targetDistance as keyof typeof multMap] || 1.4);

    const weeks = [];

    for (let w = 1; w <= totalWeeks; w++) {
        let weekMultiplier = 1;
        const progress = w / totalWeeks;

        if (w === 1) weekMultiplier = 0.5; // Starter Week: Very conservative
        else if (w === 2) weekMultiplier = 0.65;
        else if (w % 4 === 0) weekMultiplier = 0.7;
        else if (w > totalWeeks - 1) weekMultiplier = 0.3;
        else if (w === totalWeeks - 1) weekMultiplier = 0.5;
        else weekMultiplier = 0.75 + (progress * 0.25);

        if (variant === "performance") weekMultiplier *= 1.1;
        if (variant === "health") weekMultiplier *= 0.85;

        const weekKm = peakKm * weekMultiplier;

        // --- INTENSITY PROGRESSION (Ambitious Sharpening) ---
        // If goal is ambitious (Faster than today's equivalent), we start slightly slower than PB and build TO the goal pace.
        let paceSharpening = 1.0;
        const pbPaceSec = paceToSeconds(stats.best5kTime) / 5;

        if (ambitiousPaceGap > 0) { // Ambitious goal (goal pace is faster than equivalent)
            const targetMult = goalPaceSec / pbPaceSec;
            paceSharpening = 1.05 - (progress * (1.05 - targetMult));
        } else {
            // Standard sharpening
            paceSharpening = w < totalWeeks - 2 ? 1.05 - (progress * 0.05) : 1.0;
        }
        const workoutScale = 0.7 + (progress * 0.3);

        const days = structure.map(t => {
            const dist = Math.round((weekKm * t.distFactor) * 10) / 10;

            let targetPace = "";
            let paceSec = paces.easy.min;
            let description = "";
            let hrZone = "Zone 2";

            // --- TAPER LOGIC (Point 4) ---
            // In taper weeks (last 2), volume drops significantly, but intensity stays.
            const isTaper = w >= totalWeeks - 1;
            const taperDistFactor = isTaper ? 0.6 : 1.0;
            const finalDist = t.type === "long" || t.type === "easy" ? dist * taperDistFactor : dist;

            switch (t.type) {
                case "easy":
                    // Add variety: vary pace within the easy range based on day index
                    const easyRange = paces.easy.max - paces.easy.min;
                    const dayIndex = structure.indexOf(t);
                    const variation = (dayIndex % 3) * 0.33; // Cycles through 0%, 33%, 66% of range
                    paceSec = paces.easy.min + (easyRange * variation);
                    targetPace = secondsToPace(paceSec);
                    hrZone = "Zone 2";
                    description = `- ${Math.round(finalDist * 10) / 10}km Easy Run Pace: ${targetPace}\n- HR: ${hrZone} (Conversation Pace)`;
                    break;

                case "long":
                    // Week 1 Safety: Never do a long run in Week 1!
                    if (w === 1) {
                        // Convert to easy run for Week 1
                        const easyRange = paces.easy.max - paces.easy.min;
                        const dayIndex = structure.indexOf(t);
                        const variation = (dayIndex % 3) * 0.33;
                        paceSec = paces.easy.min + (easyRange * variation);
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 2";
                        description = `- ${Math.round(finalDist * 10) / 10}km Easy Run Pace: ${targetPace}\n- HR: ${hrZone} (Conversation Pace)`;
                    } else {
                        paceSec = paces.long.min;
                        targetPace = secondsToPace(paces.long.min);
                        hrZone = "Zone 2-3";

                        // Race Specificity (Point 1)
                        if (stats.targetDistance === "Full Marathon" || stats.targetDistance === "Half Marathon") {
                            if (w > 6 && !isTaper && w % 2 === 0) {
                                // Fast Finish Long Run
                                description = `- ${Math.round(finalDist * 10) / 10}km Long Run\n- First 70% Easy Pace: ${targetPace}\n- Last 30% @ Goal Race Pace\n- HR: Zone 2 -> Zone 3`;
                            } else {
                                description = `- ${Math.round(finalDist * 10) / 10}km Steady Long Run Pace: ${targetPace}\n- HR: ${hrZone}`;
                            }
                        } else {
                            description = `- ${Math.round(finalDist * 10) / 10}km Long Run Pace: ${targetPace}\n- HR: ${hrZone}`;
                        }
                    }
                    break;

                case "intervals":
                    // Week 1 Safety: No intervals in Week 1
                    if (w === 1) {
                        const easyRange = paces.easy.max - paces.easy.min;
                        const dayIndex = structure.indexOf(t);
                        const variation = (dayIndex % 3) * 0.33;
                        paceSec = paces.easy.min + (easyRange * variation);
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 2";
                        description = `- ${Math.round(finalDist * 10) / 10}km Easy Run (Intro) Pace: ${targetPace}\n- HR: ${hrZone}`;
                    } else {
                        paceSec = paces.intervals * paceSharpening;
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 4-5";

                        // Race Specific Intervals (Point 1) & Level (Point 3)
                        const isSpeedDay = stats.targetDistance === "5km" || stats.targetDistance === "10km";
                        let reps = stats.goal === "beginner" ? 6 : stats.goal === "intermediate" ? 8 : 12;
                        reps = Math.round(reps * workoutScale);

                        if (isSpeedDay) {
                            // VO2 Max Focus
                            description = `- 10m Warmup Pace: ${secondsToPace(paces.easy.max)}\n${reps}x\n- 400m Pace: ${targetPace}\n- 90s Recovery\n- 5m Cooldown Pace: ${secondsToPace(paces.easy.max)}\n- HR: ${hrZone}`;
                        } else {
                            // Threshold Intevals for HM/FM
                            const repDist = "1km"; // Simplified block for stability
                            const adjReps = Math.max(3, Math.round(reps * 0.5)); // Fewer reps for longer distance
                            const threshPace = secondsToPace(paces.tempo.max * paceSharpening);
                            description = `- 10m Warmup Pace: ${secondsToPace(paces.easy.max)}\n${adjReps}x\n- ${repDist} Pace: ${threshPace}\n- 2m Recovery\n- 5m Cooldown\n- HR: Zone 4 (Threshold)`;
                        }
                        if (isTaper) description = `- 10m Warmup\n4x\n- 400m Pace: ${targetPace}\n- 90s Recovery\n- 5m Cooldown`; // Sharp taper
                    }
                    break;

                case "tempo":
                    // Week 1 Safety: No tempo in Week 1
                    if (w === 1) {
                        const easyRange = paces.easy.max - paces.easy.min;
                        const dayIndex = structure.indexOf(t);
                        const variation = (dayIndex % 3) * 0.33;
                        paceSec = paces.easy.min + (easyRange * variation);
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 2";
                        description = `- ${Math.round(finalDist * 10) / 10}km Easy Run (Intro) Pace: ${targetPace}\n- HR: ${hrZone}`;
                    } else {
                        paceSec = paces.tempo.min * paceSharpening;
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 3-4";
                        const tempoDist = Math.max(3, Math.round(finalDist * 0.75 * workoutScale));

                        description = `- 2km Warmup Pace: ${secondsToPace(paces.easy.max)}\n- ${tempoDist}km Tempo Pace: ${targetPace}\n- 2km Cooldown Pace: ${secondsToPace(paces.easy.max)}\n- HR: ${hrZone} (Comfortably Hard)`;
                    }
                    break;

                case "rest":
                    description = "Rest Day";
                    break;
            }

            const duration = t.type === "rest" ? 0 : Math.round(dist * (paceSec / 60));

            if (w === totalWeeks && t.day === "Day 7") {
                return {
                    day: t.day,
                    type: "race",
                    description: `🏁 RACE DAY: ${stats.targetDistance}!`,
                    distance: getDistanceKm(stats.targetDistance),
                    duration: 0,
                    target_pace: "GOAL PACE"
                };
            }

            // Override type for Week 1 Quality Conversions
            const finalType = w === 1 && (t.type === "intervals" || t.type === "tempo" || t.type === "long")
                ? "easy"
                : t.type;

            return {
                day: t.day,
                type: finalType,
                description,
                distance: dist,
                duration,
                target_pace: targetPace
            };
        });

        weeks.push({
            week_number: w,
            days
        });
    }

    return { weeks, total_weeks: totalWeeks };
}

function getDistanceKm(dist: string): number {
    if (dist === "10km") return 10;
    if (dist === "Half Marathon") return 21.1;
    if (dist === "Full Marathon") return 42.2;
    return 5;
}
