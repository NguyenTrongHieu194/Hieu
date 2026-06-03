import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Request Google Sheets and Google Drive permissions
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive');

// In-memory token cache
let cachedAccessToken: string | null = null;

export const setCachedToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const getCachedToken = () => {
  return cachedAccessToken;
};

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.log("[Firebase] Notice: The client appears to be offline. Please check your network connection if needed.");
    }
  }
}
testConnection();

export const signInWithGoogle = async () => {
  try {
    // Bước 1: Đăng nhập vào Firebase Authentication bằng Google Provider (để lấy uid và tạo session đăng nhập chính)
    const result = await signInWithPopup(auth, googleProvider);
    if (!result.user) {
      throw new Error("Không thể thiết lập phiên đăng nhập Firebase Auth.");
    }

    // Bước 2: Xin cấp quyền (Scopes) cho Google Workspace (Drive, Sheets) và lấy Access Token
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      const token = credential.accessToken;
      cachedAccessToken = token;

      // Lưu lại Access Token/Refresh Token vào Firebase Firestore dưới tài khoản của cơ sở dữ liệu đó
      try {
        await setDoc(doc(db, `users/${result.user.uid}/config/workspace`), {
          accessToken: token,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (firestoreErr: any) {
        console.error("Lỗi khi lưu Access Token vào Firestore:", firestoreErr);
      }
    } else {
      throw new Error("Google Workspace không cung cấp Access Token hợp lệ. Hãy tích chọn đủ quyền Drive/Sheets khi đăng nhập Google.");
    }

    return result;
  } catch (error: any) {
    console.error("Chi tiết lỗi Đăng nhập / Liên kết Google:", error);
    throw error;
  }
};

export const signInAsGuest = async () => {
  const result = await signInAnonymously(auth);
  return result;
};

export const logOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

