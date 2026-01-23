"use client";

import { useState, useEffect, useRef } from "react";
import { GeoPoint } from "@/types";

export function useRunTracker(userWeightKg: number = 70) {
    const [isRunning, setIsRunning] = useState(false);
    const [isAutoPaused, setIsAutoPaused] = useState(false);
    const [path, setPath] = useState<GeoPoint[]>([]);
    const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
    const [distance, setDistance] = useState(0); // in meters
    const [elapsedTime, setElapsedTime] = useState(0); // in seconds
    const [currentPace, setCurrentPace] = useState(0); // seconds per km
    const [averagePace, setAveragePace] = useState(0); // seconds per km
    const [calories, setCalories] = useState(0);
    const [cadence, setCadence] = useState(0); // Steps Per Minute (SPM)
    const [stepCount, setStepCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const watchId = useRef<number | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const lastLocationRef = useRef<GeoPoint | null>(null);

    // Refs to avoid stale closures in geolocation callbacks
    const isRunningRef = useRef(false);
    const isPausedRef = useRef(false);

    // Sync refs with state
    useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
    useEffect(() => { isPausedRef.current = isAutoPaused; }, [isAutoPaused]);

    // Pace smoothing buffer
    const recentPointsRef = useRef<GeoPoint[]>([]);
    const AUTO_PAUSE_THRESHOLD = 1.0; // m/s (approx 3.6 km/h) - stop if slower than this

    // Step Detection Refs
    const stepBufferRef = useRef<number[]>([]); // Timestamps of recent steps
    const lastAccelRef = useRef<{ x: number, y: number, z: number }>({ x: 0, y: 0, z: 0 });
    const lastStepTimeRef = useRef<number>(0);

    // Haversine formula
    function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
        const R = 6371e3;
        const dLat = deg2rad(lat2 - lat1);
        const dLon = deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    function deg2rad(deg: number) {
        return deg * (Math.PI / 180);
    }

    // Step Detection Algorithm
    const handleMotion = (event: DeviceMotionEvent) => {
        if (!event.accelerationIncludingGravity) return;

        const { x, y, z } = event.accelerationIncludingGravity;
        if (!x || !y || !z) return;

        // Simple Peak Detection
        // Calculate magnitude of acceleration vector
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        // Threshold for a running step (approx > 12-13 m/s^2, gravity is ~9.8)
        const STEP_THRESHOLD = 12.5;
        const MIN_STEP_DELAY = 250; // ms (Max 240 SPM)

        if (magnitude > STEP_THRESHOLD) {
            const now = Date.now();
            if (now - lastStepTimeRef.current > MIN_STEP_DELAY) {
                // Potential step found
                // Check if it's a peak (simple approach: current > last)
                // For robustness we just count threshold crossings with debounce here
                setStepCount(prev => prev + 1);
                stepBufferRef.current.push(now);
                lastStepTimeRef.current = now;

                // Calculate SPM from buffer (steps in last 5 seconds)
                const fiveSecondsAgo = now - 5000;
                stepBufferRef.current = stepBufferRef.current.filter(t => t > fiveSecondsAgo);

                // RPM = (Steps in 5s) * 12
                const newCadence = stepBufferRef.current.length * 12;
                // Running cadence usually 150-190. Walking 100-130.
                if (newCadence > 40) { // Filter noise
                    setCadence(newCadence);
                } else {
                    setCadence(0);
                }
            }
        }
    };

    const requestSensorPermission = async () => {
        // @ts-ignore - iOS 13+ specific property
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try {
                // @ts-ignore
                const response = await DeviceMotionEvent.requestPermission();
                if (response === 'granted') {
                    return true;
                } else {
                    setError("Sensor permission denied");
                    return false;
                }
            } catch (e) {
                console.error(e);
                return false;
            }
        }
        return true; // Android/Web doesn't need explicit request
    };

    const startRun = async () => {
        // Request sensors first (must be triggered by user gesture)
        await requestSensorPermission();

        setIsRunning(true);
        setIsAutoPaused(false);
        setError(null);

        // Start Step Listeners
        window.addEventListener('devicemotion', handleMotion);

        // Start Timer
        const startTime = Date.now() - (elapsedTime * 1000);
        timerRef.current = setInterval(() => {
            if (!isPausedRef.current) {
                setElapsedTime((prev) => prev + 1);
            }
        }, 1000);

        if (!navigator.geolocation) {
            setError("Geolocation is not supported by your browser");
            return;
        }

        watchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const newPoint: GeoPoint = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    altitude: position.coords.altitude,
                    speed: position.coords.speed,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                };

                setCurrentLocation(newPoint);

                if (!isRunningRef.current) return;

                // Drift Protection: Ignore points with poor accuracy (> 25m)
                if (newPoint.accuracy && newPoint.accuracy > 25) {
                    return;
                }

                if (lastLocationRef.current) {
                    const dist = getDistanceFromLatLonInMeters(
                        lastLocationRef.current.latitude,
                        lastLocationRef.current.longitude,
                        newPoint.latitude,
                        newPoint.longitude
                    );

                    const timeDiff = (newPoint.timestamp - lastLocationRef.current.timestamp) / 1000;
                    const calculatedSpeed = timeDiff > 0 ? dist / timeDiff : 0;

                    // Improved Drift Filter: 
                    // 1. Must move more than 3 meters OR have a speed > 0.6 m/s (approx 2 km/h)
                    // 2. Must be slower than 12 m/s (approx 43 km/h)
                    if ((dist > 3 || calculatedSpeed > 0.6) && calculatedSpeed < 12) {
                        setDistance((prev) => {
                            const newTotal = prev + dist;
                            const kcal = (newTotal / 1000) * userWeightKg * 1.036;
                            setCalories(Math.floor(kcal));
                            return newTotal;
                        });
                        setPath((prev) => [...prev, newPoint]);
                        lastLocationRef.current = newPoint;

                        recentPointsRef.current.push(newPoint);
                        const cutoff = Date.now() - 30000; // Increased to 30s for professional smoothing
                        recentPointsRef.current = recentPointsRef.current.filter(p => p.timestamp > cutoff);

                        if (recentPointsRef.current.length > 2) {
                            // Calculate time-weighted average speed across the window
                            let totalWeightedSpeed = 0;
                            let totalWeight = 0;

                            for (let i = 1; i < recentPointsRef.current.length; i++) {
                                const p1 = recentPointsRef.current[i - 1];
                                const p2 = recentPointsRef.current[i];

                                const segmentDist = getDistanceFromLatLonInMeters(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
                                const segmentTime = (p2.timestamp - p1.timestamp) / 1000;

                                // Filter out impossible speed spikes within the window
                                if (segmentTime > 0 && (segmentDist / segmentTime) < 15) {
                                    // Newest points have 2x weight of oldest points
                                    const timeWeight = 1 + ((p2.timestamp - cutoff) / 30000);
                                    totalWeightedSpeed += (segmentDist / segmentTime) * timeWeight;
                                    totalWeight += timeWeight;
                                }
                            }

                            if (totalWeight > 0) {
                                const avgSpeedMs = totalWeightedSpeed / totalWeight;

                                // Human running bounds: 0.5 m/s to 10 m/s
                                if (avgSpeedMs > 0.5 && avgSpeedMs < 10) {
                                    const paceSecPerKm = 1000 / avgSpeedMs;

                                    // Soft-transition pace (exponential smoothing)
                                    setCurrentPace(prev => {
                                        if (prev === 0) return paceSecPerKm;
                                        return prev * 0.8 + paceSecPerKm * 0.2;
                                    });
                                } else if (avgSpeedMs <= 0.5) {
                                    setCurrentPace(0); // Effectively stopped
                                }
                            }
                        }
                    } else if (dist < 1 && calculatedSpeed < 0.3) {
                        // Fast Stop Detection: If almost no movement, decay pace quickly
                        setCurrentPace(prev => (prev > 0 ? Math.min(prev * 1.2, 3599) : 0));
                        // Note: Higher pace value = slower speed. Trending to 3599 (slow) or 0 (stopped)
                    }
                } else {
                    setPath([newPoint]);
                    lastLocationRef.current = newPoint;
                }
            },
            (err) => {
                setError(err.message);
                console.error("Geolocation error:", err);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            }
        );
    };

    // Calculate Average Pace
    useEffect(() => {
        if (distance > 0 && elapsedTime > 0) {
            const avgSpeedMs = distance / elapsedTime;
            const avgPaceSecPerKm = 1000 / avgSpeedMs;
            setAveragePace(Math.min(avgPaceSecPerKm, 3599));
        }
    }, [distance, elapsedTime]);

    const pauseRun = () => {
        setIsRunning(false);
        setIsAutoPaused(false);
        window.removeEventListener('devicemotion', handleMotion);

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (watchId.current !== null) {
            navigator.geolocation.clearWatch(watchId.current);
            watchId.current = null;
        }
    };

    const stopRun = () => {
        const runData = {
            distance,
            elapsedTime,
            path,
            calories,
            averagePace,
            cadence,
            stepCount
        };
        pauseRun();
        return runData;
    };

    useEffect(() => {
        return () => {
            window.removeEventListener('devicemotion', handleMotion);
            if (timerRef.current) clearInterval(timerRef.current);
            if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        };
    }, []);

    return {
        isRunning,
        path,
        currentLocation,
        distance,
        elapsedTime,
        currentPace,
        averagePace,
        calories,
        cadence,
        stepCount,
        isAutoPaused,
        startRun,
        pauseRun,
        stopRun,
        error
    };
}
