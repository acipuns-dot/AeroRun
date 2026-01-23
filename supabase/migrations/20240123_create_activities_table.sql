-- Create activities table
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    distance FLOAT NOT NULL, -- in meters
    moving_time INTEGER NOT NULL, -- in seconds
    elapsed_time INTEGER NOT NULL, -- in seconds
    start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    type TEXT NOT NULL, -- e.g., 'run'
    path JSONB, -- store the path as a list of points
    calories INTEGER,
    average_pace FLOAT, -- seconds per km
    workout_id UUID REFERENCES public.workouts(id) ON DELETE SET NULL,
    intervals_id TEXT, -- store the ID from Intervals.icu
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Add policies
CREATE POLICY "Users can view their own activities" 
ON public.activities FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activities" 
ON public.activities FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own activities" 
ON public.activities FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own activities" 
ON public.activities FOR DELETE 
USING (auth.uid() = user_id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON public.activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_date ON public.activities(start_date);
