import React, { useState, useRef, useEffect } from "react";
import {
  Users,
  Settings,
  LayoutDashboard,
  ClipboardList,
  TrendingUp,
  Calendar,
  LogOut,
  Plus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Menu,
  X,
  Scissors,
  User as UserIcon,
  FileUp,
  Loader2,
  LogIn,
  Trash2,
  GripVertical,
  Play,
  Pause,
  RotateCcw,
  Timer,
  AlertTriangle,
  CloudLightning,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PieChart,
  BarChart2,
  UserCheck,
  UserX,
  Activity,
  FileText,
  Filter,
  Search,
  CalendarRange,
  ArrowLeftRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import UtilitiesTab from "./components/UtilitiesTab";
import { auth, db, signInWithGoogle, logOut, signInAsGuest, setCachedToken } from "./lib/firebase";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  getDocs,
  where,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import {
  Worker,
  Operation,
  ProductionOrder,
  ProductionLog,
  TimeStudyRecord,
  PlanFeedItem,
} from "./types";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  LabelList,
} from "recharts";

type Tab =
  | "dashboard"
  | "workers"
  | "operations"
  | "production"
  | "planning"
  | "timestudy"
  | "duty"
  | "utilities";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

const CustomChartTick = (props: any) => {
  const { x, y, payload } = props;
  const name = payload?.value || "";
  
  const words = name.trim().split(/\s+/);
  let lines: string[] = [];
  if (words.length <= 2) {
    lines = [name];
  } else if (words.length === 3) {
    lines = [words[0], words.slice(1).join(" ")];
  } else {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        textAnchor="middle"
        fill="#6B7280"
        style={{ fontSize: "8px", fontWeight: "600", fontFamily: "sans-serif" }}
      >
        {lines.map((line, idx) => (
          <tspan key={idx} x={0} dy={idx === 0 ? 8 : 10}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

interface StopwatchTerminalProps {
  onLap: (lapSecs: number) => void;
  timeStudy: {
    time1: number;
    time2: number;
    time3: number;
  };
}

const StopwatchTerminal = ({ onLap, timeStudy }: StopwatchTerminalProps) => {
  const [swRunning, setSwRunning] = useState(false);
  const [swTime, setSwTime] = useState(0); // in milliseconds
  const [swLaps, setSwLaps] = useState<number[]>([]);
  const [swLastLapTime, setSwLastLapTime] = useState<number>(0);
  const swStartTimeRef = useRef<number>(0);
  const swAccumulatedRef = useRef<number>(0);
  const swIntervalRef = useRef<any>(null);

  const startStopwatch = () => {
    if (swRunning) return;
    swStartTimeRef.current = Date.now() - swAccumulatedRef.current;
    setSwRunning(true);
    swIntervalRef.current = window.setInterval(() => {
      const current = Date.now() - swStartTimeRef.current;
      setSwTime(current);
    }, 16); // 60 FPS is extremely smooth!
  };

  const pauseStopwatch = () => {
    if (!swRunning) return;
    window.clearInterval(swIntervalRef.current);
    swAccumulatedRef.current = swTime;
    setSwRunning(false);
  };

  const resetStopwatch = () => {
    window.clearInterval(swIntervalRef.current);
    swStartTimeRef.current = 0;
    swAccumulatedRef.current = 0;
    setSwTime(0);
    setSwRunning(false);
    setSwLaps([]);
    setSwLastLapTime(0);
  };

  const recordLap = () => {
    if (swTime === 0) return;
    const currentLapTime = swTime - swLastLapTime;
    const lapSecs = Number((currentLapTime / 1000).toFixed(2));
    if (lapSecs <= 0) return;

    onLap(lapSecs);

    setSwLaps((prev) => [lapSecs, ...prev]);
    setSwLastLapTime(swTime);
  };

  // Listen to parent clear
  useEffect(() => {
    if (timeStudy.time1 === 0 && timeStudy.time2 === 0 && timeStudy.time3 === 0) {
      window.clearInterval(swIntervalRef.current);
      swStartTimeRef.current = 0;
      swAccumulatedRef.current = 0;
      setSwTime(0);
      setSwRunning(false);
      setSwLaps([]);
      setSwLastLapTime(0);
    }
  }, [timeStudy.time1, timeStudy.time2, timeStudy.time3]);

  useEffect(() => {
    return () => {
      if (swIntervalRef.current) {
        window.clearInterval(swIntervalRef.current);
      }
    };
  }, []);

  const nextSlot =
    timeStudy.time1 === 0
      ? "Lần 1"
      : timeStudy.time2 === 0
        ? "Lần 2"
        : timeStudy.time3 === 0
          ? "Lần 3"
          : "Vòng 1";

  // Formatter for display
  const totalCentiseconds = Math.floor(swTime / 10);
  const cs = String(totalCentiseconds % 100).padStart(2, "0");
  const totalSeconds = Math.floor(swTime / 1000);
  const ss = String(totalSeconds % 60).padStart(2, "0");
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const displayTime = totalSeconds < 60 ? `${ss}.${cs}s` : `${mm}:${ss}.${cs}`;

  return (
    <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-500/20 relative overflow-hidden">
      {/* Decorative background lights */}
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -left-10 -top-10 w-40 h-40 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
        {/* Circular progress dial */}
        <div className="relative flex-shrink-0 flex items-center justify-center w-36 h-36">
          <svg className="w-full h-full transform -rotate-90">
            {/* Background track circle */}
            <circle
              cx="72"
              cy="72"
              r="55"
              className="stroke-indigo-950/50 fill-transparent"
              strokeWidth="8"
            />
            {/* Glowing active animated indicator */}
            <circle
              cx="72"
              cy="72"
              r="55"
              className="stroke-indigo-400 fill-transparent transition-all duration-75"
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 55}
              strokeDashoffset={
                2 * Math.PI * 55 -
                ((swTime % 60000) / 60000) * (2 * Math.PI * 55)
              }
              strokeLinecap="round"
            />
          </svg>
          {/* Inner Digital display */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-2xl font-black font-mono tracking-tight text-white drop-shadow-md">
              {displayTime}
            </span>
            <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-widest mt-0.5">
              {swRunning ? "🏃 ĐANG CHẠY" : "⏹️ TẠM DỪNG"}
            </span>
          </div>
        </div>

        {/* Control Stack */}
        <div className="flex-1 w-full flex flex-col justify-between self-stretch">
          <div>
            <div className="text-indigo-200 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Timer size={14} className="text-indigo-400 animate-pulse" />
              Thiết bị đo chu kỳ xoay vòng
            </div>
            <p className="text-[11px] text-indigo-200/80 leading-relaxed mb-4">
              Bấm <strong className="text-white">Bắt đầu</strong>, sau đó nhấn <strong className="text-white">Bấm Vòng</strong> mỗi lần thao tác kết thúc để tự động thu thập lần đo.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 mt-auto">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (swRunning) {
                  pauseStopwatch();
                } else {
                  startStopwatch();
                }
              }}
              className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                swRunning
                  ? "bg-amber-500 hover:bg-amber-400 text-slate-900 active:scale-95"
                  : "bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-600/30 active:scale-95"
              }`}
            >
              {swRunning ? (
                <>
                  <Pause size={13} fill="currentColor" /> Tạm dừng
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" /> Bắt đầu
                </>
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                recordLap();
              }}
              disabled={swTime === 0}
              className="flex-2 min-w-[130px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:hover:bg-emerald-500 text-slate-900 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
            >
              Bấm Vòng • Ghi {nextSlot}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetStopwatch();
              }}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition-all active:scale-95 cursor-pointer"
              title="Khởi đặt lại đồng hồ"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Recent laps horizontal list */}
      {swLaps.length > 0 && (
        <div className="mt-4 pt-3 border-t border-indigo-500/20 flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none py-1">
          <span className="text-[10px] font-bold text-indigo-450 uppercase tracking-wider flex-shrink-0">
            Lịch sử các vòng đo:
          </span>
          <div className="flex gap-1.5 overflow-x-auto">
            {swLaps.slice(0, 6).map((lapSec, index) => (
              <span
                key={index}
                className="inline-block bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold px-2 py-0.5 rounded-md"
              >
                👉 Vòng {swLaps.length - index}: <span className="text-indigo-100">{lapSec}s</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const safeFormatDate = (dateVal: any, formatStr: string = "HH:mm dd/MM/yyyy"): string => {
  if (!dateVal) return "-";
  try {
    let d: Date;
    // Handle Firestore Timestamp { seconds, nanoseconds }
    if (typeof dateVal === "object" && dateVal !== null) {
      if (typeof dateVal.toDate === "function") {
        d = dateVal.toDate();
      } else if (typeof dateVal.seconds === "number") {
        d = new Date(dateVal.seconds * 1000);
      } else {
        d = new Date(dateVal);
      }
    } else {
      d = new Date(dateVal);
    }

    if (isNaN(d.getTime())) {
      if (typeof dateVal === "string") {
        return dateVal;
      }
      return "-";
    }
    return format(d, formatStr);
  } catch (error) {
    return typeof dateVal === "string" ? dateVal : "-";
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  const handleFirestoreError = (
    error: unknown,
    operationType: OperationType,
    path: string | null,
  ) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
      },
      operationType,
      path,
    };
    console.error("Firestore Error: ", JSON.stringify(errInfo));
    // Always show alert for debugging
    const vietnameseOp =
      {
        [OperationType.WRITE]: "ghi",
        [OperationType.CREATE]: "tạo",
        [OperationType.UPDATE]: "cập nhật",
        [OperationType.DELETE]: "xóa",
        [OperationType.LIST]: "tải danh sách",
        [OperationType.GET]: "lấy dữ liệu",
      }[operationType] || operationType;

    alert(`Lỗi hệ thống khi ${vietnameseOp} dữ liệu: ${errInfo.error}`);
  };

  // Persistence State
  const [lines, setLines] = useState<string[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [timeStudyRecords, setTimeStudyRecords] = useState<TimeStudyRecord[]>(
    [],
  );
  const [plans, setPlans] = useState<PlanFeedItem[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [duties, setDuties] = useState<any[]>([]);
  const [lineDuties, setLineDuties] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Nếu đăng nhập bằng Google/Firebase thực tế, xoá trạng thái demo để đồng bộ dữ liệu chính thức
        if (!u.isAnonymous) {
          localStorage.removeItem("garmentops_demo_user");
          
          // Tự động khôi phục Access Token từ Firestore khi tải phiên
          try {
            const { getDoc, doc: fsDoc } = await import("firebase/firestore");
            const tokenSnap = await getDoc(fsDoc(db, `users/${u.uid}/config/workspace`));
            if (tokenSnap.exists()) {
              const data = tokenSnap.data();
              if (data && data.accessToken) {
                setCachedToken(data.accessToken);
              }
            }
          } catch (err) {
            console.warn("Khôi phục automatic token từ Firestore thất bại:", err);
          }
        }
        setUser(u);
      } else {
        const demoUser = localStorage.getItem("garmentops_demo_user");
        if (demoUser) {
          setUser(JSON.parse(demoUser));
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Subscription Effect
  useEffect(() => {
    if (!user) {
      setLines([]);
      setWorkers([]);
      setOperations([]);
      setOrders([]);
      setLogs([]);
      setTimeStudyRecords([]);
      setPlans([]);
      setAttendance([]);
      setDuties([]);
      setLineDuties([]);
      setMeetings([]);
      return;
    }

    if ((user as any).isLocalDemo) {
      const storedLines = localStorage.getItem('garmentops_demo_lines');
      setLines(storedLines ? JSON.parse(storedLines) : ["Chuyền 1", "Chuyền 2", "Chuyền 3"]);

      const storedWorkers = localStorage.getItem('garmentops_demo_workers');
      setWorkers(storedWorkers ? JSON.parse(storedWorkers) : []);

      const storedOperations = localStorage.getItem('garmentops_demo_operations');
      setOperations(storedOperations ? JSON.parse(storedOperations) : []);

      const storedOrders = localStorage.getItem('garmentops_demo_orders');
      setOrders(storedOrders ? JSON.parse(storedOrders) : []);

      const storedLogs = localStorage.getItem('garmentops_demo_productionLogs');
      setLogs(storedLogs ? JSON.parse(storedLogs) : []);

      const storedTS = localStorage.getItem('garmentops_demo_timeStudies');
      setTimeStudyRecords(storedTS ? JSON.parse(storedTS) : []);

      const storedPlans = localStorage.getItem('garmentops_demo_plans');
      setPlans(storedPlans ? JSON.parse(storedPlans) : [
        {
          id: "default-plan-1",
          title: "Kế hoạch sản xuất tuần này",
          description: "Bấm nút Thêm Kế Hoạch bên dưới để tải ảnh hoặc tệp sơ đồ chuyền mới.",
          imageUrl: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600",
          fileName: "ke_hoach_tuan.jpg",
          fileType: "image/jpeg",
          fileSize: "120 KB",
          createdAt: "2026-06-03T08:00:00.000Z"
        }
      ]);

      const storedAttendance = localStorage.getItem('garmentops_demo_attendance');
      setAttendance(storedAttendance ? JSON.parse(storedAttendance) : []);

      const storedDuties = localStorage.getItem('garmentops_demo_duties');
      setDuties(storedDuties ? JSON.parse(storedDuties) : []);

      const storedLineDuties = localStorage.getItem('garmentops_demo_line_duties');
      setLineDuties(storedLineDuties ? JSON.parse(storedLineDuties) : []);

      const storedWorkerHourlyLogs = localStorage.getItem('garmentops_demo_worker_hourly_logs');
      setWorkerHourlyLogs(storedWorkerHourlyLogs ? JSON.parse(storedWorkerHourlyLogs) : []);

      const storedMeetings = localStorage.getItem('garmentops_demo_meetings');
      setMeetings(storedMeetings ? JSON.parse(storedMeetings) : [
        {
          id: "demo-meeting-1",
          date: format(new Date(), "yyyy-MM-dd"),
          type: "worker",
          title: "Họp triển khai chuyền mới",
          content: "1. Phân chia sơ đồ bố trí máy cho mã hàng NESS 0351.\n2. Công nhân cuối chuyền chú ý đo thông số đầu ra kỹ hơn.\n3. Nhắc nhở an toàn lao động.",
          createdAt: new Date().toISOString()
        },
        {
          id: "demo-meeting-2",
          date: format(new Date(), "yyyy-MM-dd"),
          type: "company",
          title: "Họp giao ban toàn xí nghiệp tuần 2",
          content: "1. Đạt mục tiêu năng suất 95% cho các chuyền may chính.\n2. Tăng cường giữ gìn vệ sinh chung, gom rác đúng nơi quy định.\n3. Chuẩn bị cho đợt kiểm tra quy trình xuất khẩu sắp tới.",
          createdAt: new Date().toISOString()
        }
      ]);

      workersLoadedRef.current = true;
      return;
    }

    const userPath = `users/${user.uid}`;

    // Subscriptions
    const unsubLines = onSnapshot(
      collection(db, `${userPath}/lines`),
      (snap) => {
        const data = snap.docs.map((d) => d.data().name as string);
        setLines(data.length > 0 ? data : ["Chuyền 1", "Chuyền 2", "Chuyền 3"]);
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `${userPath}/lines`),
    );

    const unsubWorkers = onSnapshot(
      collection(db, `${userPath}/workers`),
      (snap) => {
        setWorkers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Worker));
        workersLoadedRef.current = true;
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `${userPath}/workers`),
    );

    const unsubOps = onSnapshot(
      collection(db, `${userPath}/operations`),
      (snap) => {
        setOperations(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Operation),
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `${userPath}/operations`),
    );

    const unsubOrders = onSnapshot(
      collection(db, `${userPath}/orders`),
      (snap) => {
        setOrders(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProductionOrder),
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `${userPath}/orders`),
    );

    const unsubLogs = onSnapshot(
      collection(db, `${userPath}/productionLogs`),
      (snap) => {
        setLogs(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ProductionLog),
        );
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/productionLogs`,
        ),
    );

    const unsubTS = onSnapshot(
      collection(db, `${userPath}/timeStudies`),
      (snap) => {
        setTimeStudyRecords(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TimeStudyRecord),
        );
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/timeStudies`,
        ),
    );

    const unsubPlans = onSnapshot(
      collection(db, `${userPath}/plans`),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PlanFeedItem);
        // Sort newest first based on createdAt ISO string
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setPlans(data);
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/plans`,
        ),
    );

    const unsubAttendance = onSnapshot(
      collection(db, `${userPath}/attendance`),
      (snap) => {
        setAttendance(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/attendance`,
        ),
    );

    const unsubDuties = onSnapshot(
      collection(db, `${userPath}/duties`),
      (snap) => {
        setDuties(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/duties`,
        ),
    );

    const unsubLineDuties = onSnapshot(
      collection(db, `${userPath}/lineDuties`),
      (snap) => {
        setLineDuties(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/lineDuties`,
        ),
    );

    const unsubWorkerHourlyLogs = onSnapshot(
      collection(db, `${userPath}/workerHourlyLogs`),
      (snap) => {
        setWorkerHourlyLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/workerHourlyLogs`,
        ),
    );

    const unsubMeetings = onSnapshot(
      collection(db, `${userPath}/meetings`),
      (snap) => {
        setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) =>
        handleFirestoreError(
          err,
          OperationType.LIST,
          `${userPath}/meetings`,
        ),
    );

    return () => {
      unsubLines();
      unsubWorkers();
      unsubOps();
      unsubOrders();
      unsubLogs();
      unsubTS();
      unsubPlans();
      unsubAttendance();
      unsubDuties();
      unsubLineDuties();
      unsubWorkerHourlyLogs();
      unsubMeetings();
    };
  }, [user]);

  // Flag to check if we have loaded workers at least once from Firestore
  const workersLoadedRef = useRef(false);

  useEffect(() => {
    if (user && workers.length > 0) {
      workersLoadedRef.current = true;
    }
  }, [workers, user]);

  // Firestore Helpers
  const addDocToFirestore = async (col: string, data: any) => {
    if (!user) return;
    if ((user as any).isLocalDemo) {
      const newId = col + "_" + Math.random().toString(36).substr(2, 9);
      const newItem = {
        ...data,
        id: newId,
        userId: user.uid,
        createdAt: new Date().toISOString(),
      };
      
      if (col === 'workers') {
        const next = [...workers, newItem];
        setWorkers(next);
        localStorage.setItem('garmentops_demo_workers', JSON.stringify(next));
      } else if (col === 'operations') {
        const next = [...operations, newItem];
        setOperations(next);
        localStorage.setItem('garmentops_demo_operations', JSON.stringify(next));
      } else if (col === 'orders') {
        const next = [...orders, newItem];
        setOrders(next);
        localStorage.setItem('garmentops_demo_orders', JSON.stringify(next));
      } else if (col === 'productionLogs') {
        const next = [...logs, newItem];
        setLogs(next);
        localStorage.setItem('garmentops_demo_productionLogs', JSON.stringify(next));
      } else if (col === 'timeStudies') {
        const next = [...timeStudyRecords, newItem];
        setTimeStudyRecords(next);
        localStorage.setItem('garmentops_demo_timeStudies', JSON.stringify(next));
      } else if (col === 'plans') {
        const next = [newItem, ...plans];
        setPlans(next);
        localStorage.setItem('garmentops_demo_plans', JSON.stringify(next));
      } else if (col === 'meetings') {
        const next = [newItem, ...meetings];
        setMeetings(next);
        localStorage.setItem('garmentops_demo_meetings', JSON.stringify(next));
      }
      return;
    }

    const path = `users/${user.uid}/${col}`;
    try {
      await addDoc(collection(db, path), {
        ...data,
        userId: user.uid,
        createdAt: Timestamp.now(),
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  const setDocToFirestore = async (col: string, id: string, data: any) => {
    if (!user) return;
    if ((user as any).isLocalDemo) {
      const newItem = {
        ...data,
        id,
        userId: user.uid,
        createdAt: new Date().toISOString(),
      };
      if (col === 'attendance') {
        const next = [...attendance.filter(a => a.id !== id), newItem];
        setAttendance(next);
        localStorage.setItem('garmentops_demo_attendance', JSON.stringify(next));
      } else if (col === 'duties') {
        const next = [...duties.filter(d => d.id !== id), newItem];
        setDuties(next);
        localStorage.setItem('garmentops_demo_duties', JSON.stringify(next));
      } else if (col === 'lineDuties') {
        const next = [...lineDuties.filter(d => d.id !== id), newItem];
        setLineDuties(next);
        localStorage.setItem('garmentops_demo_line_duties', JSON.stringify(next));
      } else if (col === 'workerHourlyLogs') {
        const next = [...workerHourlyLogs.filter(w => w.id !== id), newItem];
        setWorkerHourlyLogs(next);
        localStorage.setItem('garmentops_demo_worker_hourly_logs', JSON.stringify(next));
      } else if (col === 'meetings') {
        const next = [...meetings.filter(m => m.id !== id), newItem];
        setMeetings(next);
        localStorage.setItem('garmentops_demo_meetings', JSON.stringify(next));
      }
      return;
    }
    const path = `users/${user.uid}/${col}/${id}`;
    try {
      await setDoc(doc(db, `users/${user.uid}/${col}`, id), {
        ...data,
        userId: user.uid,
        createdAt: Timestamp.now(),
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  const deleteDocFromFirestore = async (col: string, id: string) => {
    if (!user) return;
    if ((user as any).isLocalDemo) {
      if (col === 'workers') {
        const next = workers.filter(w => w.id !== id);
        setWorkers(next);
        localStorage.setItem('garmentops_demo_workers', JSON.stringify(next));
      } else if (col === 'operations') {
        const next = operations.filter(o => o.id !== id);
        setOperations(next);
        localStorage.setItem('garmentops_demo_operations', JSON.stringify(next));
      } else if (col === 'orders') {
        const next = orders.filter(o => o.id !== id);
        setOrders(next);
        localStorage.setItem('garmentops_demo_orders', JSON.stringify(next));
      } else if (col === 'productionLogs') {
        const next = logs.filter(l => l.id !== id);
        setLogs(next);
        localStorage.setItem('garmentops_demo_productionLogs', JSON.stringify(next));
      } else if (col === 'timeStudies') {
        const next = timeStudyRecords.filter(t => t.id !== id);
        setTimeStudyRecords(next);
        localStorage.setItem('garmentops_demo_timeStudies', JSON.stringify(next));
      } else if (col === 'plans') {
        const next = plans.filter(p => p.id !== id);
        setPlans(next);
        localStorage.setItem('garmentops_demo_plans', JSON.stringify(next));
      } else if (col === 'attendance') {
        const next = attendance.filter(a => a.id !== id);
        setAttendance(next);
        localStorage.setItem('garmentops_demo_attendance', JSON.stringify(next));
      } else if (col === 'duties') {
        const next = duties.filter(d => d.id !== id);
        setDuties(next);
        localStorage.setItem('garmentops_demo_duties', JSON.stringify(next));
      } else if (col === 'lineDuties') {
        const next = lineDuties.filter(d => d.id !== id);
        setLineDuties(next);
        localStorage.setItem('garmentops_demo_line_duties', JSON.stringify(next));
      } else if (col === 'workerHourlyLogs') {
        const next = workerHourlyLogs.filter(w => w.id !== id);
        setWorkerHourlyLogs(next);
        localStorage.setItem('garmentops_demo_worker_hourly_logs', JSON.stringify(next));
      } else if (col === 'meetings') {
        const next = meetings.filter(m => m.id !== id);
        setMeetings(next);
        localStorage.setItem('garmentops_demo_meetings', JSON.stringify(next));
      }
      return;
    }

    const path = `users/${user.uid}/${col}/${id}`;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/${col}`, id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  const updateDocInFirestore = async (col: string, id: string, data: any) => {
    if (!user) return;
    if ((user as any).isLocalDemo) {
      if (col === 'workers') {
        const next = workers.map(w => w.id === id ? { ...w, ...data } : w);
        setWorkers(next);
        localStorage.setItem('garmentops_demo_workers', JSON.stringify(next));
      } else if (col === 'operations') {
        const next = operations.map(o => o.id === id ? { ...o, ...data } : o);
        setOperations(next);
        localStorage.setItem('garmentops_demo_operations', JSON.stringify(next));
      } else if (col === 'orders') {
        const next = orders.map(o => o.id === id ? { ...o, ...data } : o);
        setOrders(next);
        localStorage.setItem('garmentops_demo_orders', JSON.stringify(next));
      } else if (col === 'productionLogs') {
        const next = logs.map(l => l.id === id ? { ...l, ...data } : l);
        setLogs(next);
        localStorage.setItem('garmentops_demo_productionLogs', JSON.stringify(next));
      } else if (col === 'timeStudies') {
        const next = timeStudyRecords.map(t => t.id === id ? { ...t, ...data } : t);
        setTimeStudyRecords(next);
        localStorage.setItem('garmentops_demo_timeStudies', JSON.stringify(next));
      } else if (col === 'workerHourlyLogs') {
        const next = workerHourlyLogs.map(w => w.id === id ? { ...w, ...data } : w);
        setWorkerHourlyLogs(next);
        localStorage.setItem('garmentops_demo_worker_hourly_logs', JSON.stringify(next));
      } else if (col === 'meetings') {
        const next = meetings.map(m => m.id === id ? { ...m, ...data } : m);
        setMeetings(next);
        localStorage.setItem('garmentops_demo_meetings', JSON.stringify(next));
      }
      return;
    }

    const path = `users/${user.uid}/${col}/${id}`;
    try {
      await updateDoc(doc(db, `users/${user.uid}/${col}`, id), data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  // UI State
  const [newLineName, setNewLineName] = useState("");
  const [workerFilterLine, setWorkerFilterLine] = useState("");
  const [opFilterStyle, setOpFilterStyle] = useState("");
  const [tsFilterLine, setTsFilterLine] = useState("");
  const [tsFilterStyle, setTsFilterStyle] = useState("");
  const [tsFilterWorker, setTsFilterWorker] = useState("");
  const [tsSelectedStyle, setTsSelectedStyle] = useState("");
  const [tsSelectedLine, setTsSelectedLine] = useState("");
  const [tsChartMetric, setTsChartMetric] = useState<"productivity" | "duration">("productivity");
  const [tsSortOrder, setTsSortOrder] = useState<"custom" | "newest">("custom");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Transfer Workers states
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSearchQuery, setTransferSearchQuery] = useState("");
  const [transferSelectedLineFilter, setTransferSelectedLineFilter] = useState("");

  // Duty and Attendance states
  const [dutyDate, setDutyDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dutySubTab, setDutySubTab] = useState<"attendance" | "schedule" | "lines_status" | "calendar" | "meeting" | "stats">("attendance");
  const [dutyFilterLine, setDutyFilterLine] = useState("");
  const [dutySearchQuery, setDutySearchQuery] = useState("");
  const [dutyFilterAttendanceStatus, setDutyFilterAttendanceStatus] = useState<"all" | "present" | "absent">("all");
  const [lineStatusFilter, setLineStatusFilter] = useState<"Tất cả" | "Rồi" | "Chưa">("Tất cả");
  const [lineStatusSearch, setLineStatusSearch] = useState("");
  const [calendarYearMonth, setCalendarYearMonth] = useState(format(new Date(), "yyyy-MM"));

  // Specialized Attendance Statistics states
  const [statsPeriod, setStatsPeriod] = useState<"day" | "week" | "month">("day");
  const [statsDate, setStatsDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statsWeekRefDate, setStatsWeekRefDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statsMonth, setStatsMonth] = useState(format(new Date(), "yyyy-MM"));
  const [statsLine, setStatsLine] = useState("");
  const [statsSearchWorker, setStatsSearchWorker] = useState("");

  const handlePrevMonth = () => {
    const [yStr, mStr] = calendarYearMonth.split("-");
    let y = parseInt(yStr);
    let m = parseInt(mStr);
    m--;
    if (m < 1) {
      m = 12;
      y--;
    }
    setCalendarYearMonth(`${y}-${String(m).padStart(2, "0")}`);
  };

  const handleNextMonth = () => {
    const [yStr, mStr] = calendarYearMonth.split("-");
    let y = parseInt(yStr);
    let m = parseInt(mStr);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    setCalendarYearMonth(`${y}-${String(m).padStart(2, "0")}`);
  };

  // Plan Feed States
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanDesc, setNewPlanDesc] = useState("");
  const [newPlanFile, setNewPlanFile] = useState<{
    base64: string;
    name: string;
    type: string;
    sizeFriendly: string;
  } | null>(null);
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [activeZoomedPlan, setActiveZoomedPlan] = useState<string | null>(null);

  // Meeting States
  const [meetingSubTab, setMeetingSubTab] = useState<"worker" | "company">("worker");
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    content: "",
    date: format(new Date(), "yyyy-MM-dd")
  });
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [isAddingMeeting, setIsAddingMeeting] = useState(false);
  const [meetingSearch, setMeetingSearch] = useState("");

  // Dashboard States
  const [dashboardDate, setDashboardDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dashboardPeriod, setDashboardPeriod] = useState<"day" | "week" | "month">("day");

  // Time Study State
  const [timeStudy, setTimeStudy] = useState({
    workerId: "",
    operationId: "",
    operationId2: "",
    time1: 0,
    time2: 0,
    time3: 0,
    needsCheck1: false,
    needsCheck2: false,
    needsCheck3: false,
  });

  // Form States
  const [newLog, setNewLog] = useState({
    line: "",
    orderId: orders[0]?.id || "",
    actualQuantity: 0,
    date: format(new Date(), "yyyy-MM-dd"),
  });

  const [newWorker, setNewWorker] = useState({
    name: "",
    code: "",
    skills: "",
    line: "",
    gender: "nữ" as "nam" | "nữ",
  });
  const [newOperation, setNewOperation] = useState({
    name: "",
    code: "",
    style: "",
    sam: 0,
    target: 0,
  });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtractingWorker, setIsExtractingWorker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerFileInputRef = useRef<HTMLInputElement>(null);

  // --- Hourly %EFF Production Board AI Calculator States ---
  const [prodSubTab, setProdSubTab] = useState<"manual" | "eff_hourly" | "worker_hourly">("manual");
  const [workerHourlyLogs, setWorkerHourlyLogs] = useState<any[]>([]);
  const [hourlyProdDate, setHourlyProdDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hourlyProdLine, setHourlyProdLine] = useState("");
  const [workerLogWorkerId, setWorkerLogWorkerId] = useState("");
  const [workerLogOpId, setWorkerLogOpId] = useState("");
  const [workerLogType, setWorkerLogType] = useState<"daily" | "hourly">("hourly");
  const [workerLogHourRange, setWorkerLogHourRange] = useState("7h30-8h30");
  const [workerLogQty, setWorkerLogQty] = useState<number>(0);
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [isExtractingEff, setIsExtractingEff] = useState(false);
  const effFileInputRef = useRef<HTMLInputElement>(null);
  
  const [effLine, setEffLine] = useState("464");
  const [effStyle, setEffStyle] = useState("NESS 0351 W/10/022-B");
  const [effSam, setEffSam] = useState<number>(8.915);
  const [effOperators, setEffOperators] = useState<number>(18);
  
  const [effHourlyLogs, setEffHourlyLogs] = useState([
    { id: "1", time: "08:30", target: 95, actual: 55 },
    { id: "2", time: "09:30", target: 95, actual: 55 },
    { id: "3", time: "10:30", target: 95, actual: 50 },
    { id: "4", time: "11:30", target: 95, actual: 60 },
    { id: "5", time: "13:30", target: 95, actual: 57 },
    { id: "6", time: "14:30", target: 95, actual: 57 },
    { id: "7", time: "15:30", target: 95, actual: 58 },
    { id: "8", time: "16:30", target: 95, actual: 58 },
  ]);
  const [newOrder, setNewOrder] = useState({
    customer: "",
    style: "",
    job: "",
    quantity: 0,
    deadline: "",
  });
  const [prodFilterLine, setProdFilterLine] = useState("");
  const [prodFilterOrder, setProdFilterOrder] = useState("");
  const [prodFilterDate, setProdFilterDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );

  const handleAddLine = async () => {
    if (!newLineName.trim() || !user) return;
    if (lines.includes(newLineName.trim())) return;

    if ((user as any).isLocalDemo) {
      const next = [...lines, newLineName.trim()];
      setLines(next);
      localStorage.setItem('garmentops_demo_lines', JSON.stringify(next));
      setNewLineName("");
      return;
    }

    try {
      await setDoc(doc(db, `users/${user.uid}/lines`, newLineName.trim()), {
        name: newLineName.trim(),
        userId: user.uid,
      });
      setNewLineName("");
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLine = async (lineName: string) => {
    if (!user) return;
    if (window.confirm(`Bạn có chắc chắn muốn xoá chuyền "${lineName}"?`)) {
      if ((user as any).isLocalDemo) {
        const next = lines.filter((l) => l !== lineName);
        setLines(next);
        localStorage.setItem('garmentops_demo_lines', JSON.stringify(next));
        return;
      }
      try {
        await deleteDoc(doc(db, `users/${user.uid}/lines`, lineName));
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Handlers
  const handleAddLog = async () => {
    const { line, orderId, actualQuantity, date } = newLog;
    const qty = Number(actualQuantity);

    if (!line || !orderId || qty <= 0) {
      alert("Vui lòng nhập đầy đủ Chuyền, chọn Mã hàng và SL > 0!");
      return;
    }

    const log: any = {
      date: date || format(new Date(), "yyyy-MM-dd"),
      line,
      orderId,
      actualQuantity: qty,
      hour: new Date().getHours(),
      targetQuantity: 0,
    };

    await addDocToFirestore("productionLogs", log);

    // Update order progress
    const order = orders.find((o) => o.id === orderId);
    if (order) {
      await updateDocInFirestore("orders", orderId, {
        producedQuantity: order.producedQuantity + qty,
        status: "in_progress",
      });
    }

    setNewLog({ ...newLog, actualQuantity: 0 });
  };

  const handleDeleteLog = async (id: string) => {
    const logToDelete = logs.find((l) => l.id === id);
    if (logToDelete && logToDelete.orderId) {
      const order = orders.find((o) => o.id === logToDelete.orderId);
      if (order) {
        await updateDocInFirestore("orders", order.id, {
          producedQuantity: Math.max(
            0,
            order.producedQuantity - logToDelete.actualQuantity,
          ),
        });
      }
    }
    await deleteDocFromFirestore("productionLogs", id);
  };

  const handleAddWorker = async () => {
    if (!user) return;

    const hasAnyField =
      newWorker.name.trim() || newWorker.code.trim();

    if (!hasAnyField) return;

    // Add to lines if not exists
    const lineName = newWorker.line.trim() || "Chuyền 1";
    if (!lines.includes(lineName)) {
      if ((user as any).isLocalDemo) {
        const next = [...lines, lineName];
        setLines(next);
        localStorage.setItem('garmentops_demo_lines', JSON.stringify(next));
      } else {
        await setDoc(doc(db, `users/${user.uid}/lines`, lineName), {
          name: lineName,
          userId: user.uid,
        });
      }
    }

    const worker = {
      name: newWorker.name.trim() || "Chưa đặt tên",
      code: newWorker.code.trim() || "-",
      skills: [],
      line: lineName,
      performance: 0,
      gender: newWorker.gender || "nữ",
    };
    await addDocToFirestore("workers", worker);
    setNewWorker({ name: "", code: "", skills: "", line: "", gender: "nữ" });
  };

  const handleSaveWorkerHourlyLog = async () => {
    if (!workerLogWorkerId) {
      alert("Vui lòng chọn công nhân!");
      return;
    }
    if (!workerLogOpId) {
      alert("Vui lòng chọn công đoạn!");
      return;
    }
    if (workerLogQty <= 0) {
      alert("Vui lòng nhập sản lượng > 0!");
      return;
    }

    const worker = workers.find(w => w.id === workerLogWorkerId);
    const op = operations.find(o => o.id === workerLogOpId);
    if (!worker || !op) return;

    const log = {
      date: hourlyProdDate,
      line: worker.line,
      workerId: worker.id,
      workerName: worker.name,
      workerCode: worker.code,
      opId: op.id,
      opCode: op.code,
      opName: op.name,
      style: op.style,
      logType: "hourly",
      hourRange: workerLogHourRange,
      actualQuantity: workerLogQty
    };

    const logId = `wl_${Date.now()}`;
    await setDocToFirestore("workerHourlyLogs", logId, log);
    setWorkerLogQty(0);
    alert("Đã ghi nhận sản lượng thành công!");
  };

  const handleDeleteWorkerHourlyLog = async (id: string) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa bản ghi sản lượng này?")) {
      await deleteDocFromFirestore("workerHourlyLogs", id);
    }
  };

  const resizeAndCompressImage = (
    base64Str: string,
    maxW = 1000,
    maxH = 1000,
    quality = 0.7
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxW) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          }
        } else {
          if (height > maxH) {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleAddPlan = async () => {
    if (!user) return;
    if (!newPlanTitle.trim()) {
      alert("Vui lòng nhập tiêu đề kế hoạch!");
      return;
    }

    const payload = {
      title: newPlanTitle.trim(),
      description: newPlanDesc.trim() || "",
      imageUrl: newPlanFile?.base64 || "",
      fileName: newPlanFile?.name || "",
      fileType: newPlanFile?.type || "",
      fileSize: newPlanFile?.sizeFriendly || "",
      createdAt: new Date().toISOString()
    };

    await addDocToFirestore("plans", payload);
    setNewPlanTitle("");
    setNewPlanDesc("");
    setNewPlanFile(null);
    setIsAddingPlan(false);
  };

  const handleDeletePlan = async (id: string) => {
    if (window.confirm && !window.confirm("Bạn có chắc chắn muốn xóa kế hoạch này?")) {
      return;
    }
    await deleteDocFromFirestore("plans", id);
  };

  const handleDeleteWorker = async (id: string) => {
    await deleteDocFromFirestore("workers", id);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const originalBase64 = (event.target?.result as string || "").split(",")[1] || "";
        
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1200;

            if (width <= 0 || height <= 0) {
              resolve(originalBase64);
              return;
            }

            if (width > height) {
              if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
              }
            } else {
              if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(originalBase64);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            // Attempt to get compressed jpeg with quality parameter
            try {
              const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
              const base64 = dataUrl.split(",")[1];
              resolve(base64);
            } catch (innerError) {
              // Try without the quality parameter to support older/buggy browsers
              try {
                const dataUrl = canvas.toDataURL("image/jpeg");
                const base64 = dataUrl.split(",")[1];
                resolve(base64);
              } catch (lastResortError) {
                // If anything fails in canvas context or toDataURL, fallback to original uncompressed base64
                resolve(originalBase64);
              }
            }
          } catch (error) {
            console.warn("Canvas compression failed, falling back to original base64:", error);
            resolve(originalBase64);
          }
        };
        img.onerror = () => {
          resolve(originalBase64);
        };
      };
      reader.onerror = () => {
        reject(new Error("Không thể đọc tệp tin"));
      };
    });
  };

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === "auth/popup-blocked") {
        alert(
          "Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép hiện cửa sổ bật lên hoặc thử mở ứng dụng trong tab mới (nút 'Open in new tab' ở góc trên bên phải).",
        );
      } else if (error.code === "auth/unauthorized-domain") {
        alert(
          "Tên miền này chưa được cấp phép trong Firebase Console. Nếu bạn đang chạy trên Vercel, hãy thêm domain của bạn vào 'Authorized Domains' trong phần Authentication -> Settings của Firebase.",
        );
      } else {
        alert("Lỗi đăng nhập: " + error.message);
      }
    }
  };

  const handleGuestSignIn = async () => {
    try {
      await signInAsGuest();
    } catch (error: any) {
      console.warn("Firebase Guest auth blocked, starting standalone simulation mode:", error);
      const guestU = {
        uid: "local-demo-user",
        email: "demo-user@garmentops.app",
        displayName: "Khách Demo",
        isAnonymous: true,
        isLocalDemo: true
      };
      localStorage.setItem("garmentops_demo_user", JSON.stringify(guestU));
      setUser(guestU as any);
    }
  };

  const handleLogOut = async () => {
    localStorage.removeItem("garmentops_demo_user");
    setUser(null);
    try {
      await logOut();
    } catch (e) {
      console.error("Logout Error:", e);
    }
  };

  const handleWorkerFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Direct Excel Parsing Support
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(worksheet);

          let count = 0;
          for (const item of json) {
            // Normalize keys to lowercase for easier matching
            const normalizedItem: any = {};
            Object.keys(item).forEach((key) => {
              normalizedItem[key.toLowerCase().trim()] = item[key];
            });

            const lineName = (
              normalizedItem.line ||
              normalizedItem["chuyền"] ||
              normalizedItem["tổ"] ||
              "Chuyền 1"
            )
              .toString()
              .trim();

            if (!lines.includes(lineName)) {
              if ((user as any).isLocalDemo) {
                const next = [...lines, lineName];
                setLines(next);
                localStorage.setItem('garmentops_demo_lines', JSON.stringify(next));
              } else {
                await setDoc(doc(db, `users/${user.uid}/lines`, lineName), {
                  name: lineName,
                  userId: user.uid,
                });
              }
            }

            const worker = {
              name: (
                normalizedItem.name ||
                normalizedItem["họ và tên"] ||
                normalizedItem["tên"] ||
                normalizedItem["họ tên"] ||
                "Unnamed Worker"
              )
                .toString()
                .trim(),
              code: (
                normalizedItem.code ||
                normalizedItem["mã cn"] ||
                normalizedItem["mã"] ||
                normalizedItem["mã nhân viên"] ||
                "CODE"
              )
                .toString()
                .trim(),
              skills: normalizedItem.skills
                ? typeof normalizedItem.skills === "string"
                  ? normalizedItem.skills
                      .split(",")
                      .map((s: string) => s.trim())
                  : [normalizedItem.skills.toString()]
                : normalizedItem["công đoạn"] || normalizedItem["kỹ năng"]
                  ? [
                      (
                        normalizedItem["công đoạn"] || normalizedItem["kỹ năng"]
                      ).toString(),
                    ]
                  : [],
              line: lineName,
              performance: 0,
            };
            await addDocToFirestore("workers", worker);
            count++;
          }
          setWorkerFilterLine(""); // Clear the active filter to show newly imported workers!
          alert(`Đã nhập thành công ${count} công nhân từ Excel!`);
        } catch (err) {
          console.error(err);
          alert("Lỗi khi đọc file Excel. Vui lòng kiểm tra định dạng.");
        } finally {
          if (workerFileInputRef.current) workerFileInputRef.current.value = "";
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    setIsExtractingWorker(true);
    try {
      let base64 = "";
      let mimeType = "image/jpeg";

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const reader = new FileReader();
        base64 = await new Promise((resolve, reject) => {
          reader.onload = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        mimeType = "application/pdf";
      } else {
        base64 = await compressImage(file);
        mimeType = "image/jpeg";
      }

      const response = await fetch("/api/extract-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract worker data");
      }

      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          const lineName = (item.line || newWorker.line || "Chuyền 1").trim();
          if (!lines.includes(lineName)) {
            if ((user as any).isLocalDemo) {
              const next = [...lines, lineName];
              setLines(next);
              localStorage.setItem('garmentops_demo_lines', JSON.stringify(next));
            } else {
              await setDoc(doc(db, `users/${user.uid}/lines`, lineName), {
                name: lineName,
                userId: user.uid,
              });
            }
          }

          const worker = {
            name: item.name || "Unnamed Worker",
            code: item.code || "CODE",
            skills: item.skills
              ? typeof item.skills === "string"
                ? item.skills.split(",").map((s: string) => s.trim())
                : item.skills
              : [],
            line: lineName,
            performance: 0,
          };
          await addDocToFirestore("workers", worker);
        }
        setWorkerFilterLine(""); // Clear the active worker line filter
        alert(`Đã nhận diện và thêm ${data.length} công nhân thành công!`);
      } else {
        alert("Không tìm thấy dữ liệu công nhân trong hình ảnh.");
      }
    } catch (error: any) {
      console.error(error);
      alert(`Có lỗi xảy ra khi xử lý hình ảnh với AI: ${error.message}`);
    } finally {
      setIsExtractingWorker(false);
      if (workerFileInputRef.current) workerFileInputRef.current.value = "";
    }
  };

  const handleAddOperation = async () => {
    const hasAnyField =
      newOperation.name.trim() ||
      newOperation.code.trim() ||
      newOperation.style.trim() ||
      newOperation.sam > 0 ||
      newOperation.target > 0;

    if (!hasAnyField) return;

    const op = {
      name: newOperation.name.trim() || "Chưa đặt tên",
      code: newOperation.code.trim() || "-",
      style: newOperation.style.trim() || "",
      sam: Number(newOperation.sam) || 0,
      targetPerHour: Number(newOperation.target) || 0,
    };
    await addDocToFirestore("operations", op);
    setNewOperation({ name: "", code: "", style: "", sam: 0, target: 0 });
  };

  const handleDeleteOperation = async (id: string) => {
    await deleteDocFromFirestore("operations", id);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Direct Excel Parsing Support
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json: any[] = XLSX.utils.sheet_to_json(worksheet);

          let count = 0;
          for (const item of json) {
            // Normalize keys to lowercase for easier matching
            const normalizedItem: any = {};
            Object.keys(item).forEach((key) => {
              normalizedItem[key.toLowerCase().trim()] = item[key];
            });

            const opName = (
              normalizedItem.name ||
              normalizedItem["tên công đoạn"] ||
              normalizedItem["công đoạn"] ||
              normalizedItem["tên"] ||
              normalizedItem["thao tác"] ||
              normalizedItem["nội dung"] ||
              normalizedItem["bước"] ||
              "Unnamed Operation"
            )
              .toString()
              .trim();

            const opCode = (
              normalizedItem.code ||
              normalizedItem["mã công đoạn"] ||
              normalizedItem["mã cđ"] ||
              normalizedItem["mã"] ||
              normalizedItem["stt"] ||
              normalizedItem["số thứ tự"] ||
              normalizedItem["ký hiệu"] ||
              "CODE"
            )
              .toString()
              .trim();

            let samValue = Number(
              normalizedItem.sam ||
                normalizedItem["định mức"] ||
                normalizedItem["định mức sam"] ||
                normalizedItem["thời gian"] ||
                normalizedItem["tgđm"] ||
                normalizedItem["đm"] ||
                0,
            );

            let targetValue = Number(
              normalizedItem.target ||
                normalizedItem["mục tiêu"] ||
                normalizedItem["sản lượng"] ||
                normalizedItem["mục tiêu/giờ"] ||
                normalizedItem["công suất"] ||
                0,
            );

            // Auto-convert SAM <-> Target if one of them is missing
            if (samValue > 0 && targetValue === 0) {
              targetValue = Math.round(60 / samValue);
            } else if (targetValue > 0 && samValue === 0) {
              samValue = Number((60 / targetValue).toFixed(2));
            }

            const op = {
              name: opName,
              code: opCode,
              style: (
                normalizedItem.style ||
                normalizedItem["mã hàng"] ||
                normalizedItem["mã mã"] ||
                normalizedItem["hàng"] ||
                newOperation.style ||
                ""
              )
                .toString()
                .trim(),
              sam: samValue,
              targetPerHour: targetValue,
            };
            await addDocToFirestore("operations", op);
            count++;
          }
          setOpFilterStyle(""); // Clear the active filter to make sure user sees the uploaded data!
          alert(`Đã nhập thành công ${count} công đoạn từ Excel!`);
        } catch (err) {
          console.error(err);
          alert("Lỗi khi đọc file Excel. Vui lòng kiểm tra định dạng.");
        } finally {
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    setIsExtracting(true);
    try {
      let base64 = "";
      let mimeType = "image/jpeg";

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const reader = new FileReader();
        base64 = await new Promise((resolve, reject) => {
          reader.onload = () =>
            resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        mimeType = "application/pdf";
      } else {
        base64 = await compressImage(file);
        mimeType = "image/jpeg";
      }

      const response = await fetch("/api/extract-operation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract data");
      }

      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          let samValue = Number(item.sam) || 0;
          let targetValue = Number(item.target) || 0;

          // Auto-calculate if one of them is missing
          if (samValue > 0 && targetValue === 0) {
            targetValue = Math.round(60 / samValue);
          } else if (targetValue > 0 && samValue === 0) {
            samValue = Number((60 / targetValue).toFixed(2));
          }

          const op = {
            name: item.name || "Unnamed Operation",
            code: item.code || "CODE",
            style: item.style || newOperation.style || "",
            sam: samValue,
            targetPerHour: targetValue,
          };
          await addDocToFirestore("operations", op);
        }
        setOpFilterStyle(""); // Reset filter so user can see imported elements immediately
        alert(`Đã nhận diện và thêm ${data.length} công đoạn thành công!`);
      } else {
        alert("Không tìm thấy dữ liệu công đoạn trong hình ảnh.");
      }
    } catch (error: any) {
      console.error(error);
      alert(`Có lỗi xảy ra khi xử lý hình ảnh với AI: ${error.message}`);
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --- Hourly %EFF Board AI Calculator Action Utilities ---
  const handleEffBoardUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsExtractingEff(true);
    try {
      let base64 = "";
      let mimeType = "image/jpeg";

      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        const reader = new FileReader();
        base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        mimeType = "application/pdf";
      } else {
        base64 = await compressImage(file);
        mimeType = "image/jpeg";
      }

      const response = await fetch("/api/extract-efficiency-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể phân tích dữ liệu bảng");
      }

      if (data) {
        if (data.line) setEffLine(data.line.toString());
        if (data.style) setEffStyle(data.style.toString());
        if (data.sam) setEffSam(Number(data.sam) || 0);
        if (data.operators) setEffOperators(Number(data.operators) || 0);
        
        if (Array.isArray(data.hourlyLogs) && data.hourlyLogs.length > 0) {
          const formattedLogs = data.hourlyLogs.map((log: any, index: number) => ({
            id: (index + 1).toString(),
            time: log.time?.toString() || `${(8 + index).toString().padStart(2, "0")}:30`,
            target: typeof log.target === 'number' ? log.target : 95,
            actual: typeof log.actual === 'number' ? log.actual : 0,
          }));
          setEffHourlyLogs(formattedLogs);
        }
        alert("Đã hoàn thành phân tích ảnh bằng AI! Dữ liệu đã được bóc tách và nạp tự động vào bảng tính.");
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Lỗi khi xử lý hình ảnh với AI. Vui lòng kiểm tra và thử lại.");
    } finally {
      setIsExtractingEff(false);
      if (effFileInputRef.current) effFileInputRef.current.value = "";
    }
  };

  const handleAddNewHour = () => {
    setEffHourlyLogs((prev) => {
      const nextId = (prev.length > 0 ? Math.max(...prev.map(p => Number(p.id) || 0)) + 1 : 1).toString();
      let nextTime = "17:30";
      if (prev.length > 0) {
        const lastTime = prev[prev.length - 1].time;
        if (lastTime.includes(":")) {
          const match = lastTime.match(/(\d+):(\d+)/);
          if (match) {
            const h = parseInt(match[1], 10);
            const m = match[2];
            const nh = (h >= 23 ? 0 : h + 1).toString().padStart(2, "0");
            nextTime = `${nh}:${m}`;
          }
        }
      }
      return [...prev, { id: nextId, time: nextTime, target: 95, actual: 0 }];
    });
  };

  const handleUpdateHourRow = (id: string, field: "time" | "target" | "actual", value: any) => {
    setEffHourlyLogs((prev) =>
      prev.map((log) => {
        if (log.id === id) {
          if (field === "target" || field === "actual") {
            return { ...log, [field]: Number(value) || 0 };
          }
          return { ...log, [field]: value };
        }
        return log;
      })
    );
  };

  const handleDeleteHourRow = (id: string) => {
    setEffHourlyLogs((prev) => prev.filter((log) => log.id !== id));
  };

  const handleClearEffBoard = () => {
    if (window.confirm("Bạn có chắc chắn muốn xóa sạch dữ liệu hiện tại để thiết lập bảng trắng mới từ đầu?")) {
      setEffLine("");
      setEffStyle("");
      setEffSam(0);
      setEffOperators(0);
      setEffHourlyLogs([
        { id: "1", time: "08:30", target: 95, actual: 0 },
        { id: "2", time: "09:30", target: 95, actual: 0 },
        { id: "3", time: "10:30", target: 95, actual: 0 },
        { id: "4", time: "11:30", target: 95, actual: 0 },
        { id: "5", time: "13:30", target: 95, actual: 0 },
        { id: "6", time: "14:30", target: 95, actual: 0 },
        { id: "7", time: "15:30", target: 95, actual: 0 },
        { id: "8", time: "16:30", target: 95, actual: 0 },
      ]);
    }
  };

  const computeEffPercent = (actual: number, sam: number, operators: number) => {
    if (sam <= 0 || operators <= 0) return 0;
    const effFraction = (actual * sam) / (operators * 60);
    return Math.round(effFraction * 1000) / 10; // decimal notation up to 1 decimal place, e.g. 45.4
  };

  const handleAddOrder = async () => {
    if (!newOrder.customer || !newOrder.style) return;
    const order = {
      customer: newOrder.customer,
      styleName: newOrder.style,
      job: newOrder.job,
      orderQuantity: Number(newOrder.quantity),
      producedQuantity: 0,
      deadline: newOrder.deadline,
      status: "planning",
    };
    await addDocToFirestore("orders", order);
    setNewOrder({
      customer: "",
      style: "",
      job: "",
      quantity: 0,
      deadline: "",
    });
  };

  const handleDeleteOrder = async (id: string) => {
    await deleteDocFromFirestore("orders", id);
  };

  const handleAddTimeStudyRecord = async () => {
    const validTimes = [
      timeStudy.time1,
      timeStudy.time2,
      timeStudy.time3,
    ].filter((t) => t > 0);
    if (
      validTimes.length === 0 ||
      !timeStudy.workerId ||
      !timeStudy.operationId ||
      !tsSelectedStyle
    ) {
      alert(
        "Vui lòng nhập đầy đủ thông tin (chọn mã hàng, công đoạn, công nhân và các lần đo)!",
      );
      return;
    }

    const avgTimeObserved =
      validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const avgTimeAdjusted = avgTimeObserved * 1.2;
    const outputPerHour = Math.round(3600 / avgTimeAdjusted);
    const outputPerDay = outputPerHour * 8;

    const existingOrders = timeStudyRecords
      .map((r) => (r as any).orderIndex)
      .filter((val): val is number => typeof val === "number");
    const minOrder = existingOrders.length > 0 ? Math.min(...existingOrders) : 0;
    const newOrderIndex = minOrder - 1;

    const record = {
      date: format(new Date(), "yyyy-MM-dd HH:mm"),
      workerId: timeStudy.workerId,
      operationId: timeStudy.operationId,
      operationId2: timeStudy.operationId2 || "",
      times: validTimes,
      averageTime: Number(avgTimeAdjusted.toFixed(2)),
      targetPerHour: outputPerHour,
      targetPerDay: outputPerDay,
      style: tsSelectedStyle, // Store style name directly for reliability
      orderIndex: newOrderIndex,
      needsCheck: timeStudy.needsCheck1 || timeStudy.needsCheck2 || timeStudy.needsCheck3,
      needsCheckTimes: [timeStudy.needsCheck1, timeStudy.needsCheck2, timeStudy.needsCheck3],
    };

    await addDocToFirestore("timeStudies", record);
    setTimeStudy({
      ...timeStudy,
      operationId2: "",
      time1: 0,
      time2: 0,
      time3: 0,
      needsCheck1: false,
      needsCheck2: false,
      needsCheck3: false,
    });
    setTsSelectedLine("");
    alert("Đã lưu kết quả nghiên cứu (đã cộng thêm 20% thời gian bù hao)!");
  };

  const handleDeleteTimeStudyRecord = async (id: string) => {
    await deleteDocFromFirestore("timeStudies", id);
  };

  const handleToggleTimeStudyCheck = async (id: string, currentVal: boolean) => {
    await updateDocInFirestore("timeStudies", id, { needsCheck: !currentVal });
  };

  const handleImportWorkers = async (newWorkers: Omit<Worker, "id">[]): Promise<number> => {
    if (!user) return 0;
    if ((user as any).isLocalDemo) {
      const updatedLines = [...lines];
      const updatedWorkers = [...workers];
      for (const w of newWorkers) {
        const lineName = w.line || "Chuyền 1";
        if (!updatedLines.includes(lineName)) {
          updatedLines.push(lineName);
        }
        updatedWorkers.push({
          id: "worker_" + Math.random().toString(36).substr(2, 9),
          name: w.name,
          code: w.code,
          skills: w.skills,
          line: w.line,
          performance: 0,
          userId: user.uid,
          createdAt: new Date().toISOString(),
        } as any);
      }
      setLines(updatedLines);
      localStorage.setItem('garmentops_demo_lines', JSON.stringify(updatedLines));
      setWorkers(updatedWorkers);
      localStorage.setItem('garmentops_demo_workers', JSON.stringify(updatedWorkers));
      return newWorkers.length;
    }

    let count = 0;
    try {
      const batch = writeBatch(db);
      for (const w of newWorkers) {
        // Automatically ensure the line exists!
        const lineName = w.line || "Chuyền 1";
        if (!lines.includes(lineName)) {
          const lineRef = doc(db, `users/${user.uid}/lines`, lineName);
          batch.set(lineRef, { name: lineName, userId: user.uid });
        }

        const workerRef = doc(collection(db, `users/${user.uid}/workers`));
        batch.set(workerRef, {
          name: w.name,
          code: w.code,
          skills: w.skills,
          line: w.line,
          performance: 0,
          userId: user.uid,
          createdAt: Timestamp.now(),
        });
        count++;
      }
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/workers (batch)`);
    }
    return count;
  };

  const handleImportOperations = async (newOps: Omit<Operation, "id">[]): Promise<number> => {
    if (!user) return 0;
    if ((user as any).isLocalDemo) {
      const updatedOps = [...operations];
      for (const op of newOps) {
        updatedOps.push({
          id: "op_" + Math.random().toString(36).substr(2, 9),
          name: op.name,
          code: op.code,
          style: op.style || "",
          sam: op.sam,
          targetPerHour: op.targetPerHour,
          userId: user.uid,
          createdAt: new Date().toISOString(),
        } as any);
      }
      setOperations(updatedOps);
      localStorage.setItem('garmentops_demo_operations', JSON.stringify(updatedOps));
      return newOps.length;
    }

    let count = 0;
    try {
      const batch = writeBatch(db);
      for (const op of newOps) {
        const opRef = doc(collection(db, `users/${user.uid}/operations`));
        batch.set(opRef, {
          name: op.name,
          code: op.code,
          style: op.style || "",
          sam: op.sam,
          targetPerHour: op.targetPerHour,
          userId: user.uid,
          createdAt: Timestamp.now(),
        });
        count++;
      }
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}/operations (batch)`);
    }
    return count;
  };

  // Sorting logic based on Line -> Order -> Operation -> Worker
  const getSortedLogs = () => {
    return [...logs].sort((a, b) => {
      const workerA = workers.find((w) => w.id === a.workerId);
      const workerB = workers.find((w) => w.id === b.workerId);
      const orderA = orders.find((o) => o.id === a.orderId);
      const orderB = orders.find((o) => o.id === b.orderId);
      const opA = operations.find((o) => o.id === a.operationId);
      const opB = operations.find((o) => o.id === b.operationId);

      // 1. Sort by Line
      const lineCompare = (workerA?.line || "").localeCompare(
        workerB?.line || "",
      );
      if (lineCompare !== 0) return lineCompare;

      // 2. Sort by Order/Style
      const orderCompare = (orderA?.styleName || "").localeCompare(
        orderB?.styleName || "",
      );
      if (orderCompare !== 0) return orderCompare;

      // 3. Sort by Operation
      const opCompare = (opA?.name || "").localeCompare(opB?.name || "");
      if (opCompare !== 0) return opCompare;

      // 4. Sort by Worker
      const workerCompare = (workerA?.name || "").localeCompare(
        workerB?.name || "",
      );
      if (workerCompare !== 0) return workerCompare;

      // Default by time
      return b.hour - a.hour;
    });
  };

  const getProductionByLine = () => {
    const data: Record<string, number> = {};
    lines.forEach((l) => (data[l] = 0));
    logs.forEach((log: any) => {
      let line = log.line;
      if (!line && log.workerId) {
        line = workers.find((w) => w.id === log.workerId)?.line;
      }
      if (line) {
        data[line] = (data[line] || 0) + log.actualQuantity;
      }
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  };

  const getSortedTimeStudyRecords = () => {
    if (tsSortOrder === "newest") {
      return [...timeStudyRecords].sort((a, b) => {
        return (b.date || "").localeCompare(a.date || "");
      });
    }

    return [...timeStudyRecords].sort((a, b) => {
      const aOrder = typeof (a as any).orderIndex === "number" ? (a as any).orderIndex : null;
      const bOrder = typeof (b as any).orderIndex === "number" ? (b as any).orderIndex : null;

      if (aOrder !== null && bOrder !== null) {
        return aOrder - bOrder;
      }
      if (aOrder !== null) return -1;
      if (bOrder !== null) return 1;

      return (b.date || "").localeCompare(a.date || "");
    });
  };

  const handleReorderTimeStudyRecords = async (draggedIdx: number, targetIdx: number) => {
    const filtered = getFilteredTimeStudyRecords();
    if (draggedIdx === targetIdx) return;

    const reorderedFiltered = [...filtered];
    const [removed] = reorderedFiltered.splice(draggedIdx, 1);
    reorderedFiltered.splice(targetIdx, 0, removed);

    // 1. Update local state immediately for instant feedback
    const orderIndexMap = new Map<string, number>();
    reorderedFiltered.forEach((rec, idx) => {
      orderIndexMap.set(rec.id, idx);
    });

    setTimeStudyRecords((prev) => {
      return prev.map((rec) => {
        if (orderIndexMap.has(rec.id)) {
          return {
            ...rec,
            orderIndex: orderIndexMap.get(rec.id)!,
          };
        }
        return rec;
      });
    });

    // 2. Persist the new orderIndex to Firestore using writeBatch
    if (!user) return;
    if ((user as any).isLocalDemo) {
      const next = timeStudyRecords.map((t) => {
        const foundIdx = reorderedFiltered.findIndex((rf) => rf.id === t.id);
        if (foundIdx !== -1) {
          return { ...t, orderIndex: foundIdx };
        }
        return t;
      });
      setTimeStudyRecords(next);
      localStorage.setItem('garmentops_demo_timeStudies', JSON.stringify(next));
      return;
    }
    try {
      const batch = writeBatch(db);
      for (let i = 0; i < reorderedFiltered.length; i++) {
        const record = reorderedFiltered[i];
        if ((record as any).orderIndex !== i) {
          const docRef = doc(db, `users/${user.uid}/timeStudies`, record.id);
          batch.update(docRef, { orderIndex: i });
        }
      }
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}/timeStudies`);
    }
  };

  const getFilteredTimeStudyRecords = () => {
    return getSortedTimeStudyRecords().filter((record) => {
      const worker = workers.find((w) => w.id === record.workerId);
      const op = operations.find((o) => o.id === record.operationId);
      const lineMatch = !tsFilterLine || worker?.line === tsFilterLine;
      const styleMatch =
        !tsFilterStyle ||
        record.style === tsFilterStyle ||
        op?.style === tsFilterStyle;
      const workerMatch =
        !tsFilterWorker || record.workerId === tsFilterWorker;
      return lineMatch && styleMatch && workerMatch;
    });
  };

  const getOrderBreakdown = (orderId: string) => {
    const breakdown: Record<string, number> = {};
    logs
      .filter((l) => l.orderId === orderId)
      .forEach((log: any) => {
        let line = log.line;
        if (!line && log.workerId) {
          line = workers.find((w) => w.id === log.workerId)?.line;
        }
        line = line || "N/A";
        breakdown[line] = (breakdown[line] || 0) + log.actualQuantity;
      });
    return Object.entries(breakdown).map(([line, produced]) => ({
      line,
      produced,
    }));
  };

  const getDailyProductionSummary = () => {
    const summary: Record<
      string,
      {
        date: string;
        orderId: string;
        line: string;
        dailyQty: number;
      }
    > = {};

    logs
      .filter((log) => log.orderId)
      .forEach((log: any) => {
        // Use log.line if it exists (new manual entries), else fallback to worker line (legacy)
        let line = log.line;
        if (!line && log.workerId) {
          const worker = workers.find((w) => w.id === log.workerId);
          line = worker?.line;
        }
        line = line || "N/A";

        const key = `${log.date}-${log.orderId}-${line}`;

        if (!summary[key]) {
          summary[key] = {
            date: log.date,
            orderId: log.orderId || "",
            line,
            dailyQty: 0,
          };
        }
        summary[key].dailyQty += log.actualQuantity;
      });

    return Object.values(summary).sort((a, b) => b.date.localeCompare(a.date));
  };

  const sidebarItems = [
    { id: "dashboard", label: "Tổng quan", icon: LayoutDashboard },
    { id: "workers", label: "Công nhân", icon: Users },
    { id: "operations", label: "Công đoạn", icon: Settings },
    { id: "production", label: "Sản lượng", icon: TrendingUp },
    { id: "planning", label: "Kế hoạch", icon: Calendar },
    { id: "timestudy", label: "Bấm Giờ", icon: Clock },
    { id: "duty", label: "Quản lý CN", icon: ClipboardList },
    { id: "utilities", label: "Tiện ích", icon: CloudLightning },
  ];

  const totalOrdered = orders.reduce(
    (acc, order) => acc + order.orderQuantity,
    0,
  );
  const totalActual = orders.reduce(
    (acc, order) => acc + order.producedQuantity,
    0,
  );
  const overallProgress =
    totalOrdered > 0 ? (totalActual / totalOrdered) * 100 : 0;
  const recentLogs = logs.slice(-10).reverse();

  return (
    <div className="min-h-screen bg-[#FDFDFF] text-gray-900 font-sans pb-24 md:pb-8 pt-16">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-100 z-50 px-6 flex items-center justify-between shadow-sm backdrop-blur-md bg-white/80">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 rotate-3">
            <Scissors className="text-white" size={18} />
          </div>
          <h1 className="text-lg font-black font-serif italic tracking-tighter text-indigo-900 uppercase">
            Garment Ops
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {format(new Date(), "dd/MM/yyyy")}
            </p>
            {user && (
              <p className="text-[10px] text-indigo-700 font-black tracking-wide uppercase">
                {(user.isAnonymous || (user as any).isLocalDemo) ? "⚡️ Khách (Demo Mode)" : user.email}
              </p>
            )}
          </div>
          {user ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsTransferModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer border-0"
                title="Điều chuyển công nhân"
              >
                <ArrowLeftRight size={16} />
                <span className="hidden sm:inline">Điều chuyển CN</span>
              </button>
              <button
                onClick={handleLogOut}
                className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer border-0"
                title="Đăng xuất"
              >
                <LogOut size={16} />
                <span className="hidden md:inline">Đăng xuất</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Auth Overlay */}
      <AnimatePresence>
        {!user && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-8"
            >
              <div className="flex justify-center">
                <div className="h-20 w-20 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-indigo-200 rotate-12">
                  <Scissors className="text-white" size={40} />
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-black text-gray-900 font-serif italic mb-2 tracking-tight">
                  Chào mừng bạn!
                </h2>
                <p className="text-gray-500 text-sm font-medium">
                  Đăng nhập để lưu trữ dữ liệu sản xuất và đồng bộ trên mọi
                  thiết bị.
                </p>
              </div>

              {typeof window !== "undefined" && window.self !== window.top && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-[11px] text-indigo-900 text-left leading-relaxed space-y-2 shadow-sm animate-fadeIn">
                  <span className="font-extrabold text-indigo-950 flex items-center gap-1.5 uppercase">
                    📱 ĐANG CHẠY TRONG KHUNG XEM THỬ:
                  </span>
                  <p className="font-semibold text-indigo-800">
                    Trình duyệt di động luôn tự động chặn cửa sổ Pop-up khi ứng dụng chạy trong khung iframe của <strong className="text-indigo-950 font-black">AI Studio</strong>.
                  </p>
                  <p className="font-bold text-indigo-900">
                    👇 Bạn hãy nhấn vào nút dưới đây để mở ứng dụng toàn màn hình trong tab mới. Bạn sẽ đăng nhập và cập nhật dữ liệu thành công 100%!
                  </p>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all flex items-center justify-center gap-1.5 text-xs shadow-md shadow-indigo-600/15"
                  >
                    🚀 MỞ TRONG TAB ĐỘC LẬP MỚI
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              )}

              <button
                onClick={handleSignIn}
                className="w-full py-4 px-6 rounded-2xl bg-white border-2 border-gray-100 hover:border-indigo-600 transition-all flex items-center justify-center gap-4 text-gray-700 font-black shadow-sm group cursor-pointer active:scale-[0.98]"
              >
                <img
                  src="https://www.google.com/favicon.ico"
                  className="w-5 h-5 group-hover:scale-110 transition-transform"
                  alt="Google"
                />
                Tiếp tục với Google
              </button>

              <div className="relative flex py-2 items-center text-gray-400">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-4 text-[9px] font-bold uppercase tracking-widest text-gray-400">Hoặc duyệt nhanh</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              <button
                onClick={handleGuestSignIn}
                className="w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] cursor-pointer"
              >
                <Sparkles size={14} className="text-amber-400 animate-pulse" />
                Duyệt nhanh bằng Tài khoản Khách
              </button>

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-[11px] text-amber-800 text-left leading-relaxed space-y-1.5 shadow-sm">
                <span className="font-extrabold text-amber-900 flex items-center gap-1">
                  ⚠️ LƯU Ý KHI CẤP QUYỀN ĐĂNG NHẬP:
                </span>
                <p className="font-semibold">
                  Vì ứng dụng đang chạy ở môi trường thử nghiệm, nếu Google hiển thị cửa sổ đỏ cảnh báo <strong className="text-amber-950 font-black">"Google chưa xác minh ứng dụng này"</strong>:
                </p>
                <ol className="list-decimal list-inside space-y-1 font-semibold pl-1">
                  <li>Nhấn nút <strong className="text-amber-950">Nâng cao (Advanced)</strong> ở góc dưới bên trái biểu mẫu Google.</li>
                  <li>Nhấp vào liên kết <strong className="text-amber-950 underline decoration-amber-900/40">Đi tới Garment Ops (không an toàn)</strong> để tiếp tục.</li>
                </ol>
              </div>

              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest pt-2">
                Hệ thống quản lý sản xuất may mặc hiện đại
              </p>
            </motion.div>
          </motion.div>
        )}

        {loading && (
          <motion.div className="fixed inset-0 z-[101] flex items-center justify-center bg-white">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="max-w-[96%] lg:max-w-[92%] xl:max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="w-full">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (() => {
              // Date helpers
              const targetDate = dashboardDate;
              const yearMonth = targetDate.substring(0, 7); // e.g. "2026-06"
              
              const getWeekDatesList = (baseDateStr: string) => {
                const list: string[] = [];
                const parts = baseDateStr.split("-").map(Number);
                const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
                for (let i = 6; i >= 0; i--) {
                  const d = new Date(baseDate);
                  d.setDate(baseDate.getDate() - i);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, "0");
                  const r = String(d.getDate()).padStart(2, "0");
                  list.push(`${y}-${m}-${r}`);
                }
                return list;
              };

              const datesList = dashboardPeriod === "day"
                ? [targetDate]
                : dashboardPeriod === "week"
                  ? getWeekDatesList(targetDate)
                  : []; // Month uses substring matching

              // Helper to check if a date string is in the selected period
              const isDateInPeriod = (dateStr: string) => {
                if (dashboardPeriod === "day") {
                  return dateStr === targetDate;
                } else if (dashboardPeriod === "week") {
                  return datesList.includes(dateStr);
                } else {
                  return dateStr.startsWith(yearMonth);
                }
              };

              // 1. Chấm công (Attendance Stats)
              let totalPresentCount = 0;
              let totalAbsentCount = 0;
              let totalLateCount = 0;
              const periodAbsents: Array<{ workerName: string; line: string; date: string; reason: string }> = [];
              const periodLates: Array<{ workerName: string; line: string; date: string; timeValue: string; reason: string }> = [];

              const getLocalAttendanceStats = (dateStr: string) => {
                const records = attendance.filter(a => a.date === dateStr);
                let presentCount = workers.length;
                let absentCount = 0;
                let lateCount = 0;
                const absentList: any[] = [];
                const lateList: any[] = [];

                workers.forEach(w => {
                  const rec = records.find(r => r.workerId === w.id);
                  if (rec) {
                    if (rec.status === "absent") {
                      presentCount--;
                      absentCount++;
                      absentList.push({ workerName: w.name, line: w.line, reason: rec.reason || rec.leaveType || "Không có lý do" });
                    } else if (rec.status === "late") {
                      lateCount++;
                      lateList.push({ workerName: w.name, line: w.line, timeValue: rec.timeValue, reason: rec.reason || "Không có lý do" });
                    }
                  }
                });

                return { presentCount, absentCount, lateCount, absentList, lateList };
              };

              if (dashboardPeriod === "day") {
                const stats = getLocalAttendanceStats(targetDate);
                totalPresentCount = stats.presentCount;
                totalAbsentCount = stats.absentCount;
                totalLateCount = stats.lateCount;
                stats.absentList.forEach(item => {
                  periodAbsents.push({ ...item, date: targetDate });
                });
                stats.lateList.forEach(item => {
                  periodLates.push({ ...item, date: targetDate });
                });
              } else {
                const periodDates = Array.from(new Set(attendance.map(a => a.date).filter(isDateInPeriod)));
                if (periodDates.length === 0) {
                  totalPresentCount = workers.length;
                  totalAbsentCount = 0;
                  totalLateCount = 0;
                } else {
                  let sumPresent = 0;
                  let sumAbsent = 0;
                  let sumLate = 0;
                  periodDates.forEach(d => {
                    const stats = getLocalAttendanceStats(d as string);
                    sumPresent += stats.presentCount;
                    sumAbsent += stats.absentCount;
                    sumLate += stats.lateCount;
                    stats.absentList.forEach(item => {
                      periodAbsents.push({ ...item, date: d });
                    });
                    stats.lateList.forEach(item => {
                      periodLates.push({ ...item, date: d });
                    });
                  });
                  totalPresentCount = Math.round(sumPresent / periodDates.length);
                  totalAbsentCount = sumAbsent;
                  totalLateCount = sumLate;
                }
              }

              // 2. Lịch trực vệ sinh (Cleaning Duty Stats)
              const periodDuties = duties.filter(d => isDateInPeriod(d.date));
              const todayDuty = duties.find(d => d.date === targetDate) || { sweeperIds: [], trashCollectorIds: [] };
              const todaySweepers = (todayDuty.sweeperIds || []).map(id => workers.find(w => w.id === id)?.name || "").filter(Boolean);
              const todayTrash = (todayDuty.trashCollectorIds || []).map(id => workers.find(w => w.id === id)?.name || "").filter(Boolean);

              // 3. Sản lượng công đoạn cuối (Final Op Production Stats)
              let finalOpTotal = 0;
              const finalOpLineBreakdown = lines.map(line => {
                let lineTotal = 0;
                let activeLastWorkerName = "Không có";
                let activeLastOpCode = "N/A";
                let activeLastOpName = "Chưa làm";

                const periodLogsWithRecords = workerHourlyLogs
                  .filter(log => isDateInPeriod(log.date) && log.line === line)
                  .sort((a, b) => b.date.localeCompare(a.date));

                if (periodLogsWithRecords.length > 0) {
                  const datesWithLogs = Array.from(new Set(periodLogsWithRecords.map(log => log.date)));
                  
                  datesWithLogs.forEach(date => {
                    const lineWorkers = workers.filter(w => w.line === line);
                    const filteredLogs = workerHourlyLogs.filter(log => log.date === date && log.line === line);
                    const sortedLineWorkers = [...lineWorkers].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
                    const activeWorkersWithLogsList = sortedLineWorkers.filter(w => filteredLogs.some(log => log.workerId === w.id));
                    const lastWorker = activeWorkersWithLogsList[activeWorkersWithLogsList.length - 1];

                    if (lastWorker) {
                      const lastWorkerLogs = filteredLogs.filter(log => log.workerId === lastWorker.id);
                      const uniqueOpIds = Array.from(new Set(lastWorkerLogs.map(log => log.opId)));
                      const sortedOpsOfLastWorker = uniqueOpIds.map(opId => {
                        const op = operations.find(o => o.id === opId);
                        return {
                          id: opId,
                          code: op?.code || lastWorkerLogs.find(l => l.opId === opId)?.opCode || "",
                          name: op?.name || lastWorkerLogs.find(l => l.opId === opId)?.opName || ""
                        };
                      }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

                      const lastOp = sortedOpsOfLastWorker[sortedOpsOfLastWorker.length - 1];
                      if (lastOp) {
                        const finalOpLogs = lastWorkerLogs.filter(log => log.opId === lastOp.id);
                        lineTotal += finalOpLogs.reduce((sum, log) => sum + (Number(log.actualQuantity) || 0), 0);
                      }
                    }
                  });

                  const latestDate = datesWithLogs[0];
                  const lineWorkers = workers.filter(w => w.line === line);
                  const filteredLogsForLatest = workerHourlyLogs.filter(log => log.date === latestDate && log.line === line);
                  const sortedLineWorkers = [...lineWorkers].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
                  const activeWorkersWithLogsList = sortedLineWorkers.filter(w => filteredLogsForLatest.some(log => log.workerId === w.id));
                  const lastWorker = activeWorkersWithLogsList[activeWorkersWithLogsList.length - 1];
                  if (lastWorker) {
                    activeLastWorkerName = lastWorker.name;
                    const lastWorkerLogs = filteredLogsForLatest.filter(log => log.workerId === lastWorker.id);
                    const uniqueOpIds = Array.from(new Set(lastWorkerLogs.map(log => log.opId)));
                    const sortedOpsOfLastWorker = uniqueOpIds.map(opId => {
                      const op = operations.find(o => o.id === opId);
                      return {
                        id: opId,
                        code: op?.code || lastWorkerLogs.find(l => l.opId === opId)?.opCode || "",
                        name: op?.name || lastWorkerLogs.find(l => l.opId === opId)?.opName || ""
                      };
                    }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

                    const lastOp = sortedOpsOfLastWorker[sortedOpsOfLastWorker.length - 1];
                    if (lastOp) {
                      activeLastOpCode = lastOp.code;
                      activeLastOpName = lastOp.name;
                    }
                  }
                }

                finalOpTotal += lineTotal;
                return {
                  line,
                  total: lineTotal,
                  lastWorkerName: activeLastWorkerName,
                  lastOpCode: activeLastOpCode,
                  lastOpName: activeLastOpName
                };
              });

              // 4. Nội dung cuộc họp (Meetings stats and list)
              const periodMeetings = meetings.filter(m => isDateInPeriod(m.date));
              const workerMeetings = periodMeetings.filter(m => m.type === "worker");
              const companyMeetings = periodMeetings.filter(m => m.type === "company");

              return (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 text-left animate-fade-in"
                >
                  {/* Dashboard Controller / Filter Bar */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-extrabold text-indigo-950 flex items-center gap-2">
                        📊 Tổng Hợp Hoạt Động Doanh Nghiệp
                      </h3>
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mt-1">
                        Thống kê chấm công, trực nhật, sản lượng công đoạn cuối & nội dung cuộc họp
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                        <span className="text-[10px] font-black text-gray-400 pl-2 uppercase">Mốc thời gian:</span>
                        <input
                          type="date"
                          value={dashboardDate}
                          onChange={(e) => setDashboardDate(e.target.value)}
                          className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 gap-1">
                        <button
                          onClick={() => setDashboardPeriod("day")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                            dashboardPeriod === "day"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Ngày
                        </button>
                        <button
                          onClick={() => setDashboardPeriod("week")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                            dashboardPeriod === "week"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Tuần
                        </button>
                        <button
                          onClick={() => setDashboardPeriod("month")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                            dashboardPeriod === "month"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Tháng
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Attendance Card */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 block mb-1">CHẤM CÔNG</span>
                        <h4 className="text-3xl font-black text-gray-900 font-mono">
                          {dashboardPeriod === "day" 
                            ? `${totalPresentCount}/${workers.length}`
                            : `${((totalPresentCount / (workers.length || 1)) * 100).toFixed(0)}%`}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 font-semibold">
                          {dashboardPeriod === "day" ? "Đi làm hôm nay" : "Tỷ lệ đi làm trung bình"}
                        </p>
                      </div>
                      <div className="border-t border-gray-50 pt-2 mt-4 flex justify-between items-center text-[11px] text-gray-400 font-bold uppercase">
                        <span>Vắng: <span className="text-red-500">{totalAbsentCount}</span></span>
                        <span>Trễ: <span className="text-amber-500">{totalLateCount}</span></span>
                      </div>
                    </div>

                    {/* Cleaning Duty Card */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block mb-1">TRỰC VỆ SINH</span>
                        <h4 className="text-3xl font-black text-gray-900 font-mono">
                          {dashboardPeriod === "day"
                            ? `${todaySweepers.length + todayTrash.length} người`
                            : `${periodDuties.length} ca trực`}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 font-semibold">
                          {dashboardPeriod === "day" ? "Trực nhật hôm nay" : "Tổng số ca trực đã xếp"}
                        </p>
                      </div>
                      <div className="border-t border-gray-50 pt-2 mt-4 text-[11px] text-gray-400 font-bold uppercase truncate">
                        {dashboardPeriod === "day" ? (
                          <span>Trực chính: <span className="text-emerald-600">{todaySweepers.join(", ") || "Chưa xếp"}</span></span>
                        ) : (
                          <span>Tổng cộng trong kỳ</span>
                        )}
                      </div>
                    </div>

                    {/* Real-Time Final Op Production Card */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 block mb-1">SẢN LƯỢNG CÔNG ĐOẠN CUỐI</span>
                        <h4 className="text-3xl font-black text-rose-600 font-mono">
                          {finalOpTotal} <span className="text-xs font-bold text-gray-500">SP</span>
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 font-semibold">
                          Thực tế của công nhân cuối
                        </p>
                      </div>
                      <div className="border-t border-gray-50 pt-2 mt-4 text-[11px] text-gray-400 font-bold uppercase truncate">
                        ⚡ Real-time tự động cập nhật
                      </div>
                    </div>

                    {/* Meetings Card */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 block mb-1">CUỘC HỌP GHI NHẬN</span>
                        <h4 className="text-3xl font-black text-gray-900 font-mono">
                          {periodMeetings.length} <span className="text-xs font-bold text-gray-500">Ghi chú</span>
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 font-semibold">
                          {dashboardPeriod === "day" ? "Các cuộc họp hôm nay" : "Các cuộc họp trong kỳ"}
                        </p>
                      </div>
                      <div className="border-t border-gray-50 pt-2 mt-4 flex justify-between items-center text-[11px] text-gray-400 font-bold uppercase font-mono">
                        <span>Họp CN: <span className="text-indigo-600">{workerMeetings.length}</span></span>
                        <span>Họp Cty: <span className="text-purple-600">{companyMeetings.length}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Main Bento Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left & Center Columns: Logs & Summaries */}
                    <div className="lg:col-span-2 space-y-6">
                      
                      {/* Real-time final production list */}
                      <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                              🏭 Sản lượng ngày của công đoạn cuối (Thời gian thực)
                            </h4>
                            <p className="text-xs text-gray-400 mt-0.5">Tính chính xác dựa trên sản phẩm ghi nhận từ công nhân cuối của chuyền</p>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {finalOpLineBreakdown.map(item => (
                            <div key={item.line} className="bg-gray-50 p-4 rounded-xl border border-gray-100 hover:border-indigo-150 transition-colors">
                              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-2">
                                <div className="flex items-center gap-2.5">
                                  <span className="bg-indigo-600 text-white font-mono font-black text-xs px-2.5 py-1 rounded-lg">
                                    {item.line}
                                  </span>
                                  <div>
                                    <span className="text-xs font-bold text-gray-500 block sm:inline">Công nhân cuối: </span>
                                    <span className="text-xs font-extrabold text-indigo-950">{item.lastWorkerName}</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-sm font-black text-rose-600 font-mono">{item.total}</span>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase ml-1">Sản phẩm</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 mt-1 bg-white px-3 py-1.5 rounded-lg border border-gray-100 text-[11px] text-gray-500 font-medium">
                                <span className="text-indigo-600 font-black">⚙️ CĐ cuối:</span>
                                <span className="truncate">{item.lastOpCode !== "N/A" ? `${item.lastOpCode} - ${item.lastOpName}` : "Chưa có dữ liệu"}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Attendance and duty details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Attendance details */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-sm space-y-4">
                          <h4 className="text-sm font-black uppercase tracking-wider text-indigo-950">
                            📋 Chi tiết chấm công
                          </h4>
                          
                          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                            {periodAbsents.length === 0 && periodLates.length === 0 ? (
                              <div className="text-center py-12 text-xs text-gray-400 italic">
                                Tất cả công nhân đi làm đầy đủ, đúng giờ trong kỳ.
                              </div>
                            ) : (
                              <>
                                {periodAbsents.map((item, idx) => (
                                  <div key={`abs-${idx}`} className="bg-red-50/50 border border-red-100 p-3 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-xs font-black text-red-700">{item.workerName} ({item.line})</span>
                                      <span className="text-[9px] font-mono font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">VẮNG • {item.date}</span>
                                    </div>
                                    <p className="text-[10px] text-red-600 font-medium font-mono leading-tight">
                                      Lý do: {item.reason}
                                    </p>
                                  </div>
                                ))}

                                {periodLates.map((item, idx) => (
                                  <div key={`late-${idx}`} className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="text-xs font-black text-amber-850">{item.workerName} ({item.line})</span>
                                      <span className="text-[9px] font-mono font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">TRỄ ({item.timeValue}) • {item.date}</span>
                                    </div>
                                    <p className="text-[10px] text-amber-700 font-medium font-mono leading-tight">
                                      Lưu ý: {item.reason}
                                    </p>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Cleaning duty schedule detail */}
                        <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-sm space-y-4">
                          <h4 className="text-sm font-black uppercase tracking-wider text-indigo-950">
                            🧹 Phân công trực nhật hôm nay
                          </h4>

                          <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block mb-1.5">🧹 Quét dọn phòng họp & xưởng</span>
                              {todaySweepers.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {todaySweepers.map((name, i) => (
                                    <span key={i} className="bg-white border border-indigo-100 text-indigo-950 font-bold text-xs px-2.5 py-1 rounded-lg">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">Chưa phân công người dọn dẹp</p>
                              )}
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500 block mb-1.5">🚛 Đổ rác & vệ sinh chung</span>
                              {todayTrash.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {todayTrash.map((name, i) => (
                                    <span key={i} className="bg-white border border-emerald-100 text-indigo-950 font-bold text-xs px-2.5 py-1 rounded-lg">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">Chưa phân công người đổ rác</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Meetings note list on dashboard */}
                      <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                              📝 Biên Bản Cuộc Họp Trong Kỳ
                            </h4>
                            <p className="text-xs text-gray-400 mt-0.5">Nội dung họp công nhân và họp công ty gần đây</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Worker meetings panel */}
                          <div className="space-y-3">
                            <span className="text-xs font-black uppercase tracking-wider text-indigo-600 block bg-indigo-50/50 p-2.5 rounded-lg border border-indigo-100">
                              🤝 Họp Công Nhân ({workerMeetings.length})
                            </span>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                              {workerMeetings.length === 0 ? (
                                <p className="text-xs text-gray-400 italic text-center py-6">Không có biên bản họp công nhân nào</p>
                              ) : (
                                workerMeetings.map(m => (
                                  <div key={m.id} className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-mono font-bold bg-indigo-150 text-indigo-800 px-2 py-0.5 rounded">{m.date}</span>
                                    </div>
                                    <h5 className="text-xs font-extrabold text-indigo-950">{m.title}</h5>
                                    <p className="text-[11px] text-gray-600 line-clamp-3 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Company meetings panel */}
                          <div className="space-y-3">
                            <span className="text-xs font-black uppercase tracking-wider text-purple-600 block bg-purple-50/50 p-2.5 rounded-lg border border-purple-100">
                              🏢 Họp Công Ty ({companyMeetings.length})
                            </span>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                              {companyMeetings.length === 0 ? (
                                <p className="text-xs text-gray-400 italic text-center py-6">Không có biên bản họp công ty nào</p>
                              ) : (
                                companyMeetings.map(m => (
                                  <div key={m.id} className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded">{m.date}</span>
                                    </div>
                                    <h5 className="text-xs font-extrabold text-indigo-950">{m.title}</h5>
                                    <p className="text-[11px] text-gray-600 line-clamp-3 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Right Column: Plans Timeline Feed */}
                    <div className="rounded-2xl border border-gray-150 bg-white p-5 sm:p-6 shadow-sm flex flex-col h-[650px] lg:h-auto">
                      <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 font-serif flex items-center gap-1.5">
                          <Calendar size={18} className="text-indigo-600" />
                          Bản Tin Kế Hoạch
                        </h3>
                        
                        <button
                          onClick={() => setIsAddingPlan(!isAddingPlan)}
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-650 hover:text-indigo-850 transition-colors uppercase tracking-wider"
                        >
                          <Plus size={13} /> Thêm kế hoạch
                        </button>
                      </div>

                      {isAddingPlan ? (
                        /* FORM FOR ADDING PLAN */
                        <div className="space-y-3 p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4 overflow-y-auto max-h-[300px] flex-shrink-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase text-slate-500">Tải kế hoạch mới</span>
                            <button onClick={() => { setIsAddingPlan(false); setNewPlanFile(null); }} className="text-xs text-gray-400 hover:text-gray-600">Đóng</button>
                          </div>
                          <input
                            type="text"
                            placeholder="Tiêu đề (ví dụ: Kế hoạch tuần 23)..."
                            value={newPlanTitle}
                            onChange={(e) => setNewPlanTitle(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-lg border border-gray-200 focus:ring-1 focus:ring-indigo-500 outline-none bg-white font-medium"
                          />
                          <textarea
                            placeholder="Mô tả hoặc ghi chú..."
                            rows={2}
                            value={newPlanDesc}
                            onChange={(e) => setNewPlanDesc(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-lg border border-gray-200 focus:ring-1 focus:ring-indigo-500 outline-none bg-white font-medium resize-none"
                          />
                          
                          {/* File Selector */}
                          <div className="relative">
                            <input
                              type="file"
                              accept="image/*"
                              id="plan-file-upload"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = async (evt) => {
                                  const rawBase64 = evt.target?.result as string;
                                  // Compress image to handle the 1MB limit gracefully
                                  const compressedBase64 = await resizeAndCompressImage(rawBase64);
                                  const approxBytes = Math.round((compressedBase64.length * 3) / 4);
                                  const sizeFriendly = (approxBytes / 1024).toFixed(0) + " KB";
                                  
                                  setNewPlanFile({
                                    base64: compressedBase64,
                                    name: file.name,
                                    type: "image/jpeg",
                                    sizeFriendly: sizeFriendly
                                  });
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                            {newPlanFile ? (
                              <div className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs">
                                <div className="flex items-center gap-2 truncate max-w-[80%]">
                                  <span className="text-indigo-600 font-bold truncate">{newPlanFile.name}</span>
                                  <span className="text-[9px] text-gray-400">({newPlanFile.sizeFriendly})</span>
                                </div>
                                <button onClick={() => setNewPlanFile(null)} className="text-rose-500 font-bold hover:text-rose-700">Xóa</button>
                              </div>
                            ) : (
                              <label
                                htmlFor="plan-file-upload"
                                className="flex flex-col items-center justify-center p-3.5 border border-dashed border-gray-200 rounded-lg cursor-pointer bg-white hover:bg-indigo-50/25 hover:border-indigo-300 transition-colors"
                              >
                                <FileUp className="text-gray-400 mb-1" size={18} />
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Chọn hình ảnh sơ đồ kế hoạch</span>
                              </label>
                            )}
                          </div>

                          <button
                            onClick={handleAddPlan}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                          >
                            <Plus size={14} /> Đăng kế hoạch
                          </button>
                        </div>
                      ) : null}

                      {/* TIMELINE FEED LIST */}
                      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                        {plans.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-center p-4">
                            <Calendar size={32} className="text-gray-300 mb-2" />
                            <p className="text-xs font-semibold text-gray-400">Chưa tải sơ đồ hay thông báo kế hoạch nào</p>
                            <button
                              onClick={() => setIsAddingPlan(true)}
                              className="mt-2 text-[10px] font-black uppercase text-indigo-600 hover:underline"
                            >
                              + Tải ngay
                            </button>
                          </div>
                        ) : (
                          <div className="relative border-l border-indigo-100 ml-2.5 pl-4 pb-1 space-y-5">
                            {plans.map((plan) => {
                              const formattedDate = safeFormatDate(plan.createdAt, "HH:mm dd/MM/yyyy");
                              return (
                                <div key={plan.id} className="relative group/item">
                                  {/* Timeline Dot */}
                                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-white bg-indigo-500 shadow-sm transition-transform group-hover/item:scale-125 duration-150" />
                                  
                                  <div className="space-y-1">
                                    {/* Date and actions */}
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-bold text-gray-400 font-mono">
                                        {formattedDate}
                                      </span>
                                      <button
                                        onClick={() => handleDeletePlan(plan.id)}
                                        className="opacity-0 group-hover/item:opacity-100 text-rose-500 hover:text-rose-700 transition-opacity p-0.5 cursor-pointer"
                                        title="Xóa kế hoạch này"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>

                                    <h4 className="text-xs font-bold text-gray-900 leading-tight">
                                      {plan.title}
                                    </h4>

                                    {plan.description && (
                                      <p className="text-[11px] text-gray-500 font-medium whitespace-pre-wrap leading-relaxed max-w-full">
                                        {plan.description}
                                      </p>
                                    )}

                                    {plan.imageUrl && (
                                      <div className="mt-2 relative rounded-xl overflow-hidden border border-gray-150 shadow-xs cursor-zoom-in bg-gray-50 group-hover/item:border-indigo-200 transition-colors">
                                        <img
                                          src={plan.imageUrl}
                                          alt={plan.title}
                                          referrerPolicy="no-referrer"
                                          className="w-full max-h-[140px] object-cover hover:scale-[1.03] transition-transform duration-200"
                                          onClick={() => setActiveZoomedPlan(plan.imageUrl || null)}
                                        />
                                        {plan.fileName && (
                                          <div className="absolute bottom-0 left-0 right-0 bg-black/55 backdrop-blur-[1px] px-2 py-1 flex items-center justify-between text-[9px] text-white">
                                            <span className="truncate max-w-[80%]">{plan.fileName}</span>
                                            <span className="text-gray-300">({plan.fileSize || "Ảnh Sơ Đồ"})</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })()}

            {activeTab === "workers" && (
              <motion.div
                key="workers"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold font-serif italic">
                      Thêm công nhân mới
                    </h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={workerFileInputRef}
                        className="hidden"
                        accept="image/*,.pdf,.xlsx,.xls"
                        onChange={handleWorkerFileUpload}
                      />
                      <button
                        onClick={() => {
                          setIsTransferModalOpen(true);
                          setTransferSelectedLineFilter(workerFilterLine);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors font-bold text-xs uppercase tracking-widest border-0 cursor-pointer"
                      >
                        <ArrowLeftRight size={16} />
                        Điều chuyển nhanh
                      </button>
                      <button
                        onClick={() => workerFileInputRef.current?.click()}
                        disabled={isExtractingWorker}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-bold text-xs uppercase tracking-widest disabled:opacity-50 border-0 cursor-pointer"
                      >
                        {isExtractingWorker ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <FileUp size={16} />
                        )}
                        {isExtractingWorker
                          ? "Đang xử lý AI..."
                          : "Tải ảnh/tệp AI"}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input
                      placeholder="Tên công nhân"
                      value={newWorker.name}
                      onChange={(e) =>
                        setNewWorker({ ...newWorker, name: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      placeholder="Mã CN"
                      value={newWorker.code}
                      onChange={(e) =>
                        setNewWorker({ ...newWorker, code: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input
                      placeholder="Chuyền"
                      value={newWorker.line}
                      onChange={(e) =>
                        setNewWorker({ ...newWorker, line: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <select
                      value={newWorker.gender || "nữ"}
                      onChange={(e) =>
                        setNewWorker({ ...newWorker, gender: e.target.value as "nam" | "nữ" })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-medium"
                    >
                      <option value="nữ">Nữ (Quét nhà)</option>
                      <option value="nam">Nam (Đổ rác)</option>
                    </select>
                    <button
                      onClick={handleAddWorker}
                      className="bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 p-3"
                    >
                      <Plus size={18} /> Thêm
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm overflow-x-auto">
                  <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase text-gray-400 tracking-widest">
                      Danh sách công nhân
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-500 uppercase">
                        Lọc theo chuyền:
                      </span>
                      <select
                        value={workerFilterLine}
                        onChange={(e) => setWorkerFilterLine(e.target.value)}
                        className="text-xs p-2 rounded-lg border border-gray-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Tất cả chuyền</option>
                        {lines.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/30 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Mã CN
                        </th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Họ và Tên
                        </th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Giới tính
                        </th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Chuyền
                        </th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                          Thao tác
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workers
                        .filter(
                          (w) =>
                            !workerFilterLine || w.line === workerFilterLine,
                        )
                        .map((worker) => (
                          <tr
                            key={worker.id}
                            className="hover:bg-gray-50 transition-colors group"
                          >
                            <td className="px-6 py-4 text-sm font-mono text-gray-500 font-bold">
                              {worker.code}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs uppercase">
                                  {worker.name.split(" ").pop()?.[0]}
                                </div>
                                <span className="text-sm font-semibold text-gray-900">
                                  {worker.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={worker.gender || "nữ"}
                                onChange={async (e) => {
                                  const val = e.target.value as "nam" | "nữ";
                                  await updateDocInFirestore("workers", worker.id, { gender: val });
                                }}
                                className={`text-[11px] font-extrabold px-2 py-1 rounded-full border cursor-pointer outline-none transition-colors ${
                                  worker.gender === "nam"
                                    ? "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100"
                                    : "bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100"
                                }`}
                              >
                                <option value="nữ">♀️ Nữ</option>
                                <option value="nam">♂️ Nam</option>
                              </select>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={worker.line}
                                onChange={async (e) => {
                                  await updateDocInFirestore("workers", worker.id, { line: e.target.value });
                                }}
                                className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200 bg-white cursor-pointer outline-none hover:bg-gray-50 text-gray-700 font-mono"
                              >
                                {lines.map((l) => (
                                  <option key={l} value={l}>
                                    {l}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteWorker(worker.id)}
                                className="inline-flex items-center justify-center w-10 h-10 text-rose-500 hover:bg-rose-100 transition-colors rounded-full cursor-pointer relative z-50 pointer-events-auto"
                                title="Xoá công nhân"
                              >
                                <X size={20} />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === "operations" && (
              <motion.div
                key="operations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold font-serif italic">
                      Định mức Công đoạn
                    </h3>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,.pdf,.xlsx,.xls"
                        onChange={handleFileUpload}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isExtracting}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                      >
                        {isExtracting ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <FileUp size={16} />
                        )}
                        {isExtracting ? "Đang xử lý AI..." : "Tải ảnh/tệp AI"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <input
                      placeholder="Tên công đoạn"
                      value={newOperation.name}
                      onChange={(e) =>
                        setNewOperation({
                          ...newOperation,
                          name: e.target.value,
                        })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      placeholder="Mã CĐ"
                      value={newOperation.code}
                      onChange={(e) =>
                        setNewOperation({
                          ...newOperation,
                          code: e.target.value,
                        })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      placeholder="Mã hàng / Style"
                      value={newOperation.style}
                      onChange={(e) =>
                        setNewOperation({
                          ...newOperation,
                          style: e.target.value,
                        })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      type="number"
                      placeholder="SAM (phút)"
                      value={newOperation.sam || ""}
                      onChange={(e) =>
                        setNewOperation({
                          ...newOperation,
                          sam: Number(e.target.value),
                        })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Mục tiêu/h"
                      value={newOperation.target || ""}
                      onChange={(e) =>
                        setNewOperation({
                          ...newOperation,
                          target: Number(e.target.value),
                        })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <button
                      onClick={handleAddOperation}
                      className="bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Thêm
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      Bộ lọc theo mã hàng:
                    </span>
                    <select
                      value={opFilterStyle}
                      onChange={(e) => setOpFilterStyle(e.target.value)}
                      className="text-sm p-2 px-4 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    >
                      <option value="">Tất cả mã hàng</option>
                      {Array.from(
                        new Set(
                          operations.map((op) => op.style).filter(Boolean),
                        ),
                      ).map((style) => (
                        <option key={style} value={style}>
                          {style}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs text-gray-400">
                    Sản lượng đang may:{" "}
                    <span className="font-bold text-indigo-600">
                      {
                        operations.filter(
                          (op) => !opFilterStyle || op.style === opFilterStyle,
                        ).length
                      }
                    </span>{" "}
                    công đoạn
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {operations
                    .filter(
                      (op) => !opFilterStyle || op.style === opFilterStyle,
                    )
                    .map((op) => (
                      <div
                        key={op.id}
                        className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-indigo-300 transition-all shadow-sm group relative"
                      >
                        {op.style && (
                          <div className="absolute top-4 right-14">
                            <span className="bg-indigo-50 text-indigo-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">
                              Style: {op.style}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-4">
                          <div className="h-10 w-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs uppercase">
                            {op.code}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteOperation(op.id)}
                            className="inline-flex items-center justify-center w-10 h-10 text-rose-500 hover:bg-rose-100 transition-colors rounded-full cursor-pointer relative z-50 pointer-events-auto"
                            title="Xoá công đoạn"
                          >
                            <X size={20} />
                          </button>
                        </div>
                        <h4 className="text-lg font-bold text-gray-900 uppercase tracking-tight">
                          {op.name}
                        </h4>
                        <div className="mt-6 flex items-center justify-between border-t border-gray-50 pt-4">
                          <div>
                            <p className="text-xs uppercase text-gray-500 font-bold tracking-wider">
                              Định mức SAM
                            </p>
                            <p className="text-xl font-bold font-mono text-gray-900">
                              {op.sam}{" "}
                              <span className="text-sm font-normal text-gray-500 uppercase">
                                phút
                              </span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase text-gray-500 font-bold tracking-wider">
                              Mục tiêu/Giờ
                            </p>
                            <p className="text-xl font-bold font-mono text-gray-900">
                              {op.targetPerHour}{" "}
                              <span className="text-sm font-normal text-gray-500 uppercase">
                                sp
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </motion.div>
            )}

            {activeTab === "production" && (
              <motion.div
                key="production"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-6"
              >
                {/* Modern Inner Sub-Tab Mode Selector */}
                <div className="flex bg-gray-100 p-1.5 rounded-2xl w-full sm:w-fit gap-1 shadow-inner/5 flex-wrap">
                  <button
                    onClick={() => setProdSubTab("manual")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all select-none cursor-pointer border-0 ${
                      prodSubTab === "manual"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-850 bg-transparent"
                    }`}
                  >
                     Ghi nhận tổng
                  </button>
                  <button
                    onClick={() => setProdSubTab("worker_hourly")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all select-none cursor-pointer border-0 ${
                      prodSubTab === "worker_hourly"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-850 bg-transparent"
                    }`}
                  >
                    👤 Nhập theo công nhân (Giờ/Ngày)
                  </button>
                  <button
                    onClick={() => setProdSubTab("eff_hourly")}
                    className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all select-none cursor-pointer border-0 ${
                      prodSubTab === "eff_hourly"
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-gray-500 hover:text-gray-850 bg-transparent"
                    }`}
                  >
                    ⚡ Tiện ích tính %EFF Giờ (Từ ảnh)
                  </button>
                </div>

                {prodSubTab === "manual" && (
                  <>
                    <div className="grid grid-cols-1 gap-6">
                  {/* Simplified Manual Input */}
                  <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                      <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Plus size={24} />
                      </div>
                      <h3 className="text-xl font-bold font-serif italic text-indigo-900">
                        Ghi nhận sản lượng thủ công
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-gray-400 tracking-widest">
                          1. Nhập Chuyền
                        </label>
                        <input
                          type="text"
                          placeholder="Nhập tên chuyền..."
                          value={newLog.line}
                          onChange={(e) =>
                            setNewLog({ ...newLog, line: e.target.value })
                          }
                          className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 text-sm font-bold"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-gray-400 tracking-widest">
                          2. Chọn Mã hàng / Style
                        </label>
                        <select
                          value={newLog.orderId}
                          onChange={(e) =>
                            setNewLog({ ...newLog, orderId: e.target.value })
                          }
                          className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 text-sm font-bold"
                        >
                          <option value="">-- Chọn đơn hàng --</option>
                          {orders.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.styleName} - {o.customer}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-gray-400 tracking-widest">
                          3. Số lượng may được
                        </label>
                        <input
                          type="number"
                          value={newLog.actualQuantity || ""}
                          onChange={(e) =>
                            setNewLog({
                              ...newLog,
                              actualQuantity: Number(e.target.value),
                            })
                          }
                          className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-indigo-50/20 text-xl font-black text-indigo-600 text-center"
                          placeholder="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-black uppercase text-gray-400 tracking-widest">
                          4. Chọn ngày ghi nhận
                        </label>
                        <input
                          type="date"
                          value={newLog.date}
                          onChange={(e) =>
                            setNewLog({ ...newLog, date: e.target.value })
                          }
                          className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 text-sm font-bold"
                        />
                      </div>

                      <button
                        onClick={() => handleAddLog()}
                        className="bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 uppercase tracking-widest text-sm flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={18} /> Ghi nhận
                      </button>
                    </div>
                  </div>
                </div>

                {/* Information Summary Cards of Selected Order */}
                {newLog.orderId && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6"
                  >
                    {(() => {
                      const order = orders.find((o) => o.id === newLog.orderId);
                      if (!order) return null;
                      const totalProduced = logs
                        .filter((l) => l.orderId === order.id)
                        .reduce((sum, l) => sum + l.actualQuantity, 0);

                      return (
                        <>
                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Của Job phân bổ
                            </p>
                            <p className="text-xl font-black text-gray-900">
                              {order.orderQuantity}{" "}
                              <span className="text-xs font-normal">sp</span>
                            </p>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm border-l-4 border-l-indigo-600">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Tổng may được
                            </p>
                            <p className="text-xl font-black text-indigo-600">
                              {totalProduced}{" "}
                              <span className="text-xs font-normal">sp</span>
                            </p>
                          </div>
                          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm border-l-4 border-l-rose-500">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                              Tổng còn lại
                            </p>
                            <p className="text-xl font-black text-rose-500">
                              {Math.max(0, order.orderQuantity - totalProduced)}{" "}
                              <span className="text-xs font-normal">sp</span>
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </motion.div>
                )}

                {/* Daily Production Summary Table */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-gray-50 pb-6">
                    <h4 className="text-sm font-black uppercase text-gray-400 tracking-widest">
                      Báo cáo thực tế theo ngày
                    </h4>
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={prodFilterDate}
                        onChange={(e) => setProdFilterDate(e.target.value)}
                        className="text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 font-bold"
                      >
                        <option value="">Tất cả ngày</option>
                        {Array.from(new Set(logs.map((l) => l.date)))
                          .sort()
                          .reverse()
                          .map((d: string) => (
                            <option key={d} value={d}>
                              {safeFormatDate(d, "dd/MM/yyyy")}
                            </option>
                          ))}
                      </select>
                      <select
                        value={prodFilterLine}
                        onChange={(e) => setProdFilterLine(e.target.value)}
                        className="text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 font-bold"
                      >
                        <option value="">Tất cả chuyền</option>
                        {lines.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <select
                        value={prodFilterOrder}
                        onChange={(e) => setProdFilterOrder(e.target.value)}
                        className="text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 font-bold"
                      >
                        <option value="">Tất cả mã hàng</option>
                        {orders.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.styleName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                          <th className="pb-4 px-2">Ngày</th>
                          <th className="pb-4 px-2">Chuyền</th>
                          <th className="pb-4 px-2">Mã hàng</th>
                          <th className="pb-4 px-2 text-center">Phân bổ Job</th>
                          <th className="pb-4 px-2 text-center">
                            Tổng may được
                          </th>
                          <th className="pb-4 px-2 text-center">Còn lại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {getDailyProductionSummary()
                          .filter((s) => {
                            const matchDate =
                              !prodFilterDate || s.date === prodFilterDate;
                            const matchLine =
                              !prodFilterLine || s.line === prodFilterLine;
                            const matchOrder =
                              !prodFilterOrder || s.orderId === prodFilterOrder;
                            return matchDate && matchLine && matchOrder;
                          })
                          .map((summary) => {
                            const order = orders.find(
                              (o) => o.id === summary.orderId,
                            );
                            const totalStyleProduced = logs
                              .filter((l) => l.orderId === summary.orderId)
                              .reduce(
                                (sum, current) => sum + current.actualQuantity,
                                0,
                              );

                            return (
                              <tr
                                key={`${summary.date}-${summary.orderId}-${summary.line}`}
                                className="hover:bg-indigo-50/20 transition-colors"
                              >
                                <td className="py-5 px-2">
                                  <p className="text-xs font-black text-gray-700">
                                    {safeFormatDate(summary.date, "dd/MM/yyyy")}
                                  </p>
                                </td>
                                <td className="py-5 px-2">
                                  <span className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-2 py-1 rounded-lg">
                                    {summary.line}
                                  </span>
                                </td>
                                <td className="py-5 px-2">
                                  <p className="text-xs font-black text-indigo-900">
                                    {order?.styleName || "N/A"}
                                  </p>
                                  <p className="text-[10px] text-gray-400 font-bold">
                                    Job: {order?.job || "-"}
                                  </p>
                                </td>
                                <td className="py-5 px-2 text-center">
                                  <p className="text-sm font-black text-gray-900">
                                    {order?.orderQuantity || 0}
                                  </p>
                                </td>
                                <td className="py-5 px-2 text-center">
                                  <p className="text-sm font-black text-indigo-600 font-mono">
                                    {totalStyleProduced}
                                  </p>
                                </td>
                                <td className="py-5 px-2 text-center">
                                  <p className="text-sm font-black text-rose-500 font-mono">
                                    {Math.max(
                                      0,
                                      (order?.orderQuantity || 0) -
                                        totalStyleProduced,
                                    )}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Detailed Log History for Deletion */}
                  <div className="mt-12 pt-8 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h4 className="text-sm font-black uppercase text-gray-400 tracking-widest">
                          Lịch sử nhập liệu chi tiết
                        </h4>
                        <p className="text-[10px] text-gray-400 font-bold mt-1">
                          Dùng để kiểm tra và xoá các bản ghi nhập sai
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                            <th className="pb-4 px-2">Thời gian</th>
                            <th className="pb-4 px-2">Chuyền</th>
                            <th className="pb-4 px-2">Mã hàng</th>
                            <th className="pb-4 px-2 text-center">Số lượng</th>
                            <th className="pb-4 px-2 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {logs
                            .filter((l) => {
                              const matchDate =
                                !prodFilterDate || l.date === prodFilterDate;
                              const matchLine =
                                !prodFilterLine || l.line === prodFilterLine;
                              const matchOrder =
                                !prodFilterOrder ||
                                l.orderId === prodFilterOrder;
                              return matchDate && matchLine && matchOrder;
                            })
                            .sort((a, b) => b.id.localeCompare(a.id)) // Rough sort by id
                            .slice(0, 50) // Show last 50 entries
                            .map((log) => {
                              const order = orders.find(
                                (o) => o.id === log.orderId,
                              );
                              return (
                                <tr
                                  key={log.id}
                                  className="hover:bg-rose-50/30 transition-colors"
                                >
                                  <td className="py-4 px-2">
                                    <p className="text-xs font-bold text-gray-600">
                                      {log.date}
                                    </p>
                                  </td>
                                  <td className="py-4 px-2 text-xs font-bold text-gray-900">
                                    {log.line}
                                  </td>
                                  <td className="py-4 px-2 text-xs font-bold text-indigo-900">
                                    {order?.styleName}
                                  </td>
                                  <td className="py-4 px-2 text-center font-mono font-black text-indigo-600">
                                    {log.actualQuantity}
                                  </td>
                                  <td className="py-4 px-2 text-right">
                                    <button
                                      onClick={() => handleDeleteLog(log.id)}
                                      className="p-2 text-gray-400 hover:text-rose-500 transition-colors"
                                      title="Xoá bản ghi"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                  </>
                )}

                {prodSubTab === "worker_hourly" && (() => {
                  const activeLine = hourlyProdLine || lines[0] || "";
                  const lineWorkers = workers.filter(w => w.line === activeLine);
                  
                  // Filter worker logs of selected date and active line
                  const filteredLogs = workerHourlyLogs.filter(log => log.date === hourlyProdDate && log.line === activeLine);
                  
                  // Find the "công nhân cuối cùng" (last worker) in the line who has logs
                  // Let's sort line workers by code or name
                  const sortedLineWorkers = [...lineWorkers].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));
                  const activeWorkersWithLogsList = sortedLineWorkers.filter(w => filteredLogs.some(log => log.workerId === w.id));
                  const lastWorker = activeWorkersWithLogsList[activeWorkersWithLogsList.length - 1];

                  // Find the "công đoạn cuối cùng" (final operation) of this last worker
                  let finalOpLogs = [];
                  let lastOpName = "";
                  let lastOpCode = "";

                  if (lastWorker) {
                    const lastWorkerLogs = filteredLogs.filter(log => log.workerId === lastWorker.id);
                    // Find unique ops they performed
                    const uniqueOpIds = Array.from(new Set(lastWorkerLogs.map(log => log.opId)));
                    // Sort operations by code to find the last one
                    const sortedOpsOfLastWorker = uniqueOpIds.map(opId => {
                      const op = operations.find(o => o.id === opId);
                      return {
                        id: opId,
                        code: op?.code || lastWorkerLogs.find(l => l.opId === opId)?.opCode || "",
                        name: op?.name || lastWorkerLogs.find(l => l.opId === opId)?.opName || ""
                      };
                    }).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: 'base' }));

                    const lastOp = sortedOpsOfLastWorker[sortedOpsOfLastWorker.length - 1];
                    if (lastOp) {
                      finalOpLogs = lastWorkerLogs.filter(log => log.opId === lastOp.id);
                      lastOpName = lastOp.name;
                      lastOpCode = lastOp.code;
                    }
                  }

                  const totalLineQty = finalOpLogs.reduce((sum, log) => sum + (Number(log.actualQuantity) || 0), 0);
                  
                  // Group logs by worker
                  const workersWithLogs = lineWorkers.map(w => {
                    const wLogs = filteredLogs.filter(log => log.workerId === w.id);
                    const totalQty = wLogs.reduce((sum, log) => sum + (Number(log.actualQuantity) || 0), 0);
                    return {
                      worker: w,
                      logs: wLogs,
                      totalQty
                    };
                  }).filter(item => item.logs.length > 0);

                  const activeWorkersCount = workersWithLogs.length;

                  return (
                    <div className="space-y-6 text-left">
                      {/* Selection and Filter Bar */}
                      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 font-serif italic">
                            Nhập sản lượng thực tế theo công nhân
                          </h3>
                          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
                            Ghi nhận sản lượng theo giờ cho từng công nhân và tính số tổng của sản lượng ngày
                          </p>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                            <span className="text-xs font-bold text-gray-500 pl-2 uppercase">Ngày làm:</span>
                            <input
                              type="date"
                              value={hourlyProdDate}
                              onChange={(e) => setHourlyProdDate(e.target.value)}
                              className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>

                          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                            <span className="text-xs font-bold text-gray-500 pl-2 uppercase">Chuyền:</span>
                            <select
                              value={activeLine}
                              onChange={(e) => setHourlyProdLine(e.target.value)}
                              className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-mono"
                            >
                              {lines.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Summary Stats Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/30 border border-indigo-100 p-6 rounded-2xl flex items-center justify-between shadow-sm">
                          <div>
                            <span className="text-xs font-black uppercase tracking-widest text-indigo-500 block mb-1">TỔNG SẢN LƯỢNG NGÀY</span>
                            <h4 className="text-3xl font-black text-indigo-950 font-mono tracking-tight">
                              {totalLineQty} <span className="text-sm font-bold text-indigo-600">SP</span>
                            </h4>
                            <p className="text-xs text-indigo-800 font-medium mt-1">
                              {lastWorker && lastOpCode ? (
                                <>
                                  Tính theo công đoạn cuối <strong className="font-extrabold text-indigo-950 font-mono">({lastOpCode} - {lastOpName})</strong> của công nhân cuối <strong className="font-extrabold text-indigo-950">({lastWorker.name})</strong>
                                </>
                              ) : (
                                "Sản lượng ngày (chưa có ghi nhận công nhân cuối cùng)"
                              )}
                            </p>
                          </div>
                          <div className="h-12 w-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold shadow-sm text-xl">
                            🏆
                          </div>
                        </div>

                        <div className="bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 border border-emerald-100 p-6 rounded-2xl flex items-center justify-between shadow-sm">
                          <div>
                            <span className="text-xs font-black uppercase tracking-widest text-emerald-500 block mb-1">CÔNG NHÂN ĐÃ NHẬP</span>
                            <h4 className="text-3xl font-black text-emerald-950 font-mono tracking-tight">
                              {activeWorkersCount}/{lineWorkers.length} <span className="text-sm font-bold text-emerald-600 font-sans">CN</span>
                            </h4>
                            <p className="text-xs text-emerald-800 font-medium mt-1">
                              Số công nhân đã có ghi nhận giờ hôm nay
                            </p>
                          </div>
                          <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold shadow-sm text-xl">
                            👥
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Input Form Card */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 lg:col-span-1 h-fit">
                          <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 border-b border-gray-50 pb-3">
                            Thêm bản ghi sản lượng mới
                          </h4>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <label className="text-[11px] font-extrabold uppercase text-gray-400 tracking-wider">
                                  1. Chọn công nhân ({activeLine})
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsTransferModalOpen(true);
                                    setTransferSelectedLineFilter(activeLine);
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5 cursor-pointer border-0 bg-transparent p-0"
                                >
                                  <ArrowLeftRight size={10} /> Điều chuyển
                                </button>
                              </div>
                              <select
                                value={workerLogWorkerId}
                                onChange={(e) => setWorkerLogWorkerId(e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 cursor-pointer"
                              >
                                <option value="">-- Chọn công nhân --</option>
                                {lineWorkers.map(w => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.code})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-extrabold uppercase text-gray-400 tracking-wider">
                                2. Chọn công đoạn
                              </label>
                              <select
                                value={workerLogOpId}
                                onChange={(e) => setWorkerLogOpId(e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 cursor-pointer"
                              >
                                <option value="">-- Chọn công đoạn --</option>
                                {operations.map(op => (
                                  <option key={op.id} value={op.id}>
                                    [{op.style || "Chung"}] {op.name} ({op.code}) - SAM: {op.sam}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-extrabold uppercase text-gray-400 tracking-wider">
                                3. Chọn khung giờ làm việc
                              </label>
                              <select
                                value={workerLogHourRange}
                                onChange={(e) => setWorkerLogHourRange(e.target.value)}
                                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 cursor-pointer"
                              >
                                <option value="7h30-8h30">7h30-8h30</option>
                                <option value="8h30-9h30">8h30-9h30</option>
                                <option value="9h30-10h30">9h30-10h30</option>
                                <option value="10h30-11h30">10h30-11h30</option>
                                <option value="12h30-13h30">12h30-13h30</option>
                                <option value="13h30-14h30">13h30-14h30</option>
                                <option value="14h30-15h30">14h30-15h30</option>
                                <option value="15h30-16h30">15h30-16h30</option>
                                <option value="17h-18h">17h-18h</option>
                                <option value="18h-19h">18h-19h</option>
                                <option value="19h-20h">19h-20h</option>
                                <option value="20h-21h">20h-21h</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-extrabold uppercase text-gray-400 tracking-wider">
                                4. Sản lượng khung giờ này (SP)
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={workerLogQty || ""}
                                onChange={(e) => setWorkerLogQty(Math.max(0, Number(e.target.value) || 0))}
                                className="w-full p-2.5 rounded-xl border border-gray-250 bg-indigo-50/10 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm font-black text-indigo-600 text-center"
                                placeholder="0"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={handleSaveWorkerHourlyLog}
                              className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-150 uppercase tracking-widest text-xs flex items-center justify-center gap-1.5 cursor-pointer mt-4 border-0"
                            >
                              <CheckCircle2 size={14} /> Ghi nhận sản lượng
                            </button>
                          </div>
                        </div>

                        {/* List Grid / Table Card */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm lg:col-span-2 overflow-hidden flex flex-col justify-between">
                          <div>
                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                              <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">
                                Chi tiết sản lượng trong ngày ({workersWithLogs.length} công nhân)
                              </h4>
                              <span className="text-[11px] font-bold text-indigo-600 font-mono">
                                {activeLine}
                              </span>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead className="bg-gray-50/20 border-b border-gray-100">
                                  <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Công nhân</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Tổng sản lượng ngày</th>
                                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 tracking-wider text-right">Chi tiết giờ</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {workersWithLogs.map(item => {
                                    const isExpanded = expandedWorkerId === item.worker.id;
                                    return (
                                      <React.Fragment key={item.worker.id}>
                                        <tr 
                                          className="hover:bg-gray-50/30 transition-colors cursor-pointer"
                                          onClick={() => setExpandedWorkerId(isExpanded ? null : item.worker.id)}
                                        >
                                          <td className="px-6 py-4">
                                            <p className="text-sm font-semibold text-gray-900 leading-tight">
                                              {item.worker.name}
                                            </p>
                                            <p className="text-[10px] font-mono text-gray-400 font-semibold">
                                              {item.worker.code}
                                            </p>
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-black font-mono text-indigo-600">
                                              {item.totalQty} <span className="text-xs font-bold text-gray-400">SP</span>
                                            </span>
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                            <button
                                              type="button"
                                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer border-0 bg-transparent flex items-center gap-1 ml-auto text-xs font-semibold"
                                            >
                                              {isExpanded ? (
                                                <>Thu gọn <ChevronUp size={15} /></>
                                              ) : (
                                                <>Xem chi tiết <ChevronDown size={15} /></>
                                              )}
                                            </button>
                                          </td>
                                        </tr>

                                        {isExpanded && (
                                          <tr>
                                            <td colSpan={3} className="px-6 py-4 bg-gray-50/30">
                                              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-inner space-y-3">
                                                <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                                                  <span className="text-xs font-bold text-indigo-950">
                                                    Chi tiết sản lượng theo giờ của {item.worker.name}
                                                  </span>
                                                  <span className="text-[10px] font-bold text-indigo-500 font-mono">
                                                    Tổng cộng: {item.totalQty} SP
                                                  </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                  <table className="w-full text-left text-xs">
                                                    <thead>
                                                      <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50 pb-2">
                                                        <th className="py-2 text-gray-500 uppercase">Khung giờ</th>
                                                        <th className="py-2 text-gray-500 uppercase">Công đoạn</th>
                                                        <th className="py-2 text-gray-500 uppercase text-center">Sản lượng</th>
                                                        <th className="py-2 text-gray-500 uppercase text-right">Hành động</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50">
                                                      {item.logs.map(log => (
                                                        <tr key={log.id} className="hover:bg-gray-50/20">
                                                          <td className="py-2.5 font-bold text-indigo-900">
                                                            {log.hourRange}
                                                          </td>
                                                          <td className="py-2.5">
                                                            <p className="font-semibold text-gray-800 leading-tight">
                                                              {log.opName}
                                                            </p>
                                                            <p className="text-[9px] text-gray-400">
                                                              Style: {log.style} ({log.opCode})
                                                            </p>
                                                          </td>
                                                          <td className="py-2.5 text-center font-extrabold text-indigo-600 font-mono">
                                                            {log.actualQuantity}
                                                          </td>
                                                          <td className="py-2.5 text-right">
                                                            <button
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteWorkerHourlyLog(log.id);
                                                              }}
                                                              className="p-1 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all cursor-pointer border-0 bg-transparent"
                                                              title="Xóa bản ghi giờ này"
                                                            >
                                                              <Trash2 size={13} />
                                                            </button>
                                                          </td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                  {workersWithLogs.length === 0 && (
                                    <tr>
                                      <td colSpan={3} className="text-center py-16 text-gray-400 text-sm italic">
                                        Chưa có bản ghi sản lượng công nhân nào trong ngày {safeFormatDate(hourlyProdDate, "dd/MM/yyyy")} tại {activeLine}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {prodSubTab === "eff_hourly" && (
                  <div className="space-y-6">
                    {/* Drag-and-drop Image Upload Section */}
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-gray-50 pb-6 mb-6">
                        <div>
                          <h3 className="text-xl font-bold font-serif italic text-indigo-900 flex items-center gap-2">
                            ⚡ Phân tích bảng sản lượng & Tính %EFF
                          </h3>
                          <p className="text-sm text-gray-500 mt-1">
                            Chụp ảnh bảng theo dõi năng suất bằng phấn vẽ hoặc bút lông. AI sẽ tự động phân tích các mốc giờ, chỉ tiêu và số lượng may được để tính hiệu suất chính xác.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            ref={effFileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleEffBoardUpload}
                          />
                          <button
                            onClick={() => effFileInputRef.current?.click()}
                            disabled={isExtractingEff}
                            className="flex items-center gap-2 px-6 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-100 select-none cursor-pointer duration-200 disabled:opacity-50 border-0"
                          >
                            {isExtractingEff ? (
                              <Loader2 className="animate-spin" size={16} />
                            ) : (
                              <FileUp size={16} />
                            )}
                            {isExtractingEff ? "AI Đang phân tích..." : "Tự động Nhập từ Ảnh"}
                          </button>
                        </div>
                      </div>

                      {/* Line Master Parameters Input Area */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                        <div className="space-y-1">
                          <label className="text-[12px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider">
                            Tên chuyền (Line)
                          </label>
                          <input
                            type="text"
                            value={effLine}
                            onChange={(e) => setEffLine(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-250 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="Nhập chuyền..."
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[12px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider">
                            Mã hàng (Style)
                          </label>
                          <input
                            type="text"
                            value={effStyle}
                            onChange={(e) => setEffStyle(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-250 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="Nhập mã hàng..."
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[12px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider">
                            Định mức cơ bản (SAM)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            value={effSam === 0 ? "" : effSam}
                            onChange={(e) => setEffSam(Number(e.target.value) || 0)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-250 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none text-indigo-600 font-mono"
                            placeholder="Ví dụ: 8.915"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[12px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider">
                            Số người vận hành
                          </label>
                          <input
                            type="number"
                            value={effOperators === 0 ? "" : effOperators}
                            onChange={(e) => setEffOperators(Number(e.target.value) || 0)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-250 bg-white text-sm font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none text-indigo-600 font-mono"
                            placeholder="Thợ phụ + may..."
                          />
                        </div>
                      </div>
                    </div>

                    {/* Left/Right layouts */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Interactive table grid - 2 columns */}
                      <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                          <h4 className="text-sm font-black uppercase text-gray-400 tracking-widest">
                            Số liệu May & %EFF thực tế từng giờ
                          </h4>
                          <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2.5 py-1 rounded-lg">
                            Công thức: (may_được * SAM) / (người * 60) * 100%
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                                <th className="pb-3 px-2 w-12 text-center">STT</th>
                                <th className="pb-3 px-2 w-28">Giờ làm việc</th>
                                <th className="pb-3 px-2 text-center w-28 border-l border-r border-gray-50">Chỉ tiêu (pcs)</th>
                                <th className="pb-3 px-2 text-center w-28">May được (pcs)</th>
                                <th className="pb-3 px-2 text-center">% Hoàn thành</th>
                                <th className="pb-3 px-2 text-center">% Hiệu suất (%EFF)</th>
                                <th className="pb-3 px-2 text-right w-12"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {effHourlyLogs.map((log, index) => {
                                const targetAchievement = log.target > 0 
                                  ? Math.round((log.actual / log.target) * 100) 
                                  : 0;
                                const effPercent = computeEffPercent(log.actual, effSam, effOperators);
                                
                                // Beautiful matching badges
                                let effBadgeClass = "bg-rose-50 text-rose-600 border border-rose-100";
                                if (effPercent >= 85) {
                                  effBadgeClass = "bg-emerald-50 text-emerald-600 border border-emerald-100";
                                } else if (effPercent >= 70) {
                                  effBadgeClass = "bg-indigo-50 text-indigo-600 border border-indigo-100";
                                } else if (effPercent >= 50) {
                                  effBadgeClass = "bg-amber-50 text-amber-600 border border-amber-100";
                                }

                                return (
                                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-2.5 px-2 text-center font-mono text-xs text-gray-400">
                                      {index + 1}
                                    </td>
                                    <td className="py-2.5 px-2">
                                      <input
                                        type="text"
                                        value={log.time}
                                        onChange={(e) => handleUpdateHourRow(log.id, "time", e.target.value)}
                                        className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-200 focus:border-indigo-500 bg-transparent focus:bg-white text-xs font-bold text-gray-700 text-left"
                                      />
                                    </td>
                                    <td className="py-2.5 px-2 text-center border-l border-r border-gray-50/60">
                                      <input
                                        type="number"
                                        value={log.target}
                                        onChange={(e) => handleUpdateHourRow(log.id, "target", e.target.value)}
                                        className="w-20 px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-200 focus:border-indigo-500 bg-transparent focus:bg-white text-xs font-bold text-gray-700 text-center font-mono"
                                      />
                                    </td>
                                    <td className="py-2.5 px-2 text-center">
                                      <input
                                        type="number"
                                        value={log.actual}
                                        onChange={(e) => handleUpdateHourRow(log.id, "actual", e.target.value)}
                                        className="w-20 px-2 py-1.5 rounded-lg border border-transparent hover:border-gray-100 focus:border-indigo-500 bg-transparent focus:bg-white text-sm font-black text-indigo-600 text-center font-mono"
                                      />
                                    </td>
                                    <td className="py-2.5 px-2 text-center font-mono text-xs font-bold text-gray-600">
                                      <span className={log.target > 0 && log.actual >= log.target ? "text-emerald-600 font-extrabold" : ""}>
                                        {targetAchievement}%
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 text-center font-mono">
                                      <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold inline-block min-w-[62px] text-center ${effBadgeClass}`}>
                                        {effPercent}%
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-2 text-right">
                                      <button
                                        onClick={() => handleDeleteHourRow(log.id)}
                                        className="p-1 px-2 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 border-0 bg-transparent cursor-pointer transition-colors duration-150 animate-pulse-once"
                                        title="Xoá giờ làm này"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Interactive triggers */}
                        <div className="flex gap-4 pt-4 border-t border-gray-50">
                          <button
                            onClick={handleAddNewHour}
                            className="flex-1 py-3.5 px-4 rounded-xl border border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/30 text-indigo-600 bg-transparent font-bold text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                          >
                            + Thêm Giờ Ghi Nhận
                          </button>
                          <button
                            onClick={handleClearEffBoard}
                            className="py-3.5 px-6 rounded-xl border border-gray-200 hover:bg-rose-50 hover:text-rose-600 text-gray-505 bg-transparent font-bold text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                          >
                            Xoá bảng tính
                          </button>
                        </div>
                      </div>

                      {/* Cumulative efficiency summary score card & recommendations */}
                      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                        <h4 className="text-sm font-black uppercase text-gray-400 tracking-widest border-b border-gray-50 pb-4">
                          Hiệu suất bình quân tích lũy
                        </h4>

                        {(() => {
                          const totalActual = effHourlyLogs.reduce((sum, current) => sum + current.actual, 0);
                          const totalTarget = effHourlyLogs.reduce((sum, current) => sum + current.target, 0);
                          const targetProgress = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
                          const totalHours = effHourlyLogs.length;
                          
                          // Overall cumulative efficiency %
                          const cumulativeEff = (totalActual * effSam) / (effOperators * totalHours * 60) * 100;
                          const displayEff = effSam > 0 && effOperators > 0 && totalHours > 0 
                            ? Math.round(cumulativeEff * 10) / 10 
                            : 0;

                          let blockColor = "border-l-rose-550 text-rose-600 bg-rose-50/20";
                          let alertMsg = "";
                          let ratingStr = "";
                          if (displayEff >= 85) {
                            blockColor = "border-l-emerald-500 text-emerald-600 bg-emerald-50/20";
                            ratingStr = "XUẤT SẮC 🌟";
                            alertMsg = "Chuyền may đồng bộ hóa tốt, duy trì nhịp độ chuyền tối ưu! Vui lòng giữ đà sản lượng này.";
                          } else if (displayEff >= 70) {
                            blockColor = "border-l-indigo-500 text-indigo-600 bg-indigo-50/20";
                            ratingStr = "ĐẠT - KHÁ 👍";
                            alertMsg = "Cường độ sản xuất ổn định. Có thể cải thiện thêm bằng cách cân bằng công đoạn thắt nút cổ chai.";
                          } else if (displayEff >= 50) {
                            blockColor = "border-l-amber-500 text-amber-600 bg-amber-50/20";
                            ratingStr = "CẦN CẢI TIẾN ⚠️";
                            alertMsg = "Xảy ra bán thành phẩm dư thừa ứ đọng tại một số công đoạn. Nên kiểm tra và điều chuyển thợ may phụ trợ.";
                          } else {
                            blockColor = "border-l-rose-500 text-rose-600 bg-rose-50/20";
                            ratingStr = "HIỆU SUẤT THẤP 🚨";
                            alertMsg = "Hiệu suất quá thấp. Cần hỗ trợ tay nghề công nhân hoặc kiểm tra phụ liệu đầu vào bị gián đoạn khẩn cấp.";
                          }

                          return (
                            <div className="space-y-6">
                              <div className="flex flex-col items-center justify-center p-6 bg-gray-50/50 rounded-2xl border border-gray-100 text-center">
                                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">
                                  %EFF Cumulative
                                </p>
                                <div className="my-2 flex items-center justify-center">
                                  <span className="text-4xl font-extrabold font-mono tracking-tight text-indigo-900">
                                    {displayEff}%
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-gray-500">
                                  Thành tích: <span className="font-extrabold">{ratingStr}</span>
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50/30 p-3.5 rounded-xl border border-gray-100">
                                  <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                                    Tổng May Được
                                  </p>
                                  <p className="text-lg font-black text-gray-900 mt-1 font-mono">
                                    {totalActual} <span className="text-xs font-normal text-gray-400">pcs</span>
                                  </p>
                                </div>
                                <div className="bg-gray-50/30 p-3.5 rounded-xl border border-gray-100">
                                  <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                                    Đạt Target
                                  </p>
                                  <p className="text-lg font-black text-gray-905 mt-1 font-mono">
                                    {targetProgress}%
                                  </p>
                                </div>
                                <div className="bg-gray-50/30 p-3.5 rounded-xl border border-gray-100">
                                  <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                                    Mốc giờ ghi
                                  </p>
                                  <p className="text-lg font-black text-gray-905 mt-1 font-mono">
                                    {totalHours} <span className="text-xs font-normal text-gray-450">giờ</span>
                                  </p>
                                </div>
                                <div className="bg-gray-50/30 p-3.5 rounded-xl border border-gray-100">
                                  <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                                    Nhân công làm
                                  </p>
                                  <p className="text-lg font-black text-gray-905 mt-1 font-mono">
                                    {effOperators} <span className="text-xs font-normal text-gray-450">người</span>
                                  </p>
                                </div>
                              </div>

                              <div className={`p-4 rounded-xl border-l-4 ${blockColor} text-xs leading-relaxed font-semibold`}>
                                <span className="font-black block uppercase tracking-wider mb-1 text-[10px]">Nhận định Kỹ thuật (IE)</span>
                                {alertMsg}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Integrated Recharts Visual Analytics */}
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                      <h4 className="text-sm font-black uppercase text-gray-400 tracking-widest mb-6 border-b border-gray-50 pb-4">
                        Biểu đồ phân tích xu hướng sản lượng & %EFF từng giờ
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Bar chart for output comparison */}
                        <div className="space-y-3">
                          <p className="text-xs font-black text-gray-400 uppercase tracking-wider text-center">
                            So sánh Sản lượng Thực tế vs Chỉ tiêu
                          </p>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={effHourlyLogs}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} />
                                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: "#1e1b4b", borderRadius: "12px", border: "none", color: "#fff" }}
                                  labelStyle={{ fontWeight: "bold" }}
                                />
                                <Bar dataKey="target" name="Target" fill="#e0e7ff" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="actual" name="Thực tế" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Line chart for efficiency trends */}
                        <div className="space-y-3">
                          <p className="text-xs font-black text-gray-400 uppercase tracking-wider text-center">
                            Đồ thị Biến thiên hiệu suất giờ (%EFF)
                          </p>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={effHourlyLogs.map(log => ({
                                  ...log,
                                  eff: computeEffPercent(log.actual, effSam, effOperators)
                                }))}
                                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} />
                                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} />
                                <Tooltip 
                                  contentStyle={{ backgroundColor: "#1e1b4b", borderRadius: "12px", border: "none", color: "#fff" }}
                                  labelStyle={{ fontWeight: "bold" }}
                                />
                                <Line
                                  type="monotone"
                                  dataKey="eff"
                                  name="Hiệu suất %EFF"
                                  stroke="#10b981"
                                  strokeWidth={3}
                                  activeDot={{ r: 8 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === "planning" && (
              <motion.div
                key="planning"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                  <h3 className="text-xl font-bold font-serif italic mb-4">
                    Lập đơn hàng mới
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input
                      placeholder="Khách hàng"
                      value={newOrder.customer}
                      onChange={(e) =>
                        setNewOrder({ ...newOrder, customer: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      placeholder="Mã hàng / Style"
                      value={newOrder.style}
                      onChange={(e) =>
                        setNewOrder({ ...newOrder, style: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      placeholder="Job / Lệnh"
                      value={newOrder.job}
                      onChange={(e) =>
                        setNewOrder({ ...newOrder, job: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Số lượng"
                      value={newOrder.quantity || ""}
                      onChange={(e) =>
                        setNewOrder({
                          ...newOrder,
                          quantity: Number(e.target.value),
                        })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input
                      type="date"
                      value={newOrder.deadline}
                      onChange={(e) =>
                        setNewOrder({ ...newOrder, deadline: e.target.value })
                      }
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <button
                      onClick={handleAddOrder}
                      className="bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Lưu đơn
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {orders.map((order) => {
                    const progress =
                      (order.producedQuantity / order.orderQuantity) * 100;
                    const breakdown = getOrderBreakdown(order.id);

                    return (
                      <div
                        key={order.id}
                        className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all"
                      >
                        <div className="absolute top-0 right-0 p-8 flex flex-col items-end">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteOrder(order.id)}
                              className="inline-flex items-center justify-center w-10 h-10 text-rose-500 hover:bg-rose-100 transition-colors rounded-full cursor-pointer relative z-50 pointer-events-auto"
                              title="Xoá đơn hàng"
                            >
                              <X size={20} />
                            </button>
                            <span
                              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                order.status === "in_progress"
                                  ? "bg-indigo-50 text-indigo-600"
                                  : "bg-orange-50 text-orange-600"
                              }`}
                            >
                              {order.status === "in_progress"
                                ? "Đang may"
                                : "Chờ kế hoạch"}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-gray-400 font-bold uppercase tracking-tight bg-gray-50 px-3 py-1 rounded-lg">
                            Hạn giao: {order.deadline}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                          <div>
                            <h4 className="text-sm font-black text-indigo-600 uppercase tracking-widest mb-2">
                              {order.customer}
                            </h4>
                            <p className="text-3xl font-black text-gray-900 tracking-tight mb-2">
                              {order.styleName}
                            </p>
                            <div className="flex items-center gap-4 mb-8">
                              <span className="text-xs font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">
                                Job: {order.job || "N/A"}
                              </span>
                              <span className="text-xs font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">
                                Tổng SL: {order.orderQuantity} sp
                              </span>
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between text-xs font-black uppercase text-gray-400 font-mono">
                                <span>
                                  Tiến độ tổng: {progress.toFixed(1)}%
                                </span>
                                <span>
                                  {order.producedQuantity} /{" "}
                                  {order.orderQuantity} sp
                                </span>
                              </div>
                              <div className="h-4 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progress}%` }}
                                  transition={{ duration: 1, ease: "easeOut" }}
                                  className={`h-full rounded-full shadow-sm ${progress >= 100 ? "bg-emerald-500" : "bg-indigo-600"}`}
                                ></motion.div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-8">
                              <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">
                                  Cần may thêm
                                </p>
                                <p className="text-2xl font-black font-mono text-gray-900">
                                  {Math.max(
                                    0,
                                    order.orderQuantity -
                                      order.producedQuantity,
                                  )}
                                </p>
                              </div>
                              <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">
                                  Dự kiến hoàn thành
                                </p>
                                <p className="text-2xl font-black font-mono text-emerald-600">
                                  8{" "}
                                  <span className="text-xs uppercase tracking-normal">
                                    ngày
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-50 pb-2 flex items-center gap-2">
                              <Users size={12} /> Chi tiết theo chuyền may
                            </h5>
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                              {breakdown.map((b) => (
                                <div
                                  key={b.line}
                                  className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-50 shadow-sm hover:border-indigo-100 transition-colors"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-[10px]">
                                      {b.line.replace("Chuyền ", "")}
                                    </div>
                                    <div>
                                      <p className="text-sm font-black text-gray-900">
                                        {b.line}
                                      </p>
                                      <p className="text-[10px] font-bold text-gray-400">
                                        Job: {order.job || "-"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[9px] uppercase text-gray-400 font-black tracking-tighter mb-1">
                                      Đã may được
                                    </p>
                                    <p className="text-lg font-black text-indigo-600 font-mono leading-none">
                                      {b.produced}
                                    </p>
                                  </div>
                                </div>
                              ))}
                              {breakdown.length === 0 && (
                                <div className="h-32 flex flex-col items-center justify-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                  <p className="text-xs text-gray-400 italic">
                                    Chưa có chuyền nào nhận may
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
            {activeTab === "timestudy" && (
              <motion.div
                key="timestudy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white md:p-8 p-4 rounded-3xl border border-gray-100 shadow-sm w-full max-w-full mx-auto">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                      <Clock size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold font-serif italic text-gray-900">
                        Bấm Giờ
                      </h3>
                      <p className="text-sm text-gray-500">
                        Nhập thời gian đo thực tế để tính toán năng suất dự kiến
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left: Input Info */}
                    <div className="space-y-6 bg-gray-50/50 p-6 rounded-2xl">
                      <div className="space-y-4">
                        <div>
                          <label className="text-[13px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider mb-2 block">
                            1. Mã hàng
                          </label>
                          <select
                            value={tsSelectedStyle}
                            onChange={(e) => {
                              setTsSelectedStyle(e.target.value);
                              setTimeStudy({ ...timeStudy, operationId: "", operationId2: "" });
                            }}
                            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Chọn mã hàng --</option>
                            {Array.from(
                              new Set(
                                operations.map((o) => o.style).filter(Boolean),
                              ),
                            )
                              .sort()
                              .map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[13px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider mb-2 block">
                            2. Công đoạn
                          </label>
                          <select
                            value={timeStudy.operationId}
                            onChange={(e) =>
                              setTimeStudy({
                                ...timeStudy,
                                operationId: e.target.value,
                              })
                            }
                            disabled={!tsSelectedStyle}
                            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 italic"
                          >
                            <option value="">
                              {tsSelectedStyle
                                ? "-- Chọn công đoạn chính --"
                                : "-- Vui lòng chọn mã hàng trước --"}
                            </option>
                            {operations
                              .filter((o) => o.style === tsSelectedStyle)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name} ({o.code})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[13px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider mb-2 block">
                            Công đoạn gộp thêm (Không bắt buộc)
                          </label>
                          <select
                            value={timeStudy.operationId2 || ""}
                            onChange={(e) =>
                              setTimeStudy({
                                ...timeStudy,
                                operationId2: e.target.value,
                              })
                            }
                            disabled={!tsSelectedStyle || !timeStudy.operationId}
                            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 italic"
                          >
                            <option value="">
                              {!tsSelectedStyle
                                ? "-- Vui lòng chọn mã hàng trước --"
                                : !timeStudy.operationId
                                  ? "-- Vui lòng chọn công đoạn chính trước --"
                                  : "-- Chọn công đoạn gộp thêm --"}
                            </option>
                            {operations
                              .filter(
                                (o) =>
                                  o.style === tsSelectedStyle &&
                                  o.id !== timeStudy.operationId,
                              )
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name} ({o.code})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[13px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider mb-2 block">
                            3. Chuyền
                          </label>
                          <select
                            value={tsSelectedLine}
                            onChange={(e) => {
                              setTsSelectedLine(e.target.value);
                              setTimeStudy({ ...timeStudy, workerId: "" });
                            }}
                            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Chọn chuyền --</option>
                            {lines.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="text-[13px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider block">
                              4. Công nhân
                            </label>
                            {tsSelectedLine && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsTransferModalOpen(true);
                                  setTransferSelectedLineFilter(tsSelectedLine);
                                }}
                                className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-0.5 cursor-pointer border-0 bg-transparent p-0"
                              >
                                <ArrowLeftRight size={10} /> Điều chuyển
                              </button>
                            )}
                          </div>
                          <select
                            value={timeStudy.workerId}
                            onChange={(e) =>
                              setTimeStudy({
                                ...timeStudy,
                                workerId: e.target.value,
                              })
                            }
                            disabled={!tsSelectedLine}
                            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 italic"
                          >
                            <option value="">
                              {tsSelectedLine
                                ? "-- Chọn công nhân --"
                                : "-- Vui lòng chọn chuyền trước --"}
                            </option>
                            {workers
                              .filter((w) => w.line === tsSelectedLine)
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} ({w.code})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Right: Time Measure Inputs */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <label className="text-[13px] sm:text-xs font-extrabold uppercase text-gray-500 tracking-wider block">
                          5. Kết quả đo (Giây) &amp; Bấm giờ xoay vòng
                        </label>
                      </div>

                      {/* Premium Circular Stopwatch Terminal Component */}
                      <StopwatchTerminal
                        timeStudy={timeStudy}
                        onLap={(lapSecs) => {
                          setTimeStudy((prev) => {
                            if (prev.time1 === 0) {
                              return { ...prev, time1: lapSecs, needsCheck1: false };
                            } else if (prev.time2 === 0) {
                              return { ...prev, time2: lapSecs, needsCheck2: false };
                            } else if (prev.time3 === 0) {
                              return { ...prev, time3: lapSecs, needsCheck3: false };
                            } else {
                              return {
                                ...prev,
                                time1: lapSecs,
                                time2: 0,
                                time3: 0,
                                needsCheck1: false,
                                needsCheck2: false,
                                needsCheck3: false,
                              };
                            }
                          });
                        }}
                      />

                      <div className="grid grid-cols-3 gap-4">
                        {["time1", "time2", "time3"].map((key, i) => {
                          const checkKey = `needsCheck${i + 1}`;
                          const needsCheckVal = (timeStudy as any)[checkKey];
                          const hasValue = (timeStudy as any)[key] > 0;

                          return (
                            <div key={key} className="space-y-2 flex flex-col items-center">
                              <p className="text-xs text-center font-bold text-gray-500 uppercase tracking-wider">
                                Lần {i + 1}
                              </p>
                              
                              <div className="relative w-full">
                                <input
                                  type="number"
                                  value={(timeStudy as any)[key] || ""}
                                  onChange={(e) =>
                                    setTimeStudy({
                                      ...timeStudy,
                                      [key]: Number(e.target.value),
                                    })
                                  }
                                  className={`w-full p-4 rounded-2xl border-2 text-center text-xl font-black font-mono focus:border-indigo-500 outline-none transition-all shadow-sm ${
                                    needsCheckVal
                                      ? "bg-amber-50 border-amber-400 text-amber-700 placeholder-amber-400 focus:border-amber-500 animate-[pulse_3s_infinite]"
                                      : "bg-white border-gray-100 text-indigo-600"
                                  }`}
                                  placeholder="0"
                                />
                                {needsCheckVal && (
                                  <span className="absolute top-1 right-2 flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                  </span>
                                )}
                              </div>

                              <div className="w-full flex flex-col items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTimeStudy((prev) => ({
                                      ...prev,
                                      [checkKey]: !needsCheckVal,
                                    }))
                                  }
                                  className={`text-xs w-full py-2 px-1.5 rounded-xl border font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer ${
                                    needsCheckVal
                                      ? "bg-amber-150 hover:bg-amber-200 border-amber-400 text-amber-800"
                                      : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-500"
                                  }`}
                                >
                                  ⚠️ {needsCheckVal ? "Sắp xếp đo lại" : "Đo lại / Check"}
                                </button>

                                {hasValue ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setTimeStudy((prev) => ({
                                        ...prev,
                                        [key]: 0,
                                        [checkKey]: false,
                                      }))
                                    }
                                    className="text-xs w-full py-2 px-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
                                  >
                                    ✕ Đặt lại (Xóa)
                                  </button>
                                ) : (
                                  <div className="text-xs w-full py-2 px-1.5 border border-dashed border-gray-100 text-gray-300 font-medium flex items-center justify-center gap-1 select-none">
                                    Chưa có số liệu
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Calculation Results */}
                      {timeStudy.time1 > 0 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="mt-8 p-6 rounded-2xl bg-indigo-900 text-white shadow-xl shadow-indigo-100"
                        >
                          {(() => {
                            const validTimes = [
                              timeStudy.time1,
                              timeStudy.time2,
                              timeStudy.time3,
                            ].filter((t) => t > 0);
                            const avgTimeAdjusted =
                              (validTimes.reduce((a, b) => a + b, 0) /
                                validTimes.length) *
                              1.2;
                            const outputPerHour = Math.round(
                              3600 / avgTimeAdjusted,
                            );
                            const outputPerDay = outputPerHour * 8; // Assuming 8h shift

                            return (
                              <>
                                <div className="flex justify-between items-center mb-6">
                                  <span className="text-xs font-bold uppercase tracking-widest opacity-60">
                                    Kết quả dự tính (Đã cộng 20%)
                                  </span>
                                  <span className="text-[10px] bg-white/20 px-2 py-1 rounded">
                                    AVG: {avgTimeAdjusted.toFixed(1)}s
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-8 text-center">
                                  <div>
                                    <p className="text-4xl font-black font-mono">
                                      {outputPerHour}
                                    </p>
                                    <p className="text-[10px] uppercase font-bold mt-1 text-indigo-200">
                                      Sản phẩm / Giờ
                                    </p>
                                  </div>
                                  <div className="border-l border-white/10">
                                    <p className="text-4xl font-black font-mono">
                                      {outputPerDay}
                                    </p>
                                    <p className="text-[10px] uppercase font-bold mt-1 text-indigo-200">
                                      Sản phẩm / Ngày (8h)
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={handleAddTimeStudyRecord}
                                  className="w-full mt-6 bg-white text-indigo-900 py-3 rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-opacity-90 transition-all"
                                >
                                  Lưu kết quả nghiên cứu (SAM - Cộng thêm 20%)
                                </button>
                              </>
                            );
                          })()}
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <div className="mt-12 border-t border-gray-100 pt-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold uppercase text-gray-400 tracking-widest">
                          Lịch sử
                        </h4>
                        {tsSortOrder === "custom" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                            <GripVertical size={10} />
                            Kéo thả để sắp xếp
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-100">
                            Sắp xếp: Mới nhất trước
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            Sắp xếp:
                          </span>
                          <select
                            value={tsSortOrder}
                            onChange={(e) => setTsSortOrder(e.target.value as "custom" | "newest")}
                            className="text-xs p-2 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700"
                          >
                            <option value="custom">Thứ tự tùy chỉnh (Kéo thả)</option>
                            <option value="newest">Lọc từ Mới đến Cũ</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            Chuyền:
                          </span>
                          <select
                            value={tsFilterLine}
                            onChange={(e) => {
                              setTsFilterLine(e.target.value);
                              setTsFilterWorker("");
                            }}
                            className="text-xs p-2 rounded-lg border border-gray-200 bg-white"
                          >
                            <option value="">Tất cả</option>
                            {lines.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            Mã hàng:
                          </span>
                          <select
                            value={tsFilterStyle}
                            onChange={(e) => setTsFilterStyle(e.target.value)}
                            className="text-xs p-2 rounded-lg border border-gray-200 bg-white"
                          >
                            <option value="">Tất cả</option>
                            {Array.from(
                              new Set(
                                timeStudyRecords
                                  .map((r) => {
                                    const op = operations.find(
                                      (o) => o.id === r.operationId,
                                    );
                                    return r.style || op?.style || "";
                                  })
                                  .filter(Boolean),
                              ),
                            )
                              .sort()
                              .map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">
                            Công nhân:
                          </span>
                          <select
                            value={tsFilterWorker}
                            onChange={(e) => setTsFilterWorker(e.target.value)}
                            className="text-xs p-2 rounded-lg border border-gray-200 bg-white"
                          >
                            <option value="">Tất cả</option>
                            {workers
                              .filter((w) => !tsFilterLine || w.line === tsFilterLine)
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} ({w.code})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const filteredData = getFilteredTimeStudyRecords();
                      if (filteredData.length === 0) return null;

                      const chartData = filteredData.map((record) => {
                        const worker = workers.find((w) => w.id === record.workerId);
                        const op = operations.find((o) => o.id === record.operationId);
                        const op2 = record.operationId2
                          ? operations.find((o) => o.id === record.operationId2)
                          : null;
                        
                        const workerName = worker?.name || "Chưa rõ";
                        const opName = op?.name || "Chưa rõ";
                        const name = `${workerName} (${opName}${op2 ? " + " + op2.name : ""})`;
                        
                        return {
                          fullname: name,
                          worker: workerName,
                          operation: opName,
                          operation2: op2?.name || "",
                          "Năng suất (Pcs/Giờ)": record.targetPerHour,
                          "Thời gian (Giây)": record.averageTime,
                        };
                      });

                      const opColors = [
                        "#3B82F6", // Blue
                        "#10B981", // Emerald
                        "#F59E0B", // Amber
                        "#EF4444", // Red
                        "#8B5CF6", // Purple
                        "#EC4899", // Pink
                        "#06B6D4", // Cyan
                        "#14B8A6", // Teal
                        "#F97316", // Orange
                        "#6366F1", // Indigo
                        "#84CC16", // Lime
                        "#A855F7", // Deep Purple
                      ];

                      const uniqueOperations = Array.from(
                        new Set(chartData.map((d) => d.operation).filter(Boolean))
                      );

                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white/50 p-6 rounded-3xl border border-gray-100 shadow-sm mb-8"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div>
                              <h5 className="text-sm font-bold text-gray-800 uppercase tracking-wider">
                                Biểu đồ so sánh công đoạn đo thời gian
                              </h5>
                              <p className="text-xs text-gray-400 mt-0.5 font-medium">
                                Đang chọn: {tsFilterLine || "Tất cả chuyền"} • {tsFilterStyle || "Tất cả mã hàng"}
                              </p>
                            </div>
                            <div className="flex bg-gray-100 p-1 rounded-xl text-xs font-semibold self-start sm:self-auto shadow-inner">
                              <button
                                onClick={() => setTsChartMetric("productivity")}
                                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                                  tsChartMetric === "productivity"
                                    ? "bg-white text-emerald-600 shadow-sm font-bold"
                                    : "text-gray-500 hover:text-gray-900"
                                }`}
                              >
                                Năng suất (Pcs/Giờ)
                              </button>
                              <button
                                onClick={() => setTsChartMetric("duration")}
                                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                                  tsChartMetric === "duration"
                                    ? "bg-white text-amber-600 shadow-sm font-bold"
                                    : "text-gray-500 hover:text-gray-900"
                                }`}
                              >
                                Thời gian (Giây)
                              </button>
                            </div>
                          </div>

                          <div className="h-[320px] w-full overflow-x-auto overflow-y-hidden select-none scrollbar-thin scrollbar-thumb-gray-200">
                            <div style={{ minWidth: `${Math.max(485, chartData.length * 75)}px`, width: "100%" }} className="h-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  data={chartData}
                                  margin={{ top: 25, right: 10, left: -20, bottom: 35 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                  <XAxis
                                    dataKey="worker"
                                    stroke="#9CA3AF"
                                    tick={<CustomChartTick />}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={0}
                                  />
                                  <YAxis stroke="#9CA3AF" fontSize={10} tickLine={false} axisLine={false} />
                                  <Tooltip
                                    cursor={{ fill: "rgba(0,0,0,0.02)" }}
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xl text-left max-w-sm">
                                            <p className="font-bold text-gray-900 text-sm mb-1">{data.worker}</p>
                                            <p className="text-xs text-indigo-600 font-semibold mb-2">
                                              Công đoạn: {data.operation}
                                              {data.operation2 ? ` + ${data.operation2}` : ""}
                                            </p>
                                            <div className="border-t border-gray-100 pt-2 flex justify-between items-center text-xs">
                                              <span className="text-gray-500 font-medium">{payload[0].name}:</span>
                                              <span className={`font-bold ${tsChartMetric === "productivity" ? "text-emerald-600" : "text-amber-600"}`}>
                                                {payload[0].value} {tsChartMetric === "productivity" ? "Pcs/Giờ" : "s"}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Bar
                                    dataKey={
                                      tsChartMetric === "productivity"
                                        ? "Năng suất (Pcs/Giờ)"
                                        : "Thời gian (Giây)"
                                    }
                                    radius={[6, 6, 0, 0]}
                                    barSize={Math.max(20, Math.min(48, 600 / (chartData.length || 1)))}
                                  >
                                    {chartData.map((entry, index) => {
                                      const opIndex = uniqueOperations.indexOf(entry.operation);
                                      const color = opColors[opIndex % opColors.length] || "#9CA3AF";
                                      return (
                                        <Cell
                                          key={`cell-${index}`}
                                          fill={color}
                                        />
                                      );
                                    })}
                                    <LabelList
                                      dataKey={
                                        tsChartMetric === "productivity"
                                          ? "Năng suất (Pcs/Giờ)"
                                          : "Thời gian (Giây)"
                                      }
                                      position="top"
                                      formatter={(val: number) => {
                                        return tsChartMetric === "productivity" ? `${val} Pcs/Giờ` : `${val}s`;
                                      }}
                                      style={{
                                        fontSize: 9,
                                        fontWeight: 700,
                                        fill: "#374151",
                                      }}
                                    />
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          {/* Dynamic Color Legend for Operations */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 justify-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
                            {uniqueOperations.map((opName, idx) => {
                              const color = opColors[idx % opColors.length] || "#9CA3AF";
                              return (
                                <div key={opName} className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold">
                                  <span className="w-3 h-3 rounded-md inline-block shadow-sm" style={{ backgroundColor: color }} />
                                  <span>{opName}</span>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      );
                    })()}

                    <div className="space-y-4">
                      {getFilteredTimeStudyRecords()
                        .map((record, index) => {
                          const worker = workers.find(
                            (w) => w.id === record.workerId,
                          );
                          const op = operations.find(
                            (o) => o.id === record.operationId,
                          );
                          const op2 = record.operationId2
                            ? operations.find((o) => o.id === record.operationId2)
                            : null;
                          const styleName =
                            record.style || op?.style || "Không rõ mã hàng";
                          return (
                            <div
                              key={record.id}
                              draggable={tsSortOrder === "custom"}
                              onDragStart={(e) => {
                                if (tsSortOrder !== "custom") return;
                                setDraggedIndex(index);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", String(index));
                              }}
                              onDragOver={(e) => {
                                if (tsSortOrder !== "custom") return;
                                e.preventDefault();
                              }}
                              onDragEnter={() => {
                                if (tsSortOrder !== "custom") return;
                                setDragOverIndex(index);
                              }}
                              onDragEnd={() => {
                                setDraggedIndex(null);
                                setDragOverIndex(null);
                              }}
                              onDrop={(e) => {
                                if (tsSortOrder !== "custom") return;
                                e.preventDefault();
                                if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
                                  handleReorderTimeStudyRecords(draggedIndex, dragOverIndex);
                                }
                                setDraggedIndex(null);
                                setDragOverIndex(null);
                              }}
                              className={`${
                                record.needsCheck
                                  ? "bg-amber-50/80 border-amber-305 shadow-sm shadow-amber-400/5 animate-[pulse_4s_infinite]"
                                  : "bg-white border-gray-200/90 shadow-sm hover:border-gray-300 hover:shadow-md"
                              } p-5 sm:p-6 rounded-2xl border transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-5 group select-none ${
                                tsSortOrder === "custom"
                                  ? "cursor-grab active:cursor-grabbing hover:border-indigo-300"
                                  : "cursor-default"
                              } ${
                                draggedIndex === index
                                  ? "opacity-40 border-dashed border-indigo-300 bg-gray-100/50"
                                  : dragOverIndex === index
                                    ? "border-indigo-500 bg-indigo-50/40 shadow-md scale-[1.01]"
                                    : ""
                              } ${draggedIndex !== null ? "*:pointer-events-none" : ""}`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center gap-5 flex-1">
                                <div className="flex items-center gap-3">
                                  {tsSortOrder === "custom" ? (
                                    <div className="text-gray-300 group-hover:text-indigo-400 transition-colors cursor-grab active:cursor-grabbing p-1">
                                      <GripVertical size={16} />
                                    </div>
                                  ) : (
                                    <div className="text-gray-200 p-1 opacity-40" title="Đang ở chế độ sắp xếp theo ngày">
                                      <GripVertical size={16} />
                                    </div>
                                  )}
                                  <div className={`flex flex-col items-center justify-center p-3.5 rounded-2xl border shadow-sm w-20 h-20 flex-shrink-0 transition-colors ${
                                    record.needsCheck
                                      ? "bg-amber-500 border-amber-400 text-slate-900"
                                      : "bg-slate-50 border-gray-100 text-indigo-700"
                                  }`}>
                                    <p className={`text-lg font-black font-mono leading-none ${record.needsCheck ? "text-slate-900" : "text-indigo-700"}`}>
                                      {record.averageTime}s
                                    </p>
                                    <p className={`text-[8px] uppercase font-bold tracking-wider mt-1.5 ${record.needsCheck ? "text-slate-800" : "text-gray-400"}`}>
                                      Avg Time
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="space-y-1.5 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="bg-indigo-50 border border-indigo-150 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">
                                      Chuyền {worker?.line}
                                    </span>
                                    {record.needsCheck && (
                                      <span className="bg-amber-100 border border-amber-250 text-amber-800 text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-wide animate-pulse">
                                        <AlertTriangle size={10} /> Cần kiểm tra lại / Đo lại
                                      </span>
                                    )}
                                  </div>

                                  <div className="space-y-1">
                                    <h4 className="text-base sm:text-lg font-extrabold text-gray-900 leading-tight">
                                      {op?.name}{op2 ? ` + ${op2.name}` : ""}
                                    </h4>
                                    <p className="text-sm sm:text-base font-bold text-indigo-650 flex items-center gap-1.5">
                                      <span className="text-gray-450 font-medium text-xs sm:text-sm">Công nhân:</span>
                                      <span className="underline decoration-indigo-300 decoration-2 underline-offset-2">{worker?.name || "Chưa rõ"}</span>
                                    </p>
                                  </div>

                                  <p className="text-[11px] text-gray-400 font-semibold flex items-center gap-1.5 flex-wrap pt-0.5">
                                    <span>Mã hàng: <strong className="text-gray-700">{styleName}</strong></span>
                                    <span className="text-gray-200">|</span>
                                    <span>Ngày đo: {record.date}</span>
                                  </p>
                                  
                                  {/* Sub-times detailed list */}
                                  <div className="flex items-center gap-1.5 mt-2 flex-wrap pt-1 border-t border-dashed border-gray-100">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Các lần đo:</span>
                                    {record.times?.map((t, idx) => {
                                      const isSubChecked = record.needsCheckTimes?.[idx];
                                      return (
                                        <span
                                          key={idx}
                                          className={`text-[10.5px] px-2.5 py-0.5 rounded-lg font-mono font-bold transition-all ${
                                            isSubChecked
                                              ? "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm"
                                              : "bg-gray-50 border border-gray-150 text-gray-600 hover:bg-gray-100"
                                          }`}
                                          title={isSubChecked ? "Lần đo này được đánh dấu cần check lại" : `Lần đo ${idx + 1}`}
                                        >
                                          L{idx + 1}: <span className={isSubChecked ? "text-amber-900 font-black" : "text-gray-800"}>{t}s</span>
                                          {isSubChecked && " ⚠️"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex flex-wrap items-center justify-between xl:justify-end gap-5 border-t xl:border-t-0 pt-4 xl:pt-0 border-gray-100">
                                <div className="flex items-center gap-4">
                                  {/* Pcs/Giờ Stats Chip */}
                                  <div className="bg-gradient-to-br from-indigo-50/60 to-indigo-50 border border-indigo-110 p-3 rounded-2xl min-w-[105px] text-center shadow-sm">
                                    <p className="text-2xl font-black font-mono text-indigo-605 leading-none">
                                      {record.targetPerHour}
                                    </p>
                                    <p className="text-[10px] text-indigo-800/80 uppercase font-black tracking-wide mt-1.5">
                                      Pcs/Giờ
                                    </p>
                                  </div>

                                  {/* Pcs/Ngày Stats Chip */}
                                  <div className="bg-gradient-to-br from-emerald-50/60 to-emerald-50 border border-emerald-100 p-3 rounded-2xl min-w-[105px] text-center shadow-sm">
                                    <p className="text-2xl font-black font-mono text-emerald-600 leading-none">
                                      {record.targetPerDay}
                                    </p>
                                    <p className="text-[10px] text-emerald-800/80 uppercase font-black tracking-wide mt-1.5">
                                      Pcs/Ngày
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1.5 ml-auto sm:ml-2 border-l border-gray-100 pl-4">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTimeStudyCheck(record.id, !!record.needsCheck)}
                                    className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-[10px] font-extrabold uppercase transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                                      record.needsCheck
                                        ? "bg-amber-500 hover:bg-amber-400 text-slate-900 border-amber-400 shadow-md"
                                        : "bg-white hover:bg-gray-50 text-gray-500 hover:text-amber-600 border-gray-200"
                                    }`}
                                    title="Đánh dấu cần đo lại / bấm thời gian lại"
                                  >
                                    <AlertTriangle size={13} className={record.needsCheck ? "animate-bounce" : ""} />
                                    <span>{record.needsCheck ? "Hủy Flag" : "Check Lại"}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteTimeStudyRecord(record.id)
                                    }
                                    className="text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-all rounded-xl p-2 cursor-pointer"
                                    title="Xóa bản ghi"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      {timeStudyRecords.length === 0 && (
                        <div className="text-center py-12 text-gray-400 text-sm italic">
                          Chưa có bản ghi nghiên cứu nào
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "duty" && (() => {
              const currentDuty = duties.find(d => d.date === dutyDate) || {
                sweeperIds: [],
                trashCollectorIds: []
              };

              const getWorkerAttendanceRecord = (workerId: string) => {
                return attendance.find(a => a.date === dutyDate && a.workerId === workerId) || {
                  status: "present",
                  leaveType: "",
                  reason: "",
                  timeValue: "",
                  timeValueEnd: ""
                };
              };

              const getWorkerAttendance = (workerId: string) => {
                const record = attendance.find(a => a.date === dutyDate && a.workerId === workerId);
                return record ? record.status : "present";
              };

              const getLineDutyStatus = (lineName: string) => {
                const record = lineDuties.find(ld => ld.date === dutyDate && ld.line === lineName);
                return record ? (record.status as "Rồi" | "Chưa") : "Chưa";
              };

              const handleUpdateAttendance = async (workerId: string, updates: any) => {
                const existing = attendance.find(a => a.date === dutyDate && a.workerId === workerId) || {
                  date: dutyDate,
                  workerId,
                  status: "present",
                  leaveType: "",
                  reason: "",
                  timeValue: "",
                  timeValueEnd: ""
                };
                const recordId = `${dutyDate}_${workerId}`;
                await setDocToFirestore("attendance", recordId, {
                  ...existing,
                  ...updates
                });
              };

              const handleMarkAllPresent = async () => {
                const filtered = workers.filter(w => {
                  const matchLine = !dutyFilterLine || w.line === dutyFilterLine;
                  const matchSearch = !dutySearchQuery || w.name.toLowerCase().includes(dutySearchQuery.toLowerCase()) || w.code.toLowerCase().includes(dutySearchQuery.toLowerCase());
                  return matchLine && matchSearch;
                });
                for (const w of filtered) {
                  const recordId = `${dutyDate}_${w.id}`;
                  await setDocToFirestore("attendance", recordId, {
                    date: dutyDate,
                    workerId: w.id,
                    status: "present",
                    leaveType: "",
                    reason: "",
                    timeValue: "",
                    timeValueEnd: ""
                  });
                }
                alert("Đã điểm danh CÓ MẶT cho " + filtered.length + " công nhân!");
              };

              const handleAutoAssignDuty = async () => {
                const presentWorkerIds = attendance
                  .filter(a => a.date === dutyDate && a.status !== "absent")
                  .map(a => a.workerId);
                  
                const hasAttendanceRecords = attendance.some(a => a.date === dutyDate);
                const availableWorkers = workers.filter(w => {
                  if (hasAttendanceRecords) {
                    return presentWorkerIds.includes(w.id);
                  }
                  return true;
                });

                const femaleWorkers = availableWorkers.filter(w => !w.gender || w.gender === "nữ");
                const maleWorkers = availableWorkers.filter(w => w.gender === "nam");

                if (femaleWorkers.length === 0 && maleWorkers.length === 0) {
                  alert("Không tìm thấy công nhân khả dụng nào để phân công! Vui lòng thêm công nhân hoặc kiểm tra điểm danh.");
                  return;
                }

                const shuffle = (array: any[]) => [...array].sort(() => Math.random() - 0.5);
                const shuffledFemales = shuffle(femaleWorkers);
                const shuffledMales = shuffle(maleWorkers);

                const selectedSweepers = shuffledFemales.slice(0, Math.min(2, shuffledFemales.length)).map(w => w.id);
                const selectedTrashCollectors = shuffledMales.slice(0, Math.min(1, shuffledMales.length)).map(w => w.id);

                if (selectedSweepers.length === 0 && femaleWorkers.length > 0) {
                  selectedSweepers.push(femaleWorkers[0].id);
                }
                if (selectedTrashCollectors.length === 0 && maleWorkers.length > 0) {
                  selectedTrashCollectors.push(maleWorkers[0].id);
                }

                await setDocToFirestore("duties", dutyDate, {
                  date: dutyDate,
                  sweeperIds: selectedSweepers,
                  trashCollectorIds: selectedTrashCollectors
                });
                alert("Đã tự động phân công lịch trực nhật tối ưu cho ngày " + safeFormatDate(dutyDate, "dd/MM/yyyy") + "!");
              };

              const handleAddSweeper = async (workerId: string) => {
                if (!workerId) return;
                const sweeperIds = currentDuty.sweeperIds || [];
                if (sweeperIds.includes(workerId)) return;
                await setDocToFirestore("duties", dutyDate, {
                  ...currentDuty,
                  date: dutyDate,
                  sweeperIds: [...sweeperIds, workerId]
                });
              };

              const handleRemoveSweeper = async (workerId: string) => {
                const sweeperIds = currentDuty.sweeperIds || [];
                await setDocToFirestore("duties", dutyDate, {
                  ...currentDuty,
                  date: dutyDate,
                  sweeperIds: sweeperIds.filter((id: string) => id !== workerId)
                });
              };

              const handleAddTrashCollector = async (workerId: string) => {
                if (!workerId) return;
                const trashCollectorIds = currentDuty.trashCollectorIds || [];
                if (trashCollectorIds.includes(workerId)) return;
                await setDocToFirestore("duties", dutyDate, {
                  ...currentDuty,
                  date: dutyDate,
                  trashCollectorIds: [...trashCollectorIds, workerId]
                });
              };

              const handleRemoveTrashCollector = async (workerId: string) => {
                const trashCollectorIds = currentDuty.trashCollectorIds || [];
                await setDocToFirestore("duties", dutyDate, {
                  ...currentDuty,
                  date: dutyDate,
                  trashCollectorIds: trashCollectorIds.filter((id: string) => id !== workerId)
                });
              };

              const handleClearDuty = async () => {
                if (window.confirm && !window.confirm("Bạn có chắc muốn xóa tất cả phân công trực nhật của ngày này?")) {
                  return;
                }
                await setDocToFirestore("duties", dutyDate, {
                  date: dutyDate,
                  sweeperIds: [],
                  trashCollectorIds: []
                });
              };

              const filteredWorkersForAttendance = workers.filter(w => {
                const matchLine = !dutyFilterLine || w.line === dutyFilterLine;
                const matchSearch = !dutySearchQuery || w.name.toLowerCase().includes(dutySearchQuery.toLowerCase()) || w.code.toLowerCase().includes(dutySearchQuery.toLowerCase());
                const attStatus = getWorkerAttendance(w.id);
                const matchAttendance = dutyFilterAttendanceStatus === "all" ||
                  (dutyFilterAttendanceStatus === "present" && attStatus !== "absent") ||
                  (dutyFilterAttendanceStatus === "absent" && attStatus === "absent");
                return matchLine && matchSearch && matchAttendance;
              });

              const totalPresentCount = workers.filter(w => getWorkerAttendance(w.id) !== "absent").length;

              const availableFemalesForSweeping = workers.filter(w => (!w.gender || w.gender === "nữ") && !(currentDuty.sweeperIds || []).includes(w.id));
              const availableMalesForTrash = workers.filter(w => w.gender === "nam" && !(currentDuty.trashCollectorIds || []).includes(w.id));

              return (
                <motion.div
                  key="duty"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 text-left"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                        <ClipboardList size={22} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold font-serif italic text-indigo-950 leading-tight">
                          Quản lý CN
                        </h3>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                          Phân công tự động theo giới tính & chấm công ngày
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                        <span className="text-xs font-bold text-gray-500 pl-2 uppercase">Ngày trực:</span>
                        <input
                          type="date"
                          value={dutyDate}
                          onChange={(e) => setDutyDate(e.target.value)}
                          className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 flex-wrap gap-1">
                        <button
                          onClick={() => setDutySubTab("attendance")}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            dutySubTab === "attendance"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Chấm công
                        </button>
                        <button
                          onClick={() => setDutySubTab("schedule")}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            dutySubTab === "schedule"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Phân công trực nhật
                        </button>
                        <button
                          onClick={() => setDutySubTab("lines_status")}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            dutySubTab === "lines_status"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Trực nhật theo chuyền
                        </button>
                        <button
                          onClick={() => setDutySubTab("calendar")}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            dutySubTab === "calendar"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Lịch tháng &amp; Thống kê
                        </button>
                        <button
                          onClick={() => setDutySubTab("meeting")}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            dutySubTab === "meeting"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Họp
                        </button>
                        <button
                          onClick={() => setDutySubTab("stats")}
                          className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                            dutySubTab === "stats"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          Thống kê điểm danh
                        </button>
                      </div>
                    </div>
                  </div>

                  {dutySubTab === "attendance" && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="bg-gradient-to-br from-indigo-50/60 to-indigo-100 border border-indigo-150 p-6 rounded-2xl flex flex-col justify-between">
                          <div>
                            <span className="text-xs font-black uppercase tracking-widest text-indigo-500 block mb-1">Thống kê ngày</span>
                            <h4 className="text-4xl font-black text-indigo-950 font-mono tracking-tight">
                              {totalPresentCount}/{workers.length}
                            </h4>
                            <p className="text-xs text-indigo-800 font-semibold mt-1">
                              Công nhân có mặt đi làm
                            </p>
                          </div>
                          <div className="mt-4 pt-4 border-t border-indigo-200/50">
                            <div className="flex justify-between text-xs text-indigo-900 font-bold">
                              <span>Tỷ lệ đi làm:</span>
                              <span>{workers.length > 0 ? Math.round((totalPresentCount / workers.length) * 100) : 0}%</span>
                            </div>
                            <div className="w-full bg-indigo-200 h-2 rounded-full mt-1.5 overflow-hidden">
                              <div
                                className="bg-indigo-600 h-full transition-all"
                                style={{ width: `${workers.length > 0 ? (totalPresentCount / workers.length) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <input
                              type="text"
                              placeholder="Tìm công nhân (tên, mã)..."
                              value={dutySearchQuery}
                              onChange={(e) => setDutySearchQuery(e.target.value)}
                              className="p-2.5 rounded-xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            
                            <select
                              value={dutyFilterLine}
                              onChange={(e) => setDutyFilterLine(e.target.value)}
                              className="p-2.5 rounded-xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                            >
                              <option value="">Tất cả chuyền</option>
                              {lines.map(l => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                            </select>

                            <select
                              value={dutyFilterAttendanceStatus}
                              onChange={(e) => setDutyFilterAttendanceStatus(e.target.value as "all" | "present" | "absent")}
                              className="p-2.5 rounded-xl border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                            >
                              <option value="all">Tất cả điểm danh</option>
                              <option value="present">🟢 Đi làm</option>
                              <option value="absent">🔴 Nghỉ làm</option>
                            </select>

                            <button
                              onClick={() => {
                                setIsTransferModalOpen(true);
                                setTransferSelectedLineFilter(dutyFilterLine);
                              }}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl font-bold text-xs uppercase tracking-widest p-2.5 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-600/5 border border-indigo-100"
                            >
                              <ArrowLeftRight size={14} /> Điều chuyển CN
                            </button>
                            <button
                              onClick={handleMarkAllPresent}
                              disabled={filteredWorkersForAttendance.length === 0}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-widest p-2.5 transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-emerald-600/10 border-0"
                            >
                              <CheckCircle2 size={14} /> Có mặt tất cả
                            </button>
                          </div>

                          <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-xl text-xs text-amber-900 leading-relaxed">
                            <span className="font-extrabold flex items-center gap-1 uppercase text-[10px] text-amber-950 mb-0.5">
                              💡 Gợi ý trực nhật:
                            </span>
                            Chấm công đầy đủ giúp hệ thống phân công trực nhật chính xác hơn, tránh phân việc cho công nhân nghỉ làm hôm nay.
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                          <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">
                            Danh sách công nhân ({filteredWorkersForAttendance.length})
                          </h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead className="bg-gray-50/20 border-b border-gray-100">
                              <tr>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mã CN</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Họ và Tên</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Giới tính</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Chuyền</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nghỉ (Phép)</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Thời gian</th>
                                <th className="px-4 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lý do</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {filteredWorkersForAttendance.map(worker => {
                                const attRec = getWorkerAttendanceRecord(worker.id);
                                const status = attRec.status;
                                return (
                                  <tr key={worker.id} className="hover:bg-gray-50/60 transition-colors group">
                                    <td className="px-4 py-3 text-xs font-mono font-bold text-gray-500">{worker.code}</td>
                                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{worker.name}</td>
                                    <td className="px-4 py-3">
                                      <select
                                        value={worker.gender || "nữ"}
                                        onChange={async (e) => {
                                          const val = e.target.value as "nam" | "nữ";
                                          await updateDocInFirestore("workers", worker.id, { gender: val });
                                        }}
                                        className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border cursor-pointer outline-none transition-colors ${
                                          worker.gender === "nam"
                                            ? "bg-blue-50/60 text-blue-600 border-blue-100 hover:bg-blue-100"
                                            : "bg-rose-50/60 text-rose-600 border-rose-100 hover:bg-rose-100"
                                        }`}
                                      >
                                        <option value="nữ">♀️ Nữ</option>
                                        <option value="nam">♂️ Nam</option>
                                      </select>
                                    </td>
                                    <td className="px-4 py-3">
                                      <select
                                        value={worker.line}
                                        onChange={async (e) => {
                                          await updateDocInFirestore("workers", worker.id, { line: e.target.value });
                                        }}
                                        className="text-[11px] font-extrabold px-2 py-0.5 rounded-md border border-gray-200 bg-white cursor-pointer outline-none hover:bg-gray-50 text-gray-700 font-mono"
                                      >
                                        {lines.map((l) => (
                                          <option key={l} value={l}>
                                            {l}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-4 py-3">
                                      <select
                                        value={status}
                                        onChange={async (e) => {
                                          await handleUpdateAttendance(worker.id, { status: e.target.value });
                                        }}
                                        className={`text-[11px] font-black px-2 py-1 rounded-lg border outline-none cursor-pointer ${
                                          status === "present"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : status === "late"
                                              ? "bg-amber-50 text-amber-700 border-amber-200"
                                              : status === "gate_pass"
                                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                                : "bg-rose-50 text-rose-700 border-rose-200"
                                        }`}
                                      >
                                        <option value="present">🟢 Có mặt</option>
                                        <option value="late">🟡 Đi trễ</option>
                                        <option value="gate_pass">🔵 Ra cổng</option>
                                        <option value="absent">🔴 Nghỉ làm</option>
                                      </select>
                                    </td>
                                    <td className="px-4 py-3">
                                      <select
                                        value={attRec.leaveType || ""}
                                        disabled={status !== "absent"}
                                        onChange={async (e) => {
                                          await handleUpdateAttendance(worker.id, { leaveType: e.target.value });
                                        }}
                                        className={`text-[11px] font-bold px-2 py-1 rounded-lg border outline-none cursor-pointer ${
                                          status !== "absent"
                                            ? "bg-gray-50/60 text-gray-300 border-gray-100 cursor-not-allowed"
                                            : attRec.leaveType === "co_phep"
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                                              : attRec.leaveType === "khong_phep"
                                                ? "bg-rose-50 text-rose-800 border-rose-100"
                                                : "bg-white text-gray-500 border-gray-200"
                                        }`}
                                      >
                                        <option value="">-- Chọn --</option>
                                        <option value="co_phep">Có phép</option>
                                        <option value="khong_phep">Không phép</option>
                                      </select>
                                    </td>
                                    <td className="px-4 py-3">
                                      {status !== "present" ? (
                                        <div className="flex items-center gap-1.5 min-w-[170px]">
                                          <div className="flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase">Từ</span>
                                            <input
                                              type="time"
                                              value={attRec.timeValue || "08:00"}
                                              onChange={async (e) => {
                                                await handleUpdateAttendance(worker.id, { timeValue: e.target.value });
                                              }}
                                              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono w-[72px]"
                                            />
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-bold uppercase">Đến</span>
                                            <input
                                              type="time"
                                              value={attRec.timeValueEnd || "17:00"}
                                              onChange={async (e) => {
                                                await handleUpdateAttendance(worker.id, { timeValueEnd: e.target.value });
                                              }}
                                              className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 font-mono w-[72px]"
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-gray-300 font-mono text-[10px] pl-2">-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <textarea
                                        rows={1}
                                        placeholder="Nhập lý do..."
                                        value={attRec.reason || ""}
                                        onChange={async (e) => {
                                          await handleUpdateAttendance(worker.id, { reason: e.target.value });
                                        }}
                                        className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-gray-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 w-full min-w-[180px] resize-y overflow-y-auto"
                                        style={{ minHeight: '32px' }}
                                      />
                                      {attRec.reason && (
                                        <div className="text-[10px] text-gray-500 font-medium mt-1 leading-tight break-words max-w-[220px]">
                                          {attRec.reason}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {filteredWorkersForAttendance.length === 0 && (
                                <tr>
                                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm italic">
                                    Không tìm thấy công nhân phù hợp bộ lọc
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {dutySubTab === "schedule" && (
                    <div className="space-y-6">
                      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
                        <div>
                          <h4 className="text-base font-bold text-gray-900">
                            Phân công trực nhật ngày {safeFormatDate(dutyDate, "dd/MM/yyyy")}
                          </h4>
                          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
                            Quét nhà cho công nhân nữ, Đổ rác cho công nhân nam
                          </p>
                        </div>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                          <button
                            onClick={handleClearDuty}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition-all font-bold text-xs uppercase tracking-widest cursor-pointer whitespace-nowrap"
                          >
                            Xóa hết phân công
                          </button>
                          
                          <button
                            onClick={handleAutoAssignDuty}
                            className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-sm shadow-indigo-600/10 active:scale-95"
                          >
                            <Sparkles size={14} /> Tự động phân công AI
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col justify-between min-h-[400px]">
                          <div>
                            <div className="p-6 bg-gradient-to-r from-rose-500/5 to-rose-500/10 border-b border-rose-50/50 flex justify-between items-start">
                              <div>
                                <span className="inline-block bg-rose-100 border border-rose-200 text-rose-700 font-black text-[10px] px-2.5 py-0.5 rounded-md uppercase tracking-wider mb-2">
                                  Nhiệm vụ 1: Vệ sinh & Quét dọn
                                </span>
                                <h4 className="text-xl font-bold font-serif italic text-gray-950 flex items-center gap-1.5">
                                  🧹 Quét dọn nhà xưởng
                                </h4>
                                <p className="text-xs text-rose-700/80 font-bold mt-1">
                                  ⚠️ Chỉ phân công Công nhân Nữ
                                </p>
                              </div>
                              <div className="h-10 w-10 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 font-bold">
                                ♀️
                              </div>
                            </div>

                            <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">
                                Thêm thủ công (Công nhân Nữ):
                              </label>
                              <select
                                onChange={(e) => {
                                  handleAddSweeper(e.target.value);
                                  e.target.value = "";
                                }}
                                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none bg-white focus:ring-1 focus:ring-rose-500 text-gray-700"
                              >
                                <option value="">Chọn công nhân Nữ...</option>
                                {availableFemalesForSweeping.map(w => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.line} - {getWorkerAttendance(w.id) === "present" ? "Có mặt" : "Vắng mặt"})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="p-6 space-y-3">
                              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                                Công nhân đang trực quét dọn ({ (currentDuty.sweeperIds || []).length }):
                              </h5>
                              <div className="space-y-2">
                                {(currentDuty.sweeperIds || []).map((id: string) => {
                                  const worker = workers.find(w => w.id === id);
                                  if (!worker) return null;
                                  const attStatus = getWorkerAttendance(id);
                                  return (
                                    <div key={id} className="flex items-center justify-between p-3 rounded-2xl border border-rose-50 bg-rose-50/10 hover:bg-rose-50/20 transition-all">
                                      <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs uppercase">
                                          {worker.name.split(" ").pop()?.[0]}
                                        </div>
                                        <div>
                                          <p className="text-sm font-bold text-gray-900">{worker.name}</p>
                                          <p className="text-[10px] text-gray-400 font-semibold uppercase">
                                            Chuyền {worker.line} • {attStatus === "present" ? "🟢 Đi làm" : "🔴 Nghỉ"}
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleRemoveSweeper(id)}
                                        className="text-gray-300 hover:text-rose-500 p-2 rounded-xl transition-colors cursor-pointer"
                                        title="Gỡ"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                  );
                                })}
                                {(currentDuty.sweeperIds || []).length === 0 && (
                                  <div className="text-center py-8 border border-dashed border-gray-100 rounded-2xl text-xs text-gray-400 font-medium italic">
                                    Chưa phân công ai quét dọn hôm nay
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col justify-between min-h-[400px]">
                          <div>
                            <div className="p-6 bg-gradient-to-r from-blue-500/5 to-blue-500/10 border-b border-blue-50/50 flex justify-between items-start">
                              <div>
                                <span className="inline-block bg-blue-100 border border-blue-200 text-blue-700 font-black text-[10px] px-2.5 py-0.5 rounded-md uppercase tracking-wider mb-2">
                                  Nhiệm vụ 2: Thu gom & Đổ rác
                                </span>
                                <h4 className="text-xl font-bold font-serif italic text-gray-950 flex items-center gap-1.5">
                                  🚛 Đổ rác cơ sở & phế thải
                                </h4>
                                <p className="text-xs text-blue-700/80 font-bold mt-1">
                                  ⚠️ Chỉ phân công Công nhân Nam
                                </p>
                              </div>
                              <div className="h-10 w-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 font-bold">
                                ♂️
                              </div>
                            </div>

                            <div className="p-6 border-b border-gray-100 bg-gray-50/30">
                              <label className="block text-[10px] font-black uppercase text-gray-400 tracking-wider mb-2">
                                Thêm thủ công (Công nhân Nam):
                              </label>
                              <select
                                onChange={(e) => {
                                  handleAddTrashCollector(e.target.value);
                                  e.target.value = "";
                                }}
                                className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold outline-none bg-white focus:ring-1 focus:ring-blue-500 text-gray-700"
                              >
                                <option value="">Chọn công nhân Nam...</option>
                                {availableMalesForTrash.map(w => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.line} - {getWorkerAttendance(w.id) === "present" ? "Có mặt" : "Vắng mặt"})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="p-6 space-y-3">
                              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                                Công nhân đang trực đổ rác ({ (currentDuty.trashCollectorIds || []).length }):
                              </h5>
                              <div className="space-y-2">
                                {(currentDuty.trashCollectorIds || []).map((id: string) => {
                                  const worker = workers.find(w => w.id === id);
                                  if (!worker) return null;
                                  const attStatus = getWorkerAttendance(id);
                                  return (
                                    <div key={id} className="flex items-center justify-between p-3 rounded-2xl border border-blue-50 bg-blue-50/10 hover:bg-blue-50/20 transition-all">
                                      <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs uppercase">
                                          {worker.name.split(" ").pop()?.[0]}
                                        </div>
                                        <div>
                                          <p className="text-sm font-bold text-gray-900">{worker.name}</p>
                                          <p className="text-[10px] text-gray-400 font-semibold uppercase">
                                            Chuyền {worker.line} • {attStatus === "present" ? "🟢 Đi làm" : "🔴 Nghỉ"}
                                          </p>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleRemoveTrashCollector(id)}
                                        className="text-gray-300 hover:text-blue-500 p-2 rounded-xl transition-colors cursor-pointer"
                                        title="Gỡ"
                                      >
                                        <X size={16} />
                                      </button>
                                    </div>
                                  );
                                })}
                                {(currentDuty.trashCollectorIds || []).length === 0 && (
                                  <div className="text-center py-8 border border-dashed border-gray-100 rounded-2xl text-xs text-gray-400 font-medium italic">
                                    Chưa phân công ai đổ rác hôm nay
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {dutySubTab === "lines_status" && (() => {
                    const allUniqueLines = Array.from(new Set([
                      ...lines,
                      ...workers.map(w => w.line).filter(Boolean)
                    ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

                    const filteredLines = allUniqueLines.filter(l => {
                      const status = getLineDutyStatus(l);
                      const matchSearch = !lineStatusSearch || l.toLowerCase().includes(lineStatusSearch.toLowerCase());
                      const matchStatus = lineStatusFilter === "Tất cả" || status === lineStatusFilter;
                      return matchSearch && matchStatus;
                    });

                    const handleMarkAllLines = async (status: "Rồi" | "Chưa") => {
                      if (window.confirm && !window.confirm(`Bạn có chắc muốn đánh dấu TẤT CẢ các chuyền là "${status}"?`)) {
                        return;
                      }
                      for (const l of allUniqueLines) {
                        const recordId = `${dutyDate}_${l.replace(/\s+/g, '_')}`;
                        await setDocToFirestore("lineDuties", recordId, {
                          date: dutyDate,
                          line: l,
                          status: status
                        });
                      }
                      alert(`Đã đánh dấu tất cả các chuyền là "${status}"!`);
                    };

                    const handleSetLineDutyStatus = async (lineName: string, status: "Rồi" | "Chưa") => {
                      const recordId = `${dutyDate}_${lineName.replace(/\s+/g, '_')}`;
                      await setDocToFirestore("lineDuties", recordId, {
                        date: dutyDate,
                        line: lineName,
                        status: status
                      });
                    };

                    return (
                      <div className="space-y-6">
                        {/* Filter Bar */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-auto flex-1 max-w-2xl">
                            <input
                              type="text"
                              placeholder="Tìm kiếm chuyền..."
                              value={lineStatusSearch}
                              onChange={(e) => setLineStatusSearch(e.target.value)}
                              className="p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                            />
                            
                            <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-150">
                              {(["Tất cả", "Rồi", "Chưa"] as const).map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => setLineStatusFilter(opt)}
                                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    lineStatusFilter === opt
                                      ? "bg-white text-indigo-600 shadow-sm"
                                      : "text-gray-400 hover:text-gray-600"
                                  }`}
                                >
                                  {opt === "Tất cả" ? "Tất cả" : opt === "Rồi" ? "Đã trực" : "Chưa trực"}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => handleMarkAllLines("Rồi")}
                              className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                            >
                              ✓ Tất cả đã trực
                            </button>
                            <button
                              onClick={() => handleMarkAllLines("Chưa")}
                              className="px-3.5 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer active:scale-95"
                            >
                              ✗ Reset chưa trực
                            </button>
                          </div>
                        </div>

                        {/* List Table */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">
                              Danh sách chuyền trực nhật ({filteredLines.length})
                            </h4>
                            <span className="text-xs font-bold text-indigo-600">
                              Ngày: {safeFormatDate(dutyDate, "dd/MM/yyyy")}
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead className="bg-gray-50/20 border-b border-gray-100">
                                <tr>
                                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[20%]">Chuyền</th>
                                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[20%]">Tỷ lệ đi làm</th>
                                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[35%]">Nhân sự trực hôm nay</th>
                                  <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-[25%]">Trạng thái trực nhật</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {filteredLines.map(lineName => {
                                  const status = getLineDutyStatus(lineName);
                                  
                                  const lineWorkers = workers.filter(w => w.line === lineName);
                                  const linePresent = lineWorkers.filter(w => getWorkerAttendance(w.id) === "present").length;
                                  
                                  const lineSweepers = (currentDuty.sweeperIds || [])
                                    .map(id => workers.find(w => w.id === id))
                                    .filter((w): w is Worker => !!w && w.line === lineName);
                                    
                                  const lineTrash = (currentDuty.trashCollectorIds || [])
                                    .map(id => workers.find(w => w.id === id))
                                    .filter((w): w is Worker => !!w && w.line === lineName);

                                  return (
                                    <tr key={lineName} className="hover:bg-gray-50/40 transition-colors group">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                          <div className="h-7 w-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-xs text-indigo-700">
                                            {lineName.replace(/\D/g, '') || "CN"}
                                          </div>
                                          <span className="text-sm font-bold text-gray-900">{lineName}</span>
                                        </div>
                                      </td>
                                      
                                      <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                                            <span>{linePresent}/{lineWorkers.length} đi làm</span>
                                            <span>{lineWorkers.length > 0 ? Math.round((linePresent / lineWorkers.length) * 100) : 0}%</span>
                                          </div>
                                          <div className="w-24 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                            <div
                                              className="bg-indigo-600 h-full transition-all"
                                              style={{ width: `${lineWorkers.length > 0 ? (linePresent / lineWorkers.length) * 100 : 0}%` }}
                                            />
                                          </div>
                                        </div>
                                      </td>

                                      <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1 text-xs">
                                          {lineSweepers.length > 0 && (
                                            <div className="flex items-center gap-1 text-rose-600 font-medium">
                                              <span>🧹 Quét:</span>
                                              <span className="font-bold">{lineSweepers.map(w => w.name).join(", ")}</span>
                                            </div>
                                          )}
                                          {lineTrash.length > 0 && (
                                            <div className="flex items-center gap-1 text-blue-600 font-medium">
                                              <span>🚛 Rác:</span>
                                              <span className="font-bold">{lineTrash.map(w => w.name).join(", ")}</span>
                                            </div>
                                          )}
                                          {lineSweepers.length === 0 && lineTrash.length === 0 && (
                                            <span className="text-gray-400 italic">Chưa phân công ai thuộc chuyền này</span>
                                          )}
                                        </div>
                                      </td>

                                      <td className="px-6 py-4 text-center">
                                        <div className="inline-flex bg-gray-50 p-1 rounded-xl border border-gray-150">
                                          <button
                                            onClick={() => handleSetLineDutyStatus(lineName, "Chưa")}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                                              status === "Chưa"
                                                ? "bg-rose-600 text-white shadow-sm"
                                                : "text-gray-400 hover:text-gray-600"
                                            }`}
                                          >
                                            Chưa
                                          </button>
                                          <button
                                            onClick={() => handleSetLineDutyStatus(lineName, "Rồi")}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                                              status === "Rồi"
                                                ? "bg-emerald-600 text-white shadow-sm"
                                                : "text-gray-400 hover:text-gray-600"
                                            }`}
                                          >
                                            Rồi
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {filteredLines.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="text-center py-12 text-gray-400 text-sm italic">
                                      Không tìm thấy chuyền nào phù hợp bộ lọc
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {dutySubTab === "calendar" && (() => {
                    const [yStr, mStr] = calendarYearMonth.split("-");
                    const year = parseInt(yStr);
                    const month = parseInt(mStr) - 1;

                    const firstDayOfMonth = new Date(year, month, 1);
                    const startDayOfWeek = firstDayOfMonth.getDay();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const prevMonthDays = new Date(year, month, 0).getDate();

                    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

                    const cells = [];
                    for (let i = 0; i < adjustedStartDay; i++) {
                      cells.push({ isCurrentMonth: false, dayNum: prevMonthDays - adjustedStartDay + i + 1 });
                    }
                    for (let i = 1; i <= daysInMonth; i++) {
                      cells.push({ isCurrentMonth: true, dayNum: i });
                    }

                    const daysOfWeek = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

                    const monthlyDuties = duties.filter(d => d.date && d.date.startsWith(calendarYearMonth));

                    const workerDutyCounts = workers.map(worker => {
                      let sweepCount = 0;
                      let trashCount = 0;
                      monthlyDuties.forEach(d => {
                        if (d.sweeperIds?.includes(worker.id)) sweepCount++;
                        if (d.trashCollectorIds?.includes(worker.id)) trashCount++;
                      });
                      const totalCount = sweepCount + trashCount;
                      return {
                        ...worker,
                        sweepCount,
                        trashCount,
                        totalCount
                      };
                    });

                    const workersWithDuty = workerDutyCounts.filter(w => w.totalCount > 0).sort((a, b) => b.totalCount - a.totalCount);
                    const workersWithoutDuty = workerDutyCounts.filter(w => w.totalCount === 0).sort((a, b) => a.line.localeCompare(b.line, undefined, { numeric: true }));

                    return (
                      <div className="space-y-6">
                        {/* Month Picker Controls */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                              📅 Báo cáo &amp; Lịch Trực Nhật tháng {mStr}/{yStr}
                            </h4>
                            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
                              Tổng quan tần suất trực nhật và phân phối công việc tháng
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handlePrevMonth}
                              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all cursor-pointer"
                              title="Tháng trước"
                            >
                              <ChevronLeft size={18} />
                            </button>
                            <input
                              type="month"
                              value={calendarYearMonth}
                              onChange={(e) => setCalendarYearMonth(e.target.value)}
                              className="p-2 px-3 rounded-xl border border-gray-200 text-xs font-black bg-white text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              onClick={handleNextMonth}
                              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-all cursor-pointer"
                              title="Tháng sau"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                          {/* Calendar Grid */}
                          <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center justify-between border-b border-gray-50 pb-4">
                              <h5 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                                Lịch phân công trực nhật
                              </h5>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md">
                                Nhấp chọn ngày để sửa đổi lịch trực
                              </span>
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center">
                              {daysOfWeek.map((day, idx) => (
                                <div key={idx} className="text-xs font-bold text-gray-400 py-2">
                                  {day}
                                </div>
                              ))}

                              {cells.map((cell, idx) => {
                                if (!cell.isCurrentMonth) {
                                  return (
                                    <div
                                      key={`prev-${idx}`}
                                      className="min-h-[85px] bg-gray-50/20 border border-gray-100/50 rounded-xl p-1.5 opacity-30 flex flex-col justify-between"
                                    >
                                      <span className="text-[10px] font-mono font-bold text-gray-400">{cell.dayNum}</span>
                                    </div>
                                  );
                                }

                                const dateStr = `${calendarYearMonth}-${String(cell.dayNum).padStart(2, "0")}`;
                                const dayDuty = duties.find(d => d.date === dateStr);
                                const sweepers = dayDuty?.sweeperIds || [];
                                const trashCollectors = dayDuty?.trashCollectorIds || [];
                                const hasAnyDuty = sweepers.length > 0 || trashCollectors.length > 0;
                                const isToday = dateStr === format(new Date(), "yyyy-MM-dd");
                                const isSelected = dateStr === dutyDate;

                                return (
                                  <div
                                    key={`curr-${idx}`}
                                    onClick={() => {
                                      setDutyDate(dateStr);
                                      setDutySubTab("schedule");
                                    }}
                                    className={`min-h-[90px] border rounded-2xl p-2 flex flex-col justify-between cursor-pointer transition-all hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50/10 group ${
                                      isToday
                                        ? "bg-amber-50/30 border-amber-300 ring-2 ring-amber-300/30"
                                        : isSelected
                                          ? "bg-indigo-50/50 border-indigo-400"
                                          : "bg-white border-gray-100"
                                    }`}
                                  >
                                    <div className="flex justify-between items-center">
                                      <span className={`text-xs font-extrabold font-mono ${
                                        isToday 
                                          ? "text-amber-700 font-black bg-amber-100 px-1.5 py-0.5 rounded-lg" 
                                          : "text-gray-500"
                                      }`}>
                                        {cell.dayNum}
                                      </span>
                                      {hasAnyDuty && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                                      )}
                                    </div>

                                    <div className="space-y-1 mt-1.5">
                                      {sweepers.map(id => {
                                        const w = workers.find(work => work.id === id);
                                        if (!w) return null;
                                        return (
                                          <div
                                            key={`sw-${id}`}
                                            className="text-[9.5px] bg-rose-50 text-rose-700 border border-rose-100 font-extrabold px-1.5 py-0.5 rounded-lg truncate flex items-center gap-0.5"
                                            title={`Quét dọn: ${w.name} (${w.code}) - ${w.line}`}
                                          >
                                            <span>🧹</span>
                                            <span className="truncate block w-full font-sans font-bold text-[8.5px]">{w.name}</span>
                                          </div>
                                        );
                                      })}
                                      {trashCollectors.map(id => {
                                        const w = workers.find(work => work.id === id);
                                        if (!w) return null;
                                        return (
                                          <div
                                            key={`tc-${id}`}
                                            className="text-[9.5px] bg-blue-50 text-blue-700 border border-blue-100 font-extrabold px-1.5 py-0.5 rounded-lg truncate flex items-center gap-0.5"
                                            title={`Đổ rác: ${w.name} (${w.code}) - ${w.line}`}
                                          >
                                            <span>🚛</span>
                                            <span className="truncate block w-full font-sans font-bold text-[8.5px]">{w.name}</span>
                                          </div>
                                        );
                                      })}
                                      {!hasAnyDuty && (
                                        <div className="text-[8px] text-gray-300 italic py-1 group-hover:text-indigo-400 transition-colors">
                                          Trống...
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Overview Stats lists */}
                          <div className="lg:col-span-2 space-y-6">
                            {/* Haven't done duty */}
                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[220px]">
                              <div>
                                <div className="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
                                  <h5 className="text-xs font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                                    ⚠️ Chưa trực nhật tháng này ({workersWithoutDuty.length})
                                  </h5>
                                  <span className="text-[10px] text-gray-400 font-bold">
                                    Ưu tiên phân công
                                  </span>
                                </div>

                                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                                  {workersWithoutDuty.map(w => (
                                    <div
                                      key={`noduty-${w.id}`}
                                      className="flex items-center justify-between p-2 rounded-xl bg-amber-50/30 border border-amber-100/50 text-xs hover:bg-amber-50 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="bg-white border border-amber-200 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded">
                                          {w.line}
                                        </span>
                                        <span className="font-bold text-gray-950">{w.name} <span className="font-mono text-[10px] text-gray-400 font-semibold">({w.code})</span></span>
                                      </div>
                                      <span className="text-[10px] font-semibold text-gray-400 uppercase">
                                        {w.gender === "nam" ? "♂️ Nam" : "♀️ Nữ"}
                                      </span>
                                    </div>
                                  ))}
                                  {workersWithoutDuty.length === 0 && (
                                    <div className="text-center py-6 text-xs text-gray-400 italic">
                                      Tất cả công nhân đã được trực nhật tháng này! 👏
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Have done duty */}
                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[220px]">
                              <div>
                                <div className="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
                                  <h5 className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                                    🟢 Đã trực nhật tháng này ({workersWithDuty.length})
                                  </h5>
                                  <span className="text-[10px] text-gray-400 font-bold">
                                    Số lần trực nhật
                                  </span>
                                </div>

                                <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                                  {workersWithDuty.map(w => (
                                    <div
                                      key={`hasduty-${w.id}`}
                                      className="flex items-center justify-between p-2 rounded-xl bg-emerald-50/20 border border-emerald-100/50 text-xs hover:bg-emerald-50/40 transition-colors"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="bg-white border border-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded">
                                          {w.line}
                                        </span>
                                        <span className="font-bold text-gray-900">{w.name} <span className="font-mono text-[10px] text-gray-400 font-semibold">({w.code})</span></span>
                                      </div>
                                      
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-gray-400">
                                          {w.sweepCount > 0 && `🧹${w.sweepCount}`}
                                          {w.sweepCount > 0 && w.trashCount > 0 && " • "}
                                          {w.trashCount > 0 && `🚛${w.trashCount}`}
                                        </span>
                                        <span className="bg-emerald-100 text-emerald-800 font-black text-[10px] px-2 py-0.5 rounded-lg">
                                          {w.totalCount} lần
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                  {workersWithDuty.length === 0 && (
                                    <div className="text-center py-6 text-xs text-gray-400 italic">
                                      Chưa có ai trực nhật trong tháng này.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {dutySubTab === "meeting" && (
                    <div className="space-y-6">
                      {/* Sub-tabs: Họp Công Nhân & Họp Công ty */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 gap-1">
                          <button
                            onClick={() => {
                              setMeetingSubTab("worker");
                              setIsAddingMeeting(false);
                              setEditingMeetingId(null);
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              meetingSubTab === "worker"
                                ? "bg-white text-indigo-600 shadow-sm"
                                : "text-gray-400 hover:text-gray-600"
                            }`}
                          >
                            Họp Công Nhân
                          </button>
                          <button
                            onClick={() => {
                              setMeetingSubTab("company");
                              setIsAddingMeeting(false);
                              setEditingMeetingId(null);
                            }}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              meetingSubTab === "company"
                                ? "bg-white text-indigo-600 shadow-sm"
                                : "text-gray-400 hover:text-gray-600"
                            }`}
                          >
                            Họp Công ty
                          </button>
                        </div>

                        {!isAddingMeeting && !editingMeetingId && (
                          <button
                            onClick={() => {
                              setMeetingForm({
                                title: "",
                                content: "",
                                date: format(new Date(), "yyyy-MM-dd")
                              });
                              setIsAddingMeeting(true);
                            }}
                            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
                          >
                            + Thêm cuộc họp
                          </button>
                        )}
                      </div>

                      {/* Add / Edit Form */}
                      {(isAddingMeeting || editingMeetingId) && (
                        <div className="bg-white p-6 rounded-2xl border border-gray-150 shadow-sm space-y-4">
                          <h4 className="text-sm font-bold uppercase tracking-wider text-indigo-950">
                            {editingMeetingId ? "Sửa ghi chú cuộc họp" : `Thêm cuộc họp mới (${meetingSubTab === "worker" ? "Họp Công Nhân" : "Họp Công ty"})`}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">Ngày họp</label>
                              <input
                                type="date"
                                value={meetingForm.date}
                                onChange={(e) => setMeetingForm({ ...meetingForm, date: e.target.value })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">Tiêu đề cuộc họp</label>
                              <input
                                type="text"
                                value={meetingForm.title}
                                onChange={(e) => setMeetingForm({ ...meetingForm, title: e.target.value })}
                                placeholder="Nhập tiêu đề hoặc chủ đề..."
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">Nội dung cuộc họp</label>
                            <textarea
                              rows={8}
                              value={meetingForm.content}
                              onChange={(e) => setMeetingForm({ ...meetingForm, content: e.target.value })}
                              placeholder="Nhập nội dung chi tiết cuộc họp, quyết định, lưu ý..."
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-semibold text-gray-700 outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white resize-y"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              onClick={() => {
                                setIsAddingMeeting(false);
                                setEditingMeetingId(null);
                              }}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl cursor-pointer transition-all"
                            >
                              Hủy
                            </button>
                            <button
                              onClick={async () => {
                                if (!meetingForm.title.trim() || !meetingForm.content.trim()) {
                                  alert("Vui lòng điền đầy đủ tiêu đề và nội dung cuộc họp");
                                  return;
                                }
                                const payload = {
                                  date: meetingForm.date,
                                  title: meetingForm.title,
                                  content: meetingForm.content,
                                  type: meetingSubTab
                                };
                                if (editingMeetingId) {
                                  await updateDocInFirestore("meetings", editingMeetingId, payload);
                                  setEditingMeetingId(null);
                                } else {
                                  await addDocToFirestore("meetings", payload);
                                  setIsAddingMeeting(false);
                                }
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl cursor-pointer transition-all"
                            >
                              Lưu lại
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Search Bar & List */}
                      {!isAddingMeeting && !editingMeetingId && (
                        <div className="space-y-4">
                          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2.5">
                            <span className="text-gray-400 mr-2 text-xs font-bold uppercase">Tìm kiếm:</span>
                            <input
                              type="text"
                              value={meetingSearch}
                              onChange={(e) => setMeetingSearch(e.target.value)}
                              placeholder="Tìm theo tiêu đề hoặc nội dung cuộc họp..."
                              className="flex-1 bg-transparent border-none text-xs text-indigo-950 font-bold placeholder-gray-400 outline-none"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            {meetings
                              .filter(m => m.type === meetingSubTab)
                              .filter(m => {
                                if (!meetingSearch.trim()) return true;
                                const search = meetingSearch.toLowerCase();
                                return m.title.toLowerCase().includes(search) || m.content.toLowerCase().includes(search);
                              })
                              .sort((a, b) => b.date.localeCompare(a.date))
                              .map(m => (
                                <div key={m.id} className="bg-white p-5 rounded-2xl border border-gray-150 shadow-sm relative group hover:border-indigo-200 transition-all">
                                  <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-3">
                                    <div>
                                      <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 font-black text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg mb-2">
                                        📅 {m.date}
                                      </span>
                                      <h5 className="text-base font-extrabold text-indigo-950 leading-snug">
                                        {m.title}
                                      </h5>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setMeetingForm({
                                            title: m.title,
                                            content: m.content,
                                            date: m.date
                                          });
                                          setEditingMeetingId(m.id);
                                        }}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                      >
                                        Sửa
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (confirm("Bạn có chắc chắn muốn xóa ghi chú cuộc họp này không?")) {
                                            await deleteDocFromFirestore("meetings", m.id);
                                          }
                                        }}
                                        className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                      >
                                        Xóa
                                      </button>
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-600 leading-relaxed font-medium whitespace-pre-wrap bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    {m.content}
                                  </div>
                                </div>
                              ))}

                            {meetings.filter(m => m.type === meetingSubTab).length === 0 && (
                              <div className="bg-white py-12 text-center rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400 italic">
                                Chưa có ghi chú cuộc họp nào cho mục này.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {dutySubTab === "stats" && (() => {
                    const filteredWorkers = workers.filter(w => !statsLine || w.line === statsLine);

                    // --- HELPERS ---
                    const getWeekDates = (dateStr: string): string[] => {
                      const current = new Date(dateStr);
                      const day = current.getDay();
                      const diff = current.getDate() - day + (day === 0 ? -6 : 1);
                      const monday = new Date(current.setDate(diff));
                      
                      const dates: string[] = [];
                      for (let i = 0; i < 7; i++) {
                        const d = new Date(monday);
                        d.setDate(monday.getDate() + i);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, "0");
                        const dayNum = String(d.getDate()).padStart(2, "0");
                        dates.push(`${y}-${m}-${dayNum}`);
                      }
                      return dates;
                    };

                    const getMonthDates = (yearMonthStr: string): string[] => {
                      const [yStr, mStr] = yearMonthStr.split("-");
                      const year = parseInt(yStr);
                      const month = parseInt(mStr) - 1;
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const dates: string[] = [];
                      for (let i = 1; i <= daysInMonth; i++) {
                        const dayNum = String(i).padStart(2, "0");
                        dates.push(`${year}-${mStr}-${dayNum}`);
                      }
                      return dates;
                    };

                    const safeFormatDate = (dateStr: string, fmtStr: string) => {
                      try {
                        return format(new Date(dateStr), fmtStr);
                      } catch {
                        return dateStr;
                      }
                    };

                    // --- DAILY CALCULATIONS ---
                    const dailyAttendance = filteredWorkers.map(w => {
                      const rec = attendance.find(a => a.date === statsDate && a.workerId === w.id);
                      return {
                        worker: w,
                        status: rec?.status || "present",
                        leaveType: rec?.leaveType || "",
                        reason: rec?.reason || "",
                        timeValue: rec?.timeValue || "",
                        timeValueEnd: rec?.timeValueEnd || ""
                      };
                    });

                    const dailyStats = {
                      total: dailyAttendance.length,
                      present: dailyAttendance.filter(a => a.status === "present").length,
                      late: dailyAttendance.filter(a => a.status === "late").length,
                      gatePass: dailyAttendance.filter(a => a.status === "gate_pass").length,
                      excused: dailyAttendance.filter(a => a.status === "absent" && a.leaveType === "co_phep").length,
                      unexcused: dailyAttendance.filter(a => a.status === "absent" && a.leaveType === "khong_phep").length,
                      absentTotal: dailyAttendance.filter(a => a.status === "absent").length,
                    };

                    const dailyExceptions = dailyAttendance.filter(a => a.status !== "present");

                    // Daily Line Breakdown
                    const dailyLineBreakdown = lines.map(l => {
                      const lineWorkers = workers.filter(w => w.line === l);
                      const lineAtt = lineWorkers.map(w => {
                        const rec = attendance.find(a => a.date === statsDate && a.workerId === w.id);
                        return rec?.status || "present";
                      });

                      const total = lineWorkers.length;
                      const present = lineAtt.filter(s => s === "present").length;
                      const late = lineAtt.filter(s => s === "late").length;
                      const gatePass = lineAtt.filter(s => s === "gate_pass").length;
                      const absent = lineAtt.filter(s => s === "absent").length;
                      const active = present + late + gatePass;
                      const rate = total > 0 ? Math.round((active / total) * 100) : 0;

                      return {
                        line: l,
                        total,
                        present,
                        late,
                        gatePass,
                        absent,
                        rate
                      };
                    }).filter(item => item.total > 0);

                    // --- WEEKLY CALCULATIONS ---
                    const weekDates = getWeekDates(statsWeekRefDate);
                    
                    // Filter attendance dates in this week that have at least one record
                    const weekActiveDates = weekDates.filter(d => attendance.some(a => a.date === d));
                    const weekDatesToUse = weekActiveDates.length > 0 ? weekActiveDates : weekDates.filter(d => d <= format(new Date(), "yyyy-MM-dd"));

                    // Weekly stats accumulators
                    let weeklyPresentCount = 0;
                    let weeklyLateCount = 0;
                    let weeklyGatePassCount = 0;
                    let weeklyExcusedCount = 0;
                    let weeklyUnexcusedCount = 0;
                    let weeklyAbsentCount = 0;

                    // Worker weekly score cards
                    const workerWeeklyScores = filteredWorkers.map(w => {
                      let present = 0;
                      let late = 0;
                      let gatePass = 0;
                      let excused = 0;
                      let unexcused = 0;

                      weekDates.forEach(d => {
                        const rec = attendance.find(a => a.date === d && a.workerId === w.id);
                        const status = rec?.status || "present";
                        if (status === "present") present++;
                        else if (status === "late") late++;
                        else if (status === "gate_pass") gatePass++;
                        else if (status === "absent") {
                          if (rec?.leaveType === "co_phep") excused++;
                          else unexcused++;
                        }
                      });

                      const totalDays = weekDates.length;
                      const activeDays = present + late + gatePass;
                      const rate = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

                      return {
                        worker: w,
                        present,
                        late,
                        gatePass,
                        excused,
                        unexcused,
                        absent: excused + unexcused,
                        rate
                      };
                    });

                    // Aggregate weekly
                    workerWeeklyScores.forEach(score => {
                      weeklyPresentCount += score.present;
                      weeklyLateCount += score.late;
                      weeklyGatePassCount += score.gatePass;
                      weeklyExcusedCount += score.excused;
                      weeklyUnexcusedCount += score.unexcused;
                      weeklyAbsentCount += score.absent;
                    });

                    const totalWeeklyPossible = filteredWorkers.length * weekDates.length;
                    const weeklyAttendanceRate = totalWeeklyPossible > 0 
                      ? Math.round(((weeklyPresentCount + weeklyLateCount + weeklyGatePassCount) / totalWeeklyPossible) * 100)
                      : 0;

                    // Week daily trend data for Recharts
                    const weekTrendData = weekDates.map((d, index) => {
                      const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
                      const label = `${dayNames[index]} (${safeFormatDate(d, "dd/MM")})`;
                      
                      const dayAtt = filteredWorkers.map(w => {
                        return attendance.find(a => a.date === d && a.workerId === w.id)?.status || "present";
                      });

                      const total = filteredWorkers.length;
                      const present = dayAtt.filter(s => s === "present").length;
                      const late = dayAtt.filter(s => s === "late").length;
                      const gatePass = dayAtt.filter(s => s === "gate_pass").length;
                      const active = present + late + gatePass;
                      const rate = total > 0 ? Math.round((active / total) * 100) : 100;

                      return {
                        name: label,
                        "Tỷ lệ đi làm (%)": rate,
                        "Đi trễ": dayAtt.filter(s => s === "late").length,
                        "Nghỉ làm": dayAtt.filter(s => s === "absent").length,
                      };
                    });

                    // Top absentees/latecomers of the week
                    const weeklyExceptionsList = workerWeeklyScores
                      .filter(s => s.absent > 0 || s.late > 0)
                      .sort((a, b) => (b.absent * 2 + b.late) - (a.absent * 2 + a.late))
                      .slice(0, 5);

                    // --- MONTHLY CALCULATIONS ---
                    const monthDates = getMonthDates(statsMonth);
                    const monthActiveDates = monthDates.filter(d => attendance.some(a => a.date === d));
                    const monthDatesToUse = monthActiveDates.length > 0 
                      ? monthActiveDates 
                      : monthDates.filter(d => d <= format(new Date(), "yyyy-MM-dd"));

                    // Worker monthly scorecard
                    const workerMonthlyScores = filteredWorkers.map(w => {
                      let present = 0;
                      let late = 0;
                      let gatePass = 0;
                      let excused = 0;
                      let unexcused = 0;

                      monthDatesToUse.forEach(d => {
                        const rec = attendance.find(a => a.date === d && a.workerId === w.id);
                        const status = rec?.status || "present";
                        if (status === "present") present++;
                        else if (status === "late") late++;
                        else if (status === "gate_pass") gatePass++;
                        else if (status === "absent") {
                          if (rec?.leaveType === "co_phep") excused++;
                          else unexcused++;
                        }
                      });

                      const totalDays = monthDatesToUse.length;
                      const activeDays = present + late + gatePass;
                      const rate = totalDays > 0 ? Math.round((activeDays / totalDays) * 100) : 0;

                      return {
                        worker: w,
                        present,
                        late,
                        gatePass,
                        excused,
                        unexcused,
                        absent: excused + unexcused,
                        rate
                      };
                    });

                    let monthlyPresentCount = 0;
                    let monthlyLateCount = 0;
                    let monthlyGatePassCount = 0;
                    let monthlyExcusedCount = 0;
                    let monthlyUnexcusedCount = 0;

                    workerMonthlyScores.forEach(score => {
                      monthlyPresentCount += score.present;
                      monthlyLateCount += score.late;
                      monthlyGatePassCount += score.gatePass;
                      monthlyExcusedCount += score.excused;
                      monthlyUnexcusedCount += score.unexcused;
                    });

                    const totalMonthlyPossible = filteredWorkers.length * monthDatesToUse.length;
                    const monthlyAttendanceRate = totalMonthlyPossible > 0
                      ? Math.round(((monthlyPresentCount + monthlyLateCount + monthlyGatePassCount) / totalMonthlyPossible) * 100)
                      : 0;

                    // Monthly daily trend data for Recharts (limit to dates to use for better visualization)
                    const monthTrendData = monthDatesToUse.map(d => {
                      const dayLabel = safeFormatDate(d, "dd/MM");
                      const dayAtt = filteredWorkers.map(w => {
                        return attendance.find(a => a.date === d && a.workerId === w.id)?.status || "present";
                      });

                      const total = filteredWorkers.length;
                      const active = dayAtt.filter(s => s === "present" || s === "late" || s === "gate_pass").length;
                      const rate = total > 0 ? Math.round((active / total) * 100) : 100;

                      return {
                        date: dayLabel,
                        "Tỷ lệ %": rate,
                        "Đi trễ": dayAtt.filter(s => s === "late").length,
                        "Vắng": dayAtt.filter(s => s === "absent").length,
                      };
                    });

                    // Search and filter on Scorecard
                    const searchedMonthlyScores = workerMonthlyScores.filter(s => {
                      const q = statsSearchWorker.toLowerCase();
                      const matchSearch = !q || s.worker.name.toLowerCase().includes(q) || s.worker.code.toLowerCase().includes(q);
                      return matchSearch;
                    });

                    return (
                      <div className="space-y-6">
                        {/* Period & Filter bar */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 self-start">
                            <button
                              onClick={() => setStatsPeriod("day")}
                              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                                statsPeriod === "day"
                                  ? "bg-white text-indigo-600 shadow-sm"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <Activity size={14} /> Thống kê Ngày
                            </button>
                            <button
                              onClick={() => setStatsPeriod("week")}
                              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                                statsPeriod === "week"
                                  ? "bg-white text-indigo-600 shadow-sm"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <CalendarRange size={14} /> Thống kê Tuần
                            </button>
                            <button
                              onClick={() => setStatsPeriod("month")}
                              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                                statsPeriod === "month"
                                  ? "bg-white text-indigo-600 shadow-sm"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <PieChart size={14} /> Thống kê Tháng
                            </button>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            {/* Dynamic period inputs */}
                            {statsPeriod === "day" && (
                              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                                <span className="text-[10px] font-bold text-gray-500 pl-2 uppercase">Chọn ngày:</span>
                                <input
                                  type="date"
                                  value={statsDate}
                                  onChange={(e) => setStatsDate(e.target.value)}
                                  className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                />
                              </div>
                            )}

                            {statsPeriod === "week" && (
                              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                                <span className="text-[10px] font-bold text-gray-500 pl-2 uppercase">Ngày tham chiếu tuần:</span>
                                <input
                                  type="date"
                                  value={statsWeekRefDate}
                                  onChange={(e) => setStatsWeekRefDate(e.target.value)}
                                  className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                />
                              </div>
                            )}

                            {statsPeriod === "month" && (
                              <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                                <span className="text-[10px] font-bold text-gray-500 pl-2 uppercase">Chọn tháng:</span>
                                <input
                                  type="month"
                                  value={statsMonth}
                                  onChange={(e) => setStatsMonth(e.target.value)}
                                  className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-900 outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 p-1.5 rounded-xl">
                              <span className="text-[10px] font-bold text-gray-500 pl-2 uppercase">Chuyền:</span>
                              <select
                                value={statsLine}
                                onChange={(e) => setStatsLine(e.target.value)}
                                className="bg-white border border-gray-200 rounded-lg p-1.5 text-xs font-bold text-indigo-950 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                              >
                                <option value="">Tất cả chuyền</option>
                                {lines.map(l => (
                                  <option key={l} value={l}>{l}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* ============================================== */}
                        {/* ============= DAILY STATS RENDER ============= */}
                        {/* ============================================== */}
                        {statsPeriod === "day" && (
                          <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                  <Users size={20} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Tổng số nhân sự</span>
                                  <span className="text-2xl font-black text-gray-900 font-mono">{dailyStats.total}</span>
                                </div>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                  <UserCheck size={20} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Có mặt đi làm</span>
                                  <span className="text-2xl font-black text-emerald-600 font-mono">{dailyStats.present}</span>
                                  <span className="text-[10px] text-gray-400 block font-medium">({dailyStats.total > 0 ? Math.round((dailyStats.present / dailyStats.total) * 100) : 0}%)</span>
                                </div>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                                  <Clock size={20} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Đi trễ / Đi muộn</span>
                                  <span className="text-2xl font-black text-amber-600 font-mono">{dailyStats.late}</span>
                                  <span className="text-[10px] text-gray-400 block font-medium">({dailyStats.total > 0 ? Math.round((dailyStats.late / dailyStats.total) * 100) : 0}%)</span>
                                </div>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                                  <ArrowUpRight size={20} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Ra cổng tạm thời</span>
                                  <span className="text-2xl font-black text-blue-600 font-mono">{dailyStats.gatePass}</span>
                                </div>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                                  <UserX size={20} />
                                </div>
                                <div>
                                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Vắng mặt (Tổng)</span>
                                  <span className="text-2xl font-black text-rose-600 font-mono">{dailyStats.absentTotal}</span>
                                  <span className="text-[10px] text-gray-400 block font-medium">Có phép: {dailyStats.excused} | Không: {dailyStats.unexcused}</span>
                                </div>
                              </div>
                            </div>

                            {/* Line breakdown chart & table */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 font-sans">
                                    <BarChart2 size={16} className="text-indigo-600" /> Biểu đồ so sánh tỷ lệ đi làm theo Chuyền (%)
                                  </h4>
                                </div>
                                <div className="h-[280px]">
                                  {dailyLineBreakdown.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                      <BarChart data={dailyLineBreakdown} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="line" tick={{ fontSize: 11, fontWeight: "bold" }} stroke="#9ca3af" />
                                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <Tooltip 
                                          contentStyle={{ borderRadius: "12px", border: "150", fontSize: "11px" }}
                                        />
                                        <Bar dataKey="rate" name="Tỷ lệ đi làm (%)" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                                          {dailyLineBreakdown.map((entry, index) => {
                                            const colors = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];
                                            return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                          })}
                                        </Bar>
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-xs italic">
                                      Không có dữ liệu của chuyền nào.
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5 font-sans">
                                    <FileText size={16} className="text-indigo-600" /> Tóm tắt theo Chuyền
                                  </h4>
                                  <div className="space-y-3 overflow-y-auto max-h-[220px] pr-1">
                                    {dailyLineBreakdown.map(b => (
                                      <div key={b.line} className="flex items-center justify-between border-b border-gray-50 pb-2">
                                        <div>
                                          <span className="text-xs font-black text-gray-800 font-mono">{b.line}</span>
                                          <span className="text-[10px] text-gray-400 block font-medium">Sĩ số: {b.total} | Vắng: {b.absent} | Trễ: {b.late}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                                            b.rate >= 95 ? "bg-emerald-50 text-emerald-700" : b.rate >= 85 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                                          }`}>
                                            {b.rate}%
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                    {dailyLineBreakdown.length === 0 && (
                                      <div className="text-center text-gray-400 text-xs py-12 italic">Không có dữ liệu chuyền</div>
                                    )}
                                  </div>
                                </div>
                                <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-50 text-[10px] text-indigo-900 leading-relaxed font-semibold mt-4">
                                  Tỷ lệ đi làm được tính dựa trên số công nhân hiện hữu (Có mặt + Trễ + Ra cổng) chia cho tổng sĩ số của chuyền đó.
                                </div>
                              </div>
                            </div>

                            {/* Exceptions Table */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <h4 className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5 font-sans">
                                  ⚠️ Danh sách bất thường trong ngày ({dailyExceptions.length})
                                </h4>
                                <span className="text-[10px] text-gray-400 font-bold uppercase font-mono">Ngày: {safeFormatDate(statsDate, "dd/MM/yyyy")}</span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left font-sans">
                                  <thead className="bg-gray-50/20 border-b border-gray-100">
                                    <tr>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mã CN</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Công nhân</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Chuyền</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trạng thái</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nghỉ có phép</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Thời gian ghi nhận</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lý do ghi chú</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {dailyExceptions.map(exc => (
                                      <tr key={exc.worker.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-3 text-xs font-mono font-bold text-gray-500">{exc.worker.code}</td>
                                        <td className="px-6 py-3 text-sm font-semibold text-gray-900">{exc.worker.name}</td>
                                        <td className="px-6 py-3 text-xs font-bold text-gray-600 font-mono">{exc.worker.line}</td>
                                        <td className="px-6 py-3">
                                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                            exc.status === "late" 
                                              ? "bg-amber-100 text-amber-800" 
                                              : exc.status === "gate_pass"
                                                ? "bg-blue-100 text-blue-800"
                                                : "bg-rose-100 text-rose-800"
                                          }`}>
                                            {exc.status === "late" ? "🟡 ĐI TRỄ" : exc.status === "gate_pass" ? "🔵 RA CỔNG" : "🔴 NGHỈ LÀM"}
                                          </span>
                                        </td>
                                        <td className="px-6 py-3">
                                          {exc.status === "absent" ? (
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                              exc.leaveType === "co_phep" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                                            }`}>
                                              {exc.leaveType === "co_phep" ? "CÓ PHÉP" : "KHÔNG PHÉP"}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300">-</span>
                                          )}
                                        </td>
                                        <td className="px-6 py-3 text-xs font-medium text-gray-500 font-mono">
                                          {exc.timeValue ? `${exc.timeValue} - ${exc.timeValueEnd || "17:00"}` : "-"}
                                        </td>
                                        <td className="px-6 py-3 text-xs text-gray-600 font-medium max-w-[200px] truncate" title={exc.reason}>
                                          {exc.reason || <span className="text-gray-300 italic">Không có lý do</span>}
                                        </td>
                                      </tr>
                                    ))}
                                    {dailyExceptions.length === 0 && (
                                      <tr>
                                        <td colSpan={7} className="text-center py-8 text-gray-400 text-xs italic">
                                          Hôm nay tuyệt vời! Không có trường hợp đi trễ hay vắng mặt nào.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ============================================== */}
                        {/* ============= WEEKLY STATS RENDER ============= */}
                        {/* ============================================== */}
                        {statsPeriod === "week" && (
                          <div className="space-y-6">
                            {/* Week Info Alert */}
                            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block">Tuần phân tích</span>
                                <span className="text-sm font-bold text-indigo-950 font-sans">
                                  Từ Thứ 2 ({safeFormatDate(weekDates[0], "dd/MM/yyyy")}) đến Chủ Nhật ({safeFormatDate(weekDates[6], "dd/MM/yyyy")})
                                </span>
                              </div>
                              <span className="text-xs bg-indigo-600 text-white font-black px-3 py-1 rounded-xl shadow-sm font-mono">
                                {weeklyAttendanceRate}% Chuyên cần tuần
                              </span>
                            </div>

                            {/* Weekly KPI Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tỷ lệ đi làm TB</span>
                                <h5 className="text-3xl font-black text-indigo-600 font-mono">{weeklyAttendanceRate}%</h5>
                                <div className="w-full bg-indigo-100 h-1.5 rounded-full mt-2">
                                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${weeklyAttendanceRate}%` }} />
                                </div>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tổng lượt đi trễ</span>
                                <h5 className="text-3xl font-black text-amber-600 font-mono">{weeklyLateCount} <span className="text-xs text-gray-400 font-semibold">lượt</span></h5>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold uppercase">Cần lưu ý nhắc nhở</p>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Nghỉ có phép tuần</span>
                                <h5 className="text-3xl font-black text-emerald-600 font-mono">{weeklyExcusedCount} <span className="text-xs text-gray-400 font-semibold">lượt</span></h5>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold uppercase">Được duyệt đúng quy trình</p>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Nghỉ không phép tuần</span>
                                <h5 className="text-3xl font-black text-rose-600 font-mono">{weeklyUnexcusedCount} <span className="text-xs text-gray-400 font-semibold">lượt</span></h5>
                                <p className="text-[10px] text-rose-500 mt-1 font-black uppercase">⚠️ Cần lập biên bản kỷ luật</p>
                              </div>
                            </div>

                            {/* Charts & Top lists */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-1.5 font-sans">
                                  <TrendingUp size={16} className="text-indigo-600" /> Biểu đồ xu hướng chuyên cần trong tuần (%)
                                </h4>
                                <div className="h-[280px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={weekTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                      <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: "bold" }} stroke="#9ca3af" />
                                      <YAxis domain={[50, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                      <Tooltip contentStyle={{ borderRadius: "12px", border: "150", fontSize: "11px" }} />
                                      <Line 
                                        type="monotone" 
                                        dataKey="Tỷ lệ đi làm (%)" 
                                        stroke="#4f46e5" 
                                        strokeWidth={3} 
                                        dot={{ r: 5 }} 
                                        activeDot={{ r: 8 }} 
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5 text-rose-700 font-sans">
                                    <AlertTriangle size={16} /> Các trường hợp vắng/trễ nhiều tuần này
                                  </h4>
                                  <div className="space-y-3 overflow-y-auto max-h-[220px]">
                                    {weeklyExceptionsList.map(exc => (
                                      <div key={exc.worker.id} className="flex items-center justify-between border-b border-gray-50 pb-2">
                                        <div>
                                          <span className="text-xs font-bold text-gray-900">{exc.worker.name}</span>
                                          <span className="text-[10px] text-gray-400 font-mono block">Mã: {exc.worker.code} | Chuyền: {exc.worker.line}</span>
                                        </div>
                                        <div className="text-right flex flex-col items-end">
                                          <span className="text-[11px] font-black text-rose-600 font-mono">Vắng: {exc.excused + exc.unexcused} ngày</span>
                                          <span className="text-[10px] text-amber-600 font-bold">Trễ: {exc.late} lần</span>
                                        </div>
                                      </div>
                                    ))}
                                    {weeklyExceptionsList.length === 0 && (
                                      <div className="text-center text-gray-400 text-xs py-12 italic">Không có trường hợp bất thường lặp lại trong tuần.</div>
                                    )}
                                  </div>
                                </div>
                                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-50 text-[10px] text-amber-900 leading-relaxed font-semibold mt-4">
                                  Hệ thống tự động chấm điểm và cảnh báo những nhân viên có tần suất nghỉ hoặc đi trễ cao trong tuần này để người quản lý có kế hoạch điều động nhân sự dự phòng.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* ============================================== */}
                        {/* ============= MONTHLY STATS RENDER ============= */}
                        {/* ============================================== */}
                        {statsPeriod === "month" && (
                          <div className="space-y-6">
                            {/* Monthly Summary Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Hiệu suất đi làm tháng</span>
                                <h5 className="text-3xl font-black text-indigo-600 font-mono">{monthlyAttendanceRate}%</h5>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold">Tỷ lệ bình quân cả tháng</p>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tổng ngày có dữ liệu</span>
                                <h5 className="text-3xl font-black text-emerald-600 font-mono">{monthDatesToUse.length} <span className="text-xs text-gray-400 font-semibold">ngày</span></h5>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold">Số ngày đã cập nhật điểm danh</p>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tỷ lệ đi muộn tháng</span>
                                <h5 className="text-3xl font-black text-amber-600 font-mono">
                                  {totalMonthlyPossible > 0 ? Math.round((monthlyLateCount / totalMonthlyPossible) * 1000) / 10 : 0}%
                                </h5>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold">Tỷ lệ số lượt đi muộn trên tổng số công</p>
                              </div>

                              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Tỷ lệ vắng không phép</span>
                                <h5 className="text-3xl font-black text-rose-600 font-mono">
                                  {totalMonthlyPossible > 0 ? Math.round((monthlyUnexcusedCount / totalMonthlyPossible) * 1000) / 10 : 0}%
                                </h5>
                                <p className="text-[10px] text-gray-400 mt-1 font-semibold">Tỷ lệ số ngày nghỉ không phép</p>
                              </div>
                            </div>

                            {/* Line Chart Monthly Trend */}
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                              <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-1.5 font-sans">
                                <TrendingUp size={16} className="text-indigo-600" /> Biểu đồ chuyên cần hàng ngày trong tháng {safeFormatDate(statsMonth + "-01", "MM/yyyy")}
                              </h4>
                              <div className="h-[250px]">
                                {monthTrendData.length > 0 ? (
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={monthTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                      <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#9ca3af" />
                                      <YAxis domain={[70, 100]} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                      <Tooltip contentStyle={{ borderRadius: "12px", border: "150", fontSize: "11px" }} />
                                      <Line 
                                        type="monotone" 
                                        dataKey="Tỷ lệ %" 
                                        stroke="#10b981" 
                                        strokeWidth={2.5} 
                                        dot={false}
                                        activeDot={{ r: 6 }} 
                                      />
                                    </LineChart>
                                  </ResponsiveContainer>
                                ) : (
                                  <div className="h-full flex items-center justify-center text-gray-400 text-xs italic">
                                    Chưa có bất kỳ dữ liệu điểm danh nào trong tháng này.
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Monthly Attendance Scorecard */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden font-sans">
                              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">
                                    📊 BẢNG CÔNG &amp; CHUYÊN CẦN THÁNG ({searchedMonthlyScores.length} Công nhân)
                                  </h4>
                                  <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5 font-sans">Thống kê tích lũy dựa trên số ngày chấm công thực tế</p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                    <input
                                      type="text"
                                      placeholder="Tìm tên, mã..."
                                      value={statsSearchWorker}
                                      onChange={(e) => setStatsSearchWorker(e.target.value)}
                                      className="p-2 pl-9 rounded-xl border border-gray-200 text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none bg-white text-gray-800"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left font-sans">
                                  <thead className="bg-gray-50/20 border-b border-gray-100 font-sans">
                                    <tr>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mã CN</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Họ và Tên</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Chuyền</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">🟢 Có mặt</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">🟡 Đi trễ</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">🔵 Ra cổng</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">🔵 Có phép</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">🔴 Không phép</th>
                                      <th className="px-6 py-3.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center font-sans">Tỷ lệ chuyên cần</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 font-medium text-xs text-gray-700">
                                    {searchedMonthlyScores.map(score => (
                                      <tr key={score.worker.id} className="hover:bg-gray-50/40 transition-colors">
                                        <td className="px-6 py-3 font-mono font-bold text-gray-500">{score.worker.code}</td>
                                        <td className="px-6 py-3 font-semibold text-gray-900">{score.worker.name}</td>
                                        <td className="px-6 py-3 font-bold text-gray-600 font-mono">{score.worker.line}</td>
                                        <td className="px-6 py-3 text-center font-bold text-emerald-600 font-mono">{score.present} d</td>
                                        <td className="px-6 py-3 text-center font-bold text-amber-600 font-mono">{score.late} d</td>
                                        <td className="px-6 py-3 text-center font-bold text-blue-600 font-mono">{score.gatePass} d</td>
                                        <td className="px-6 py-3 text-center font-bold text-indigo-600 font-mono">{score.excused} d</td>
                                        <td className="px-6 py-3 text-center font-bold text-rose-600 font-mono">{score.unexcused} d</td>
                                        <td className="px-6 py-3 text-center font-sans">
                                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                            score.rate >= 95 ? "bg-emerald-50 text-emerald-700" : score.rate >= 85 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"
                                          }`}>
                                            {score.rate}%
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                    {searchedMonthlyScores.length === 0 && (
                                      <tr>
                                        <td colSpan={9} className="text-center py-12 text-gray-400 italic font-sans">
                                          Không tìm thấy công nhân phù hợp bộ lọc tìm kiếm.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })()}

            {activeTab === "utilities" && (
              <motion.div
                key="utilities"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <UtilitiesTab
                  workers={workers}
                  operations={operations}
                  orders={orders}
                  logs={logs}
                  timeStudyRecords={timeStudyRecords}
                  lines={lines}
                  onImportWorkers={handleImportWorkers}
                  onImportOperations={handleImportOperations}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Navigation (Mobile & Desktop) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 flex justify-around items-center h-20 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] backdrop-blur-lg bg-white/90">
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as Tab)}
            className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-1 transition-all ${
              activeTab === item.id
                ? "text-indigo-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <div
              className={`p-2 rounded-xl transition-all ${activeTab === item.id ? "bg-indigo-50 scale-110" : ""}`}
            >
              <item.icon size={20} />
            </div>
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-normal sm:tracking-wide">
              {item.label}
            </span>
            {activeTab === item.id && (
              <motion.div
                layoutId="nav-pill"
                className="absolute -top-[1px] w-8 h-1 bg-indigo-600 rounded-full"
              />
            )}
          </button>
        ))}
      </nav>

      {/* Plan Image Zoom Modal Overlay */}
      <AnimatePresence>
        {activeZoomedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActiveZoomedPlan(null)}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-zoom-out"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative max-w-4xl w-full max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setActiveZoomedPlan(null)}
                className="absolute top-4 right-4 bg-gray-900/80 hover:bg-gray-900 text-white h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer shadow-md z-10"
              >
                <X size={18} />
              </button>
              <div className="w-full h-full flex items-center justify-center overflow-auto max-h-[85vh]">
                <img
                  src={activeZoomedPlan}
                  alt="Bảng kế hoạch"
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[80vh] object-contain rounded-lg select-none"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Worker Transfer Modal */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold shadow-sm">
                    <ArrowLeftRight size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black font-serif italic text-gray-900">
                      Điều chuyển công nhân
                    </h3>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                      Thay đổi tổ/chuyền may nhanh chóng ở tất cả các mục
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setTransferSearchQuery("");
                    setTransferSelectedLineFilter("");
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-500 h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer border-0"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                {/* Search & Filter Controls */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Tìm tên hoặc mã công nhân..."
                      value={transferSearchQuery}
                      onChange={(e) => setTransferSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 uppercase whitespace-nowrap">Lọc chuyền:</span>
                    <select
                      value={transferSelectedLineFilter}
                      onChange={(e) => setTransferSelectedLineFilter(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none bg-white cursor-pointer"
                    >
                      <option value="">Tất cả chuyền</option>
                      {lines.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Bulk Transfer Action Section */}
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3">
                  <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider flex items-center gap-1.5">
                    ⚡ Điều chuyển hàng loạt (Tác vụ nhanh)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-1">TỪ CHUYỀN</label>
                      <select
                        id="bulk-from-line"
                        className="w-full p-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                      >
                        <option value="">-- Chọn chuyền nguồn --</option>
                        {lines.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-500 block mb-1">SANG CHUYỀN</label>
                      <select
                        id="bulk-to-line"
                        className="w-full p-2 rounded-xl border border-gray-200 bg-white text-xs font-semibold focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer"
                      >
                        <option value="">-- Chọn chuyền đích --</option>
                        {lines.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={async () => {
                        const fromVal = (document.getElementById("bulk-from-line") as HTMLSelectElement)?.value;
                        const toVal = (document.getElementById("bulk-to-line") as HTMLSelectElement)?.value;
                        if (!fromVal || !toVal) {
                          alert("Vui lòng chọn cả chuyền nguồn và chuyền đích!");
                          return;
                        }
                        if (fromVal === toVal) {
                          alert("Chuyền nguồn và chuyền đích phải khác nhau!");
                          return;
                        }
                        const workersToMove = workers.filter((w) => w.line === fromVal);
                        if (workersToMove.length === 0) {
                          alert(`Không có công nhân nào thuộc "${fromVal}" để chuyển.`);
                          return;
                        }
                        if (window.confirm(`Bạn có chắc chắn muốn chuyển TOÀN BỘ ${workersToMove.length} công nhân từ "${fromVal}" sang "${toVal}"?`)) {
                          for (const w of workersToMove) {
                            await updateDocInFirestore("workers", w.id, { line: toVal });
                          }
                          alert(`Đã điều chuyển thành công ${workersToMove.length} công nhân sang "${toVal}"!`);
                        }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs uppercase tracking-wider py-2 px-3 rounded-xl transition-all cursor-pointer h-[38px] flex items-center justify-center gap-1 shadow-sm border-0"
                    >
                      <ArrowLeftRight size={13} /> Thực hiện
                    </button>
                  </div>
                </div>

                {/* Worker List Grid/Table */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-gray-400 tracking-widest mb-3">
                    Danh sách công nhân khớp bộ lọc
                  </h4>
                  <div className="border border-gray-100 rounded-2xl divide-y divide-gray-100 overflow-hidden max-h-[250px] overflow-y-auto font-sans">
                    {workers
                      .filter((w) => {
                        const matchSearch = !transferSearchQuery ||
                          w.name.toLowerCase().includes(transferSearchQuery.toLowerCase()) ||
                          w.code.toLowerCase().includes(transferSearchQuery.toLowerCase());
                        const matchLine = !transferSelectedLineFilter || w.line === transferSelectedLineFilter;
                        return matchSearch && matchLine;
                      })
                      .map((worker) => (
                        <div
                          key={worker.id}
                          className="flex items-center justify-between p-3 hover:bg-gray-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs uppercase">
                              {worker.name.split(" ").pop()?.[0]}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-900">{worker.name}</p>
                              <p className="text-[10px] font-semibold text-gray-400 font-mono">Code: {worker.code}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold uppercase text-gray-400">Chuyền hiện tại:</span>
                            <select
                              value={worker.line}
                              onChange={async (e) => {
                                await updateDocInFirestore("workers", worker.id, { line: e.target.value });
                              }}
                              className="text-[11px] font-extrabold px-2 py-1 rounded-lg border border-gray-200 bg-white cursor-pointer outline-none hover:bg-gray-50 text-indigo-600 font-mono"
                            >
                              {lines.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    {workers.filter((w) => {
                      const matchSearch = !transferSearchQuery ||
                        w.name.toLowerCase().includes(transferSearchQuery.toLowerCase()) ||
                        w.code.toLowerCase().includes(transferSearchQuery.toLowerCase());
                      const matchLine = !transferSelectedLineFilter || w.line === transferSelectedLineFilter;
                      return matchSearch && matchLine;
                    }).length === 0 && (
                      <div className="p-8 text-center text-xs text-gray-400 italic">
                        Không tìm thấy công nhân phù hợp bộ lọc
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                <button
                  onClick={() => {
                    setIsTransferModalOpen(false);
                    setTransferSearchQuery("");
                    setTransferSelectedLineFilter("");
                  }}
                  className="px-5 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
