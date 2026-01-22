"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getActivitiesAction } from "@/app/actions/intervals";
import { Profile } from "@/types";

interface DataContextType {
    profile: Profile | null;
    session: any | null;
    workouts: any[];
    activities: any[];
    isLoading: boolean;
    refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [session, setSession] = useState<any | null>(null);
    const [workouts, setWorkouts] = useState<any[]>([]);
    const [activities, setActivities] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async (currentSession?: any) => {
        console.log('[DataContext] fetchData called', { hasCurrentSession: !!currentSession });
        const activeSession = currentSession || (await supabase.auth.getSession()).data.session;

        if (!activeSession) {
            setProfile(null);
            setSession(null);
            setWorkouts([]);
            setActivities([]);
            setIsLoading(false);
            return;
        }

        setSession(activeSession);

        try {
            console.log('[DataContext] Fetching data in parallel...');
            // Fetch everything in parallel for maximum speed
            const [profileRes, workoutsRes, activitiesRes] = await Promise.all([
                supabase.from("profiles").select("*").eq("id", activeSession.user.id).single(),
                supabase.from("workouts").select("*").eq("user_id", activeSession.user.id).order("date", { ascending: true }),
                getActivitiesAction()
            ]);

            console.log('[DataContext] Data fetched:', {
                profile: !!profileRes.data,
                workouts: workoutsRes.data?.length || 0,
                activities: Array.isArray(activitiesRes) ? activitiesRes.length : 0
            });

            if (profileRes.data) setProfile(profileRes.data);
            else setProfile(null);

            const fetchedWorkouts = workoutsRes.data || [];
            const fetchedActivities = Array.isArray(activitiesRes) ? activitiesRes : [];

            console.log('[DataContext] Updating state with:', {
                workoutsCount: fetchedWorkouts.length,
                activitiesCount: fetchedActivities.length
            });

            // --- AUTO-SYNC COMPLETION ---
            // If a workout is not marked completed but we have an activity on that day, mark it done!
            const updatedWorkouts = [...fetchedWorkouts];
            const workoutsToUpdate: string[] = [];

            fetchedWorkouts.forEach((w: any) => {
                if (!w.completed) {
                    const hasActivity = fetchedActivities.some((a: any) => {
                        const aDate = new Date(a.start_date_local || a.start_date).toISOString().split('T')[0];
                        return aDate === w.date;
                    });

                    if (hasActivity) {
                        w.completed = true;
                        workoutsToUpdate.push(w.id);
                    }
                }
            });

            // Update local state immediately
            setWorkouts(updatedWorkouts);
            setActivities(fetchedActivities);

            // Update database in the background if needed
            if (workoutsToUpdate.length > 0) {
                console.log(`[DataContext] Auto-marking ${workoutsToUpdate.length} workouts as completed...`);
                supabase.from("workouts").update({ completed: true }).in("id", workoutsToUpdate).then(({ error }) => {
                    if (error) console.error("[DataContext] Error auto-updating workouts:", error);
                });
            }
        } catch (err) {
            console.error("Error preloading data:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            fetchData(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <DataContext.Provider value={{
            profile,
            session,
            workouts,
            activities,
            isLoading,
            refreshData: () => fetchData()
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
}
