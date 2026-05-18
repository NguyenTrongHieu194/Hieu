import React, { useState, useRef, useEffect } from 'react';
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
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logOut 
} from './lib/firebase';
import { 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
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
  Timestamp
} from 'firebase/firestore';
import { Worker, Operation, ProductionOrder, ProductionLog, TimeStudyRecord } from './types';
import { format } from 'date-fns';
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
  Cell
} from 'recharts';

type Tab = 'dashboard' | 'workers' | 'operations' | 'production' | 'planning' | 'timestudy';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Persistence State
  const [lines, setLines] = useState<string[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [timeStudyRecords, setTimeStudyRecords] = useState<TimeStudyRecord[]>([]);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
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
      return;
    }

    const userPath = `users/${user.uid}`;

    // Subscriptions
    const unsubLines = onSnapshot(collection(db, `${userPath}/lines`), (snap) => {
      const data = snap.docs.map(d => d.data().name as string);
      setLines(data.length > 0 ? data : ['Chuyền 1', 'Chuyền 2', 'Chuyền 3']);
    });

    const unsubWorkers = onSnapshot(collection(db, `${userPath}/workers`), (snap) => {
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Worker)));
    });

    const unsubOps = onSnapshot(collection(db, `${userPath}/operations`), (snap) => {
      setOperations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Operation)));
    });

    const unsubOrders = onSnapshot(collection(db, `${userPath}/orders`), (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionOrder)));
    });

    const unsubLogs = onSnapshot(collection(db, `${userPath}/productionLogs`), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductionLog)));
    });

    const unsubTS = onSnapshot(collection(db, `${userPath}/timeStudies`), (snap) => {
      setTimeStudyRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimeStudyRecord)));
    });

    return () => {
      unsubLines();
      unsubWorkers();
      unsubOps();
      unsubOrders();
      unsubLogs();
      unsubTS();
    };
  }, [user]);

  // Firestore Helpers
  const addDocToFirestore = async (col: string, data: any) => {
    if (!user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/${col}`), {
        ...data,
        userId: user.uid,
        createdAt: Timestamp.now()
      });
    } catch (e) {
      console.error(e);
      alert("Lỗi khi lưu dữ liệu lên đám mây.");
    }
  };

  const deleteDocFromFirestore = async (col: string, id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/${col}`, id));
    } catch (e) {
      console.error(e);
    }
  };

  const updateDocInFirestore = async (col: string, id: string, data: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/${col}`, id), data);
    } catch (e) {
      console.error(e);
    }
  };

  // UI State
  const [newLineName, setNewLineName] = useState('');
  const [workerFilterLine, setWorkerFilterLine] = useState('');
  const [opFilterStyle, setOpFilterStyle] = useState('');
  const [tsFilterLine, setTsFilterLine] = useState('');
  const [tsFilterOrder, setTsFilterOrder] = useState('');

  // Time Study State
  const [timeStudy, setTimeStudy] = useState({
    orderId: '',
    workerId: '',
    operationId: '',
    time1: 0,
    time2: 0,
    time3: 0,
  });

  // Form States
  const [newLog, setNewLog] = useState({
    line: lines[0] || 'Chuyền 1',
    orderId: orders[0]?.id || '',
    actualQuantity: 0,
    date: format(new Date(), 'yyyy-MM-dd')
  });

  const [newWorker, setNewWorker] = useState({ name: '', code: '', skills: '', line: '' });
  const [newOperation, setNewOperation] = useState({ name: '', code: '', style: '', sam: 0, target: 0 });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isExtractingWorker, setIsExtractingWorker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerFileInputRef = useRef<HTMLInputElement>(null);
  const [newOrder, setNewOrder] = useState({ customer: '', style: '', job: '', quantity: 0, deadline: '' });
  const [prodFilterLine, setProdFilterLine] = useState('');
  const [prodFilterOrder, setProdFilterOrder] = useState('');
  const [prodFilterDate, setProdFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const handleAddLine = async () => {
    if (!newLineName.trim() || !user) return;
    if (lines.includes(newLineName.trim())) return;
    
    try {
      await setDoc(doc(db, `users/${user.uid}/lines`, newLineName.trim()), {
        name: newLineName.trim(),
        userId: user.uid
      });
      setNewLineName('');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLine = async (lineName: string) => {
    if (!user) return;
    if (window.confirm(`Bạn có chắc chắn muốn xoá chuyền "${lineName}"?`)) {
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
      alert("Vui lòng chọn đầy đủ Chuyền, Mã hàng và SL > 0!");
      return;
    }

    const log: any = {
      date: date || format(new Date(), 'yyyy-MM-dd'),
      line,
      orderId,
      actualQuantity: qty,
      hour: new Date().getHours(),
      targetQuantity: 0 
    };

    await addDocToFirestore('productionLogs', log);
    
    // Update order progress
    const order = orders.find(o => o.id === orderId);
    if (order) {
      await updateDocInFirestore('orders', orderId, {
        producedQuantity: order.producedQuantity + qty,
        status: 'in_progress'
      });
    }

    setNewLog({ ...newLog, actualQuantity: 0 });
  };

  const handleDeleteLog = async (id: string) => {
    const logToDelete = logs.find(l => l.id === id);
    if (logToDelete && logToDelete.orderId) {
      const order = orders.find(o => o.id === logToDelete.orderId);
      if (order) {
        await updateDocInFirestore('orders', order.id, {
          producedQuantity: Math.max(0, order.producedQuantity - logToDelete.actualQuantity)
        });
      }
    }
    await deleteDocFromFirestore('productionLogs', id);
  };

  const handleAddWorker = async () => {
    if (!newWorker.name || !newWorker.code || !user) return;
    
    // Add to lines if not exists
    const lineName = newWorker.line.trim() || 'Chuyền 1';
    if (!lines.includes(lineName)) {
      await setDoc(doc(db, `users/${user.uid}/lines`, lineName), {
        name: lineName,
        userId: user.uid
      });
    }

    const worker = {
      name: newWorker.name,
      code: newWorker.code,
      skills: newWorker.skills.split(',').map(s => s.trim()),
      line: lineName,
      performance: 0
    };
    await addDocToFirestore('workers', worker);
    setNewWorker({ name: '', code: '', skills: '', line: '' });
  };

  const handleDeleteWorker = async (id: string) => {
    await deleteDocFromFirestore('workers', id);
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_SIZE = 1200;

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
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Quality 0.7 for good balance between size and OCR quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleWorkerFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsExtractingWorker(true);
    try {
      const base64 = await compressImage(file);
      const response = await fetch('/api/extract-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract worker data');
      }
      
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          const lineName = (item.line || newWorker.line || 'Chuyền 1').trim();
          if (!lines.includes(lineName)) {
            await setDoc(doc(db, `users/${user.uid}/lines`, lineName), {
              name: lineName,
              userId: user.uid
            });
          }

          const worker = {
            name: item.name || 'Unhamed Worker',
            code: item.code || 'CODE',
            skills: item.skills ? (typeof item.skills === 'string' ? item.skills.split(',').map((s: string) => s.trim()) : item.skills) : [],
            line: lineName,
            performance: 0
          };
          await addDocToFirestore('workers', worker);
        }
        alert(`Đã nhận diện và thêm ${data.length} công nhân thành công!`);
      } else {
        alert('Không tìm thấy dữ liệu công nhân trong hình ảnh.');
      }
    } catch (error: any) {
      console.error(error);
      alert(`Có lỗi xảy ra khi xử lý hình ảnh với AI: ${error.message}`);
    } finally {
      setIsExtractingWorker(false);
      if (workerFileInputRef.current) workerFileInputRef.current.value = '';
    }
  };

  const handleAddOperation = async () => {
    if (!newOperation.name || !newOperation.code) return;
    const op = {
      name: newOperation.name,
      code: newOperation.code,
      style: newOperation.style,
      sam: Number(newOperation.sam),
      targetPerHour: Number(newOperation.target)
    };
    await addDocToFirestore('operations', op);
    setNewOperation({ name: '', code: '', style: '', sam: 0, target: 0 });
  };

  const handleDeleteOperation = async (id: string) => {
    await deleteDocFromFirestore('operations', id);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsExtracting(true);
    try {
      const base64 = await compressImage(file);
      const response = await fetch('/api/extract-operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: 'image/jpeg' })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract data');
      }
      
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          const op = {
            name: item.name || 'Unhamed Operation',
            code: item.code || 'CODE',
            style: item.style || newOperation.style || '',
            sam: Number(item.sam) || 0,
            targetPerHour: Number(item.target) || 0
          };
          await addDocToFirestore('operations', op);
        }
        alert(`Đã nhận diện và thêm ${data.length} công đoạn thành công!`);
      } else {
        alert('Không tìm thấy dữ liệu công đoạn trong hình ảnh.');
      }
    } catch (error: any) {
      console.error(error);
      alert(`Có lỗi xảy ra khi xử lý hình ảnh với AI: ${error.message}`);
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      status: 'planning'
    };
    await addDocToFirestore('orders', order);
    setNewOrder({ customer: '', style: '', job: '', quantity: 0, deadline: '' });
  };

  const handleDeleteOrder = async (id: string) => {
    await deleteDocFromFirestore('orders', id);
  };

  const handleAddTimeStudyRecord = async () => {
    const validTimes = [timeStudy.time1, timeStudy.time2, timeStudy.time3].filter(t => t > 0);
    if (validTimes.length === 0 || !timeStudy.workerId || !timeStudy.operationId) {
      alert("Vui lòng nhập đầy đủ thông tin!");
      return;
    }

    const avgTimeObserved = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const avgTimeAdjusted = avgTimeObserved * 1.2;
    const outputPerHour = Math.round(3600 / avgTimeAdjusted);
    const outputPerDay = outputPerHour * 8;

    const record = {
      date: format(new Date(), 'yyyy-MM-dd HH:mm'),
      workerId: timeStudy.workerId,
      operationId: timeStudy.operationId,
      orderId: timeStudy.orderId,
      times: validTimes,
      averageTime: Number(avgTimeAdjusted.toFixed(2)),
      targetPerHour: outputPerHour,
      targetPerDay: outputPerDay
    };

    await addDocToFirestore('timeStudies', record);
    setTimeStudy({ ...timeStudy, time1: 0, time2: 0, time3: 0 });
    alert("Đã lưu kết quả nghiên cứu (đã cộng thêm 20% thời gian bù hao)!");
  };

  const handleDeleteTimeStudyRecord = async (id: string) => {
    await deleteDocFromFirestore('timeStudies', id);
  };

  // Sorting logic based on Line -> Order -> Operation -> Worker
  const getSortedLogs = () => {
    return [...logs].sort((a, b) => {
      const workerA = workers.find(w => w.id === a.workerId);
      const workerB = workers.find(w => w.id === b.workerId);
      const orderA = orders.find(o => o.id === a.orderId);
      const orderB = orders.find(o => o.id === b.orderId);
      const opA = operations.find(o => o.id === a.operationId);
      const opB = operations.find(o => o.id === b.operationId);

      // 1. Sort by Line
      const lineCompare = (workerA?.line || "").localeCompare(workerB?.line || "");
      if (lineCompare !== 0) return lineCompare;

      // 2. Sort by Order/Style
      const orderCompare = (orderA?.styleName || "").localeCompare(orderB?.styleName || "");
      if (orderCompare !== 0) return orderCompare;

      // 3. Sort by Operation
      const opCompare = (opA?.name || "").localeCompare(opB?.name || "");
      if (opCompare !== 0) return opCompare;

      // 4. Sort by Worker
      const workerCompare = (workerA?.name || "").localeCompare(workerB?.name || "");
      if (workerCompare !== 0) return workerCompare;

      // Default by time
      return b.hour - a.hour;
    });
  };

  const getProductionByLine = () => {
    const data: Record<string, number> = {};
    lines.forEach(l => data[l] = 0);
    logs.forEach((log: any) => {
      let line = log.line;
      if (!line && log.workerId) {
        line = workers.find(w => w.id === log.workerId)?.line;
      }
      if (line) {
        data[line] = (data[line] || 0) + log.actualQuantity;
      }
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  };

  const getSortedTimeStudyRecords = () => {
    return [...timeStudyRecords].sort((a, b) => {
      const workerA = workers.find(w => w.id === a.workerId);
      const workerB = workers.find(w => w.id === b.workerId);
      const orderA = orders.find(o => o.id === a.orderId);
      const orderB = orders.find(o => o.id === b.orderId);
      const opA = operations.find(o => o.id === a.operationId);
      const opB = operations.find(o => o.id === b.operationId);

      const lineCompare = (workerA?.line || "").localeCompare(workerB?.line || "");
      if (lineCompare !== 0) return lineCompare;

      const orderCompare = (orderA?.styleName || "").localeCompare(orderB?.styleName || "");
      if (orderCompare !== 0) return orderCompare;

      return (opA?.name || "").localeCompare(opB?.name || "");
    });
  };

  const getOrderBreakdown = (orderId: string) => {
    const breakdown: Record<string, number> = {};
    logs.filter(l => l.orderId === orderId).forEach((log: any) => {
      let line = log.line;
      if (!line && log.workerId) {
        line = workers.find(w => w.id === log.workerId)?.line;
      }
      line = line || 'N/A';
      breakdown[line] = (breakdown[line] || 0) + log.actualQuantity;
    });
    return Object.entries(breakdown).map(([line, produced]) => ({
      line,
      produced
    }));
  };

  const getDailyProductionSummary = () => {
    const summary: Record<string, {
      date: string;
      orderId: string;
      line: string;
      dailyQty: number;
    }> = {};

    logs.filter(log => log.orderId).forEach((log: any) => {
      // Use log.line if it exists (new manual entries), else fallback to worker line (legacy)
      let line = log.line;
      if (!line && log.workerId) {
        const worker = workers.find(w => w.id === log.workerId);
        line = worker?.line;
      }
      line = line || 'N/A';
      
      const key = `${log.date}-${log.orderId}-${line}`;

      if (!summary[key]) {
        summary[key] = {
          date: log.date,
          orderId: log.orderId || '',
          line,
          dailyQty: 0
        };
      }
      summary[key].dailyQty += log.actualQuantity;
    });

    return Object.values(summary)
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'workers', label: 'Công nhân', icon: Users },
    { id: 'operations', label: 'Công đoạn', icon: Settings },
    { id: 'production', label: 'Sản lượng', icon: TrendingUp },
    { id: 'planning', label: 'Kế hoạch', icon: Calendar },
    { id: 'timestudy', label: 'Bấm giờ SAM', icon: Clock },
  ];

  const totalOrdered = orders.reduce((acc, order) => acc + order.orderQuantity, 0);
  const totalActual = orders.reduce((acc, order) => acc + order.producedQuantity, 0);
  const overallProgress = totalOrdered > 0 ? (totalActual / totalOrdered) * 100 : 0;
  const recentLogs = logs.slice(-10).reverse();

  return (
    <div className="min-h-screen bg-[#FDFDFF] text-gray-900 font-sans pb-24 md:pb-8 pt-16">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-100 z-50 px-6 flex items-center justify-between shadow-sm backdrop-blur-md bg-white/80">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100 rotate-3">
            <Scissors className="text-white" size={18} />
          </div>
          <h1 className="text-lg font-black font-serif italic tracking-tighter text-indigo-900 uppercase">Garment Ops</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{format(new Date(), 'dd/MM/yyyy')}</p>
            {user && <p className="text-[10px] text-indigo-600 font-bold">{user.email}</p>}
          </div>
          {user ? (
            <button 
              onClick={logOut}
              className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-rose-50 hover:text-rose-600 transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
              title="Đăng xuất"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Đăng xuất</span>
            </button>
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
                <h2 className="text-3xl font-black text-gray-900 font-serif italic mb-2 tracking-tight">Chào mừng bạn!</h2>
                <p className="text-gray-500 text-sm font-medium">Đăng nhập để lưu trữ dữ liệu sản xuất và đồng bộ trên mọi thiết bị.</p>
              </div>
              <button 
                onClick={signInWithGoogle}
                className="w-full py-4 px-6 rounded-2xl bg-white border-2 border-gray-100 hover:border-indigo-600 transition-all flex items-center justify-center gap-4 text-gray-700 font-black shadow-sm group"
              >
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5 group-hover:scale-110 transition-transform" alt="Google" />
                Tiếp tục với Google
              </button>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Hệ thống quản lý sản xuất may mặc hiện đại</p>
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
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Tổng sản lượng', value: totalActual, unit: 'sản phẩm', trend: '+12%', icon: TrendingUp, color: 'indigo' },
                    { label: 'Tiến độ chung', value: `${overallProgress.toFixed(1)}%`, unit: 'trên tổng đơn hàng', trend: 'Kế hoạch', icon: ArrowUpRight, color: 'emerald' },
                    { label: 'Số chuyền đang may', value: lines.length, unit: 'chuyền', trend: 'Ổn định', icon: Clock, color: 'amber' },
                    { label: 'Đơn hàng Nike', value: '24%', unit: 'tiến độ mã Hot', trend: '+3%', icon: CheckCircle2, color: 'rose' },
                  ].map((stat, i) => (
                    <div key={i} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                          <h3 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{stat.value}</h3>
                          <p className="mt-1 text-xs text-gray-400">{stat.unit}</p>
                        </div>
                        <div className={`rounded-xl p-3 ${
                          stat.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
                          stat.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                          stat.color === 'amber' ? 'bg-amber-50 text-amber-600' :
                          'bg-rose-50 text-rose-600'
                        }`}>
                          <stat.icon size={24} />
                        </div>
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <span className={`text-xs font-semibold ${stat.trend.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {stat.trend}
                        </span>
                        <span className="text-xs text-gray-400">so với hôm qua</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900 italic font-serif">Sản lượng theo Chuyền</h3>
                      <div className="flex gap-4">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                          Thực tế (sản phẩm)
                        </span>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getProductionByLine()}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                          <XAxis 
                            dataKey="name" 
                            stroke="#9CA3AF" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false}
                          />
                          <YAxis 
                            stroke="#9CA3AF" 
                            fontSize={12} 
                            tickLine={false} 
                            axisLine={false} 
                          />
                          <Tooltip 
                            cursor={{ fill: '#F9FAFB' }}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                          />
                          <Bar dataKey="value" fill="#6366F1" radius={[8, 8, 0, 0]} barSize={40}>
                            {getProductionByLine().map((entry, index) => (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={index % 2 === 0 ? '#6366F1' : '#8B5CF6'} 
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <h3 className="mb-6 text-lg font-bold text-gray-900 italic font-serif">Phân bổ Công nhân</h3>
                    <div className="space-y-4">
                      {workers.slice(0, 5).map((worker, i) => (
                        <div key={i} className="flex items-center justify-between group cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs uppercase tracking-tighter">
                              {worker.name.split(' ').pop()?.[0]}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{worker.name}</p>
                              <p className="text-xs text-gray-500">{worker.code}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-gray-900">{worker.performance}%</p>
                            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-gray-100">
                              <div 
                                className={`h-full ${worker.performance > 90 ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                                style={{ width: `${worker.performance}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="mt-6 w-full rounded-xl bg-gray-50 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
                      Xem tất cả công nhân
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'workers' && (
              <motion.div
                key="workers"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold font-serif italic">Thêm công nhân mới</h3>
                    <div className="flex items-center gap-2">
                       <input 
                         type="file" 
                         ref={workerFileInputRef} 
                         className="hidden" 
                         accept="image/*,.pdf" 
                         onChange={handleWorkerFileUpload} 
                       />
                       <button 
                         onClick={() => workerFileInputRef.current?.click()}
                         disabled={isExtractingWorker}
                         className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                       >
                         {isExtractingWorker ? (
                           <Loader2 className="animate-spin" size={16} />
                         ) : (
                           <FileUp size={16} />
                         )}
                         {isExtractingWorker ? 'Đang xử lý AI...' : 'Tải ảnh/tệp AI'}
                       </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input 
                      placeholder="Tên công nhân"
                      value={newWorker.name}
                      onChange={e => setNewWorker({...newWorker, name: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input 
                      placeholder="Mã CN"
                      value={newWorker.code}
                      onChange={e => setNewWorker({...newWorker, code: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input 
                      placeholder="Chuyền"
                      value={newWorker.line}
                      onChange={e => setNewWorker({...newWorker, line: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <input 
                      placeholder="Kỹ năng"
                      value={newWorker.skills}
                      onChange={e => setNewWorker({...newWorker, skills: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button 
                      onClick={handleAddWorker}
                      className="bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={18} /> Thêm
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm overflow-x-auto">
                  <div className="p-6 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase text-gray-400 tracking-widest">Danh sách công nhân</h4>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold text-gray-400 uppercase">Lọc theo chuyền:</span>
                       <select 
                         value={workerFilterLine}
                         onChange={(e) => setWorkerFilterLine(e.target.value)}
                         className="text-xs p-2 rounded-lg border border-gray-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500"
                       >
                         <option value="">Tất cả chuyền</option>
                         {lines.map(l => <option key={l} value={l}>{l}</option>)}
                       </select>
                    </div>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-gray-50/30 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Mã CN</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Họ và Tên</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kỹ năng</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Chuyền</th>
                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workers
                        .filter(w => !workerFilterLine || w.line === workerFilterLine)
                        .map((worker) => (
                        <tr key={worker.id} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-6 py-4 text-sm font-mono text-gray-500 font-bold">{worker.code}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs uppercase">
                                {worker.name.split(' ').pop()?.[0]}
                              </div>
                              <span className="text-sm font-semibold text-gray-900">{worker.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {worker.skills.map((skill, idx) => (
                                <span key={idx} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{worker.line}</td>
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

            {activeTab === 'operations' && (
              <motion.div
                key="operations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold font-serif italic">Định mức Công đoạn</h3>
                    <div className="flex items-center gap-2">
                       <input 
                         type="file" 
                         ref={fileInputRef} 
                         className="hidden" 
                         accept="image/*,.pdf" 
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
                         {isExtracting ? 'Đang xử lý AI...' : 'Tải ảnh/tệp AI'}
                       </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <input 
                      placeholder="Tên công đoạn"
                      value={newOperation.name}
                      onChange={e => setNewOperation({...newOperation, name: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      placeholder="Mã CĐ"
                      value={newOperation.code}
                      onChange={e => setNewOperation({...newOperation, code: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      placeholder="Mã hàng / Style"
                      value={newOperation.style}
                      onChange={e => setNewOperation({...newOperation, style: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      type="number"
                      placeholder="SAM (phút)"
                      value={newOperation.sam || ''}
                      onChange={e => setNewOperation({...newOperation, sam: Number(e.target.value)})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      type="number"
                      placeholder="Mục tiêu/h"
                      value={newOperation.target || ''}
                      onChange={e => setNewOperation({...newOperation, target: Number(e.target.value)})}
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
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Bộ lọc theo mã hàng:</span>
                    <select 
                      value={opFilterStyle}
                      onChange={(e) => setOpFilterStyle(e.target.value)}
                      className="text-sm p-2 px-4 rounded-xl border border-gray-200 bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    >
                      <option value="">Tất cả mã hàng</option>
                      {Array.from(new Set(operations.map(op => op.style).filter(Boolean))).map(style => (
                        <option key={style} value={style}>{style}</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs text-gray-400">
                    Sản lượng đang may: <span className="font-bold text-indigo-600">{operations.filter(op => !opFilterStyle || op.style === opFilterStyle).length}</span> công đoạn
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {operations
                    .filter(op => !opFilterStyle || op.style === opFilterStyle)
                    .map((op) => (
                    <div key={op.id} className="bg-white p-6 rounded-2xl border border-gray-100 hover:border-indigo-300 transition-all shadow-sm group relative">
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
                      <h4 className="text-lg font-bold text-gray-900 uppercase tracking-tight">{op.name}</h4>
                      <div className="mt-6 flex items-center justify-between border-t border-gray-50 pt-4">
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Định mức SAM</p>
                          <p className="text-xl font-bold font-mono text-gray-900">{op.sam} <span className="text-sm font-normal text-gray-500 uppercase">phút</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase text-gray-400 font-bold tracking-widest">Mục tiêu/Giờ</p>
                          <p className="text-xl font-bold font-mono text-gray-900">{op.targetPerHour} <span className="text-sm font-normal text-gray-500 uppercase">sp</span></p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'production' && (
              <motion.div
                key="production"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="space-y-6"
              >
                 <div className="grid grid-cols-1 gap-6">
                    {/* Simplified Manual Input */}
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-8">
                           <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Plus size={24} />
                           </div>
                           <h3 className="text-xl font-bold font-serif italic text-indigo-900">Ghi nhận sản lượng thủ công</h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                           <div className="space-y-2">
                             <label className="text-xs font-black uppercase text-gray-400 tracking-widest">1. Chọn Chuyền</label>
                             <select 
                               value={newLog.line}
                               onChange={(e) => setNewLog({ ...newLog, line: e.target.value })}
                               className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 text-sm font-bold"
                             >
                               {lines.map(l => <option key={l} value={l}>{l}</option>)}
                             </select>
                           </div>

                           <div className="space-y-2">
                             <label className="text-xs font-black uppercase text-gray-400 tracking-widest">2. Chọn Mã hàng / Style</label>
                             <select 
                               value={newLog.orderId}
                               onChange={(e) => setNewLog({ ...newLog, orderId: e.target.value })}
                               className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-gray-50/50 text-sm font-bold"
                             >
                               <option value="">-- Chọn đơn hàng --</option>
                               {orders.map(o => (
                                 <option key={o.id} value={o.id}>{o.styleName} - {o.customer}</option>
                               ))}
                             </select>
                           </div>

                           <div className="space-y-2">
                             <label className="text-xs font-black uppercase text-gray-400 tracking-widest">3. Số lượng may được</label>
                             <input 
                               type="number" 
                               value={newLog.actualQuantity || ''}
                               onChange={(e) => setNewLog({ ...newLog, actualQuantity: Number(e.target.value) })}
                               className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-indigo-50/20 text-xl font-black text-indigo-600 text-center" 
                               placeholder="0" 
                             />
                           </div>

                           <div className="space-y-2">
                             <label className="text-xs font-black uppercase text-gray-400 tracking-widest">4. Chọn ngày ghi nhận</label>
                             <input 
                               type="date" 
                               value={newLog.date}
                               onChange={(e) => setNewLog({ ...newLog, date: e.target.value })}
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
                       const order = orders.find(o => o.id === newLog.orderId);
                       if (!order) return null;
                       const totalProduced = logs
                        .filter(l => l.orderId === order.id)
                        .reduce((sum, l) => sum + l.actualQuantity, 0);
                       
                       return (
                         <>
                           <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Của Job phân bổ</p>
                             <p className="text-xl font-black text-gray-900">{order.orderQuantity} <span className="text-xs font-normal">sp</span></p>
                           </div>
                           <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm border-l-4 border-l-indigo-600">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng may được</p>
                             <p className="text-xl font-black text-indigo-600">{totalProduced} <span className="text-xs font-normal">sp</span></p>
                           </div>
                           <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm border-l-4 border-l-rose-500">
                             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Tổng còn lại</p>
                             <p className="text-xl font-black text-rose-500">{Math.max(0, order.orderQuantity - totalProduced)} <span className="text-xs font-normal">sp</span></p>
                           </div>
                         </>
                       );
                     })()}
                   </motion.div>
                 )}

                 {/* Daily Production Summary Table */}
                 <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-gray-50 pb-6">
                       <h4 className="text-sm font-black uppercase text-gray-400 tracking-widest">Báo cáo thực tế theo ngày</h4>
                       <div className="flex items-center gap-3 flex-wrap">
                          <select 
                            value={prodFilterDate}
                            onChange={(e) => setProdFilterDate(e.target.value)}
                            className="text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 font-bold"
                          >
                            <option value="">Tất cả ngày</option>
                            {Array.from(new Set(logs.map(l => l.date))).sort().reverse().map((d: string) => (
                              <option key={d} value={d}>{format(new Date(d), 'dd/MM/yyyy')}</option>
                            ))}
                          </select>
                          <select 
                            value={prodFilterLine}
                            onChange={(e) => setProdFilterLine(e.target.value)}
                            className="text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 font-bold"
                          >
                            <option value="">Tất cả chuyền</option>
                            {lines.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                          <select 
                            value={prodFilterOrder}
                            onChange={(e) => setProdFilterOrder(e.target.value)}
                            className="text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 font-bold"
                          >
                            <option value="">Tất cả mã hàng</option>
                            {orders.map(o => <option key={o.id} value={o.id}>{o.styleName}</option>)}
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
                            <th className="pb-4 px-2 text-center">Tổng may được</th>
                            <th className="pb-4 px-2 text-center">Còn lại</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {getDailyProductionSummary()
                            .filter(s => {
                              const matchDate = !prodFilterDate || s.date === prodFilterDate;
                              const matchLine = !prodFilterLine || s.line === prodFilterLine;
                              const matchOrder = !prodFilterOrder || s.orderId === prodFilterOrder;
                              return matchDate && matchLine && matchOrder;
                            })
                            .map((summary) => {
                              const order = orders.find(o => o.id === summary.orderId);
                              const totalStyleProduced = logs
                                .filter(l => l.orderId === summary.orderId)
                                .reduce((sum, current) => sum + current.actualQuantity, 0);
                              
                              return (
                                <tr key={`${summary.date}-${summary.orderId}-${summary.line}`} className="hover:bg-indigo-50/20 transition-colors">
                                  <td className="py-5 px-2">
                                    <p className="text-xs font-black text-gray-700">{format(new Date(summary.date), 'dd/MM/yyyy')}</p>
                                  </td>
                                  <td className="py-5 px-2">
                                    <span className="bg-indigo-50 text-indigo-600 text-[10px] font-black px-2 py-1 rounded-lg">
                                      {summary.line}
                                    </span>
                                  </td>
                                  <td className="py-5 px-2">
                                    <p className="text-xs font-black text-indigo-900">{order?.styleName || 'N/A'}</p>
                                    <p className="text-[10px] text-gray-400 font-bold">Job: {order?.job || '-'}</p>
                                  </td>
                                  <td className="py-5 px-2 text-center">
                                    <p className="text-sm font-black text-gray-900">{order?.orderQuantity || 0}</p>
                                  </td>
                                  <td className="py-5 px-2 text-center">
                                    <p className="text-sm font-black text-indigo-600 font-mono">{totalStyleProduced}</p>
                                  </td>
                                  <td className="py-5 px-2 text-center">
                                    <p className="text-sm font-black text-rose-500 font-mono">
                                      {Math.max(0, (order?.orderQuantity || 0) - totalStyleProduced)}
                                    </p>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                 </div>
              </motion.div>
            )}

            {activeTab === 'planning' && (
              <motion.div
                key="planning"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                  <h3 className="text-xl font-bold font-serif italic mb-4">Lập đơn hàng mới</h3>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <input 
                      placeholder="Khách hàng"
                      value={newOrder.customer}
                      onChange={e => setNewOrder({...newOrder, customer: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      placeholder="Mã hàng / Style"
                      value={newOrder.style}
                      onChange={e => setNewOrder({...newOrder, style: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      placeholder="Job / Lệnh"
                      value={newOrder.job}
                      onChange={e => setNewOrder({...newOrder, job: e.target.value})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      type="number"
                      placeholder="Số lượng"
                      value={newOrder.quantity || ''}
                      onChange={e => setNewOrder({...newOrder, quantity: Number(e.target.value)})}
                      className="p-3 rounded-xl border border-gray-200 text-sm outline-none"
                    />
                    <input 
                      type="date"
                      value={newOrder.deadline}
                      onChange={e => setNewOrder({...newOrder, deadline: e.target.value})}
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
                    const progress = (order.producedQuantity / order.orderQuantity) * 100;
                    const breakdown = getOrderBreakdown(order.id);

                    return (
                      <div key={order.id} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all">
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
                               <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                 order.status === 'in_progress' ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'
                               }`}>
                                 {order.status === 'in_progress' ? 'Đang may' : 'Chờ kế hoạch'}
                               </span>
                             </div>
                           <p className="mt-3 text-xs text-gray-400 font-bold uppercase tracking-tight bg-gray-50 px-3 py-1 rounded-lg">Hạn giao: {order.deadline}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                          <div>
                            <h4 className="text-sm font-black text-indigo-600 uppercase tracking-widest mb-2">{order.customer}</h4>
                            <p className="text-3xl font-black text-gray-900 tracking-tight mb-2">{order.styleName}</p>
                            <div className="flex items-center gap-4 mb-8">
                               <span className="text-xs font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">Job: {order.job || 'N/A'}</span>
                               <span className="text-xs font-bold text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">Tổng SL: {order.orderQuantity} sp</span>
                            </div>

                            <div className="space-y-3">
                               <div className="flex justify-between text-xs font-black uppercase text-gray-400 font-mono">
                                 <span>Tiến độ tổng: {progress.toFixed(1)}%</span>
                                 <span>{order.producedQuantity} / {order.orderQuantity} sp</span>
                               </div>
                               <div className="h-4 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
                                 <motion.div 
                                   initial={{ width: 0 }}
                                   animate={{ width: `${progress}%` }}
                                   transition={{ duration: 1, ease: "easeOut" }}
                                   className={`h-full rounded-full shadow-sm ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                                 ></motion.div>
                               </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-8">
                               <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                 <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Cần may thêm</p>
                                 <p className="text-2xl font-black font-mono text-gray-900">{Math.max(0, order.orderQuantity - order.producedQuantity)}</p>
                               </div>
                               <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                 <p className="text-[10px] uppercase text-gray-400 font-black tracking-widest mb-1">Dự kiến hoàn thành</p>
                                 <p className="text-2xl font-black font-mono text-emerald-600">8 <span className="text-xs uppercase tracking-normal">ngày</span></p>
                               </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                             <h5 className="text-[10px] font-black uppercase text-gray-400 tracking-widest border-b border-gray-50 pb-2 flex items-center gap-2">
                               <Users size={12} /> Chi tiết theo chuyền may
                             </h5>
                             <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {breakdown.map((b) => (
                                  <div key={b.line} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-50 shadow-sm hover:border-indigo-100 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className="h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-[10px]">
                                        {b.line.replace('Chuyền ', '')}
                                      </div>
                                      <div>
                                        <p className="text-sm font-black text-gray-900">{b.line}</p>
                                        <p className="text-[10px] font-bold text-gray-400">Job: {order.job || '-'}</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-[9px] uppercase text-gray-400 font-black tracking-tighter mb-1">Đã may được</p>
                                      <p className="text-lg font-black text-indigo-600 font-mono leading-none">{b.produced}</p>
                                    </div>
                                  </div>
                                ))}
                                {breakdown.length === 0 && (
                                  <div className="h-32 flex flex-col items-center justify-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                    <p className="text-xs text-gray-400 italic">Chưa có chuyền nào nhận may</p>
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
            {activeTab === 'timestudy' && (
              <motion.div
                key="timestudy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm max-w-4xl mx-auto">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="h-12 w-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg">
                      <Clock size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold font-serif italic text-gray-900">Nghiên cứu thời gian (SAM Case)</h3>
                      <p className="text-sm text-gray-500">Nhập thời gian đo thực tế để tính toán năng suất dự kiến</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left: Input Info */}
                    <div className="space-y-6 bg-gray-50/50 p-6 rounded-2xl">
                       <div className="space-y-4">
                          <div>
                            <label className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-2 block">1. Mã hàng / Đơn hàng</label>
                            <select 
                              value={timeStudy.orderId}
                              onChange={e => setTimeStudy({...timeStudy, orderId: e.target.value})}
                              className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Chọn đơn hàng --</option>
                              {orders.map(o => <option key={o.id} value={o.id}>{o.styleName} ({o.customer})</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-2 block">2. Công nhân & Chuyền</label>
                            <select 
                              value={timeStudy.workerId}
                              onChange={e => setTimeStudy({...timeStudy, workerId: e.target.value})}
                              className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Chọn công nhân --</option>
                              {workers.map(w => <option key={w.id} value={w.id}>{w.name} - {w.line}</option>)}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs font-bold uppercase text-gray-400 tracking-widest mb-2 block">3. Công đoạn</label>
                            <select 
                              value={timeStudy.operationId}
                              onChange={e => setTimeStudy({...timeStudy, operationId: e.target.value})}
                              className="w-full p-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Chọn công đoạn --</option>
                              {operations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                          </div>
                       </div>
                    </div>

                    {/* Right: Time Measure Inputs */}
                    <div className="space-y-6">
                       <label className="text-xs font-bold uppercase text-gray-400 tracking-widest block">4. Kết quả đo (Giây)</label>
                       <div className="grid grid-cols-3 gap-4">
                          {['time1', 'time2', 'time3'].map((key, i) => (
                            <div key={key} className="space-y-2">
                               <p className="text-[10px] text-center font-bold text-gray-400">Lần {i+1}</p>
                               <input 
                                 type="number"
                                 value={(timeStudy as any)[key] || ''}
                                 onChange={e => setTimeStudy({...timeStudy, [key]: Number(e.target.value)})}
                                 className="w-full p-4 rounded-2xl border-2 border-gray-100 bg-white text-center text-xl font-black font-mono text-indigo-600 focus:border-indigo-500 outline-none transition-all shadow-sm"
                                 placeholder="0"
                               />
                            </div>
                          ))}
                       </div>

                       {/* Calculation Results */}
                       {timeStudy.time1 > 0 && (
                         <motion.div 
                           initial={{ opacity: 0, scale: 0.95 }}
                           animate={{ opacity: 1, scale: 1 }}
                           className="mt-8 p-6 rounded-2xl bg-indigo-900 text-white shadow-xl shadow-indigo-100"
                         >
                            {(() => {
                              const validTimes = [timeStudy.time1, timeStudy.time2, timeStudy.time3].filter(t => t > 0);
                              const avgTimeAdjusted = (validTimes.reduce((a, b) => a + b, 0) / validTimes.length) * 1.2;
                              const outputPerHour = Math.round(3600 / avgTimeAdjusted);
                              const outputPerDay = outputPerHour * 8; // Assuming 8h shift

                              return (
                                <>
                                  <div className="flex justify-between items-center mb-6">
                                     <span className="text-xs font-bold uppercase tracking-widest opacity-60">Kết quả dự tính (Đã cộng 20%)</span>
                                     <span className="text-[10px] bg-white/20 px-2 py-1 rounded">AVG: {avgTimeAdjusted.toFixed(1)}s</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-8 text-center">
                                     <div>
                                        <p className="text-4xl font-black font-mono">{outputPerHour}</p>
                                        <p className="text-[10px] uppercase font-bold mt-1 text-indigo-200">Sản phẩm / Giờ</p>
                                     </div>
                                     <div className="border-l border-white/10">
                                        <p className="text-4xl font-black font-mono">{outputPerDay}</p>
                                        <p className="text-[10px] uppercase font-bold mt-1 text-indigo-200">Sản phẩm / Ngày (8h)</p>
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
                        <h4 className="text-sm font-bold uppercase text-gray-400 tracking-widest">Lịch sử nghiên cứu SAM</h4>
                        <div className="flex items-center gap-3 flex-wrap">
                           <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold text-gray-400 uppercase">Chuyền:</span>
                             <select 
                               value={tsFilterLine}
                               onChange={(e) => setTsFilterLine(e.target.value)}
                               className="text-xs p-2 rounded-lg border border-gray-200 bg-white"
                             >
                               <option value="">Tất cả</option>
                               {lines.map(l => <option key={l} value={l}>{l}</option>)}
                             </select>
                           </div>
                           <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold text-gray-400 uppercase">Mã hàng:</span>
                             <select 
                               value={tsFilterOrder}
                               onChange={(e) => setTsFilterOrder(e.target.value)}
                               className="text-xs p-2 rounded-lg border border-gray-200 bg-white"
                             >
                               <option value="">Tất cả</option>
                               {orders.map(o => <option key={o.id} value={o.id}>{o.styleName}</option>)}
                             </select>
                           </div>
                        </div>
                     </div>
                     <div className="space-y-4">
                        {getSortedTimeStudyRecords()
                          .filter(record => {
                            const worker = workers.find(w => w.id === record.workerId);
                            const lineMatch = !tsFilterLine || worker?.line === tsFilterLine;
                            const orderMatch = !tsFilterOrder || record.orderId === tsFilterOrder;
                            return lineMatch && orderMatch;
                          })
                          .map((record) => {
                          const worker = workers.find(w => w.id === record.workerId);
                          const op = operations.find(o => o.id === record.operationId);
                          const order = orders.find(o => o.id === record.orderId);
                          return (
                            <div key={record.id} className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                               <div className="flex items-center gap-6">
                                  <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-gray-100 shadow-sm w-20">
                                     <p className="text-lg font-black text-indigo-600 font-mono">{record.averageTime}s</p>
                                     <p className="text-[8px] uppercase font-bold text-gray-400">Avg Time</p>
                                  </div>
                                  <div>
                                     <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">{worker?.line}</span>
                                        <p className="text-sm font-bold text-gray-900">{op?.name} • {worker?.name}</p>
                                     </div>
                                     <p className="text-[10px] text-gray-400 font-semibold">{order?.styleName || 'Không rõ mã hàng'} • {record.date}</p>
                                  </div>
                               </div>
                               <div className="flex items-center gap-8">
                                  <div className="text-right">
                                     <p className="text-xs font-bold text-gray-900">{record.targetPerHour} sp/h</p>
                                     <p className="text-[10px] text-gray-400 uppercase font-bold">Năng suất/Giờ</p>
                                  </div>
                                  <div className="text-right border-l border-gray-200 pl-8">
                                     <p className="text-xs font-bold text-emerald-600">{record.targetPerDay} sp/d</p>
                                     <p className="text-[10px] text-gray-400 uppercase font-bold">Năng suất/Ngày</p>
                                  </div>
                                  <button 
                                    onClick={() => handleDeleteTimeStudyRecord(record.id)}
                                    className="text-gray-300 hover:text-rose-500 transition-colors ml-4 p-2"
                                  >
                                    <X size={18} />
                                  </button>
                               </div>
                            </div>
                          );
                        })}
                        {timeStudyRecords.length === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm italic">Chưa có bản ghi nghiên cứu nào</div>
                        )}
                     </div>
                  </div>
                </div>
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
              ? 'text-indigo-600' 
              : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <div className={`p-2 rounded-xl transition-all ${activeTab === item.id ? 'bg-indigo-50 scale-110' : ''}`}>
              <item.icon size={20} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
            {activeTab === item.id && (
              <motion.div 
                layoutId="nav-pill"
                className="absolute -top-[1px] w-8 h-1 bg-indigo-600 rounded-full"
              />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
