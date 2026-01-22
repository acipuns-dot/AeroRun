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

export async function generatePlanOptionsAction(stats: UserStats) {
    const guidance = getDetailedGuidance(stats);
    const distanceKey = stats.targetDistance as keyof typeof COACHING_KNOWLEDGE;
    const expertKnowledge = COACHING_KNOWLEDGE[distanceKey] || COACHING_KNOWLEDGE["5km"];

    let realityCheckNote = "";
    if (stats.targetTime) {
        const goalPaceSec = parseTimeStringToSeconds(stats.targetTime)! / getDistanceKm(stats.targetDistance);
        if (goalPaceSec < (parseTimeStringToSeconds(stats.best5kTime)! / 5)) {
            realityCheckNote = "WARNING: Goal pace is faster than 5k PB. Plan EXTENDED to 18 weeks.";
        }
    }

    const prompt = `
    You are an elite endurance coach.
    TASK: Discover 3 training strategies for ${stats.targetDistance}.
    
    USER PROFILE: 
    - PB: ${stats.best5kTime} (${guidance.currentPbPace})
    - Goal Time: ${stats.targetTime || "N/A"}
    - Level: ${stats.goal}

    METHODOLOGY:
    ${expertKnowledge}
    ${REALITY_CHECK_RULES}
    ${guidance.volumeGuidance}

    JSON STRUCTURE:
    { "options": [{ 
        "id": "steady|performance|health", 
        "title": "...", 
        "strategy_reasoning": "Explain the 80/20, periodization, and how you handle their pace gaps.",
        "description": "Short summary", 
        "coach_notes": "One key tip", 
        "total_weeks": ${realityCheckNote ? 18 : 12}, 
        "target_peak_volume": ${guidance.peakWeeklyKm} 
    }] }
    `;

    return await callGroq(prompt, true);
}

export async function generateFullPlanAction(stats: UserStats, selectedId: string, options: any[]) {
    const selected = options.find(o => o.id === selectedId);
    const guidance = getDetailedGuidance(stats);
    const distanceKey = stats.targetDistance as keyof typeof COACHING_KNOWLEDGE;
    const expertKnowledge = COACHING_KNOWLEDGE[distanceKey] || COACHING_KNOWLEDGE["5km"];

    const prompt = `
    TASK: Build the COMPLETE schedule.
    STRATEGY: ${selected.title} - ${selected.strategy_reasoning}
    WEEKS: 1 to ${selected.total_weeks} (NO SKIPPING WEEKS).

    STRICT COACHING BRAIN:
    - **80/20 RULE**: Only 1-2 quality runs.
    - **Intervals.icu Syntax**: Every step starts with '- '. Format: '- [Distance/Time] [Type] [Pace/Effort]'
    - **Volume**: Start at ~${guidance.peakWeeklyKm * 0.5}km, peak at ${selected.target_peak_volume}km.
    
    PACING:
    - Easy: ${guidance.easyRange}
    - Tempo: ${guidance.tempoRange}
    - Intervals: ${guidance.intervalPace}

    JSON: { "weeks": [ { "week_number": 1, "days": [...] } ] }
    `;

    return await callGroq(prompt, false);
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
