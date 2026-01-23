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

    // Base weeks by distance (Beginner-friendly scaling)
    const baseWeeks: Record<string, number> = {
        "5km": 12,
        "10km": 14,
        "Half Marathon": 16,
        "Full Marathon": 18
    };

    let totalWeeks = baseWeeks[stats.targetDistance] || 12;

    // If goal VDOT is significantly higher than current VDOT, extend the plan
    if (ambitiousVDOTGap > 5) { // Extremely ambitious (+5 VDOT levels is huge)
        totalWeeks = Math.max(totalWeeks, 24);
    } else if (ambitiousVDOTGap > 2) { // Ambitious (+2-5 VDOT levels)
        totalWeeks = stats.targetDistance === "Full Marathon" ? 22 : 18;
    }

    const baseKm = stats.goal === "beginner" ? 20 : stats.goal === "intermediate" ? 35 : 55;
    const multMap = { "5km": 1.4, "10km": 1.7, "Half Marathon": 2.2, "Full Marathon": 2.8 } as const;
    const peakKm = baseKm * (multMap[stats.targetDistance as keyof typeof multMap] || 1.4);

    const weeks = [];

    for (let w = 1; w <= totalWeeks; w++) {
        let weekMultiplier = 1;
        const progress = w / totalWeeks;

        if (w === 1) {
            // --- UNIVERSAL CONSERVATION PRINCIPLE ---
            // Every plan starts at 50% of peak volume in Week 1.
            // This applies to ALL levels (Beginner to Elite) to allow
            // structural adaptation (tendons/ligaments) regardless of cardiovascular fitness.
            weekMultiplier = 0.5;
        }
        else if (w === 2) weekMultiplier = 0.65;
        else if (w % 4 === 0) weekMultiplier = 0.7;
        else if (w > totalWeeks - 1) weekMultiplier = 0.3;
        else if (w === totalWeeks - 1) weekMultiplier = 0.5;
        else weekMultiplier = 0.75 + (progress * 0.25);

        if (variant === "performance") weekMultiplier *= 1.1;
        if (variant === "health") weekMultiplier *= 0.85;

        const weekKm = peakKm * weekMultiplier;

        // --- INTENSITY PROGRESSION (AeroEngine VDOT scaling) ---
        // We start training at current fitness and build TO the goal fitness.
        const currentPlanVDOT = currentVDOT + (ambitiousVDOTGap * progress);

        // Sharpening is now naturally handled by the built-in VDOT logic,
        // but we can add a slight secondary sharpening for "race feel" in late weeks.
        const paceSharpening = w < totalWeeks - 2 ? 1.0 : 0.99; // 1% faster in the final weeks

        // Recalculate paces for THIS week's fitness level
        const weeklyPaces = getCalculatedPacesFromVDOT(currentPlanVDOT);

        const workoutScale = 0.7 + (progress * 0.3);

        const days = structure.map(t => {
            const dist = Math.round((weekKm * t.distFactor) * 10) / 10;

            let targetPace = "";
            let paceSec = weeklyPaces.easy.min;
            let description = "";
            let hrZone = "Zone 2";

            // --- TAPER LOGIC (Point 4) ---
            // In taper weeks (last 2), volume drops significantly, but intensity stays.
            const isTaper = w >= totalWeeks - 1;
            const taperDistFactor = isTaper ? 0.6 : 1.0;
            const finalDist = t.type === "long" || t.type === "easy" ? dist * taperDistFactor : dist;

            let structuredWorkout = "";

            switch (t.type) {
                case "easy": {
                    const easyRange = weeklyPaces.easy.max - weeklyPaces.easy.min;
                    const dayIndex = structure.indexOf(t);
                    const variation = (dayIndex % 3) * 0.33;
                    paceSec = weeklyPaces.easy.min + (easyRange * variation);
                    targetPace = secondsToPace(paceSec);
                    const easyPace = secondsToPace(weeklyPaces.easy.max);
                    hrZone = "Zone 2";
                    description = `- 5m Warmup Pace: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Easy Run Pace: ${targetPace}\n- 5m Cooldown Pace: ${easyPace}\n- HR: ${hrZone}`;
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

                        if (stats.targetDistance === "Full Marathon" || stats.targetDistance === "Half Marathon") {
                            if (w > 6 && !isTaper && w % 2 === 0) {
                                const easyDist = Math.round(finalDist * 0.7 * 10) / 10;
                                const raceDist = Math.round((finalDist - easyDist) * 10) / 10;
                                const racePace = secondsToPace(paceSec * 0.95);
                                description = `- 5m Warmup Pace: ${easyPace}\n- ${easyDist}km Easy Pace: ${targetPace}\n- ${raceDist}km @ Goal Race Pace: ${racePace}\n- 5m Cooldown Pace: ${easyPace}`;
                                structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set\n- ${easyDist}km ${targetPace}\n- ${raceDist}km ${racePace}\n\nCooldown\n- 5m ${easyPace}`;
                            } else {
                                description = `- 5m Warmup Pace: ${easyPace}\n- ${Math.round(finalDist * 10) / 10}km Steady Long Run Pace: ${targetPace}\n- 5m Cooldown Pace: ${easyPace}`;
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

                        if (isSpeedDay) {
                            description = `- 5m Warmup Pace: ${easyPace}\n${reps}x\n- 400m Pace: ${targetPace}\n- 90s Recovery\n- 5m Cooldown Pace: ${easyPace}\n- HR: ${hrZone}`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set ${reps}x\n- 400m ${targetPace}\n- 90s recovery\n\nCooldown\n- 5m ${easyPace}`;
                        } else {
                            const repDist = "1km";
                            const adjReps = Math.max(3, Math.round(reps * 0.5));
                            const threshPace = secondsToPace(weeklyPaces.tempo.max * paceSharpening);
                            description = `- 5m Warmup Pace: ${easyPace}\n${adjReps}x\n- ${repDist} Pace: ${threshPace}\n- 2m Recovery\n- 5m Cooldown Pace: ${easyPace}\n- HR: Zone 4 (Threshold)`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set ${adjReps}x\n- ${repDist} ${threshPace}\n- 2m recovery\n\nCooldown\n- 5m ${easyPace}`;
                        }
                        if (isTaper) {
                            description = `- 5m Warmup Pace: ${easyPace}\n4x\n- 400m Pace: ${targetPace}\n- 90s Recovery\n- 5m Cooldown Pace: ${easyPace}`;
                            structuredWorkout = `Warmup\n- 5m ${easyPace}\n\nMain Set 4x\n- 400m ${targetPace}\n- 90s recovery\n\nCooldown\n- 5m ${easyPace}`;
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
                        description = `- ${Math.round(finalDist * 10) / 10}km Easy Run (Intro) Pace: ${targetPace}\n- HR: ${hrZone}`;
                        structuredWorkout = `Warmup\n- ${Math.round(finalDist * 10) / 10}km ${targetPace}`;
                    } else {
                        paceSec = weeklyPaces.tempo.min * paceSharpening;
                        targetPace = secondsToPace(paceSec);
                        hrZone = "Zone 3-4";
                        const tempoDist = Math.max(3, Math.round(finalDist * 0.75 * workoutScale));
                        const easyPace = secondsToPace(weeklyPaces.easy.max);

                        description = `- 2km Warmup Pace: ${easyPace}\n- ${tempoDist}km Tempo Pace: ${targetPace}\n- 2km Cooldown Pace: ${easyPace}\n- HR: ${hrZone} (Comfortably Hard)`;
                        structuredWorkout = `Warmup\n- 2km ${easyPace}\n\nMain Set\n- ${tempoDist}km ${targetPace}\n\nCooldown\n- 2km ${easyPace}`;
                    }
                    break;
                }

                case "rest":
                    description = "Rest Day";
                    structuredWorkout = "";
                    break;
            }

            const duration = t.type === "rest" ? 0 : Math.round(dist * (paceSec / 60)) + 10;

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

            // --- WEEK 1 SAFETY: INTRO CONVERSION ---
            // For Week 1, we convert all potentially high-impact workouts
            // (Intervals, Tempo, Long) to "Easy" for all fitness levels.
            const finalType = w === 1 && (t.type === "intervals" || t.type === "tempo" || t.type === "long")
                ? "easy"
                : t.type;

            return {
                day: t.day,
                type: finalType,
                description,
                distance: dist,
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

function getDistanceKm(dist: string): number {
    if (dist === "10km") return 10;
    if (dist === "Half Marathon") return 21.1;
    if (dist === "Full Marathon") return 42.2;
    return 5;
}
