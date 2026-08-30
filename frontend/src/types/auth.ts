export type User = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  last_login_at: string | null;
};

export type AuthResponse = {
  user: User;
  csrf_token: string;
};

export type AuthCredentials = {
  email: string;
  password: string;
};
