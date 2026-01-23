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
                        <span className="text-[11px] uppercase font-black tracking-[0.1em] text-primary">Live Tracking</span>
                        <div className="flex items-center space-x-2 mt-2">
                            {isRunning ? (
                                <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-green-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-white/80 uppercase">Recording</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                    <span className="text-[10px] font-bold text-white/40 uppercase">Paused</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <Link href="/" className="pointer-events-auto bg-black/40 backdrop-blur-md w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white border border-white/5 transition-colors">
                        <span className="sr-only">Close</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </Link>
                </div>

                {/* Waiting for GPS Overlay */}
                {!currentLocation && !error && (
                    <div className="absolute inset-0 flex items-center justify-center z-[400]">
                        <p className="text-white/20 text-xs font-bold tracking-widest animate-pulse">Waiting for GPS...</p>
                    </div>
                )}

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
                <div className="text-center space-y-0 mt-4">
                    <p className="text-[11px] text-white/30 uppercase font-bold tracking-[0.2em]">Total Time</p>
                    <h1 className="text-[110px] font-black italic tracking-tighter leading-none tabular-nums text-white">
                        {formatTime(elapsedTime)}
                    </h1>
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#111] p-6 rounded-[32px] border border-white/5 flex flex-col items-center justify-center space-y-4">
                        <MapPin className="w-6 h-6 text-primary" />
                        <div className="text-center">
                            <h2 className="text-5xl font-black italic tabular-nums leading-none tracking-tighter">{formatDistance(distance)}</h2>
                            <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mt-2">Kilometers</p>
                        </div>
                    </div>
                    <div className="bg-[#111] p-6 rounded-[32px] border border-white/5 flex flex-col items-center justify-center space-y-4">
                        <Navigation className="w-6 h-6 text-purple-500" />
                        <div className="text-center">
                            <h2 className="text-5xl font-black italic tabular-nums leading-none tracking-tighter">{formatPace(currentPace)}</h2>
                            <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mt-2">Current Pace</p>
                        </div>
                    </div>
                    <div className="bg-[#111] p-6 rounded-[32px] border border-white/5 flex flex-col items-center justify-center space-y-4 col-span-2">
                        <span className="text-2xl">🔥</span>
                        <div className="text-center">
                            <h2 className="text-5xl font-black italic tabular-nums leading-none tracking-tighter">{calories}</h2>
                            <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest mt-2">Calories Burned</p>
                        </div>
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
                                className="w-28 h-28 rounded-full bg-primary flex items-center justify-center shadow-[0_0_50px_rgba(0,255,255,0.3)] text-black font-black active:scale-95 transition-transform"
                            >
                                <Play className="w-12 h-12 fill-black ml-1.5" />
                            </motion.button>
                        ) : isRunning ? (
                            <motion.button
                                key="pause"
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                onClick={pauseRun}
                                className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center border border-white/10 text-white font-black active:scale-95 transition-transform"
                            >
                                <Pause className="w-10 h-10 fill-white" />
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
                                    className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/40 text-green-500 active:scale-95 transition-transform"
                                >
                                    <Play className="w-8 h-8 fill-green-500 ml-1" />
                                </button>

                                <button
                                    onClick={handleFinish}
                                    disabled={isSaving}
                                    className={`w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/40 text-red-500 active:scale-95 transition-transform ${isSaving ? "opacity-50" : ""}`}
                                >
                                    {isSaving ? (
                                        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Square className="w-8 h-8 fill-red-500" />
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
