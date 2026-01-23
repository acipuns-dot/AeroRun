"use client";

import { useRunTracker } from "@/hooks/useRunTracker";
import { Play, Pause, Square, MapPin, Navigation } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useMemo, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DataContext } from "@/context/DataContext";
import { uploadActivityAction } from "@/app/actions/intervals";
import { saveActivityAction } from "@/app/actions/activities";

// Dynamically import map to avoid SSR issues with Leaflet
const LiveMap = dynamic(() => import("@/components/LiveMap"), {
    ssr: false,
    loading: () => <div className="h-full w-full bg-[#0A0A0A] animate-pulse" />
});

export default function RecordPage() {
    const { profile } = useContext(DataContext)!;
    const {
        isRunning,
        path,
        currentLocation,
        distance,
        elapsedTime,
        currentPace,
        calories,
        startRun,
        pauseRun,
        stopRun,
        error
    } = useRunTracker(profile?.weight || 70);
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleFinish = async () => {
        if (!confirm("Finish and save workout?")) return;

        setIsSaving(true);
        setSaveError(null);

        try {
            const runData = stopRun();
            if (!runData.path || runData.path.length < 2) {
                alert("Run too short to save!");
                setIsSaving(false);
                return;
            }

            const result = await uploadActivityAction(runData);

            // Local save (always save locally even if upload fails)
            const localResult = await saveActivityAction({
                name: `AeroRun: ${new Date().toLocaleDateString()}`,
                distance: runData.distance,
                moving_time: runData.elapsedTime,
                elapsed_time: runData.elapsedTime,
                type: 'run',
                path: runData.path,
                calories: runData.calories,
                average_pace: runData.averagePace,
                intervals_id: result.success ? result.data?.id?.toString() : null
            });

            if (result.success || localResult.success) {
                router.push("/activities");
            } else {
                setSaveError("Failed to save activity locally or to Intervals.icu");
                setIsSaving(false);
            }
        } catch (err: any) {
            setSaveError(err.message || "An unexpected error occurred");
            setIsSaving(false);
        }
    };

    // Formatting helpers
    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const formatDistance = (meters: number) => {
        return (meters / 1000).toFixed(2);
    };

    const formatPace = (paceSecPerKm: number) => {
        if (paceSecPerKm === 0 || paceSecPerKm > 3599) return "--:--";
        const m = Math.floor(paceSecPerKm / 60);
        const s = Math.floor(paceSecPerKm % 60);
        return `${m}'${s.toString().padStart(2, '0')}"`;
    };

    const pathCoords = useMemo(() => {
        return path.map(p => [p.latitude, p.longitude] as [number, number]);
    }, [path]);

    const currentCoords = useMemo(() => {
        if (!currentLocation) return null;
        return [currentLocation.latitude, currentLocation.longitude] as [number, number];
    }, [currentLocation]);

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col relative overflow-hidden">
            {/* Header / Map Area */}
            <div className="h-[45vh] relative w-full border-b border-white/10">
                <LiveMap path={pathCoords} currentLocation={currentCoords} />

                {/* Overlay Header */}
                <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-[500] pointer-events-none">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-black tracking-[0.2em] text-primary drop-shadow-md">Live Tracking</span>
                        <div className="flex items-center space-x-2 mt-1">
                            {isRunning ? (
                                <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-green-500/30">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-xs font-bold text-green-500">Rec</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                    <div className="w-2 h-2 rounded-full bg-white/40" />
                                    <span className="text-xs font-bold text-white/60">Paused</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <Link href="/" className="pointer-events-auto bg-black/60 backdrop-blur-md p-2 rounded-full text-white/60 hover:text-white border border-white/10 transition-colors">
                        <span className="sr-only">Close</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </Link>
                </div>

                {(error || saveError) && (
                    <div className="absolute bottom-4 left-4 right-4 bg-red-500/20 border border-red-500/50 backdrop-blur-md p-3 rounded-xl z-[500] pointer-events-none">
                        <p className="text-red-200 text-xs font-bold flex items-center">
                            <Navigation className="w-3 h-3 mr-2" />
                            {saveError ? `Save Error: ${saveError}` : `GPS Signal Lost: ${error}`}
                        </p>
                    </div>
                )}
            </div>

            {/* Stats Area - The HUD */}
            <div className="flex-1 flex flex-col p-6 relative z-10 space-y-8">

                {/* Main Timer */}
                <div className="text-center space-y-1">
                    <p className="text-[10px] text-white/40 uppercase font-black tracking-[0.3em]">Total Time</p>
                    <h1 className="text-7xl font-black italic tracking-tighter tabular-nums drop-shadow-[0_0_30px_rgba(0,195,255,0.2)]">
                        {formatTime(elapsedTime)}
                    </h1>
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center space-y-2">
                        <MapPin className="w-5 h-5 text-primary mb-1" />
                        <h2 className="text-4xl font-black italic tabular-nums">{formatDistance(distance)}</h2>
                        <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">Kilometers</p>
                    </div>
                    <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center space-y-2">
                        <Navigation className="w-5 h-5 text-purple-400 mb-1" />
                        <h2 className="text-4xl font-black italic tabular-nums">{formatPace(currentPace)}</h2>
                        <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">Current Pace</p>
                    </div>
                    <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center justify-center space-y-2 col-span-2">
                        <div className="flex items-center space-x-2 mb-1">
                            <span className="text-orange-500 font-bold">🔥</span>
                        </div>
                        <h2 className="text-4xl font-black italic tabular-nums">{calories}</h2>
                        <p className="text-[9px] text-white/40 uppercase font-bold tracking-widest">Calories Burned</p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex-1 flex items-end justify-center pb-8 safe-area-pb">
                    <AnimatePresence mode="wait">
                        {!isRunning && elapsedTime === 0 ? (
                            <motion.button
                                key="start"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={startRun}
                                className="w-24 h-24 rounded-full bg-primary flex items-center justify-center shadow-[0_0_40px_rgba(0,195,255,0.4)] text-black font-black active:scale-95 transition-transform"
                            >
                                <Play className="w-10 h-10 fill-black ml-1" />
                            </motion.button>
                        ) : isRunning ? (
                            <motion.button
                                key="pause"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={pauseRun}
                                className="w-24 h-24 rounded-full bg-yellow-400 flex items-center justify-center shadow-[0_0_40px_rgba(250,204,21,0.4)] text-black font-black active:scale-95 transition-transform"
                            >
                                <Pause className="w-10 h-10 fill-black" />
                            </motion.button>
                        ) : (
                            <motion.div
                                key="resume-stop"
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="flex items-center space-x-8"
                            >
                                <button
                                    onClick={startRun}
                                    className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)] text-black active:scale-95 transition-transform"
                                >
                                    <Play className="w-8 h-8 fill-black ml-1" />
                                </button>

                                <button
                                    onClick={handleFinish}
                                    disabled={isSaving}
                                    className={`w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] text-black active:scale-95 transition-transform ${isSaving ? "opacity-50" : ""}`}
                                >
                                    {isSaving ? (
                                        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Square className="w-8 h-8 fill-black" />
                                    )}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
