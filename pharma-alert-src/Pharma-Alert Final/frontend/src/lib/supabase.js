import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Helper function to get current user
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return null;
  return user;
};

// Helper function to get user profile
export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) return null;
  return data;
};

// Subscribe to realtime changes
export const subscribeToTable = (table, callback, filter = null) => {
  let channel = supabase.channel(`public:${table}`);
  
  const subscriptionConfig = {
    event: '*',
    schema: 'public',
    table: table
  };
  
  if (filter) {
    subscriptionConfig.filter = filter;
  }
  
  channel = channel.on('postgres_changes', subscriptionConfig, callback);
  
  channel.subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
};
