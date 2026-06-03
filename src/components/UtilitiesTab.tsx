import React, { useState, useEffect, useRef } from "react";
import {
  FileSpreadsheet,
  CloudLightning,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Database,
  Plus,
  Compass,
  AlertCircle,
  CheckCircle,
  FileCheck,
  UserCheck,
  Zap,
  LogIn,
  Unlink,
  ExternalLink,
  Download,
  Upload,
  MessageSquare,
  Send,
  Paperclip,
  Sparkles,
  Bot,
  User,
  Trash2,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FirebaseError } from "firebase/app";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import {
  Worker,
  Operation,
  ProductionOrder,
  ProductionLog,
  TimeStudyRecord,
} from "../types";
import { getCachedToken, setCachedToken, signInWithGoogle, db, auth } from "../lib/firebase";

interface UtilitiesTabProps {
  workers: Worker[];
  operations: Operation[];
  orders: ProductionOrder[];
  logs: ProductionLog[];
  timeStudyRecords: TimeStudyRecord[];
  lines: string[];
  onImportWorkers: (workers: Omit<Worker, "id">[]) => Promise<number>;
  onImportOperations: (operations: Omit<Operation, "id">[]) => Promise<number>;
}

export default function UtilitiesTab({
  workers,
  operations,
  orders,
  logs,
  timeStudyRecords,
  lines,
  onImportWorkers,
  onImportOperations,
}: UtilitiesTabProps) {
  const [accessToken, setAccessToken] = useState<string | null>(getCachedToken());
  const [isConnecting, setIsConnecting] = useState(false);
  const [subTab, setSubTab] = useState<"drive" | "export" | "import" | "ai-chat">("ai-chat");
  
  // Gemini AI Chat State
  interface ChatMessage {
    id: string;
    role: "user" | "model";
    text: string;
    createdAt: Date;
    fileAttachment?: {
      name: string;
      mimeType: string;
      dataUrl?: string;
    };
    actions?: {
      type: "add_worker" | "add_operation" | "add_order" | "add_log";
      data: any;
      executed?: boolean;
      error?: string;
    }[];
  }

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      text: "Xin chào! Tôi là **Trợ lý ảo AI Garment Ops** 🤖✨\n\nTôi có thể giúp bạn giải đáp thắc mắc chuyên môn IE (Kỹ thuật công nghiệp), phân tích dữ liệu, tệp đính kèm và **trực tiếp hành động** để cập nhật dữ liệu vào máy chủ.\n\n### Bạn có thể gõ các yêu cầu hành động mẫu sau:\n- 👤 **Nhân sự**: `Thêm công nhân Nguyễn Văn Hoàn vào Chuyền 1, mã CN422, có kỹ năng vắt sổ, tra tay`\n- ⚙️ **Công đoạn**: `Thêm công đoạn Tra khóa chính áo khoác mã CD909 chuẩn SAM 1.15 phút`\n- 📦 **Đơn hàng**: `Tạo đơn hàng may 5000 Áo Hoodie Polo cho khách hàng Uniqlo hạn giao ngày 2026-06-25`\n- 📈 **Sản lượng**: `Ghi nhận Chuyền 1 mã hàng POLO-01 may đạt 145 cái`\n\n### 📎 Chèn và phân tích tệp đính kèm:\nBạn có thể đính kèm bảng ảnh chụp, tài liệu kỹ thuật hoặc file danh sách để tôi tự động đọc và thực hiện tải lên hệ thống chuẩn xác!",
      createdAt: new Date(),
    }
  ]);

  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; mimeType: string; data: string; dataUrl?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Drive API State
  const [spreadsheets, setSpreadsheets] = useState<any[]>([]);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  
  // Link Spreadsheet State
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>("");
  const [selectedSpreadsheetName, setSelectedSpreadsheetName] = useState<string>("");
  const [customSpreadsheetId, setCustomSpreadsheetId] = useState<string>("");
  const [creationName, setCreationName] = useState<string>("Báo cáo Garment Ops - " + new Date().toLocaleDateString("vi-VN"));
  const [isCreating, setIsCreating] = useState(false);

  // Export State
  const [exportType, setExportType] = useState<"logs" | "timeStudy" | "workers" | "operations">("logs");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  
  // Import State
  const [importType, setImportType] = useState<"workers" | "operations">("workers");
  const [importRange, setImportRange] = useState<string>("Sheet1!A1:E100");
  const [importingState, setImportingState] = useState<"idle" | "fetching" | "preview" | "submitting">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<any[][]>([]);
  const [selectedHeaders, setSelectedHeaders] = useState<Record<string, number>>({});
  const [successImportCount, setSuccessImportCount] = useState<number | null>(null);

  const saveSpreadsheetConfig = async (selectedId: string, customId: string, name: string) => {
    if (auth.currentUser) {
      try {
        const { setDoc, doc } = await import("firebase/firestore");
        await setDoc(doc(db, `users/${auth.currentUser.uid}/config/workspace`), {
          selectedSpreadsheetId: selectedId,
          customSpreadsheetId: customId,
          selectedSpreadsheetName: name,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn("Lưu cấu hình Spreadsheet lên Firestore thất bại:", err);
      }
    }
  };

  useEffect(() => {
    const initToken = async () => {
      let token = getCachedToken();
      let fsSelectedId = "";
      let fsCustomId = "";
      let fsName = "";
      if (auth.currentUser) {
        try {
          const { getDoc, doc } = await import("firebase/firestore");
          const tokenSnap = await getDoc(doc(db, `users/${auth.currentUser.uid}/config/workspace`));
          if (tokenSnap.exists()) {
            const data = tokenSnap.data();
            if (data) {
              if (data.accessToken) {
                token = data.accessToken;
                setCachedToken(token);
              }
              if (data.selectedSpreadsheetId) fsSelectedId = data.selectedSpreadsheetId;
              if (data.customSpreadsheetId) fsCustomId = data.customSpreadsheetId;
              if (data.selectedSpreadsheetName) fsName = data.selectedSpreadsheetName;
            }
          }
        } catch (err) {
          console.warn("Failed to retrieve token from Firestore in UtilitiesTab:", err);
        }
      }
      setAccessToken(token);
      if (fsSelectedId) setSelectedSpreadsheetId(fsSelectedId);
      if (fsCustomId) setCustomSpreadsheetId(fsCustomId);
      if (fsName) setSelectedSpreadsheetName(fsName);

      if (token) {
        fetchSpreadsheets(token, fsSelectedId || undefined);
      }
    };
    initToken();
  }, []);

  // Scroll to bottom helper
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSelectedFile({
        name: file.name,
        mimeType: file.type,
        data: result, // Full base64 or raw string
        dataUrl: file.type.startsWith("image/") ? result : undefined,
      });
    };

    if (file.type.startsWith("image/")) {
      reader.readAsDataURL(file);
    } else {
      // For CSV, JSON, TXT files, read as text to construct client payload
      reader.readAsText(file);
    }
  };

  const handleSendChat = async () => {
    if (!userInput.trim() && !selectedFile) return;

    setIsSending(true);
    const textToSend = userInput.trim();
    const currentFile = selectedFile;
    
    // Reset selection inputs
    setUserInput("");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const userMsgId = "user-" + Date.now();
    
    // Add user message to local chat messages
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: "user",
      text: textToSend,
      createdAt: new Date(),
      fileAttachment: currentFile ? {
        name: currentFile.name,
        mimeType: currentFile.mimeType,
        dataUrl: currentFile.dataUrl,
      } : undefined,
    };

    setChatMessages((prev) => [...prev, userMessage]);

    try {
      // 1. Compile chat history formatted in Gemini roles
      // Format history: user -> model pairs
      const formattedHistory = chatMessages
        .filter(m => m.id !== "welcome") // skip introductory system greeting
        .map(m => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

      // 2. Prepare file data. If it is an image, we send as base64 inlineData. 
      // If it is a text/csv file, we concatenate its content to the prompt.
      let promptText = textToSend;
      let backendFilePayload: any = null;

      if (currentFile) {
        if (currentFile.mimeType.startsWith("image/")) {
          backendFilePayload = {
            data: currentFile.data,
            mimeType: currentFile.mimeType,
          };
        } else {
          // If text file, inject its content directly into prompt text so model is guaranteed to read it
          promptText = `[Nạp nội dung tệp đính kèm: "${currentFile.name} (${currentFile.mimeType})"]:\n\`\`\`\n${currentFile.data}\n\`\`\`\n\nYêu cầu của tôi đối với tệp này: ${textToSend || "Phân tích số liệu và đề xuất hành động"}`;
        }
      }

      // 3. Collect immediate state context summaries for Gemini
      const statsContext = {
        workersCount: workers.length,
        operationsCount: operations.length,
        ordersCount: orders.length,
        logsCount: logs.length,
        lines: lines,
        workersSample: workers.slice(0, 15).map(w => ({ name: w.name, code: w.code, line: w.line, skills: w.skills })),
        ordersSample: orders.slice(0, 10).map(o => ({ id: o.id, customer: o.customer, styleName: o.styleName, produced: o.producedQuantity, total: o.orderQuantity, status: o.status })),
        operationsSample: operations.slice(0, 15).map(op => ({ name: op.name, code: op.code, sam: op.sam, target: op.targetPerHour, style: op.style })),
      };

      // 4. Send API call to backend
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: promptText,
          history: formattedHistory,
          file: backendFilePayload,
          context: statsContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI HTTP Error ${response.status}: ` + (await response.text()));
      }

      const resData = await response.json();
      const aiReplyText = resData.text || "";

      // 5. Parse action block from reply text
      let parsedActions: any[] = [];
      try {
        const actionMatch = aiReplyText.match(/```actions\s*([\s\S]*?)\s*```/);
        if (actionMatch && actionMatch[1]) {
          parsedActions = JSON.parse(actionMatch[1].trim());
        }
      } catch (parseErr) {
        console.error("Failed to parse proposed action payload:", parseErr);
      }

      // Clean responseText: strip of the markdown ```actions portion to keep visual presentation clean
      let cleanResponseText = aiReplyText;
      if (aiReplyText.includes("```actions")) {
        cleanResponseText = aiReplyText.split("```actions")[0].trim();
      }

      // Add model's reply
      const aiMessage: ChatMessage = {
        id: "ai-" + Date.now(),
        role: "model",
        text: cleanResponseText,
        createdAt: new Date(),
        actions: parsedActions.length > 0 ? parsedActions.map((act: any) => ({
          type: act.type,
          data: act.data,
          executed: false,
        })) : undefined,
      };

      setChatMessages((prev) => [...prev, aiMessage]);

    } catch (chatErr: any) {
      console.error("Error communicating with AI Chat:", chatErr);
      setChatMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          role: "model",
          text: `⚠️ **Không thể kết nối trò chuyện với AI:** ${chatErr.message || "Đã xảy ra sự cố kết nối. Vui lòng kiểm tra lại môi trường và khóa API key."}`,
          createdAt: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleExecuteAIAction = async (msgId: string) => {
    // Check authentication
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert("Vui lòng đăng nhập hệ thống để thực hiện các thao tác ghi dữ liệu.");
      return;
    }

    // Find message in list
    const msgIndex = chatMessages.findIndex((m) => m.id === msgId);
    if (msgIndex === -1 || !chatMessages[msgIndex].actions) return;

    const updatedMessages = [...chatMessages];
    const actionsToRun = updatedMessages[msgIndex].actions || [];

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < actionsToRun.length; i++) {
      const act = actionsToRun[i];
      if (act.executed) continue;

      try {
        if (act.type === "add_worker") {
          const colPath = `users/${currentUser.uid}/workers`;
          const skillsArr = act.data.skills 
            ? typeof act.data.skills === "string"
              ? act.data.skills.split(",").map((s: string) => s.trim())
              : act.data.skills
            : [];
          
          await addDoc(collection(db, colPath), {
            name: act.data.name || "Công nhân chưa đặt tên",
            code: act.data.code || "CN" + Math.floor(100 + Math.random() * 900),
            line: act.data.line || "Chuyền 1",
            skills: skillsArr,
            performance: 0,
            userId: currentUser.uid,
            createdAt: Timestamp.now(),
          });
        } 
        else if (act.type === "add_operation") {
          const colPath = `users/${currentUser.uid}/operations`;
          const samVal = act.data.sam ? Number(act.data.sam) : 1.0;
          const targetVal = act.data.targetPerHour ? Number(act.data.targetPerHour) : Math.round(60 / samVal);

          await addDoc(collection(db, colPath), {
            name: act.data.name || "Công đoạn chưa đặt tên",
            code: act.data.code || "CD" + Math.floor(100 + Math.random() * 900),
            sam: samVal,
            targetPerHour: targetVal,
            style: act.data.style || "",
            userId: currentUser.uid,
            createdAt: Timestamp.now(),
          });
        } 
        else if (act.type === "add_order") {
          const colPath = `users/${currentUser.uid}/orders`;
          const qVal = act.data.orderQuantity ? Number(act.data.orderQuantity) : 1000;
          const deadlineVal = act.data.deadline || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

          await addDoc(collection(db, colPath), {
            customer: act.data.customer || "Khách lẻ",
            styleName: act.data.styleName || "Sản phẩm may",
            job: act.data.job || "Kế hoạch may",
            orderQuantity: qVal,
            producedQuantity: 0,
            deadline: deadlineVal,
            status: "planning",
            userId: currentUser.uid,
            createdAt: Timestamp.now(),
          });
        } 
        else if (act.type === "add_log") {
          const colPath = `users/${currentUser.uid}/productionLogs`;
          
          // Match matching order ID dynamically based on requested styleName text
          let matchedOrderId = act.data.orderId || "";
          if (!matchedOrderId && orders.length > 0) {
            const matchTxt = (act.data.styleName || "").toLowerCase();
            const matching = orders.find(o => o.styleName.toLowerCase().includes(matchTxt) || o.id === act.data.styleName);
            if (matching) matchedOrderId = matching.id;
            else matchedOrderId = orders[0].id; // Fallback to first available order
          }

          if (!matchedOrderId) {
            throw new Error(`Không tìm thấy đơn hàng tương thích để liên kết cột. Vui lòng tạo đơn hàng trước.`);
          }

          await addDoc(collection(db, colPath), {
            date: act.data.date || new Date().toISOString().split("T")[0],
            line: act.data.line || "Chuyền 1",
            orderId: matchedOrderId,
            actualQuantity: act.data.actualQuantity ? Number(act.data.actualQuantity) : 0,
            hour: act.data.hour ? Number(act.data.hour) : 8,
            userId: currentUser.uid,
            createdAt: Timestamp.now(),
          });
        }

        act.executed = true;
        act.error = undefined;
        successCount++;
      } catch (execErr: any) {
        console.error("Error executing action:", execErr);
        act.error = execErr.message || "Lỗi Firestore";
        failedCount++;
      }
    }

    setChatMessages(updatedMessages);

    if (successCount > 0) {
      alert(`Đã hoàn thành ${successCount} hành động cập nhật dữ liệu Firestore thành công!`);
    } else if (failedCount > 0) {
      alert(`Lỗi thực hiện một vài hành động từ trợ lý AI.`);
    }
  };

  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    setDriveError(null);
    try {
      const result = await signInWithGoogle();
      const token = getCachedToken();
      setAccessToken(token);
      if (token) {
        await fetchSpreadsheets(token);
      }
    } catch (error: any) {
      console.error("Google connection error:", error);
      let userFriendlyMsg = error.message || "Lỗi không xác định";
      if (error?.code === "auth/popup-closed-by-user" || error?.message?.includes("popup-closed-by-user")) {
        userFriendlyMsg = "Cửa sổ liên kết đã bị đóng. Hãy chắc chắn bạn đã nhấn vào 'Nâng cao' (Advanced) -> 'Đi tới Garment Ops (không an toàn)' ở màn hình cảnh báo của Google để hoàn tất cấp quyền.";
      } else if (error?.message?.includes("assertion failed") || error?.message?.includes("Pending promise")) {
        userFriendlyMsg = "Lỗi trạng thái phiên (Firebase pending session error). Vui lòng nhấn F5 (Tải lại trang) để làm mới kết nối Google và thử kích hoạt lại.";
      }
      setDriveError("Không thể liên kết tài khoản Google: " + userFriendlyMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setCachedToken(null);
    setAccessToken(null);
    setSpreadsheets([]);
    setSelectedSpreadsheetId("");
    setSelectedSpreadsheetName("");
    if (auth.currentUser) {
      try {
        const { deleteDoc, doc } = await import("firebase/firestore");
        await deleteDoc(doc(db, `users/${auth.currentUser.uid}/config/workspace`));
      } catch (err) {
        console.warn("Khử kết nối khỏi Firestore thất bại:", err);
      }
    }
  };

  const fetchSpreadsheets = async (token: string, existingSelectedId?: string) => {
    setLoadingDrive(true);
    setDriveError(null);
    try {
      const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet'");
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink,createdTime)&orderBy=modifiedTime%20desc&pageSize=20`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        if (response.status === 401) {
          handleDisconnectGoogle();
          throw new Error("Phiên làm việc Google hết hạn. Vui lòng kết nối lại.");
        }
        let detail = "";
        try {
          const errBody = await response.json();
          detail = errBody.error?.message || response.statusText;
        } catch (_) {
          detail = `Mã lỗi ${response.status}`;
        }
        throw new Error(`Không thể lấy danh sách bảng tính: ${detail}. Hãy chắc chắn bạn đã đồng ý cấp tất cả các quyền ở màn hình Đăng nhập.`);
      }
      const data = await response.json();
      setSpreadsheets(data.files || []);
      if (existingSelectedId) {
        setSelectedSpreadsheetId(existingSelectedId);
        const matched = data.files?.find((f: any) => f.id === existingSelectedId);
        if (matched) {
          setSelectedSpreadsheetName(matched.name);
        }
      } else if (data.files && data.files.length > 0 && !selectedSpreadsheetId) {
        setSelectedSpreadsheetId(data.files[0].id);
        setSelectedSpreadsheetName(data.files[0].name);
      }
    } catch (error: any) {
      setDriveError(error.message || "Không thể lấy danh sách bảng tính.");
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleCreateNewSpreadsheet = async () => {
    const token = accessToken || getCachedToken();
    if (!token) return;
    setIsCreating(true);
    setDriveError(null);
    try {
      const response = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: creationName.trim() || "Báo cáo Garment Ops",
          mimeType: "application/vnd.google-apps.spreadsheet",
        }),
      });

      if (!response.ok) {
        let errDesc = "";
        try {
          const errData = await response.json();
          errDesc = ` [Chi tiết: ${errData.error?.message || response.statusText}]`;
        } catch (_) {
          errDesc = ` [Mã lỗi: ${response.status}]`;
        }
        throw new Error("Không thể tạo file trên Google Drive." + errDesc + ". Vui lòng đăng xuất Google và nhấn nhấn liên kết lại, đảm bảo chọn tích đủ quyền truy cập Drive/Sheets.");
      }

      const file = await response.json();
      const spreadsheetId = file.id;

      // Now set up initial sheets structure and format
      // Create sheets for: Production Logs, Time Study, Workers, Operations
      const sheetSetupResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [
              {
                updateSpreadsheetProperties: {
                  properties: { title: creationName },
                  fields: "title",
                },
              },
              // Create Sheets
              { addSheet: { properties: { title: "NhatKySanLuong" } } },
              { addSheet: { properties: { title: "NghienCuuThoiGian" } } },
              { addSheet: { properties: { title: "CongNhan" } } },
              { addSheet: { properties: { title: "CongDoan" } } },
              // Delete default "Sheet1" to clean up
              {
                deleteSheet: {
                  sheetId: 0 // In standard empty spreadsheets, sheet 0 is Sheet1
                }
              }
            ],
          }),
        }
      );

      // Now add header rows to each sheet
      const headersMap = {
        "NhatKySanLuong!A1:G1": [["Ngày", "Chuyền", "Khách Hàng", "Mã Hàng", "Job Công việc", "Sản lượng Thực tế", "Giờ Ghi"]],
        "NghienCuuThoiGian!A1:H1": [["Ngày Đo", "Chuyền", "Mã Hàng", "Công Đoạn", "Tên Công Nhân", "Thời Gian TB (s)", "Năng Suất/Giờ (sp)", "Năng Suất/Ngày (sp)"]],
        "CongNhan!A1:E1": [["Họ Tên", "Mã Công Nhân", "Chuyền", "Kỹ Năng", "Hiệu Suất (%)"]],
        "CongDoan!A1:D1": [["Mã Công Đoạn", "Tên Công Đoạn", "SAM", "Mục Tiêu/Giờ"]],
      };

      for (const [range, values] of Object.entries(headersMap)) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ values }),
          }
        );
      }

      alert("Đã tạo thành công bảng tính mới với cấu trúc báo cáo hoàn chỉnh!");
      await fetchSpreadsheets(token);
      setSelectedSpreadsheetId(spreadsheetId);
      setSelectedSpreadsheetName(creationName);
    } catch (err: any) {
      setDriveError("Lỗi khởi tạo Spreadsheet: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportData = async () => {
    const token = accessToken || getCachedToken();
    const sheetId = customSpreadsheetId.trim() || selectedSpreadsheetId;
    if (!token) {
      alert("Vui lòng kết nối Google Workspace trước!");
      return;
    }
    if (!sheetId) {
      alert("Vui lòng chọn hoặc điền Google Spreadsheet ID!");
      return;
    }

    setIsExporting(true);
    setExportSuccess(null);

    try {
      let range = "";
      let sheetName = "";
      let headers: string[] = [];
      let values: any[][] = [];

      if (exportType === "logs") {
        sheetName = "NhatKySanLuong";
        headers = ["Ngày", "Chuyền", "Khách Hàng", "Mã Hàng", "Job Công việc", "Sản lượng Thực tế", "Giờ Ghi"];
        range = "NhatKySanLuong!A2";
        values = logs.map((log) => {
          const order = orders.find((o) => o.id === log.orderId);
          const line = log.line || "Chuyền 1";
          return [
            log.date || "-",
            line,
            order?.customer || "-",
            order?.styleName || "-",
            order?.job || "-",
            log.actualQuantity || 0,
            log.hour ? `${log.hour}:00` : "-",
          ];
        });
      } else if (exportType === "timeStudy") {
        sheetName = "NghienCuuThoiGian";
        headers = ["Ngày Đo", "Chuyền", "Mã Hàng", "Công Đoạn", "Tên Công Nhân", "Thời Gian TB (s)", "Năng Suất/Giờ (sp)", "Năng Suất/Ngày (sp)"];
        range = "NghienCuuThoiGian!A2";
        values = timeStudyRecords.map((rec) => {
          const workerInstance = workers.find((w) => w.id === rec.workerId);
          const opInstance = operations.find((o) => o.id === rec.operationId);
          return [
            rec.date || "-",
            workerInstance?.line || "-",
            rec.style || "-",
            opInstance?.name || "-",
            workerInstance?.name || "-",
            rec.averageTime || 0,
            rec.targetPerHour || 0,
            rec.targetPerDay || 0,
          ];
        });
      } else if (exportType === "workers") {
        sheetName = "CongNhan";
        headers = ["Họ Tên", "Mã Công Nhân", "Chuyền", "Kỹ Năng", "Hiệu Suất (%)"];
        range = "CongNhan!A2";
        values = workers.map((w) => [
          w.name || "",
          w.code || "",
          w.line || "",
          w.skills?.join(", ") || "",
          w.performance || 0,
        ]);
      } else if (exportType === "operations") {
        sheetName = "CongDoan";
        headers = ["Mã Công Đoạn", "Tên Công Đoạn", "SAM", "Mục Tiêu/Giờ"];
        range = "CongDoan!A2";
        values = operations.map((op) => [
          op.code || "",
          op.name || "",
          op.sam || 0,
          op.targetPerHour || 0,
        ]);
      }

      if (values.length === 0) {
        throw new Error("Không có dữ liệu trong hệ thống để xuất! Hãy chắc chắn có ít nhất và đã ghi chép dữ liệu trước khi đẩy xuất.");
      }

      const appendData = async (targetRange: string) => {
        return fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${targetRange}:append?valueInputOption=USER_ENTERED`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              values: values,
            }),
          }
        );
      };

      let appendResponse = await appendData(range);

      if (!appendResponse.ok) {
        if (appendResponse.status === 401) {
          await handleDisconnectGoogle();
          throw new Error("Phiên làm việc Google của bạn đã hết hạn bảo mật (Access Token hết hiệu lực sau 1 giờ). Hệ thống đã tự động ngắt kết nối cũ. Vui lòng bấm nút 'Kết nối với Google' ở góc phải màn hình phía trên và tích chọn đầy đủ các quyền truy cập để lấy lại mã đăng nhập mới.");
        }

        let errText = "";
        let errStatus = appendResponse.status;
        try {
          const errData = await appendResponse.json();
          errText = errData.error?.message || "";
        } catch (_) {}

        // Auto-create missing sheet if requested range does not exist
        if (errStatus === 400 && (errText.toLowerCase().includes("range") || errText.toLowerCase().includes("not found") || errText.toLowerCase().includes("unable to parse") || errText.toLowerCase().includes("cannot find"))) {
          const addSheetRes = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                requests: [
                  { addSheet: { properties: { title: sheetName } } }
                ],
              }),
            }
          );

          if (addSheetRes.ok) {
            // Write column headers
            await fetch(
              `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetName}!A1?valueInputOption=USER_ENTERED`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ values: [headers] }),
              }
            );

            // Re-attempt appending
            appendResponse = await appendData(range);
          }
        }
      }

      if (!appendResponse.ok) {
        let finalDetail = "";
        try {
          const finalErr = await appendResponse.json();
          finalDetail = finalErr.error?.message || appendResponse.statusText;
        } catch (_) {
          finalDetail = `HTTP ${appendResponse.status}`;
        }
        throw new Error(`Google Sheets API trả về lỗi: ${finalDetail}. Vui lòng thử lại hoặc đảm bảo bạn có quyền truy cập.`);
      }

      setExportSuccess(`Đã xuất thành công ${values.length} dòng dữ liệu lên trang tính!`);
    } catch (error: any) {
      alert("Xuất thất bại: " + error.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFetchSheetForImport = async () => {
    const token = accessToken || getCachedToken();
    const sheetId = customSpreadsheetId.trim() || selectedSpreadsheetId;
    if (!token) return;
    if (!sheetId) {
      setImportError("Vui lòng nhập hoặc chọn một Spreadsheet ID.");
      return;
    }

    setImportingState("fetching");
    setImportError(null);
    setSheetData([]);
    setSuccessImportCount(null);

    try {
      const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(importRange)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          await handleDisconnectGoogle();
          throw new Error("Phiên làm việc Google của bạn đã hết hạn bảo mật (Access Token hết hiệu lực sau 1 giờ). Hệ thống đã tự động ngắt kết nối cũ. Vui lòng bấm nút 'Kết nối với Google' ở góc phải màn hình phía trên và tích chọn đầy đủ các quyền truy cập để lấy lại mã đăng nhập mới.");
        }
        throw new Error(`Không thể đọc tài liệu. STATUS ${response.status}. Hãy kiểm tra lại Tên Sheet và Vùng chọn.`);
      }

      const resData = await response.json();
      if (!resData.values || resData.values.length === 0) {
        throw new Error("Không tìm thấy hàng dữ liệu nào trong vùng chọn.");
      }

      setSheetData(resData.values);
      setImportingState("preview");

      // Auto-guessing column mappings based on headers
      const headers = resData.values[0] || [];
      const newMappings: Record<string, number> = {};

      if (importType === "workers") {
        const nameKeywords = ["tên", "họ tên", "name", "full name", "worker", "công nhân"];
        const codeKeywords = ["mã", "code", "mã nhân viên", "mã cn", "id"];
        const lineKeywords = ["chuyền", "tổ", "line", "nhóm"];
        const skillsKeywords = ["kỹ năng", "công đoạn", "giai đoạn", "skills"];

        headers.forEach((h: string, idx: number) => {
          const lower = h.toString().toLowerCase().trim();
          if (nameKeywords.some((k) => lower.includes(k)) && !newMappings.name) {
            newMappings.name = idx;
          } else if (codeKeywords.some((k) => lower.includes(k)) && !newMappings.code) {
            newMappings.code = idx;
          } else if (lineKeywords.some((k) => lower.includes(k)) && !newMappings.line) {
            newMappings.line = idx;
          } else if (skillsKeywords.some((k) => lower.includes(k)) && !newMappings.skills) {
            newMappings.skills = idx;
          }
        });
      } else {
        const nameKeywords = ["tên", "name", "công đoạn", "thao tác", "operation", "bước"];
        const codeKeywords = ["mã", "code", "mã cđ", "id", "stt"];
        const samKeywords = ["sam", "định mức", "thời gian", "tgđm"];
        const targetKeywords = ["mục tiêu", "target", "sản lượng", "năng suất"];

        headers.forEach((h: string, idx: number) => {
          const lower = h.toString().toLowerCase().trim();
          if (nameKeywords.some((k) => lower.includes(k)) && !newMappings.name) {
            newMappings.name = idx;
          } else if (codeKeywords.some((k) => lower.includes(k)) && !newMappings.code) {
            newMappings.code = idx;
          } else if (samKeywords.some((k) => lower.includes(k)) && !newMappings.sam) {
            newMappings.sam = idx;
          } else if (targetKeywords.some((k) => lower.includes(k)) && !newMappings.target) {
            newMappings.target = idx;
          }
        });
      }
      setSelectedHeaders(newMappings);
    } catch (err: any) {
      setImportError(err.message || "Lỗi đọc trang tính.");
      setImportingState("idle");
    }
  };

  const executeImport = async () => {
    if (sheetData.length <= 1) return;
    setImportingState("submitting");
    setImportError(null);

    const rows = sheetData.slice(1); // skip headers
    let importedCount = 0;

    try {
      if (importType === "workers") {
        const workersToImport: Omit<Worker, "id">[] = [];
        
        rows.forEach((row) => {
          const nameVal = selectedHeaders.name !== undefined ? row[selectedHeaders.name] : "";
          const codeVal = selectedHeaders.code !== undefined ? row[selectedHeaders.code] : "";
          const lineVal = selectedHeaders.line !== undefined ? row[selectedHeaders.line] : "Chuyền 1";
          const skillsVal = selectedHeaders.skills !== undefined ? row[selectedHeaders.skills] : "";

          if (nameVal || codeVal) {
            const skillsArray = skillsVal 
              ? typeof skillsVal === "string" 
                ? skillsVal.split(",").map((s) => s.trim()) 
                : [skillsVal.toString()] 
              : [];
            
            workersToImport.push({
              name: (nameVal || "Công nhân chưa đặt tên").toString().trim(),
              code: (codeVal || "-").toString().trim(),
              line: (lineVal || "Chuyền 1").toString().trim(),
              skills: skillsArray,
              performance: 0,
            });
          }
        });

        if (workersToImport.length > 0) {
          importedCount = await onImportWorkers(workersToImport);
        }
      } else {
        const operationsToImport: Omit<Operation, "id">[] = [];

        rows.forEach((row) => {
          const nameVal = selectedHeaders.name !== undefined ? row[selectedHeaders.name] : "";
          const codeVal = selectedHeaders.code !== undefined ? row[selectedHeaders.code] : "";
          const samVal = selectedHeaders.sam !== undefined ? Number(row[selectedHeaders.sam]) : 0;
          const targetVal = selectedHeaders.target !== undefined ? Number(row[selectedHeaders.target]) : 0;

          if (nameVal || codeVal) {
            let sam = samVal || 0;
            let target = targetVal || 0;

            // Auto conversion
            if (sam > 0 && target === 0) {
              target = Math.round(60 / sam);
            } else if (target > 0 && sam === 0) {
              sam = Number((60 / target).toFixed(2));
            }

            operationsToImport.push({
              name: (nameVal || "Công đoạn chưa đặt tên").toString().trim(),
              code: (codeVal || "-").toString().trim(),
              sam: sam,
              targetPerHour: target,
            });
          }
        });

        if (operationsToImport.length > 0) {
          importedCount = await onImportOperations(operationsToImport);
        }
      }

      setSuccessImportCount(importedCount);
      setImportingState("idle");
      setSheetData([]);
    } catch (err: any) {
      setImportError("Lỗi đồng bộ dữ liệu vào hệ thống: " + err.message);
      setImportingState("preview");
    }
  };

  const getActiveSpreadsheetId = () => customSpreadsheetId.trim() || selectedSpreadsheetId;

  return (
    <div className="space-y-6">
      {/* Tab Navigation header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold font-serif italic text-indigo-900 uppercase flex items-center gap-2">
            <CloudLightning size={22} className="text-indigo-600" />
            Tiện ích & Tích hợp Workspace
          </h2>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            Kết nối tài khoản Google Drive và Google Sheets để đồng bộ hóa, sao lưu báo cáo, xuất số liệu và nhập liệu công đoạn/công nhân tự động.
          </p>
        </div>
        
        {accessToken && (
          <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-2 rounded-2xl">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            <span className="text-[10px] uppercase tracking-widest font-black text-indigo-800">
              Đã kết nối với Google
            </span>
            <button
              onClick={handleDisconnectGoogle}
              className="p-1 text-indigo-800 hover:text-rose-600 transition-colors bg-white rounded-lg shadow-sm hover:shadow"
              title="Ngắt kết nối Google"
            >
              <Unlink size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Connection Layer */}
      {!accessToken ? (
        <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-8 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center gap-8 justify-between">
          <div className="space-y-4 max-w-xl text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs font-bold tracking-widest uppercase">
              <Compass size={12} className="text-indigo-300" />
              Tối ưu sản xuất
            </div>
            <h3 className="text-2xl font-black font-serif italic">
              Đồng bộ hóa dữ liệu với Google Workspace!
            </h3>
            <p className="text-sm text-indigo-200">
              Kích hoạt tích hợp để lưu trữ cấu trúc kế hoạch may vào **Google Drive** và xuất bảng báo cáo tiến độ **Google Sheets** thời gian thực với sự cho phép từ bạn.
            </p>
            <ul className="text-xs space-y-2 text-indigo-100 font-semibold list-disc list-inside">
              <li>Xuất nhật ký sản lượng, năng suất từng phút về trang tính.</li>
              <li>Xuất kết quả bấm thời gian của chuyền để phân tích trực quan.</li>
              <li>Nhập tự động hàng trăm công đoạn dập thiết kế và thông tin công nhân chỉ cần 1 cú click.</li>
            </ul>

            <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-200 text-xs leading-relaxed space-y-2">
              <p className="font-extrabold text-amber-300 flex items-center gap-1">
                ⚠️ HƯỚNG DẪN CẤP QUYỀN (VƯỢT CẢNH BÁO GOOGLE):
              </p>
              <p className="font-semibold text-[11px] text-indigo-100">
                Khi ấn nút <strong className="text-white">Kích hoạt Workspace</strong>, cửa sổ Google sẽ cảnh báo <strong className="text-amber-300 font-black">"Google chưa xác minh ứng dụng này"</strong> (do là phiên bản thử nghiệm). Hãy làm như sau để được cấp quyền:
              </p>
              <ol className="list-decimal list-inside space-y-1 font-semibold text-[11px]">
                <li>Nhấp vào nút <strong className="text-amber-300 border-b border-amber-300/40 pb-0.5">Nâng cao (Advanced)</strong> ở góc dưới cùng bên trái biểu mẫu.</li>
                <li>Tiếp tục nhấp vào dòng chữ liên kết <strong className="text-amber-300 border-b border-amber-300/40 pb-0.5">Đi tới Garment Ops (không an toàn)</strong>.</li>
                <li>Hãy nhớ <strong className="text-white">ĐÁNH DẤU CHỌN TẤT CẢ các ô quyền truy cập</strong> (Drive, Sheets/Spreadsheets) và nhấn nút <strong className="text-white font-black">Tiếp tục (Continue)</strong>.</li>
              </ol>
            </div>

            {typeof window !== "undefined" && window.self !== window.top && (
              <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-400/20 rounded-2xl text-indigo-200 text-xs leading-relaxed space-y-2 animate-fadeIn">
                <p className="font-extrabold text-indigo-300 flex items-center gap-1.5 uppercase">
                  📱 LƯU Ý KHI LIÊN KẾT TRÊN ĐIỆN THOẠI / IFRAME:
                </p>
                <p className="font-semibold text-[11px]">
                  Do bạn đang chạy trong khung nhìn thử nghiệm của <strong className="text-white font-bold">AI Studio</strong>, trình duyệt di động luôn tự động chặn việc mở cửa sổ cấp quyền mới của Google.
                </p>
                <p className="font-bold text-white text-[11px]">
                  👉 Vui lòng nhấn vào nút dưới đây để mở ứng dụng toàn màn hình trong một tab độc lập để thiết lập thành công 100%!
                </p>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold uppercase text-[9px] shadow-md transition-all cursor-pointer"
                >
                  Mở tab mới
                  <ExternalLink size={10} />
                </a>
              </div>
            )}
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={handleConnectGoogle}
              disabled={isConnecting}
              className="gsi-material-button group bg-white hover:bg-indigo-50 text-slate-800 font-black py-4 px-6 rounded-2xl shadow-xl transition-all hover:scale-[1.02] flex items-center gap-3 border border-gray-100 cursor-pointer disabled:opacity-50"
            >
              {isConnecting ? (
                <RefreshCw size={18} className="animate-spin text-slate-700" />
              ) : (
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 group-hover:scale-110 transition-transform">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
              )}
              <span className="text-slate-900 font-bold">Kích hoạt Workspace</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {/* Menu / Sidebar of Utilities */}
          <div className="space-y-2 lg:col-span-1 xl:col-span-1">
            {[
              { id: "ai-chat", label: "Trợ lý AI Gemini", icon: MessageSquare, desc: "Trò chuyện & Thao tác AI" },
              { id: "drive", label: "Quản lý File Drive", icon: FolderOpen, desc: "Cài đặt file báo cáo chính" },
              { id: "export", label: "Xuất Báo cáo Excel", icon: Download, desc: "Đẩy dữ liệu lên Sheets" },
              { id: "import", label: "Nhập liệu tự động", icon: Upload, desc: "Tải Công nhân / Công đoạn" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as any)}
                className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-3 relative overflow-hidden group ${
                  subTab === tab.id
                    ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20"
                    : "bg-white hover:bg-gray-50 text-gray-700 border-gray-100 hover:border-gray-200"
                }`}
              >
                <div className={`p-2 rounded-xl ${subTab === tab.id ? "bg-indigo-500 text-white" : "bg-gray-50 text-gray-400 group-hover:text-indigo-600"}`}>
                  <tab.icon size={18} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-tight">{tab.label}</p>
                  <p className={`text-[10px] ${subTab === tab.id ? "text-indigo-200" : "text-gray-400"}`}>{tab.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Interactive Utility Screen */}
          <div className="lg:col-span-3 xl:col-span-4 bg-white border border-gray-100/80 rounded-3xl p-3 sm:p-5 md:p-6 shadow-sm overflow-hidden min-h-[400px]">
            {subTab === "ai-chat" && (
              <div className="flex flex-col h-[650px] bg-slate-50/50 rounded-2xl border border-gray-150 overflow-hidden relative">
                {/* Chat Header */}
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-400">
                      <Sparkles size={18} className="animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-white">
                        Trợ lý Kỹ thuật AI Gemini
                        <span className="bg-indigo-500/20 text-indigo-300 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border border-indigo-500/30">Live 1.5 Flash</span>
                      </h4>
                      <p className="text-[10px] text-gray-300 font-semibold leading-none mt-1">Nạp dữ liệu tự động, hỏi bài định mức IE & Đề xuất hành động thông minh</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử trò chuyện?")) {
                        setChatMessages([
                          {
                            id: "welcome",
                            role: "model",
                            text: "Xin chào! Tôi là **Trợ lý ảo AI Garment Ops** 🤖✨\n\nTôi có thể giúp bạn giải đáp thắc mắc chuyên môn IE (Kỹ thuật công nghiệp), phân tích dữ liệu, tệp đính kèm và **trực tiếp hành động** để cập nhật dữ liệu vào máy chủ.\n\n### Bạn có thể gõ các yêu cầu hành động mẫu sau:\n- 👤 **Nhân sự**: `Thêm công nhân Nguyễn Văn Hoàn vào Chuyền 1, mã CN422, có kỹ năng vắt sổ, tra tay`\n- ⚙️ **Công đoạn**: `Thêm công đoạn Tra khóa chính áo khoác mã CD909 chuẩn SAM 1.15 phút`\n- 📦 **Đơn hàng**: `Tạo đơn hàng may 5000 Áo Hoodie Polo cho khách hàng Uniqlo hạn giao ngày 2026-06-25`\n- 📈 **Sản lượng**: `Ghi nhận Chuyền 1 mã hàng POLO-01 may đạt 145 cái`\n\n### 📎 Chèn và phân tích tệp đính kèm:\nBạn có thể đính kèm bảng ảnh chụp, tài liệu kỹ thuật hoặc file danh sách để tôi tự động đọc và thực hiện tải lên hệ thống chuẩn xác! Phân tích nhanh chóng bằng AI!",
                            createdAt: new Date(),
                          }
                        ]);
                      }
                    }}
                    title="Xóa cuộc trò chuyện"
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-gray-400 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Chat Scroll Area */}
                <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4">
                  {chatMessages.map((msg) => {
                    const isModel = msg.role === "model";
                    const isError = msg.id.startsWith("err-");
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex gap-3 w-full max-w-[94%] sm:max-w-[88%] ${isModel ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                      >
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold leading-none ${
                          isModel 
                            ? isError ? "bg-rose-100 text-rose-600" : "bg-indigo-100 text-indigo-600 border border-indigo-200" 
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}>
                          {isModel ? (
                            <Bot size={16} />
                          ) : (
                            <User size={16} />
                          )}
                        </div>

                        {/* Content bubble */}
                        <div className="space-y-2">
                          <div className={`p-3.5 rounded-2xl shadow-sm text-xs font-semibold whitespace-pre-wrap leading-relaxed ${
                            isModel 
                              ? isError ? "bg-rose-50 text-rose-800 border border-rose-100" : "bg-white text-gray-850 border border-gray-150" 
                              : "bg-indigo-600 text-white rounded-tr-none"
                          }`}>
                            {msg.text}

                            {/* Attached File Indicator inside user message */}
                            {msg.fileAttachment && (
                              <div className={`mt-2.5 p-2 rounded-xl flex items-center gap-2 border text-[11px] ${
                                isModel ? "bg-gray-50 border-gray-200 text-gray-600" : "bg-indigo-700/80 border-indigo-500 text-indigo-100"
                              }`}>
                                <Paperclip size={12} className="flex-shrink-0" />
                                <div className="truncate flex-1 font-bold">
                                  {msg.fileAttachment.name}
                                </div>
                                {msg.fileAttachment.dataUrl && (
                                  <img 
                                    src={msg.fileAttachment.dataUrl} 
                                    alt="User Attachment" 
                                    className="w-10 h-10 object-cover rounded-lg border border-black/10"
                                    referrerPolicy="no-referrer"
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Action Proposal Widget */}
                          {isModel && msg.actions && msg.actions.length > 0 && (
                            <div className="bg-white border border-emerald-250 rounded-2xl p-3.5 shadow-md w-full max-w-sm sm:max-w-md space-y-2.5">
                              <p className="text-[10px] font-black uppercase text-emerald-700 flex items-center gap-1">
                                <Sparkles size={11} className="text-emerald-500 animate-pulse animate-duration-1000" />
                                Đề xuất hành động từ Trợ lý AI
                              </p>
                              
                              <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                                {msg.actions.map((act, aIdx) => {
                                  let typeLabel = "Hành động";
                                  let desc = "";
                                  if (act.type === "add_worker") {
                                    typeLabel = "Thêm công nhân";
                                    desc = `${act.data.name} [${act.data.code}] - Phân chuyền: ${act.data.line}`;
                                  } else if (act.type === "add_operation") {
                                    typeLabel = "Thêm công đoạn";
                                    desc = `${act.data.name} [CD: ${act.data.code}] - Định mức SAM: ${act.data.sam} phút`;
                                  } else if (act.type === "add_order") {
                                    typeLabel = "Khởi tạo Đơn hàng";
                                    desc = `Khách: ${act.data.customer} - Mã hàng: ${act.data.styleName} (${act.data.orderQuantity} sản phẩm)`;
                                  } else if (act.type === "add_log") {
                                    typeLabel = "Ghi sản lượng";
                                    desc = `Ghi ${act.data.actualQuantity} sản phẩm tại ${act.data.line || "Chuyền 1"} (Ca/Giờ: ${act.data.hour})`;
                                  }

                                  return (
                                    <div key={aIdx} className="py-2.5 text-[11px] flex justify-between items-start gap-1.5">
                                      <div>
                                        <span className="font-extrabold uppercase text-gray-400 text-[8.5px] block">{typeLabel}</span>
                                        <span className="font-extrabold text-gray-700 block mt-0.5">{desc}</span>
                                        {act.error && (
                                          <span className="text-[9.5px] font-medium text-rose-500 block">Lỗi: {act.error}</span>
                                        )}
                                      </div>
                                      {act.executed ? (
                                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded font-black uppercase text-[8px] border border-emerald-200 flex items-center gap-0.5 mt-1 animate-fadeIn">
                                          <Check size={8} strokeWidth={3} />
                                          Thành công
                                        </span>
                                      ) : (
                                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-black uppercase text-[8px] border border-amber-200 mt-1">
                                          Chờ Lưu
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Button to confirm execution */}
                              <button
                                disabled={msg.actions.every((a) => a.executed)}
                                onClick={() => handleExecuteAIAction(msg.id)}
                                className={`w-full py-2 px-3 rounded-xl font-extrabold uppercase text-[10px] tracking-wide flex items-center justify-center gap-1.5 shadow-sm border transition-all ${
                                  msg.actions.every((a) => a.executed)
                                    ? "bg-gray-100 border-gray-150 text-gray-400 cursor-not-allowed"
                                    : "bg-emerald-600 border-emerald-500 hover:bg-emerald-500 text-white cursor-pointer active:scale-95"
                                }`}
                              >
                                {msg.actions.every((a) => a.executed) ? (
                                  <>
                                    <CheckCircle size={12} className="text-gray-400" />
                                    Đã cập nhật hệ thống thành công
                                  </>
                                ) : (
                                  <>
                                    <CloudLightning size={12} className="animate-bounce" />
                                    Bấm vào đây để AI nạp Dữ liệu
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isSending && (
                    <div className="flex gap-3 w-full max-w-[94%] sm:max-w-[88%] mr-auto">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0 animate-pulse border border-indigo-100">
                        <Bot size={16} />
                      </div>
                      <div className="bg-white text-gray-500 p-4 border border-gray-150 rounded-2xl shadow-sm text-xs flex items-center gap-2">
                        <RefreshCw className="animate-spin text-indigo-600" size={13} />
                        <span className="font-extrabold uppercase tracking-wide text-[9px]">AI đang đọc tài liệu và nạp dữ liệu...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Selected File Review Ribbon */}
                {selectedFile && (
                  <div className="bg-indigo-50/90 border-t border-indigo-100 px-4 py-2 flex items-center justify-between text-xs font-bold text-indigo-950 shadow-inner flex-shrink-0 animate-fadeIn">
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip size={12} className="text-indigo-600" />
                      <span className="truncate">{selectedFile.name} (Sẵn sàng đính kèm tệp gửi)</span>
                      {selectedFile.dataUrl && (
                        <img 
                          src={selectedFile.dataUrl} 
                          alt="attached preview" 
                          className="w-7 h-7 object-cover rounded border border-indigo-200"
                          referrerPolicy="no-referrer"
                        />
                      )}
                    </div>
                    <button 
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-[10px] text-rose-500 hover:text-rose-700 uppercase font-black tracking-tight"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                )}

                {/* Input Controls */}
                <div className="bg-white border-t border-gray-150 p-3 flex items-center gap-2.5 flex-shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                  {/* File Upload Trigger */}
                  <button
                    disabled={isSending}
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Đính kèm bảng Excel, CSV, ảnh chụp thông số..."
                    className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-500 hover:text-indigo-600 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <Paperclip size={18} />
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*,.pdf,.xlsx,.xls,.csv"
                    onChange={handleFileChange}
                  />

                  {/* Message Input Box */}
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isSending && handleSendChat()}
                    disabled={isSending}
                    placeholder="Gửi yêu cầu... ví dụ: 'Thêm công nhân Nguyễn Kim vào Chuyền 2'"
                    className="flex-1 bg-gray-50 hover:bg-white focus:bg-white text-xs font-semibold p-3 border border-gray-200 focus:border-indigo-500 rounded-xl outline-none transition-all disabled:opacity-50 text-sm"
                  />

                  {/* Send Action */}
                  <button
                    disabled={isSending || (!userInput.trim() && !selectedFile)}
                    type="button"
                    onClick={() => !isSending && handleSendChat()}
                    className="p-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-100 text-white disabled:text-gray-400 rounded-xl transition-all shadow-md shadow-indigo-600/10 active:scale-95 disabled:scale-100 cursor-pointer flex items-center justify-center"
                  >
                    {isSending ? (
                      <RefreshCw className="animate-spin" size={16} />
                    ) : (
                      <Send size={15} />
                    )}
                  </button>
                </div>
              </div>
            )}

            {subTab === "drive" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-black uppercase text-gray-900 flex items-center gap-2">
                    <FolderOpen size={18} className="text-indigo-600" />
                    Quản lý File Tài liệu Báo cáo trên Google Drive
                  </h4>
                  <p className="text-xs text-gray-500 font-semibold mt-1">
                    Thiết lập file Google Sheets kết nối. Hệ thống hỗ trợ đọc, ghi dữ liệu tự động giữa ứng dụng Garment Ops và tài liệu Sheets được chọn.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Select File from list in Drive */}
                  <div className="p-5 bg-gray-50/50 border border-gray-100 rounded-2xl space-y-4">
                    <p className="text-sm font-extrabold uppercase text-indigo-900 tracking-tight flex items-center gap-1.5">
                      <FileSpreadsheet size={16} /> Chuyển đổi Trang tính Liên kết
                    </p>
                    {loadingDrive ? (
                      <div className="py-8 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="animate-spin text-indigo-600" size={24} />
                        <span className="text-xs font-bold uppercase text-gray-400">Đang quét tài liệu Google Drive...</span>
                      </div>
                    ) : driveError ? (
                      <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex gap-2 items-start text-xs text-rose-700">
                        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                        <span>{driveError}</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {spreadsheets.length === 0 ? (
                          <p className="text-sm text-gray-400 italic">Không tìm thấy file Excel nào trên Drive của bạn.</p>
                        ) : (
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-gray-600">Chọn từ Google Drive của bạn:</label>
                            <select
                              value={selectedSpreadsheetId}
                              onChange={async (e) => {
                                const val = e.target.value;
                                setSelectedSpreadsheetId(val);
                                const selected = spreadsheets.find(s => s.id === val);
                                const name = selected ? selected.name : "";
                                if (selected) setSelectedSpreadsheetName(name);
                                await saveSpreadsheetConfig(val, customSpreadsheetId, name);
                              }}
                              className="w-full text-xs font-semibold p-3 border border-gray-200 bg-white rounded-xl focus:border-indigo-500 outline-none"
                            >
                              {spreadsheets.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="pt-2 border-t border-gray-100 space-y-2">
                          <label className="text-xs font-bold uppercase text-gray-600">Nhập thủ công Sheet ID (Tùy chọn):</label>
                          <input
                            type="text"
                            placeholder="Điền Google Sheets ID..."
                            value={customSpreadsheetId}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setCustomSpreadsheetId(val);
                              await saveSpreadsheetConfig(selectedSpreadsheetId, val, selectedSpreadsheetName);
                            }}
                            className="w-full text-xs font-mono p-3 border border-gray-200 bg-white rounded-xl focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Create New Spreadsheet helper */}
                  <div className="p-5 bg-gray-50/50 border border-gray-100 rounded-2xl space-y-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <p className="text-sm font-extrabold uppercase text-indigo-900 tracking-tight flex items-center gap-1.5">
                        <Plus size={16} /> Khởi tạo File Báo cáo Mới Gốc
                      </p>
                      <p className="text-xs text-gray-600 leading-relaxed font-semibold">
                        Nếu bạn chưa có file, nhấp để hệ thống tự động sinh một bảng tính hoàn chỉnh có sẵn layout trang tính trống làm chuẩn xuất nhập dữ liệu (*NhatKySanLuong*, *CongNhan*, *CongDoan*, *NghienCuuThoiGian*).
                      </p>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-500">Tên tài liệu thiết kế:</label>
                        <input
                          type="text"
                          value={creationName}
                          onChange={(e) => setCreationName(e.target.value)}
                          className="w-full text-xs font-semibold p-2.5 border border-gray-200 bg-white rounded-xl"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleCreateNewSpreadsheet}
                      disabled={isCreating}
                      className="w-full py-3 px-4 rounded-xl text-xs font-extrabold uppercase text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                    >
                      {isCreating ? (
                        <RefreshCw className="animate-spin" size={13} />
                      ) : (
                        <FileCheck size={14} />
                      )}
                      Tự động khởi tạo chuẩn report
                    </button>
                  </div>
                </div>



                {/* Display connected state details */}
                {getActiveSpreadsheetId() && (
                  <div className="bg-indigo-50/40 border border-indigo-150 p-4 rounded-2xl space-y-3">
                    <p className="text-xs font-extrabold uppercase text-indigo-900 tracking-wider">THÔNG TIN TRANG TÍNH ĐANG LIÊN KẾT</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                      <div className="space-y-1">
                        <p className="text-gray-500 text-xs">Tên file hiển thị:</p>
                        <p className="text-gray-800 break-all">{customSpreadsheetId ? "Sheet thủ công" : selectedSpreadsheetName || "Chưa tải xong"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-gray-500 text-xs">Tài liệu ID (Spreadsheet ID):</p>
                        <p className="text-gray-800 font-mono text-xs break-all">{getActiveSpreadsheetId()}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-indigo-100 flex justify-end">
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${getActiveSpreadsheetId()}/edit`}
                        target="_blank"
                        referrerPolicy="no-referrer"
                        className="text-xs font-extrabold uppercase tracking-tight text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm"
                      >
                        <ExternalLink size={12} />
                        Mở Google Sheets bằng tab mới
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {subTab === "export" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                    <Download size={16} className="text-indigo-600" />
                    Đẩy xuất dữ liệu hệ thống ra Google Sheets
                  </h4>
                  <p className="text-[11px] text-gray-400 font-semibold mt-1">
                    Xuất các bản ghi hoạt động trong máy từ Firestore lưu trữ thẳng vào file Google Sheets đã chọn ở mục Cài đặt File.
                  </p>
                </div>

                {!getActiveSpreadsheetId() ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs space-y-2 flex flex-col items-center text-center">
                    <AlertCircle size={22} className="text-amber-500 animate-[bounce_3s_infinite]" />
                    <p className="font-extrabold">CHƯA KHAI BÁO SHEET LIÊN KẾT</p>
                    <p className="text-gray-500 max-w-md font-semibold">Vui lòng quay lại tab <strong>Quản lý File Drive</strong> để liên kết một tài liệu spreadsheet hoặc bấm nút tự động khởi tạo trước khi thực hiện xuất báo cáo.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-extrabold uppercase text-gray-400">Chọn Loại Dữ Liệu Cần Xuất:</label>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { id: "logs", label: "Nhật ký sản lượng may", size: logs.length, units: "bản ghi" },
                            { id: "timeStudy", label: "Kết quả nghiên cứu bấm giờ", size: timeStudyRecords.length, units: "bản ghi" },
                            { id: "workers", label: "Danh sách công nhân chuyền", size: workers.length, units: "nhân sự" },
                            { id: "operations", label: "Danh sách công đoạn định mức", size: operations.length, units: "công đoạn" },
                          ].map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setExportType(item.id as any);
                                setExportSuccess(null);
                              }}
                              className={`w-full text-left p-2.5 rounded-xl border text-xs font-semibold flex justify-between items-center transition-all ${
                                exportType === item.id
                                  ? "bg-indigo-50 border-indigo-500 text-indigo-900"
                                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50/80"
                              }`}
                            >
                              <span>{item.label}</span>
                              <span className="text-[9px] bg-white border border-gray-200 text-gray-500 font-bold px-2 py-0.5 rounded-md">
                                {item.size} {item.units}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 flex flex-col justify-center">
                        <div className="p-4 bg-indigo-50/60 rounded-xl space-y-2 text-[11px] leading-relaxed font-semibold text-indigo-800">
                          <p className="font-extrabold flex items-center gap-1"><Zap size={12} /> CÁCH THỨC XUẤT HOẠT ĐỘNG:</p>
                          <p>Hệ thống sử dụng cơ chế <strong>Append (Thêm hàng mới)</strong>. Mọi dòng dữ liệu mới trong máy sẽ được tự động xếp vào các dòng trống cuối cùng của cột trong trang tính Google Sheets được liên kết mà không ghi đè, làm mất dữ liệu cũ của bạn.</p>
                        </div>
                        
                        <button
                          onClick={handleExportData}
                          disabled={isExporting}
                          className="w-full py-4 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold uppercase tracking-wide text-xs shadow-lg shadow-indigo-200 disabled:opacity-40 transition-all cursor-pointer flex items-center justify-center gap-2"
                        >
                          {isExporting ? (
                            <RefreshCw className="animate-spin" size={16} />
                          ) : (
                            <Download size={16} />
                          )}
                          Đẩy dữ liệu lên Cloud Sheets
                        </button>
                      </div>
                    </div>

                    {/* Success notification */}
                    <AnimatePresence>
                      {exportSuccess && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="bg-emerald-50 border border-emerald-250 p-4 rounded-xl flex items-start gap-2 text-emerald-800 text-xs"
                        >
                          <CheckCircle size={18} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                          <div className="space-y-1">
                            <p className="font-black">ĐỒNG BỘ THÀNH CÔNG!</p>
                            <p className="font-semibold">{exportSuccess}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            )}

            {subTab === "import" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-black uppercase text-gray-900 flex items-center gap-2">
                    <Upload size={16} className="text-indigo-600" />
                    Nhập dữ liệu tự động từ tài liệu Google Sheets vào máy
                  </h4>
                  <p className="text-[11px] text-gray-400 font-semibold mt-1">
                    Đọc dữ liệu hàng loạt từ file Sheets trên Drive nạp thẳng trực tiếp vào hệ thống danh bạ công nhân hoặc kho công đoạn của bạn để tiết kiệm thời gian gõ tay.
                  </p>
                </div>

                {!getActiveSpreadsheetId() ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs space-y-2 flex flex-col items-center text-center">
                    <AlertCircle size={22} className="text-amber-500" />
                    <p className="font-extrabold">CHƯA THIẾT LẬP FILE ĐỒNG BỘ</p>
                    <p className="text-gray-500 max-w-md font-semibold">Vui lòng bổ sung hoặc tạo sheet liên kết ở tab đầu tiên hoặc mở rộng quyền Sheets trước khi gọi nạp dữ liệu Excel.</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Setup range */}
                    {importingState === "idle" && (
                      <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-extrabold uppercase text-gray-400">Chọn Mục Đích Nạp Dữ Liệu:</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setImportType("workers")}
                              className={`flex-1 py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${
                                importType === "workers"
                                  ? "bg-indigo-600 border-indigo-600 text-white"
                                  : "bg-white border-gray-255 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <UserCheck size={14} /> Công Nhân
                            </button>
                            <button
                              onClick={() => setImportType("operations")}
                              className={`flex-1 py-3 px-4 rounded-xl border text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${
                                importType === "operations"
                                  ? "bg-indigo-600 border-indigo-600 text-white"
                                  : "bg-white border-gray-255 text-gray-600 hover:bg-gray-50"
                              }`}
                            >
                              <Database size={14} /> Công Đoạn
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-extrabold uppercase text-gray-400">Tên Sheet và Vùng chọn (Range):</label>
                            <input
                              type="text"
                              value={importRange}
                              onChange={(e) => setImportRange(e.target.value)}
                              className="w-full text-xs font-mono p-3 border border-gray-200 bg-white rounded-xl focus:border-indigo-500 outline-none"
                              placeholder="e.g. Sheet1!A1:E100 hoặc CongNhan!A1:E200"
                            />
                            <p className="text-[9px] text-gray-400 font-semibold italic">Mẹo: Bạn có thể điền <code>Sheet1!A1:E200</code> hoặc <code>CongNhan!A1:E50</code> tùy theo tên bảng của bạn.</p>
                          </div>
                        </div>

                        <div className="flex flex-col justify-end">
                          <button
                            onClick={handleFetchSheetForImport}
                            className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold uppercase flex items-center justify-center gap-2"
                          >
                            <ArrowRight size={14} /> Quét và Tải dữ liệu xem trước
                          </button>
                        </div>
                      </div>
                    )}

                    {importingState === "fetching" && (
                      <div className="border border-gray-100 p-12 rounded-3xl flex flex-col items-center justify-center gap-4 bg-gray-50/50">
                        <RefreshCw className="animate-spin text-indigo-600" size={32} />
                        <p className="text-xs uppercase font-extrabold text-gray-500 tracking-widest">Đang tải cấu trúc từ Google Sheets...</p>
                      </div>
                    )}

                    {importingState === "preview" && sheetData.length > 0 && (
                      <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl space-y-4">
                        <p className="text-xs font-extrabold uppercase text-indigo-950">Khớp cột dữ liệu & Xem trước ({sheetData.length - 1} dòng dữ liệu)</p>
                        
                        {/* Headers Mapping selection */}
                        <div className="p-4 bg-white border border-gray-150 rounded-xl space-y-3 text-xs">
                          <p className="font-extrabold text-gray-700 text-[10px] uppercase">Gán các cột tương ứng từ File Excel của bạn:</p>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {importType === "workers" ? (
                              <>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Tên Công Nhân:</label>
                                  <select
                                    value={selectedHeaders.name ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, name: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Mã Số Công Nhân (Mã thẻ):</label>
                                  <select
                                    value={selectedHeaders.code ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, code: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Chuyền / Tổ gắn liền:</label>
                                  <select
                                    value={selectedHeaders.line ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, line: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Các công đoạn làm được (Skills):</label>
                                  <select
                                    value={selectedHeaders.skills ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, skills: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Tên Công Đoạn:</label>
                                  <select
                                    value={selectedHeaders.name ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, name: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Mã Công Đoạn:</label>
                                  <select
                                    value={selectedHeaders.code ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, code: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Định định mức SAM:</label>
                                  <select
                                    value={selectedHeaders.sam ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, sam: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase text-gray-400">Sản lượng mục tiêu/Giờ:</label>
                                  <select
                                    value={selectedHeaders.target ?? ""}
                                    onChange={(e) => setSelectedHeaders({ ...selectedHeaders, target: Number(e.target.value) })}
                                    className="w-full text-xs p-2 border border-gray-200 bg-white rounded-lg font-semibold"
                                  >
                                    <option value="">- Chọn cột -</option>
                                    {sheetData[0].map((h, i) => (
                                      <option key={i} value={i}>Cột {i + 1}: {h}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Data Grid Preview */}
                        <div className="overflow-x-auto max-h-[220px] border border-gray-150 rounded-xl whitespace-nowrap bg-white">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="bg-gray-100 font-bold sticky top-0 text-slate-800 border-b border-gray-200">
                              <tr>
                                {sheetData[0].map((h, idx) => (
                                  <th key={idx} className="p-2.5">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-600 font-semibold">
                              {sheetData.slice(1, 10).map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-gray-50/50">
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="p-2">
                                      {cell?.toString() || "-"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              {sheetData.length > 10 && (
                                <tr>
                                  <td colSpan={sheetData[0].length} className="text-center p-3 text-gray-400 text-[10px] italic bg-gray-50">
                                    ... Và thêm {sheetData.length - 10} dòng khác nữa
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                          <button
                            onClick={() => {
                              setSheetData([]);
                              setImportingState("idle");
                            }}
                            className="px-4 py-2 border border-gray-200 text-gray-500 font-extrabold uppercase rounded-lg text-[10px] cursor-pointer"
                          >
                            Hủy Bỏ
                          </button>
                          
                          <button
                            onClick={executeImport}
                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold uppercase rounded-xl text-[10px] cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            <UserCheck size={12} />
                            Tiến hành Đồng bộ vào App
                          </button>
                        </div>
                      </div>
                    )}

                    {importingState === "submitting" && (
                      <div className="border border-gray-100 p-12 rounded-3xl flex flex-col items-center justify-center gap-4 bg-gray-50/50">
                        <RefreshCw className="animate-spin text-emerald-600" size={32} />
                        <p className="text-xs uppercase font-extrabold text-emerald-600 tracking-widest">Đang tải dữ liệu vào Firestore...</p>
                      </div>
                    )}

                    {/* Success prompt for imports */}
                    {successImportCount !== null && (
                      <div className="bg-emerald-50 border border-emerald-250 p-5 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs shadow-sm">
                        <CheckCircle size={22} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-black text-sm uppercase">NẠP DỮ LIỆU THÀNH CÔNG!</p>
                          <p className="font-semibold text-gray-600 mt-1">
                            Đã nạp thành công <strong>{successImportCount}</strong> bản ghi mới từ bảng tính Google Sheets vào hệ thống đám mây. Bạn có thể sử dụng các dữ liệu mới này ngay lập tức!
                          </p>
                          <button
                            onClick={() => {
                              setSuccessImportCount(null);
                              setImportingState("idle");
                            }}
                            className="mt-3 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg font-black uppercase text-[10px] hover:bg-emerald-100 transition-colors cursor-pointer text-emerald-850"
                          >
                            Đồng bộ File khác
                          </button>
                        </div>
                      </div>
                    )}

                    {importError && (
                      <div className="bg-rose-50 border border-rose-250 p-4 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
                        <AlertCircle size={18} className="text-rose-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="font-black uppercase">LỖI XỬ LÝ NHẬP KIỂU</p>
                          <p className="font-semibold">{importError}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
