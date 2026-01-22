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

    // Map day names to indices (0=Monday, 6=Sunday)
    const dayToIndex: Record<string, number> = {
        "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
        "Friday": 4, "Saturday": 5, "Sunday": 6
    };
    const longRunIndex = dayToIndex[longRunDay];

    // Base workout types based on level and days available
    const workoutPriority: WorkoutType[] = stats.goal === "beginner"
        ? ["long", "intervals", "easy", "easy"]
        : stats.goal === "intermediate"
            ? ["long", "intervals", "tempo", "easy", "easy"]
            : ["long", "intervals", "tempo", "easy", "easy", "easy"];

    // Build the 7-day week
    const week: DayTemplate[] = [];
    let workoutIndex = 0;

    for (let i = 0; i < 7; i++) {
        const dayName = `Day ${i + 1}`;

        if (i === longRunIndex) {
            // Long run day
            week.push({ day: dayName, type: "long", intensity: "high", distFactor: 0.35 });
        } else if (workoutIndex < daysPerWeek - 1) {
            // Running day
            const type = workoutPriority[workoutIndex] || "easy";
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

    const paceGap = pbPaceSec - goalPaceSec;

    let totalWeeks = stats.targetDistance === "Full Marathon" ? 16 : 12;
    if (paceGap > 10) totalWeeks = stats.targetDistance === "Full Marathon" ? 22 : 18;
    else if (paceGap > 25) totalWeeks = 24;

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
        const paceSharpening = paceGap > 0 ? (1.05 - (progress * (1.05 - (goalPaceSec / pbPaceSec)))) : (w < totalWeeks - 2 ? 1.05 - (progress * 0.05) : 1.0);
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
