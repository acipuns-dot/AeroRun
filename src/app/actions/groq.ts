"use server";

import Groq from "groq-sdk";
import { COACHING_KNOWLEDGE, REALITY_CHECK_RULES } from "@/lib/coaching-knowledge";

function getGroqKeys(): string[] {
    const keys = process.env.GROQ_API_KEYS ? process.env.GROQ_API_KEYS.split(",").map(k => k.trim()) : [];
    if (keys.length === 0 && process.env.GROQ_API_KEY) {
        keys.push(process.env.GROQ_API_KEY);
    }
    return keys;
}

export interface UserStats {
    height: number;
    weight: number;
    age: number;
    best5kTime: string;
    goal: "beginner" | "intermediate" | "elite";
    targetDistance: "5km" | "10km" | "Half Marathon" | "Full Marathon";
    targetTime?: string;
}

// --- PACING HELPERS ---

function parseTimeStringToSeconds(timeStr: string): number | null {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] * 60; // Minutes fallback
}

function formatSecondsToPace(seconds: number): string {
    const min = Math.floor(seconds / 60);
    const sec = Math.round(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}/km`;
}

function calculatePace(timeStr: string, distKm: number): string {
    const totalSeconds = parseTimeStringToSeconds(timeStr);
    if (!totalSeconds) return "Unknown";
    return formatSecondsToPace(totalSeconds / distKm);
}

function getDistanceKm(dist: string): number {
    if (dist === "10km") return 10;
    if (dist === "Half Marathon") return 21.1;
    if (dist === "Full Marathon") return 42.2;
    return 5;
}

const MAX_SECONDS_PER_KM = 570; // 9:30/km
const clampPace = (seconds: number) => Math.min(seconds, MAX_SECONDS_PER_KM);

function getDetailedGuidance(stats: UserStats) {
    const currentPbPace = calculatePace(stats.best5kTime, 5);
    const totalPbSeconds = parseTimeStringToSeconds(stats.best5kTime) || 1200;
    const pbSecondsPerKm = totalPbSeconds / 5;

    const easyStart = clampPace(pbSecondsPerKm * 1.35);
    const easyEnd = clampPace(pbSecondsPerKm * 1.55);
    const easyRange = `${formatSecondsToPace(easyStart)} - ${formatSecondsToPace(easyEnd)}`;

    const tempoStart = clampPace(pbSecondsPerKm * 1.15);
    const tempoEnd = clampPace(pbSecondsPerKm * 1.25);
    const tempoRange = `${formatSecondsToPace(tempoStart)} - ${formatSecondsToPace(tempoEnd)}`;

    const intervalPace = formatSecondsToPace(Math.max(pbSecondsPerKm, 300));
    const hillsPace = tempoRange;
    const stridesPace = "Mile pace or faster (Sprints)";

    let targetGoalPace = "Unknown";
    const targetSeconds = stats.targetTime ? parseTimeStringToSeconds(stats.targetTime) : null;
    const targetDistKm = getDistanceKm(stats.targetDistance);

    if (targetSeconds) {
        targetGoalPace = formatSecondsToPace(targetSeconds / targetDistKm);
    } else {
        targetGoalPace = formatSecondsToPace(pbSecondsPerKm * 0.98);
    }

    const baseWeeklyKm = stats.goal === "beginner" ? 20 : stats.goal === "intermediate" ? 30 : 45;
    const peakMultiplier = targetDistKm === 5 ? 1.5 : targetDistKm === 10 ? 1.8 : targetDistKm === 21.1 ? 2.2 : 2.5;
    const peakWeeklyKm = Math.round(baseWeeklyKm * peakMultiplier);

    const volumeGuidance = `
    WEEKLY VOLUME & DISTRIBUTION (STRICT 80/20):
    - **80/20 Rule**: ~80% Easy, Max 1-2 Quality sessions/week.
    - Week 1-2: ${baseWeeklyKm}km (Base)
    - Week 3: ${Math.round(baseWeeklyKm * 1.1)}km
    - Week 4: ${Math.round(baseWeeklyKm * 0.8)}km (DOWN WEEK)
    - Build/Peak/Taper: Gradually scale to peak of ${peakWeeklyKm}km.
    
    TYPES: Hill Repeats, Strides, Progression Runs.
    Periodization: Base (W1-4) -> Build (W5-8) -> Peak (W9-11) -> Taper (W12).
    `;

    return { easyRange, tempoRange, intervalPace, hillsPace, stridesPace, targetGoalPace, volumeGuidance, currentPbPace, targetDistKm, peakWeeklyKm };
}

// --- SERVER ACTIONS ---

import { generateEnginePlan } from "@/lib/plan-engine";

/**
 * STEP 1: Discover 3 training plan strategies.
 */
export async function generatePlanOptionsAction(stats: UserStats) {
    const guidance = getDetailedGuidance(stats);

    const prompt = `
    TASK: Provide the "Coaching Voice" for 3 training options for ${stats.targetDistance}.
    
    USER PROFILE:
    - 5km PB: ${stats.best5kTime} (${guidance.currentPbPace})
    - Goal: ${stats.targetDistance}
    - Level: ${stats.goal}
    
    OPTIONS REQUIRING COACHING VOICES:
    1. "Steady": Focus on aerobic foundation and volume consistency.
    2. "Performance": Focus on speed development and aggressive interval targets.
    3. "Health": Focus on injury prevention and sustainable longevity.

    Return a JSON object with:
    - id: "steady" | "performance" | "health"
    - title: Strategic Name
    - strategy_reasoning: (STRICT 2 SENTENCES) High-level coaching approach.
    - description: (STRICT 1 SENTENCE) A catchy summary of what makes this plan unique.
    - coach_notes: (STRICT 1 SENTENCE) Specific expert tip for this path.

    JSON: { "options": [...] }
    `;

    const aiOptions = await callGroq(prompt, true);

    // Merge AI personality with engine-calculated metadata
    const finalOptions = await Promise.all(aiOptions.options.map(async (opt: any) => {
        const enginePreview = await generateEnginePlan(stats, opt.id as any);
        return {
            ...opt,
            total_weeks: enginePreview.total_weeks,
            target_peak_volume: Math.round(enginePreview.weeks[Math.floor(enginePreview.total_weeks * 0.7)].days.reduce((acc: number, d: any) => acc + (d.distance || 0), 0))
        };
    }));

    return { options: finalOptions };
}

/**
 * STEP 2: Generate the FULL schedule.
 * Logic: 100% Deterministic Engine for reliability.
 */
export async function generateFullPlanAction(stats: UserStats, selectedId: string, options: any[]) {
    return await generateEnginePlan(stats, selectedId as any);
}

async function callGroq(prompt: string, isQuick: boolean) {
    const keys = getGroqKeys();
    for (const apiKey of keys) {
        const groq = new Groq({ apiKey });
        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: "system", content: "You are a world-class running coach. ONLY output JSON." }, { role: "user", content: prompt }],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                max_tokens: isQuick ? 2500 : 8000,
                temperature: 0.2,
            });
            return JSON.parse(completion.choices[0].message.content || "{}");
        } catch (e: any) {
            console.error("Groq attempt failed:", e.message);
        }
    }
    throw new Error("AI generation failed.");
}

// BACKWARD COMPAT (UI uses this to check options)
export async function generateTrainingPlanAction(stats: UserStats) {
    return await generatePlanOptionsAction(stats);
}
