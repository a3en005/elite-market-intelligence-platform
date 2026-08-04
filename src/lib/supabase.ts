import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export const getSupabase = () => {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and Anon Key are required. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
};

// For backward compatibility if needed, but prefer getSupabase()
export const supabase = {
  get auth() { return getSupabase().auth; },
  get functions() { return getSupabase().functions; },
  from: (table: string) => getSupabase().from(table),
};
