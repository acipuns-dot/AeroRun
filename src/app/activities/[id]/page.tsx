"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getActivityDetailsAction, getActivityStreamsAction } from "@/app/actions/intervals";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Clock, Zap, TrendingUp, Heart, Activity as ActivityIcon, Mountain } from "lucide-react";
import { format } from "date-fns";
import { useData } from "@/context/DataContext";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("@/components/Map"), {
    ssr: false,
    loading: () => <div className="h-64 w-full bg-white/5 animate-pulse rounded-2xl flex items-center justify-center text-white/20 uppercase text-xs font-black">Loading Map...</div>
});

export default function ActivityDetail() {
    const params = useParams();
    const router = useRouter();
    const { activities, isLoading: isContextLoading } = useData();
    const [activity, setActivity] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [streamsLoading, setStreamsLoading] = useState(false);
    const [coordinates, setCoordinates] = useState<[number, number][]>([]);

    useEffect(() => {
        const loadActivity = async () => {
            const activityId = params.id as string;
            if (!activityId) return;

            let currentActivity = null;

            // 1. Try to find in context first
            const localActivity = activities?.find((a: any) => a.id.toString() === activityId);
            if (localActivity) {
                console.log('[ActivityDetail] Found activity in context');
                currentActivity = localActivity;
            } else if (!isContextLoading) {
                // 2. Fallback to API if not in context or context is loading
                console.log('[ActivityDetail] Not found in context, fetching from API...');
                setIsLoading(true);
                currentActivity = await getActivityDetailsAction(activityId);
                setIsLoading(false);
            }

            if (currentActivity) {
                setActivity(currentActivity);
                setIsLoading(false);

                // --- 1. Check for Local Path first ---
                if (currentActivity.path && Array.isArray(currentActivity.path) && currentActivity.path.length > 0) {
                    console.log('[ActivityDetail] Found local path data, formatting coordinates...');
                    const localCoords: [number, number][] = currentActivity.path.map((p: any) => {
                        // Handle both GeoPoint objects and [lat, lng] arrays
                        if (Array.isArray(p)) return [p[0], p[1]] as [number, number];
                        return [p.latitude, p.longitude] as [number, number];
                    }).filter((c: any) => !isNaN(c[0]) && !isNaN(c[1]));

                    if (localCoords.length > 0) {
                        console.log('[ActivityDetail] Map loaded from local path:', localCoords.length, 'points');
                        setCoordinates(localCoords);
                        setStreamsLoading(false);
                        return; // Successfully loaded local path, skip stream fetch
                    }
                }

                // --- 2. Fallback: Fetch GPS data from Intervals.icu ---
                setStreamsLoading(true);
                console.log('[ActivityDetail] Fetching streams for:', activityId);
                try {
                    const streams = await getActivityStreamsAction(activityId);
                    console.log('[ActivityDetail] Streams received:', streams ? 'yes' : 'no');

                    if (streams && Array.isArray(streams)) {
                        const latlngStream = streams.find((s: any) => s.type === "latlng");
                        console.log('[ActivityDetail] LatLng stream found:', latlngStream ? 'yes' : 'no');

                        if (latlngStream && latlngStream.data && latlngStream.data2) {
                            console.log('[ActivityDetail] LatLng data points (lat/lng):', latlngStream.data.length, latlngStream.data2.length);

                            // Robust zipping with validation
                            const zippedCoords: [number, number][] = [];
                            const len = Math.min(latlngStream.data.length, latlngStream.data2.length);

                            for (let i = 0; i < len; i++) {
                                const lat = latlngStream.data[i];
                                const lng = latlngStream.data2[i];
                                // Only add if both are valid numbers
                                if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                                    zippedCoords.push([lat, lng]);
                                }
                            }

                            console.log('[ActivityDetail] Valid coordinates extracted:', zippedCoords.length);
                            if (zippedCoords.length > 0) {
                                setCoordinates(zippedCoords);
                            }
                        } else if (latlngStream && Array.isArray(latlngStream.data) && Array.isArray(latlngStream.data[0])) {
                            // Plan B: Data is already zipped
                            setCoordinates(latlngStream.data);
                        }
                    }
                } catch (err) {
                    console.error('[ActivityDetail] Error fetching or processing streams:', err);
                } finally {
                    setStreamsLoading(false);
                }
            }
        };

        loadActivity();
    }, [params.id, activities, isContextLoading]);

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!activity) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <p className="text-white/40">Activity not found</p>
                <button onClick={() => router.back()} className="mt-4 text-primary">Go Back</button>
            </div>
        </div>
    );

    const distanceKm = (activity.distance / 1000).toFixed(2);
    const durationMin = Math.floor(activity.moving_time / 60);
    const durationSec = activity.moving_time % 60;
    const avgPaceMinPerKm = activity.distance > 0 ? (activity.moving_time / 60) / (activity.distance / 1000) : 0;
    const paceMin = Math.floor(avgPaceMinPerKm);
    const paceSec = Math.round((avgPaceMinPerKm - paceMin) * 60);

    return (
        <div className="min-h-screen pb-32">
            {/* Header */}
            <div className="p-6 flex items-center space-x-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold">{activity.name || "Run"}</h1>
                    <p className="text-xs text-white/40">
                        {activity.start_date ? format(new Date(activity.start_date), "EEEE, MMMM d, yyyy 'at' h:mm a") : "Date unavailable"}
                    </p>
                </div>
                <div className="bg-primary/10 text-primary text-xs font-black px-3 py-1 rounded-full uppercase">
                    {activity.type}
                </div>
            </div>

            <div className="px-6 space-y-6">
                {/* Key Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass p-4 space-y-2">
                        <MapPin className="w-5 h-5 text-primary" />
                        <p className="text-xs text-white/40 uppercase font-bold">Distance</p>
                        <p className="text-2xl font-black">{distanceKm} <span className="text-sm font-normal text-white/40">KM</span></p>
                    </div>
                    <div className="glass p-4 space-y-2">
                        <Clock className="w-5 h-5 text-accent" />
                        <p className="text-xs text-white/40 uppercase font-bold">Duration</p>
                        <p className="text-2xl font-black">{durationMin}:{durationSec.toString().padStart(2, '0')}</p>
                    </div>
                    <div className="glass p-4 space-y-2">
                        <Zap className="w-5 h-5 text-green-400" />
                        <p className="text-xs text-white/40 uppercase font-bold">Avg Pace</p>
                        <p className="text-2xl font-black">{paceMin}:{paceSec.toString().padStart(2, '0')} <span className="text-sm font-normal text-white/40">/km</span></p>
                    </div>
                    <div className="glass p-4 space-y-2">
                        <Heart className="w-5 h-5 text-red-400" />
                        <p className="text-xs text-white/40 uppercase font-bold">Avg HR</p>
                        <p className="text-2xl font-black">{activity.average_heartrate || "--"} <span className="text-sm font-normal text-white/40">bpm</span></p>
                    </div>
                </div>

                {/* Map */}
                {(streamsLoading || coordinates.length > 0) && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full"
                    >
                        {streamsLoading ? (
                            <div className="h-64 w-full bg-white/5 animate-pulse rounded-2xl flex items-center justify-center border border-white/10">
                                <span className="text-white/20 uppercase text-xs font-black tracking-widest">Loading Route...</span>
                            </div>
                        ) : (
                            <Map coordinates={coordinates} />
                        )}
                    </motion.div>
                )}

                {/* Additional Metrics */}
                {(activity.total_elevation_gain || activity.average_cadence || activity.calories) && (
                    <div className="glass p-6 space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Additional Metrics</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {activity.total_elevation_gain > 0 && (
                                <div className="flex items-center space-x-3">
                                    <Mountain className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Elevation Gain</p>
                                        <p className="font-bold">{Math.round(activity.total_elevation_gain)}m</p>
                                    </div>
                                </div>
                            )}
                            {activity.average_cadence && (
                                <div className="flex items-center space-x-3">
                                    <TrendingUp className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Avg Cadence</p>
                                        <p className="font-bold">{Math.round(activity.average_cadence)} spm</p>
                                    </div>
                                </div>
                            )}
                            {activity.calories && (
                                <div className="flex items-center space-x-3">
                                    <Zap className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Calories</p>
                                        <p className="font-bold">{Math.round(activity.calories)} kcal</p>
                                    </div>
                                </div>
                            )}
                            {activity.max_heartrate && (
                                <div className="flex items-center space-x-3">
                                    <Heart className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Max HR</p>
                                        <p className="font-bold">{activity.max_heartrate} bpm</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Description */}
                {activity.description && (
                    <div className="glass p-6 space-y-2">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Description</h2>
                        <p className="text-white/80">{activity.description}</p>
                    </div>
                )}
            </div>

            <BottomNav />
        </div>
    );
}
