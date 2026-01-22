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
        { day: "Tuesday", type: "easy", intensity: "easy", distFactor: 0.2 },
        { day: "Wednesday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Thursday", type: "intervals", intensity: "high", distFactor: 0.25 },
        { day: "Friday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Saturday", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Sunday", type: "long", intensity: "medium", distFactor: 0.4 },
    ],
    "intermediate": [
        { day: "Monday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Tuesday", type: "easy", intensity: "easy", distFactor: 0.15 },
        { day: "Wednesday", type: "intervals", intensity: "high", distFactor: 0.2 },
        { day: "Thursday", type: "rest", intensity: "easy", distFactor: 0 },
        { day: "Friday", type: "tempo", intensity: "medium", distFactor: 0.2 },
        { day: "Saturday", type: "easy", intensity: "easy", distFactor: 0.1 },
        { day: "Sunday", type: "long", intensity: "high", distFactor: 0.35 },
    ],
};

// --- ENGINE ---

export async function generateEnginePlan(stats: UserStats, variant: "steady" | "performance" | "health") {
    const paces = getCalculatedPaces(stats.best5kTime);
    const structure = WEEKLY_STRUCTURES[stats.goal === "elite" ? "intermediate" : stats.goal];

    // Determine plan length
    let totalWeeks = 12;
    if (stats.targetDistance === "Full Marathon") totalWeeks = 16;

    // Scale volume based on target
    const baseKm = stats.goal === "beginner" ? 20 : 35;
    const peakKm = stats.targetDistance === "5km" ? baseKm * 1.5 :
        stats.targetDistance === "10km" ? baseKm * 1.8 :
            stats.targetDistance === "Half Marathon" ? baseKm * 2.2 : baseKm * 3;

    const weeks = [];

    for (let w = 1; w <= totalWeeks; w++) {
        let weekMultiplier = 1;

        // Periodization
        if (w <= 2) weekMultiplier = 0.7; // Base 1
        else if (w === 4 || w === 8 || w === 12) weekMultiplier = 0.6; // Down Weeks
        else if (w > 8 && w < totalWeeks - 1) weekMultiplier = 1.0; // Peak
        else if (w === totalWeeks - 1) weekMultiplier = 0.5; // Taper
        else if (w === totalWeeks) weekMultiplier = 0.3; // Race Week
        else weekMultiplier = 0.85; // Build

        // Variant modifiers
        if (variant === "performance") weekMultiplier *= 1.1;
        if (variant === "health") weekMultiplier *= 0.85;

        const weekKm = peakKm * weekMultiplier;

        const days = structure.map(t => {
            const dist = Math.round((weekKm * t.distFactor) * 10) / 10;
            const duration = Math.round(dist * (paces.easy.min / 60)); // rough duration estimate

            let targetPace = "";
            let description = "";

            switch (t.type) {
                case "easy":
                    targetPace = secondsToPace(paces.easy.min);
                    description = `- ${dist}km Easy Run\n- Maintain conversation pace.`;
                    break;
                case "long":
                    targetPace = secondsToPace(paces.long.min);
                    description = `- ${dist}km Long Run\n- Weekly endurance anchor.`;
                    break;
                case "intervals":
                    targetPace = secondsToPace(paces.intervals);
                    const reps = stats.goal === "beginner" ? 4 : 8;
                    description = `- 10m Warmup\n- ${reps}x 400m @ ${targetPace}\n- 90s Recovery\n- 5m Cooldown`;
                    break;
                case "tempo":
                    targetPace = secondsToPace(paces.tempo.min);
                    const tempoDist = Math.round(dist * 0.7);
                    description = `- 2km Warmup\n- ${tempoDist}km @ Threshold Pace\n- 2km Cooldown`;
                    break;
                case "rest":
                    description = "Rest Day - Active recovery or complete rest.";
                    break;
            }

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
