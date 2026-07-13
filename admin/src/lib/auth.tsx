import { createContext, useContext } from 'react';

// ログイン中スタッフの権限情報。管理者(admin)=全体閲覧、一般(staff)=自分のみ。
export interface Me {
  userId: string | null;
  isAdmin: boolean;
}

export const AuthContext = createContext<Me>({ userId: null, isAdmin: false });

export function useAuth(): Me {
  return useContext(AuthContext);
}
