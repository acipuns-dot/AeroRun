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
        { day: "Monday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Tuesday", type: "easy", intensity: "easy", distFactor: 0.25 },
        { day: "Wednesday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Thursday", type: "intervals", intensity: "high", distFactor: 0.25 },
        { day: "Friday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Saturday", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Sunday", type: "long", intensity: "medium", distFactor: 0.35 },
    ],
    "intermediate": [
        { day: "Monday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Tuesday", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Wednesday", type: "intervals", intensity: "high", distFactor: 0.2 },
        { day: "Thursday", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Friday", type: "tempo", intensity: "medium", distFactor: 0.2 },
        { day: "Saturday", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Sunday", type: "long", intensity: "high", distFactor: 0.25 },
    ],
    "elite": [
        { day: "Monday", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Tuesday", type: "intervals", intensity: "high", distFactor: 0.15 },
        { day: "Wednesday", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Thursday", type: "tempo", intensity: "medium", distFactor: 0.2 },
        { day: "Friday", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Saturday", type: "easy", intensity: "easy", distFactor: 0.05 },
        { day: "Sunday", type: "long", intensity: "high", distFactor: 0.25 },
    ],
};

// --- ENGINE ---

export async function generateEnginePlan(stats: UserStats, variant: "steady" | "performance" | "health") {
    const paces = getCalculatedPaces(stats.best5kTime);
    const structure = WEEKLY_STRUCTURES[stats.goal] || WEEKLY_STRUCTURES["intermediate"];

    // Determine plan length
    let totalWeeks = 12;
    if (stats.targetDistance === "Full Marathon") totalWeeks = 16;

    // Level-based base volume
    const baseKm = stats.goal === "beginner" ? 20 : stats.goal === "intermediate" ? 35 : 55;

    // Distance-based multipliers
    const multMap = {
        "5km": 1.4,
        "10km": 1.7,
        "Half Marathon": 2.2,
        "Full Marathon": 2.8
    };
    const peakKm = baseKm * multMap[stats.targetDistance];

    const weeks = [];

    for (let w = 1; w <= totalWeeks; w++) {
        let weekMultiplier = 1;
        const progress = w / totalWeeks;

        // --- VOLUME PROGRESSION (Runna Scale) ---
        if (w <= 2) weekMultiplier = 0.65; // Onboarding
        else if (w % 4 === 0) weekMultiplier = 0.7; // Deload
        else if (w > totalWeeks - 2) weekMultiplier = 0.5; // Taper/Race
        else {
            // Linear ramp for volume from 0.75 to 1.0
            weekMultiplier = 0.75 + (progress * 0.25);
        }

        if (variant === "performance") weekMultiplier *= 1.1;
        if (variant === "health") weekMultiplier *= 0.85;

        const weekKm = peakKm * weekMultiplier;

        // --- INTENSITY PROGRESSION (Sharpening) ---
        // Paces start 5% slower in week 1 and 'sharpen' to goal pace by week 10
        const paceSharpening = w < totalWeeks - 2 ? 1.05 - (progress * 0.05) : 1.0;

        // Workout density (reps/blocks) grows from 70% to 100%
        const workoutScale = 0.7 + (progress * 0.3);

        const days = structure.map(t => {
            const dist = Math.round((weekKm * t.distFactor) * 10) / 10;

            let targetPace = "";
            let paceSec = paces.easy.min;
            let description = "";

            switch (t.type) {
                case "easy":
                    paceSec = paces.easy.min;
                    targetPace = secondsToPace(paceSec);
                    description = `- ${dist}km Easy Run Pace: ${targetPace}`;
                    break;
                case "long":
                    paceSec = paces.long.min;
                    targetPace = secondsToPace(paceSec);
                    description = `- ${dist}km Long Run Pace: ${targetPace}`;
                    break;
                case "intervals":
                    paceSec = paces.intervals * paceSharpening;
                    targetPace = secondsToPace(paceSec);
                    const baseReps = stats.goal === "beginner" ? 6 : stats.goal === "intermediate" ? 10 : 15;
                    const reps = Math.max(4, Math.round(baseReps * workoutScale));
                    description = `- 10m Warmup Pace: ${secondsToPace(paces.easy.max)}\n${reps}x\n- 400m Pace: ${targetPace}\n- 90s Recovery\n- 5m Cooldown Pace: ${secondsToPace(paces.easy.max)}`;
                    break;
                case "tempo":
                    paceSec = paces.tempo.min * paceSharpening;
                    targetPace = secondsToPace(paceSec);
                    const tempoDist = Math.max(2, Math.round(dist * 0.7 * workoutScale));
                    description = `- 2km Warmup Pace: ${secondsToPace(paces.easy.max)}\n- ${tempoDist}km Tempo Pace: ${targetPace}\n- 2km Cooldown Pace: ${secondsToPace(paces.easy.max)}`;
                    break;
                case "rest":
                    description = "Rest Day";
                    break;
            }

            const duration = t.type === "rest" ? 0 : Math.round(dist * (paceSec / 60));

            if (w === totalWeeks && t.day === "Sunday") {
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
