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
    activitiesError: string | null;
    isLoading: boolean;
    refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [session, setSession] = useState<any | null>(null);
    const [workouts, setWorkouts] = useState<any[]>([]);
    const [activities, setActivities] = useState<any[]>([]);
    const [activitiesError, setActivitiesError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async (currentSession?: any) => {
        console.log('[DataContext] fetchData - starting check...', {
            hasCurrentSession: !!currentSession,
            providedUserId: currentSession?.user?.id
        });

        try {
            setIsLoading(true);
            const activeSession = currentSession || (await supabase.auth.getSession()).data.session;
            console.log('[DataContext] fetchData - active session result:', {
                hasSession: !!activeSession,
                userId: activeSession?.user?.id,
                email: activeSession?.user?.email
            });

            if (!activeSession) {
                console.log('[DataContext] No session found, clearing state.');
                setProfile(null);
                setSession(null);
                setWorkouts([]);
                setActivities([]);
                setIsLoading(false);
                return;
            }

            setSession(activeSession);
            console.log('[DataContext] Fetching profile, workouts, and activities...');

            // Fetch everything in parallel for maximum speed
            const [profileRes, workoutsRes, activitiesRes] = await Promise.all([
                supabase.from("profiles").select("*").eq("id", activeSession.user.id).single(),
                supabase.from("workouts").select("*").eq("user_id", activeSession.user.id).order("date", { ascending: true }),
                getActivitiesAction()
            ]);

            console.log('[DataContext] Data fetched:', {
                profileFound: !!profileRes.data,
                profileOnboarded: profileRes.data?.onboarded,
                workouts: workoutsRes.data?.length || 0,
                activities: activitiesRes?.data?.length || 0,
                activitiesError: activitiesRes?.error
            });

            if (profileRes.data) setProfile(profileRes.data);
            else {
                console.log('[DataContext] Profile not found in database for user:', activeSession.user.id);
                setProfile(null);
            }

            const fetchedWorkouts = workoutsRes.data || [];
            const fetchedActivities = activitiesRes?.data || [];
            setActivitiesError(activitiesRes?.error || null);

            console.log('[DataContext] Updating state with fetched data...');

            // --- AUTO-SYNC COMPLETION ---
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

            setWorkouts(updatedWorkouts);
            setActivities(fetchedActivities);

            if (workoutsToUpdate.length > 0) {
                console.log(`[DataContext] Auto-marking ${workoutsToUpdate.length} workouts as completed...`);
                supabase.from("workouts").update({ completed: true }).in("id", workoutsToUpdate).then(({ error }) => {
                    if (error) console.error("[DataContext] Error auto-updating workouts:", error);
                });
            }
        } catch (err) {
            console.error("[DataContext] Error preloading data:", err);
        } finally {
            console.log('[DataContext] Setting isLoading to false.');
            setIsLoading(false);
        }
    };

    useEffect(() => {
        console.log('[DataContext] Initial mount - starting fetchData');
        fetchData();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('[DataContext] onAuthStateChange event:', event, { hasSession: !!session });
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
            activitiesError,
            isLoading,
            refreshData: async () => {
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                await fetchData(currentSession);
            }
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
