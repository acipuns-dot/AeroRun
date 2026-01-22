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
 */
function getCalculatedPaces(best5k: string) {
    const pbSec = paceToSeconds(best5k);
    const pbSecPerKm = pbSec / 5;

    return {
        easy: { min: pbSecPerKm * 1.35, max: pbSecPerKm * 1.55 },
        tempo: { min: pbSecPerKm * 1.12, max: pbSecPerKm * 1.18 },
        intervals: pbSecPerKm * 0.98, // Slightly faster than 5k pace
        long: { min: pbSecPerKm * 1.40, max: pbSecPerKm * 1.60 },
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

    // Map day names to indices (0=Sunday, 6=Saturday) - Sunday first!
    const dayToIndex: Record<string, number> = {
        "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3,
        "Thursday": 4, "Friday": 5, "Saturday": 6
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
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
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

export async function generateEnginePlan(stats: UserStats, variant: "steady" | "performance" | "health") {
    const paces = getCalculatedPaces(stats.best5kTime);
    const structure = buildDynamicStructure(stats);

    // --- AMBITIOUS GOAL DETECTION ---
    const pbSec = paceToSeconds(stats.best5kTime);
    const pbPaceSec = pbSec / 5;
    const targetDistKm = getDistanceKm(stats.targetDistance);
    const targetSeconds = stats.targetTime ? paceToSeconds(stats.targetTime) : null;
    const goalPaceSec = targetSeconds ? targetSeconds / targetDistKm : pbPaceSec * 0.98;

    // Gap: Negative = Goal is FASTER than PB (ambitious), Positive = Goal is SLOWER (conservative)
    const paceGap = pbPaceSec - goalPaceSec;

    let totalWeeks = stats.targetDistance === "Full Marathon" ? 16 : 12;

    // If goal pace is significantly faster than current PB, extend the plan
    if (paceGap < -10) { // Goal is >10s/km faster than 5k PB
        totalWeeks = stats.targetDistance === "Full Marathon" ? 22 : 18;
    } else if (paceGap < -25) { // Goal is >25s/km faster (very ambitious)
        totalWeeks = 24;
    }

    const baseKm = stats.goal === "beginner" ? 20 : stats.goal === "intermediate" ? 35 : 55;
    const multMap = { "5km": 1.4, "10km": 1.7, "Half Marathon": 2.2, "Full Marathon": 2.8 } as const;
    const peakKm = baseKm * (multMap[stats.targetDistance as keyof typeof multMap] || 1.4);

    const weeks = [];

    for (let w = 1; w <= totalWeeks; w++) {
        let weekMultiplier = 1;
        const progress = w / totalWeeks;

        if (w <= 2) weekMultiplier = 0.65;
        else if (w % 4 === 0) weekMultiplier = 0.7;
        else if (w > totalWeeks - 1) weekMultiplier = 0.3;
        else if (w === totalWeeks - 1) weekMultiplier = 0.5;
        else weekMultiplier = 0.75 + (progress * 0.25);

        if (variant === "performance") weekMultiplier *= 1.1;
        if (variant === "health") weekMultiplier *= 0.85;

        const weekKm = peakKm * weekMultiplier;

        // --- INTENSITY PROGRESSION (Ambitious Sharpening) ---
        // If goal is ambitious (faster than PB), we start slightly slower than PB and build TO the goal pace.
        let paceSharpening = 1.0;
        if (paceGap < 0) { // Ambitious goal (goal pace is faster than PB)
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
                    paceSec = paces.easy.min;
                    targetPace = secondsToPace(paceSec);
                    hrZone = "Zone 2";
                    description = `- ${Math.round(finalDist * 10) / 10}km Easy Run Pace: ${targetPace}\n- HR: ${hrZone} (Conversation Pace)`;
                    break;

                case "long":
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
                    break;

                case "intervals":
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
                    break;

                case "tempo":
                    paceSec = paces.tempo.min * paceSharpening;
                    targetPace = secondsToPace(paceSec);
                    hrZone = "Zone 3-4";
                    const tempoDist = Math.max(3, Math.round(finalDist * 0.75 * workoutScale));

                    description = `- 2km Warmup Pace: ${secondsToPace(paces.easy.max)}\n- ${tempoDist}km Tempo Pace: ${targetPace}\n- 2km Cooldown Pace: ${secondsToPace(paces.easy.max)}\n- HR: ${hrZone} (Comfortably Hard)`;
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

            return {
                day: t.day,
                type: t.type,
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
