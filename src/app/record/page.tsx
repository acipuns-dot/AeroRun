"use client";

import { useRunTracker } from "@/hooks/useRunTracker";
import { Play, Pause, Square, MapPin, Navigation, AlertCircle } from "lucide-react";
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
    const { profile, refreshData } = useContext(DataContext)!;
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
    const [showFinishModal, setShowFinishModal] = useState(false);
    const [showShortRunWarning, setShowShortRunWarning] = useState(false);

    const handleFinish = async () => {
        if (elapsedTime < 120) {
            setShowShortRunWarning(true);
            setTimeout(() => setShowShortRunWarning(false), 3000);
            return;
        }
        setShowFinishModal(true);
    };

    const confirmFinish = async () => {
        setShowFinishModal(false);
        setIsSaving(true);
        setSaveError(null);

        try {
            const runData = stopRun();
            if (!runData.path || runData.path.length < 2) {
                alert("Run data missing!");
                setIsSaving(false);
                return;
            }

            const activityTitle = getActivityTitle();

            // Perform upload (Intervals.icu will use this name if provided in GPX or as metadata)
            const result = await uploadActivityAction({ ...runData, name: activityTitle });

            // Local save
            const localResult = await saveActivityAction({
                name: activityTitle,
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
                await refreshData();
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
    const getActivityTitle = () => {
        const hour = new Date().getHours();
        let timeOfDay = "Night";
        if (hour >= 5 && hour < 12) timeOfDay = "Morning";
        else if (hour >= 12 && hour < 17) timeOfDay = "Afternoon";
        else if (hour >= 17 && hour < 21) timeOfDay = "Evening";

        return `AeroRun: ${timeOfDay} Run`;
    };

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
        <div className="h-[100dvh] bg-[#0A0A0A] text-white flex flex-col relative overflow-hidden select-none touch-none">
            {/* Header / Map Area */}
            <div className="h-[30vh] relative w-full border-b border-white/5">
                <LiveMap path={pathCoords} currentLocation={currentCoords} />

                {/* Overlay Header */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-[500] pointer-events-none">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-black tracking-[0.1em] text-cyan-400">Live Tracking</span>
                        <div className="flex items-center space-x-2 mt-1">
                            {isRunning ? (
                                <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-green-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[9px] font-bold text-white/80 uppercase">Recording</span>
                                </div>
                            ) : (
                                <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                    <span className="text-[9px] font-bold text-white/40 uppercase">Paused</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <Link href="/" className="pointer-events-auto bg-black/40 backdrop-blur-md w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white border border-white/5 transition-colors">
                        <span className="sr-only">Close</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </Link>
                </div>

                {!currentLocation && !error && (
                    <div className="absolute inset-0 flex items-center justify-center z-[400] bg-black/20 pointer-events-none">
                        <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">Waiting for GPS</p>
                    </div>
                )}

                {(error || saveError) && (
                    <div className="absolute bottom-2 left-2 right-2 bg-red-500/20 border border-red-500/50 backdrop-blur-md p-2 rounded-lg z-[500] pointer-events-none">
                        <p className="text-red-200 text-[10px] font-black uppercase flex items-center">
                            <Navigation className="w-3 h-3 mr-2" />
                            {saveError ? `Save Error: ${saveError}` : `GPS Lost: ${error}`}
                        </p>
                    </div>
                )}
            </div>

            {/* Stats Area - The Vertical HUD */}
            <div className="flex-1 flex flex-col items-center justify-between p-4 relative z-10 py-6">

                {/* Main Timer */}
                <div className="text-center w-full">
                    <p className="text-[10px] text-white/20 uppercase font-black tracking-[0.3em] mb-1">Total Time</p>
                    <h1 className="text-7xl font-black italic tracking-tighter leading-none tabular-nums text-white lg:text-8xl">
                        {formatTime(elapsedTime)}
                    </h1>
                </div>

                {/* Compact 3-Column Stats Row */}
                <div className="grid grid-cols-3 gap-1 w-full max-w-sm mt-4">
                    <div className="bg-[#111] p-4 py-6 rounded-[28px] border border-white/5 flex flex-col items-center justify-center space-y-3">
                        <MapPin className="w-5 h-5 text-cyan-400" />
                        <div className="text-center">
                            <h2 className="text-3xl font-black italic tabular-nums leading-none tracking-tighter">{formatDistance(distance)}</h2>
                            <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest mt-1">KM</p>
                        </div>
                    </div>
                    <div className="bg-[#111] p-4 py-6 rounded-[28px] border border-white/5 flex flex-col items-center justify-center space-y-3">
                        <Navigation className="w-5 h-5 text-purple-500" />
                        <div className="text-center">
                            <h2 className="text-3xl font-black italic tabular-nums leading-none tracking-tighter">{formatPace(currentPace)}</h2>
                            <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest mt-1">PACE</p>
                        </div>
                    </div>
                    <div className="bg-[#111] p-4 py-6 rounded-[28px] border border-white/5 flex flex-col items-center justify-center space-y-3">
                        <span className="text-xl">🔥</span>
                        <div className="text-center">
                            <h2 className="text-3xl font-black italic tabular-nums leading-none tracking-tighter">{calories}</h2>
                            <p className="text-[9px] text-white/20 uppercase font-bold tracking-widest mt-1">CAL</p>
                        </div>
                    </div>
                </div>

                {/* Fixed Control Area */}
                <div className="flex items-center justify-center pt-4 pb-12">
                    <AnimatePresence mode="wait">
                        {!isRunning && elapsedTime === 0 ? (
                            <motion.button
                                key="start"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                onClick={startRun}
                                className="w-20 h-20 rounded-full bg-cyan-400 flex items-center justify-center shadow-[0_0_40px_rgba(0,255,255,0.3)] text-black active:scale-95 transition-transform"
                            >
                                <Play className="w-10 h-10 fill-black ml-1.5" />
                            </motion.button>
                        ) : isRunning ? (
                            <motion.button
                                key="pause"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                onClick={pauseRun}
                                className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white active:scale-95 transition-transform"
                            >
                                <Pause className="w-8 h-8 fill-white" />
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
                                    className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20 text-green-500 active:scale-95 transition-transform"
                                >
                                    <Play className="w-6 h-6 fill-green-500 ml-1" />
                                </button>

                                <button
                                    onClick={handleFinish}
                                    disabled={isSaving}
                                    className={`w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 text-red-500 active:scale-95 transition-transform ${isSaving ? "opacity-50" : ""}`}
                                >
                                    {isSaving ? (
                                        <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Square className="w-6 h-6 fill-red-500" />
                                    )}
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Premium Finish Modal */}
            <AnimatePresence>
                {showFinishModal && (
                    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                            onClick={() => setShowFinishModal(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#111] border border-white/10 rounded-[32px] p-8 w-full max-w-sm relative z-10 shadow-2xl"
                        >
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Square className="w-8 h-8 fill-primary text-primary" />
                                </div>
                                <h3 className="text-2xl font-black italic tracking-tighter uppercase">Finish Workout?</h3>
                                <p className="text-white/40 text-sm font-medium leading-relaxed">
                                    Ready to save your effort? Your activity will be synced to your history.
                                </p>

                                <div className="grid grid-cols-2 gap-4 pt-6">
                                    <button
                                        onClick={() => setShowFinishModal(false)}
                                        className="py-4 rounded-2xl bg-white/5 border border-white/5 text-white/60 font-black uppercase text-xs tracking-widest hover:bg-white/10 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmFinish}
                                        className="py-4 rounded-2xl bg-primary text-black font-black uppercase text-xs tracking-widest shadow-[0_0_30px_rgba(0,255,255,0.3)] hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Save Run
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Short Run Warning */}
            <AnimatePresence>
                {showShortRunWarning && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-24 left-6 right-6 z-[600] pointer-events-none"
                    >
                        <div className="bg-orange-500/20 border border-orange-500/50 backdrop-blur-md p-4 rounded-2xl flex items-center space-x-4 shadow-xl">
                            <div className="bg-orange-500 rounded-full p-2">
                                <AlertCircle className="w-5 h-5 text-black" />
                            </div>
                            <div>
                                <h4 className="text-white font-black italic tracking-tighter text-sm uppercase">Run Too Short</h4>
                                <p className="text-white/60 text-xs font-bold leading-none mt-1">Activities must be at least 2 minutes long to save.</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
