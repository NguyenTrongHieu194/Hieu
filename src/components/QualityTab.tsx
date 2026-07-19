import React, { useState } from "react";
import { 
  ShieldAlert, Plus, Trash2, Edit, Filter, Calendar, 
  ChevronLeft, ChevronRight, BarChart3, Users, Scissors, Info, Sparkles,
  FileSpreadsheet, Download, Clipboard, Printer, FileText, Check, X
} from "lucide-react";
import { format, parseISO, isSameWeek, addDays, subDays, addMonths, subMonths } from "date-fns";
import { Worker, Operation, QualityLog } from "../types";

interface QualityTabProps {
  workers: Worker[];
  operations: Operation[];
  qualityLogs: QualityLog[];
  lines: string[];
  onAddLog: (col: "qualityLogs", data: any) => Promise<void>;
  onUpdateLog: (col: "qualityLogs", id: string, data: any) => Promise<void>;
  onDeleteLog: (col: "qualityLogs", id: string) => Promise<void>;
}

export const QualityTab: React.FC<QualityTabProps> = ({
  workers,
  operations,
  qualityLogs,
  lines,
  onAddLog,
  onUpdateLog,
  onDeleteLog
}) => {
  const [filterPeriod, setFilterPeriod] = useState<"day" | "week" | "month">("month");
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [filterLine, setFilterLine] = useState<string>("Tất cả");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal & Edit Form States
  const [isOpenModal, setIsOpenModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Report Modal States
  const [isOpenReportModal, setIsOpenReportModal] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month">("month");
  const [reportDate, setReportDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reportLine, setReportLine] = useState("Tất cả");
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Form Fields
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formLine, setFormLine] = useState("");
  const [formWorkerId, setFormWorkerId] = useState("");
  const [formOperationId, setFormOperationId] = useState("");
  const [formTotalChecked, setFormTotalChecked] = useState<number>(100);
  const [formDefectCount, setFormDefectCount] = useState<number>(0);
  const [formDefectType, setFormDefectType] = useState("Bỏ mũi");
  const [formCustomDefectType, setFormCustomDefectType] = useState("");
  const [formSeverity, setFormSeverity] = useState<"mild" | "moderate" | "critical">("mild");
  const [formNotes, setFormNotes] = useState("");

  const defaultPresets = [
    "Bỏ mũi",
    "Đứt chỉ",
    "Lệch đường may",
    "Nhăn sườn",
    "Lỗi rập",
    "Bẩn dầu",
    "Thủng vải"
  ];

  const [customPresets, setCustomPresets] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("custom_defect_types");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [newCustomPresetInput, setNewCustomPresetInput] = useState("");
  const [showAddPresetInput, setShowAddPresetInput] = useState(false);

  const defectTypePresets = [...defaultPresets, ...customPresets, "Khác"];

  // Date Navigation Helpers
  const handlePrevPeriod = () => {
    const current = parseISO(filterDate);
    if (filterPeriod === "day") {
      setFilterDate(format(subDays(current, 1), "yyyy-MM-dd"));
    } else if (filterPeriod === "week") {
      setFilterDate(format(subDays(current, 7), "yyyy-MM-dd"));
    } else {
      setFilterDate(format(subMonths(current, 1), "yyyy-MM-dd"));
    }
  };

  const handleNextPeriod = () => {
    const current = parseISO(filterDate);
    if (filterPeriod === "day") {
      setFilterDate(format(addDays(current, 1), "yyyy-MM-dd"));
    } else if (filterPeriod === "week") {
      setFilterDate(format(addDays(current, 7), "yyyy-MM-dd"));
    } else {
      setFilterDate(format(addMonths(current, 1), "yyyy-MM-dd"));
    }
  };

  const safeFormatDate = (dateStr: string, formatStr: string) => {
    try {
      return format(parseISO(dateStr), formatStr);
    } catch {
      return dateStr;
    }
  };

  // Filter Quality Logs based on selected Period & Line
  const filteredLogs = qualityLogs.filter(log => {
    // 1. Line Filter
    if (filterLine !== "Tất cả" && log.line !== filterLine) return false;

    // 2. Period Filter
    const logDateObj = parseISO(log.date);
    const filterDateObj = parseISO(filterDate);
    
    if (filterPeriod === "day") {
      if (log.date !== filterDate) return false;
    } else if (filterPeriod === "week") {
      if (!isSameWeek(logDateObj, filterDateObj, { weekStartsOn: 1 })) return false;
    } else if (filterPeriod === "month") {
      if (log.date.substring(0, 7) !== filterDate.substring(0, 7)) return false;
    }

    // 3. Search Query (Worker Name, Code, Defect Type, Operation Name)
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const worker = workers.find(w => w.id === log.workerId);
      const op = operations.find(o => o.id === log.operationId);
      const workerMatch = worker && (worker.name.toLowerCase().includes(q) || worker.code.toLowerCase().includes(q));
      const opMatch = op && (op.name.toLowerCase().includes(q) || op.code.toLowerCase().includes(q));
      const defectMatch = log.defectType.toLowerCase().includes(q);
      const notesMatch = log.notes?.toLowerCase().includes(q);
      if (!workerMatch && !opMatch && !defectMatch && !notesMatch) return false;
    }

    return true;
  });

  // Calculate Statistics
  const totalChecked = filteredLogs.reduce((acc, log) => acc + (log.totalChecked || 0), 0);
  const totalDefects = filteredLogs.reduce((acc, log) => acc + (log.defectCount || 0), 0);
  const averageDefectRate = totalChecked > 0 ? (totalDefects / totalChecked) * 100 : 0;
  const criticalDefectsCount = filteredLogs.filter(log => log.severity === "critical").reduce((acc, log) => acc + log.defectCount, 0);

  // Stats: Defect rate by Worker (Ai hay may hư)
  const workerStatsMap: Record<string, { totalChecked: number; defectCount: number; severityScore: number }> = {};
  filteredLogs.forEach(log => {
    if (!log.workerId) return;
    if (!workerStatsMap[log.workerId]) {
      workerStatsMap[log.workerId] = { totalChecked: 0, defectCount: 0, severityScore: 0 };
    }
    workerStatsMap[log.workerId].totalChecked += log.totalChecked;
    workerStatsMap[log.workerId].defectCount += log.defectCount;
    // Critical = 3 pts, Moderate = 2 pts, Mild = 1 pt
    const multiplier = log.severity === "critical" ? 3 : log.severity === "moderate" ? 2 : 1;
    workerStatsMap[log.workerId].severityScore += log.defectCount * multiplier;
  });

  const workerStatsList = Object.entries(workerStatsMap).map(([workerId, data]) => {
    const workerObj = workers.find(w => w.id === workerId);
    const defectRate = data.totalChecked > 0 ? (data.defectCount / data.totalChecked) * 100 : 0;
    return {
      workerId,
      workerName: workerObj?.name || "Công nhân ẩn",
      workerCode: workerObj?.code || "N/A",
      line: workerObj?.line || "Chưa rõ",
      ...data,
      defectRate
    };
  }).sort((a, b) => b.defectCount - a.defectCount); // Sort by total defects

  // Stats: Quality by Operation (Theo từng công đoạn)
  const operationStatsMap: Record<string, { totalChecked: number; defectCount: number }> = {};
  filteredLogs.forEach(log => {
    if (!log.operationId) return;
    if (!operationStatsMap[log.operationId]) {
      operationStatsMap[log.operationId] = { totalChecked: 0, defectCount: 0 };
    }
    operationStatsMap[log.operationId].totalChecked += log.totalChecked;
    operationStatsMap[log.operationId].defectCount += log.defectCount;
  });

  const operationStatsList = Object.entries(operationStatsMap).map(([opId, data]) => {
    const opObj = operations.find(o => o.id === opId);
    const defectRate = data.totalChecked > 0 ? (data.defectCount / data.totalChecked) * 100 : 0;
    return {
      opId,
      opName: opObj?.name || "Công đoạn ẩn",
      opCode: opObj?.code || "N/A",
      ...data,
      defectRate
    };
  }).sort((a, b) => b.defectCount - a.defectCount);

  // Stats: Defect Types Distribution
  const defectTypeStatsMap: Record<string, number> = {};
  filteredLogs.forEach(log => {
    const type = log.defectType || "Khác";
    defectTypeStatsMap[type] = (defectTypeStatsMap[type] || 0) + log.defectCount;
  });
  const defectTypeStatsList = Object.entries(defectTypeStatsMap)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Handle Form Submission (Add/Edit)
  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLine || !formWorkerId || !formOperationId) {
      alert("Vui lòng điền đầy đủ Chuyền, Công nhân và Công đoạn!");
      return;
    }
    if (formDefectCount > formTotalChecked) {
      alert("Số lượng sản phẩm lỗi không thể lớn hơn tổng số lượng đã kiểm tra!");
      return;
    }

    const finalDefectType = formDefectType === "Khác" ? formCustomDefectType.trim() : formDefectType;
    if (!finalDefectType) {
      alert("Vui lòng nhập loại lỗi!");
      return;
    }

    const logData = {
      date: formDate,
      line: formLine,
      workerId: formWorkerId,
      operationId: formOperationId,
      totalChecked: Number(formTotalChecked),
      defectCount: Number(formDefectCount),
      defectType: finalDefectType,
      severity: formSeverity,
      notes: formNotes.trim() || ""
    };

    try {
      if (isEditing && editingId) {
        await onUpdateLog("qualityLogs", editingId, logData);
      } else {
        await onAddLog("qualityLogs", logData);
      }
      setIsOpenModal(false);
      resetForm();
    } catch (err) {
      console.error("Save quality log error: ", err);
    }
  };

  // Set values to form for Editing
  const handleStartEdit = (log: QualityLog) => {
    setIsEditing(true);
    setEditingId(log.id);
    setFormDate(log.date);
    setFormLine(log.line);
    setFormWorkerId(log.workerId);
    setFormOperationId(log.operationId);
    setFormTotalChecked(log.totalChecked);
    setFormDefectCount(log.defectCount);
    
    if (defectTypePresets.includes(log.defectType)) {
      setFormDefectType(log.defectType);
      setFormCustomDefectType("");
    } else {
      setFormDefectType("Khác");
      setFormCustomDefectType(log.defectType);
    }
    
    setFormSeverity(log.severity);
    setFormNotes(log.notes || "");
    setIsOpenModal(true);
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setFormLine(lines[0] || "Chuyền 1");
    setFormWorkerId("");
    setFormOperationId("");
    setFormTotalChecked(100);
    setFormDefectCount(0);
    setFormDefectType("Bỏ mũi");
    setFormCustomDefectType("");
    setFormSeverity("mild");
    setFormNotes("");
  };

  // Open add modal
  const handleOpenAdd = () => {
    resetForm();
    if (lines.length > 0) {
      setFormLine(lines[0]);
    }
    setIsOpenModal(true);
  };

  const handleOpenReport = () => {
    setReportPeriod(filterPeriod);
    setReportDate(filterDate);
    setReportLine(filterLine);
    setIsOpenReportModal(true);
  };

  // Report Calculations & Handlers
  const reportLogs = qualityLogs.filter(log => {
    if (reportLine !== "Tất cả" && log.line !== reportLine) return false;
    const logDateObj = parseISO(log.date);
    const filterDateObj = parseISO(reportDate);
    if (reportPeriod === "day") {
      if (log.date !== reportDate) return false;
    } else if (reportPeriod === "week") {
      if (!isSameWeek(logDateObj, filterDateObj, { weekStartsOn: 1 })) return false;
    } else if (reportPeriod === "month") {
      if (log.date.substring(0, 7) !== reportDate.substring(0, 7)) return false;
    }
    return true;
  });

  const repTotalChecked = reportLogs.reduce((acc, log) => acc + (log.totalChecked || 0), 0);
  const repTotalDefects = reportLogs.reduce((acc, log) => acc + (log.defectCount || 0), 0);
  const repAverageDefectRate = repTotalChecked > 0 ? (repTotalDefects / repTotalChecked) * 100 : 0;
  const repCriticalCount = reportLogs.filter(log => log.severity === "critical").reduce((acc, log) => acc + log.defectCount, 0);

  const repWorkerStatsMap: Record<string, { totalChecked: number; defectCount: number }> = {};
  reportLogs.forEach(log => {
    if (!log.workerId) return;
    if (!repWorkerStatsMap[log.workerId]) repWorkerStatsMap[log.workerId] = { totalChecked: 0, defectCount: 0 };
    repWorkerStatsMap[log.workerId].totalChecked += log.totalChecked;
    repWorkerStatsMap[log.workerId].defectCount += log.defectCount;
  });

  const repWorkerStatsList = Object.entries(repWorkerStatsMap).map(([wId, data]) => {
    const w = workers.find(item => item.id === wId);
    return {
      name: w?.name || "N/A",
      code: w?.code || "N/A",
      line: w?.line || "N/A",
      ...data,
      defectRate: data.totalChecked > 0 ? (data.defectCount / data.totalChecked) * 100 : 0
    };
  }).sort((a, b) => b.defectCount - a.defectCount);

  const repOpStatsMap: Record<string, { totalChecked: number; defectCount: number }> = {};
  reportLogs.forEach(log => {
    if (!log.operationId) return;
    if (!repOpStatsMap[log.operationId]) repOpStatsMap[log.operationId] = { totalChecked: 0, defectCount: 0 };
    repOpStatsMap[log.operationId].totalChecked += log.totalChecked;
    repOpStatsMap[log.operationId].defectCount += log.defectCount;
  });

  const repOpStatsList = Object.entries(repOpStatsMap).map(([opId, data]) => {
    const op = operations.find(o => o.id === opId);
    return {
      name: op?.name || "N/A",
      code: op?.code || "N/A",
      ...data,
      defectRate: data.totalChecked > 0 ? (data.defectCount / data.totalChecked) * 100 : 0
    };
  }).sort((a, b) => b.defectCount - a.defectCount);

  const repDefectMap: Record<string, number> = {};
  reportLogs.forEach(log => {
    repDefectMap[log.defectType] = (repDefectMap[log.defectType] || 0) + log.defectCount;
  });
  const repDefectList = Object.entries(repDefectMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  const handlePrevReportPeriod = () => {
    const current = parseISO(reportDate);
    if (reportPeriod === "day") {
      setReportDate(format(subDays(current, 1), "yyyy-MM-dd"));
    } else if (reportPeriod === "week") {
      setReportDate(format(subDays(current, 7), "yyyy-MM-dd"));
    } else {
      setReportDate(format(subMonths(current, 1), "yyyy-MM-dd"));
    }
  };

  const handleNextReportPeriod = () => {
    const current = parseISO(reportDate);
    if (reportPeriod === "day") {
      setReportDate(format(addDays(current, 1), "yyyy-MM-dd"));
    } else if (reportPeriod === "week") {
      setReportDate(format(addDays(current, 7), "yyyy-MM-dd"));
    } else {
      setReportDate(format(addMonths(current, 1), "yyyy-MM-dd"));
    }
  };

  const handleCopyReportText = () => {
    let periodStr = "";
    if (reportPeriod === "day") {
      periodStr = `Ngày ${safeFormatDate(reportDate, "dd/MM/yyyy")}`;
    } else if (reportPeriod === "week") {
      periodStr = `Tuần từ ${safeFormatDate(reportDate, "dd/MM/yyyy")}`;
    } else {
      periodStr = `Tháng ${safeFormatDate(reportDate, "MM/yyyy")}`;
    }

    const title = `📊 BÁO CÁO CHẤT LƯỢNG ĐƯỜNG MAY (${periodStr.toUpperCase()})\n`;
    const sub = `Chuyền: ${reportLine === "Tất cả" ? "Tất cả các chuyền" : reportLine}\n`;
    const separator = `-----------------------------------------\n`;
    
    const stats = `📌 SỐ LIỆU TỔNG HỢP:\n` +
      `- Tổng sản phẩm đã kiểm tra: ${repTotalChecked.toLocaleString()} pcs\n` +
      `- Tổng sản phẩm phát hiện lỗi: ${repTotalDefects.toLocaleString()} pcs\n` +
      `- Tỷ lệ sai hỏng trung bình: ${repAverageDefectRate.toFixed(2)}%\n` +
      `- Số lỗi nghiêm trọng (Critical): ${repCriticalCount.toLocaleString()} pcs\n\n`;

    let topWorkers = `👷 TOP CÔNG NHÂN SAI HỎNG NHIỀU NHẤT:\n`;
    if (repWorkerStatsList.length === 0) {
      topWorkers += `(Không có dữ liệu lỗi)\n`;
    } else {
      repWorkerStatsList.slice(0, 3).forEach((w, index) => {
        topWorkers += `${index + 1}. ${w.name} (${w.code} - ${w.line}): ${w.defectCount} lỗi / ${w.totalChecked} kiểm tra (${w.defectRate.toFixed(1)}%)\n`;
      });
    }
    topWorkers += `\n`;

    let topOps = `✂️ CÔNG ĐOẠN PHÁT SINH NHIỀU LỖI NHẤT:\n`;
    if (repOpStatsList.length === 0) {
      topOps += `(Không có dữ liệu lỗi)\n`;
    } else {
      repOpStatsList.slice(0, 3).forEach((o, index) => {
        topOps += `${index + 1}. ${o.name} (${o.code}): ${o.defectCount} lỗi / ${o.totalChecked} kiểm tra (${o.defectRate.toFixed(1)}%)\n`;
      });
    }
    topOps += `\n`;

    let defectTypes = `🧵 CƠ CẤU LOẠI LỖI PHỔ BIẾN:\n`;
    if (repDefectList.length === 0) {
      defectTypes += `(Không có dữ liệu lỗi)\n`;
    } else {
      repDefectList.slice(0, 3).forEach((d, index) => {
        defectTypes += `${index + 1}. Lỗi ${d.type}: ${d.count} lần xuất hiện\n`;
      });
    }

    const footer = `\nBáo cáo được khởi tạo tự động từ hệ thống quản lý dệt may.`;

    const fullReportText = title + sub + separator + stats + topWorkers + topOps + defectTypes + footer;

    navigator.clipboard.writeText(fullReportText).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    }).catch(err => {
      console.error("Failed to copy report text: ", err);
    });
  };

  const handleDownloadCSV = () => {
    let periodStr = "";
    if (reportPeriod === "day") {
      periodStr = safeFormatDate(reportDate, "dd-MM-yyyy");
    } else if (reportPeriod === "week") {
      periodStr = `tuan-${safeFormatDate(reportDate, "dd-MM-yyyy")}`;
    } else {
      periodStr = `thang-${safeFormatDate(reportDate, "MM-yyyy")}`;
    }

    let csvContent = "\uFEFF"; // UTF-8 BOM
    csvContent += `BÁO CÁO TỔNG HỢP CHẤT LƯỢNG ĐƯỜNG MAY\n`;
    csvContent += `Thời gian,${reportPeriod === "day" ? "Ngày" : reportPeriod === "week" ? "Tuần" : "Tháng"} ${periodStr}\n`;
    csvContent += `Chuyền,${reportLine}\n\n`;

    csvContent += `SỐ LIỆU TỔNG HỢP\n`;
    csvContent += `Sản phẩm đã kiểm tra,${repTotalChecked}\n`;
    csvContent += `Sản phẩm sai hỏng,${repTotalDefects}\n`;
    csvContent += `Tỷ lệ sai hỏng trung bình,${repAverageDefectRate.toFixed(2)}%\n`;
    csvContent += `Số lỗi nghiêm trọng,${repCriticalCount}\n\n`;

    csvContent += `CHI TIẾT LỖI THEO CÔNG NHÂN\n`;
    csvContent += `Mã công nhân,Tên công nhân,Chuyền,Số lượng kiểm tra,Số lượng sai hỏng,Tỷ lệ lỗi (%)\n`;
    repWorkerStatsList.forEach(w => {
      csvContent += `"${w.code}","${w.name}","${w.line}",${w.totalChecked},${w.defectCount},${w.defectRate.toFixed(2)}\n`;
    });
    csvContent += `\n`;

    csvContent += `CHI TIẾT LỖI THEO CÔNG ĐOẠN\n`;
    csvContent += `Mã công đoạn,Tên công đoạn,Số lượng kiểm tra,Số lượng sai hỏng,Tỷ lệ lỗi (%)\n`;
    repOpStatsList.forEach(o => {
      csvContent += `"${o.code}","${o.name}",${o.totalChecked},${o.defectCount},${o.defectRate.toFixed(2)}\n`;
    });
    csvContent += `\n`;

    csvContent += `CHI TIẾT LOẠI LỖI PHÁT SINH\n`;
    csvContent += `Loại lỗi,Số lượng phát sinh\n`;
    repDefectList.forEach(d => {
      csvContent += `"${d.type}",${d.count}\n`;
    });
    csvContent += `\n`;

    csvContent += `DANH SÁCH PHIẾU KIỂM LỖI CHI TIẾT\n`;
    csvContent += `Ngày,Chuyền,Mã công nhân,Tên công nhân,Tên công đoạn,Loại lỗi,Mức độ,Số lượng kiểm tra,Số lượng lỗi,Ghi chú\n`;
    reportLogs.forEach(log => {
      const w = workers.find(item => item.id === log.workerId);
      const op = operations.find(item => item.id === log.operationId);
      const severityStr = log.severity === "critical" ? "Nghiêm trọng" : log.severity === "moderate" ? "Vừa" : "Nhẹ";
      csvContent += `"${log.date}","${log.line}","${w?.code || ""}","${w?.name || ""}","${op?.name || ""}","${log.defectType}","${severityStr}",${log.totalChecked},${log.defectCount},"${(log.notes || "").replace(/"/g, '""')}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `bao_cao_chat_luong_${periodStr}_${reportLine.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Vui lòng cho phép trình duyệt mở popup để in báo cáo!");
      return;
    }

    let periodStr = "";
    if (reportPeriod === "day") {
      periodStr = `Ngày ${safeFormatDate(reportDate, "dd/MM/yyyy")}`;
    } else if (reportPeriod === "week") {
      periodStr = `Tuần bắt đầu từ ${safeFormatDate(reportDate, "dd/MM/yyyy")}`;
    } else {
      periodStr = `Tháng ${safeFormatDate(reportDate, "MM/yyyy")}`;
    }

    let workerRows = repWorkerStatsList.map(w => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${w.code}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${w.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${w.line}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${w.totalChecked}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #dc2626; font-weight: bold;">${w.defectCount}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${w.defectRate.toFixed(2)}%</td>
      </tr>
    `).join("");

    let opRows = repOpStatsList.map(o => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${o.code}</td>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${o.name}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${o.totalChecked}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; color: #dc2626; font-weight: bold;">${o.defectCount}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${o.defectRate.toFixed(2)}%</td>
      </tr>
    `).join("");

    let defectRows = repDefectList.map(d => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${d.type}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #4f46e5;">${d.count}</td>
      </tr>
    `).join("");

    let detailedRows = reportLogs.map(log => {
      const w = workers.find(item => item.id === log.workerId);
      const op = operations.find(item => item.id === log.operationId);
      const severityStr = log.severity === "critical" ? "Nghiêm trọng" : log.severity === "moderate" ? "Vừa" : "Nhẹ";
      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd;">${log.date}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${log.line}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${w?.name || ""} (${w?.code || ""})</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${op?.name || ""}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${log.defectType}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${severityStr}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${log.totalChecked}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #dc2626;">${log.defectCount}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Báo cáo chất lượng ${periodStr}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 20px; line-height: 1.5; }
            h1 { text-align: center; color: #1e1b4b; margin-bottom: 5px; }
            h2 { text-align: center; color: #4f46e5; margin-top: 0; font-size: 1.2rem; }
            h3 { border-bottom: 2px solid #4f46e5; color: #1e1b4b; padding-bottom: 5px; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
            th { background-color: #f3f4f6; padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: left; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
            .card { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center; }
            .card .val { font-size: 1.5rem; font-weight: bold; color: #1e1b4b; margin-top: 5px; }
            .card .lbl { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; font-weight: bold; }
            @media print {
              button { display: none; }
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: right;">
            <button onclick="window.print()" style="background-color: #4f46e5; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">IN BÁO CÁO</button>
          </div>
          <h1>BÁO CÁO TỔNG HỢP CHẤT LƯỢNG ĐƯỜNG MAY</h1>
          <h2>Thống kê ${periodStr} - Chuyền: ${reportLine}</h2>
          
          <div class="grid">
            <div class="card">
              <div class="lbl">Sản phẩm đã kiểm tra</div>
              <div class="val">${repTotalChecked.toLocaleString()} pcs</div>
            </div>
            <div class="card">
              <div class="lbl">Sản phẩm sai hỏng</div>
              <div class="val" style="color: #dc2626;">${repTotalDefects.toLocaleString()} pcs</div>
            </div>
            <div class="card">
              <div class="lbl">Tỷ lệ sai hỏng trung bình</div>
              <div class="val" style="color: ${repAverageDefectRate > 5 ? '#dc2626' : repAverageDefectRate > 2 ? '#b45309' : '#059669'};">${repAverageDefectRate.toFixed(2)}%</div>
            </div>
            <div class="card">
              <div class="lbl">Số lỗi nghiêm trọng</div>
              <div class="val" style="color: #a855f7;">${repCriticalCount.toLocaleString()} pcs</div>
            </div>
          </div>

          <h3>1. CHI TIẾT SAI HỎNG THEO CÔNG NHÂN</h3>
          <table>
            <thead>
              <tr>
                <th>Mã CN</th>
                <th>Tên Công Nhân</th>
                <th>Chuyền</th>
                <th>Kiểm tra</th>
                <th>Số lỗi</th>
                <th>Tỷ lệ lỗi</th>
              </tr>
            </thead>
            <tbody>
              \${workerRows || '<tr><td colspan="6" style="text-align:center; padding: 15px; color: #888;">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>

          <h3>2. CHI TIẾT SAI HỎNG THEO CÔNG ĐOẠN</h3>
          <table>
            <thead>
              <tr>
                <th>Mã CĐ</th>
                <th>Tên Công Đoạn</th>
                <th>Kiểm tra</th>
                <th>Số lỗi</th>
                <th>Tỷ lệ lỗi</th>
              </tr>
            </thead>
            <tbody>
              \${opRows || '<tr><td colspan="5" style="text-align:center; padding: 15px; color: #888;">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>

          <div style="display: grid; grid-template-columns: 1fr; gap: 20px;">
            <div>
              <h3>3. CƠ CẤU LOẠI LỖI PHỔ BIẾN</h3>
              <table>
                <thead>
                  <tr>
                    <th>Loại Lỗi</th>
                    <th style="width: 150px; text-align: center;">Số lượng phát sinh</th>
                  </tr>
                </thead>
                <tbody>
                  \${defectRows || '<tr><td colspan="2" style="text-align:center; padding: 15px; color: #888;">Không có dữ liệu</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>

          <h3>4. CHI TIẾT DANH SÁCH PHIẾU KIỂM LỖI</h3>
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Chuyền</th>
                <th>Công nhân</th>
                <th>Công đoạn</th>
                <th>Loại lỗi</th>
                <th>Mức độ</th>
                <th>Kiểm tra</th>
                <th>Số lỗi</th>
              </tr>
            </thead>
            <tbody>
              \${detailedRows || '<tr><td colspan="8" style="text-align:center; padding: 15px; color: #888;">Không có dữ liệu</td></tr>'}
            </tbody>
          </table>

          <div style="margin-top: 50px; text-align: right; font-style: italic; color: #666; font-size: 0.85rem;">
            Người lập báo cáo: Hệ thống dệt may tự động &bull; Thời gian xuất: \${new Date().toLocaleString('vi-VN')}
          </div>
          
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Filter workers based on selected formLine
  const workersOnSelectedLine = workers.filter(w => !formLine || w.line === formLine);

  return (
    <div id="quality-section-root" className="space-y-6">
      {/* Tab Header Controls */}
      <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-950 flex items-center gap-2">
            🛡️ Quản Lý Chất Lượng Đường May
          </h2>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mt-0.5">
            Thống kê sai hỏng theo công đoạn &amp; công nhân để giảm tỷ lệ lỗi
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            id="btn-open-quality-report"
            onClick={handleOpenReport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2.5 rounded-2xl flex items-center gap-1.5 transition-all text-xs cursor-pointer shadow-md shadow-emerald-100"
          >
            <BarChart3 size={16} /> Xuất Báo Cáo
          </button>
          <button
            id="btn-add-quality-log"
            onClick={handleOpenAdd}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-2.5 rounded-2xl flex items-center gap-1.5 transition-all text-xs cursor-pointer shadow-md shadow-indigo-100"
          >
            <Plus size={16} /> Thêm Phiếu Kiểm Lỗi
          </button>
        </div>
      </div>

      {/* Dynamic Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Period Selector */}
        <div className="lg:col-span-3">
          <div className="grid grid-cols-3 gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100">
            <button
              onClick={() => setFilterPeriod("day")}
              className={`py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                filterPeriod === "day" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setFilterPeriod("week")}
              className={`py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                filterPeriod === "week" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Tuần này
            </button>
            <button
              onClick={() => setFilterPeriod("month")}
              className={`py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                filterPeriod === "month" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Tháng này
            </button>
          </div>
        </div>

        {/* Date Selector with Nav buttons */}
        <div className="lg:col-span-3 flex items-center justify-between bg-gray-50 p-1 rounded-2xl border border-gray-100">
          <button
            onClick={handlePrevPeriod}
            className="p-1.5 hover:bg-white rounded-xl text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-black text-gray-900 truncate">
            {filterPeriod === "day" && safeFormatDate(filterDate, "dd/MM/yyyy")}
            {filterPeriod === "week" && `Tuần: ${safeFormatDate(filterDate, "dd/MM/yyyy")}`}
            {filterPeriod === "month" && `Tháng: ${safeFormatDate(filterDate, "MM/yyyy")}`}
          </span>
          <button
            onClick={handleNextPeriod}
            className="p-1.5 hover:bg-white rounded-xl text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Line Filter */}
        <div className="lg:col-span-2">
          <div className="relative">
            <select
              value={filterLine}
              onChange={(e) => setFilterLine(e.target.value)}
              className="w-full bg-gray-50 border border-gray-100 text-xs font-black text-gray-900 py-2.5 pl-3 pr-8 rounded-2xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="Tất cả">Tất cả Chuyền</option>
              {lines.map(line => (
                <option key={line} value={line}>{line}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
              <Filter size={12} />
            </div>
          </div>
        </div>

        {/* Search Worker / Operation */}
        <div className="lg:col-span-4 relative">
          <input
            type="text"
            placeholder="Tìm theo tên công nhân, lỗi, công đoạn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-900 py-2.5 pl-9 pr-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-100 placeholder-gray-400"
          />
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Calendar size={14} />
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Checked */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
            <Scissors size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              Sản Phẩm Kiểm Tra
            </span>
            <span className="text-xl font-black text-gray-950 mt-0.5 block">
              {totalChecked.toLocaleString()} <span className="text-xs font-semibold text-gray-400">pcs</span>
            </span>
          </div>
        </div>

        {/* Card 2: Total Defected */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-red-50 text-red-600 rounded-2xl">
            <ShieldAlert size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              Sản Phẩm Sai Hỏng
            </span>
            <span className="text-xl font-black text-gray-950 mt-0.5 block">
              {totalDefects.toLocaleString()} <span className="text-xs font-semibold text-gray-400">pcs</span>
            </span>
          </div>
        </div>

        {/* Card 3: Defect Rate */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
            <BarChart3 size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              Tỷ Lệ Sai Lỗi Trung Bình
            </span>
            <span className={`text-xl font-black mt-0.5 block ${averageDefectRate > 5 ? "text-red-600" : averageDefectRate > 2 ? "text-amber-600" : "text-emerald-600"}`}>
              {averageDefectRate.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Card 4: Critical Defects */}
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
            <Info size={22} />
          </div>
          <div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
              Lỗi Nghiêm Trọng (Critical)
            </span>
            <span className="text-xl font-black text-gray-950 mt-0.5 block">
              {criticalDefectsCount.toLocaleString()} <span className="text-xs font-semibold text-gray-400">pcs</span>
            </span>
          </div>
        </div>
      </div>

      {/* Analytics Reports Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top Worker Defects list: "Ai hay may hư" */}
        <div className="lg:col-span-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[350px]">
          <div>
            <div className="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-red-900 flex items-center gap-1.5">
                🔥 Công Nhân Thường Xuyên May Hư ({workerStatsList.length})
              </h3>
              <span className="text-[10px] text-gray-400 font-bold">Lỗi / Tổng kiểm</span>
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {workerStatsList.map((w, index) => (
                <div key={w.workerId} className="flex flex-col gap-1 p-2 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="bg-white border border-gray-200 text-gray-700 text-[8.5px] font-black px-1.5 py-0.5 rounded shadow-sm">
                        {w.line}
                      </span>
                      <span className="font-bold text-gray-950">
                        {w.workerName} <span className="font-mono text-[10px] text-gray-400">({w.workerCode})</span>
                      </span>
                    </div>
                    <span className="font-black text-red-600">{w.defectCount} lỗi</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1">
                    <div 
                      className={`h-full rounded-full ${w.defectRate > 8 ? "bg-red-600" : w.defectRate > 4 ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, w.defectRate)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                    <span>Đã kiểm: {w.totalChecked} pcs</span>
                    <span>Tỷ lệ lỗi: {w.defectRate.toFixed(1)}%</span>
                  </div>
                </div>
              ))}

              {workerStatsList.length === 0 && (
                <div className="text-center py-12 text-xs text-gray-400 italic">
                  Không có dữ liệu lỗi của công nhân trong thời gian này! 🎉
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Defects by Operation table */}
        <div className="lg:col-span-5 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[350px]">
          <div>
            <div className="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                ✂️ Tỷ Lệ Lỗi Theo Từng Công Đoạn ({operationStatsList.length})
              </h3>
              <span className="text-[10px] text-gray-400 font-bold">Phân tích sai hỏng</span>
            </div>

            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {operationStatsList.map((op) => (
                <div key={op.opId} className="flex flex-col gap-1 p-2 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="bg-white border border-gray-200 text-gray-700 text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded shadow-sm">
                        {op.opCode}
                      </span>
                      <span className="font-bold text-gray-950 truncate" title={op.opName}>
                        {op.opName}
                      </span>
                    </div>
                    <span className="font-black text-indigo-700">{op.defectCount} lỗi</span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden mt-1">
                    <div 
                      className={`h-full rounded-full ${op.defectRate > 8 ? "bg-red-600" : op.defectRate > 4 ? "bg-amber-500" : "bg-indigo-600"}`}
                      style={{ width: `${Math.min(100, op.defectRate)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400 font-bold">
                    <span>Đã kiểm: {op.totalChecked} pcs</span>
                    <span>Tỷ lệ lỗi: {op.defectRate.toFixed(1)}%</span>
                  </div>
                </div>
              ))}

              {operationStatsList.length === 0 && (
                <div className="text-center py-12 text-xs text-gray-400 italic">
                  Không có dữ liệu lỗi theo công đoạn!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Common Defect Types Distribution */}
        <div className="lg:col-span-3 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[350px]">
          <div>
            <div className="flex justify-between items-center border-b border-gray-50 pb-3 mb-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                📊 Phân Loại Các Loại Lỗi
              </h3>
              <span className="text-[10px] text-gray-400 font-bold">Số lượng</span>
            </div>

            <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
              {defectTypeStatsList.map((item, index) => {
                const percent = totalDefects > 0 ? (item.count / totalDefects) * 100 : 0;
                return (
                  <div key={item.type} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-gray-950">{item.type}</span>
                      <span className="font-black text-purple-700">{item.count} pcs <span className="font-normal text-[10px] text-gray-400">({percent.toFixed(0)}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-600 rounded-full" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {defectTypeStatsList.length === 0 && (
                <div className="text-center py-12 text-xs text-gray-400 italic">
                  Trống...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Logs Table / Feed */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-gray-900 flex items-center gap-1.5">
            📝 Danh Sách Phiếu Kiểm Lỗi ({filteredLogs.length})
          </h3>
          <span className="text-[10px] text-gray-400 font-bold">
            Bộ lọc hiện tại đang hiển thị {filteredLogs.length} phiếu
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                <th className="py-3 px-4">Ngày</th>
                <th className="py-3 px-4">Chuyền</th>
                <th className="py-3 px-4">Công nhân</th>
                <th className="py-3 px-4">Công đoạn</th>
                <th className="py-3 px-4 text-center">Đã kiểm</th>
                <th className="py-3 px-4 text-center">Số lỗi</th>
                <th className="py-3 px-4 text-center">Tỷ lệ</th>
                <th className="py-3 px-4">Loại lỗi</th>
                <th className="py-3 px-4">Mức độ</th>
                <th className="py-3 px-4">Ghi chú</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredLogs.map((log) => {
                const workerObj = workers.find(w => w.id === log.workerId);
                const opObj = operations.find(o => o.id === log.operationId);
                const rate = log.totalChecked > 0 ? (log.defectCount / log.totalChecked) * 100 : 0;
                
                return (
                  <tr key={log.id} className="text-xs hover:bg-gray-50/50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-gray-950">
                      {safeFormatDate(log.date, "dd/MM/yyyy")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="bg-gray-100 text-gray-700 text-[10px] font-black px-2 py-0.5 rounded">
                        {log.line}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-gray-900 block">{workerObj?.name || "Lao động ẩn"}</span>
                        <span className="font-mono text-[9px] text-gray-400 font-semibold">{workerObj?.code || "N/A"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-gray-900 block">{opObj?.name || "Công đoạn ẩn"}</span>
                        <span className="font-mono text-[9px] text-gray-400 font-semibold">{opObj?.code || "N/A"}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold text-gray-700">
                      {log.totalChecked} pcs
                    </td>
                    <td className="py-3.5 px-4 text-center font-black text-red-600">
                      {log.defectCount} pcs
                    </td>
                    <td className={`py-3.5 px-4 text-center font-black ${rate > 5 ? "text-red-600" : rate > 2 ? "text-amber-600" : "text-emerald-600"}`}>
                      {rate.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-950">
                      {log.defectType}
                    </td>
                    <td className="py-3.5 px-4">
                      {log.severity === "critical" && (
                        <span className="bg-purple-100 text-purple-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                          Cực kỳ nghiêm trọng
                        </span>
                      )}
                      {log.severity === "moderate" && (
                        <span className="bg-amber-100 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                          Vừa phải
                        </span>
                      )}
                      {log.severity === "mild" && (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                          Nhẹ
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 italic max-w-xs truncate" title={log.notes}>
                      {log.notes || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => handleStartEdit(log)}
                          className="p-1 text-gray-400 hover:text-indigo-600 transition-colors rounded hover:bg-gray-100 cursor-pointer"
                          title="Sửa phiếu"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Bạn có chắc chắn muốn xoá phiếu kiểm lỗi này không?")) {
                              onDeleteLog("qualityLogs", log.id);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors rounded hover:bg-gray-100 cursor-pointer"
                          title="Xoá phiếu"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-gray-400 italic">
                    Không tìm thấy phiếu kiểm lỗi nào phù hợp bộ lọc hiện tại!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Quality Log Dialog */}
      {isOpenModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-indigo-50/40">
              <h3 className="text-sm font-black text-indigo-950 uppercase tracking-wider">
                {isEditing ? "🛡️ Sửa Phiếu Kiểm Lỗi" : "🛡️ Thêm Phiếu Kiểm Lỗi Mới"}
              </h3>
              <button 
                onClick={() => setIsOpenModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
              >
                Đóng ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveLog} className="p-6 space-y-4 flex-1">
              {/* Date */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Ngày Kiểm Tra
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {/* Chuyền */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Chuyền May
                </label>
                <select
                  required
                  value={formLine}
                  onChange={(e) => {
                    setFormLine(e.target.value);
                    setFormWorkerId(""); // Reset worker on line change
                  }}
                  className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">-- Chọn chuyền --</option>
                  {lines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              {/* Công nhân (filtered by chuyền) */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Công Nhân May
                </label>
                <select
                  required
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">-- Chọn công nhân --</option>
                  {workersOnSelectedLine.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code}) - {w.line}
                    </option>
                  ))}
                </select>
                {formLine && workersOnSelectedLine.length === 0 && (
                  <p className="text-[10px] text-amber-600 font-bold mt-1">
                    ⚠️ Không có công nhân nào trong {formLine}! Vui lòng thêm công nhân vào chuyền này trước.
                  </p>
                )}
              </div>

              {/* Công đoạn */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Công Đoạn Kiểm Tra
                </label>
                <select
                  required
                  value={formOperationId}
                  onChange={(e) => setFormOperationId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">-- Chọn công đoạn --</option>
                  {operations.map(op => (
                    <option key={op.id} value={op.id}>
                      {op.name} ({op.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Checked & Defect counts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    Tổng Kiểm Tra (Sản phẩm)
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formTotalChecked}
                    onChange={(e) => setFormTotalChecked(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                    Số Lượng Lỗi (Sản phẩm)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={formDefectCount}
                    onChange={(e) => setFormDefectCount(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Defect Type Preset & Custom */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                      Loại Lỗi Thường Gặp
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddPresetInput(!showAddPresetInput)}
                      className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Plus size={10} /> {showAddPresetInput ? "Đóng" : "Bổ sung lỗi"}
                    </button>
                  </div>
                  {showAddPresetInput && (
                    <div className="flex gap-2 mb-2 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100/40">
                      <input
                        type="text"
                        placeholder="e.g. Sổ chỉ, Lỏng sợi..."
                        value={newCustomPresetInput}
                        onChange={(e) => setNewCustomPresetInput(e.target.value)}
                        className="flex-1 bg-white border border-gray-200 text-xs font-semibold p-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = newCustomPresetInput.trim();
                            if (val) {
                              if (defectTypePresets.includes(val)) {
                                alert("Loại lỗi này đã tồn tại!");
                                return;
                              }
                              const updated = [...customPresets, val];
                              setCustomPresets(updated);
                              localStorage.setItem("custom_defect_types", JSON.stringify(updated));
                              setFormDefectType(val);
                              setNewCustomPresetInput("");
                              setShowAddPresetInput(false);
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = newCustomPresetInput.trim();
                          if (val) {
                            if (defectTypePresets.includes(val)) {
                              alert("Loại lỗi này đã tồn tại!");
                              return;
                            }
                            const updated = [...customPresets, val];
                            setCustomPresets(updated);
                            localStorage.setItem("custom_defect_types", JSON.stringify(updated));
                            setFormDefectType(val);
                            setNewCustomPresetInput("");
                            setShowAddPresetInput(false);
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black px-3 rounded-lg cursor-pointer"
                      >
                        Thêm
                      </button>
                    </div>
                  )}
                  <select
                    value={formDefectType}
                    onChange={(e) => setFormDefectType(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {defectTypePresets.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                {formDefectType === "Khác" && (
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                      Nhập Tên Lỗi Khác
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sổ chỉ, Lỏng sợi..."
                      value={formCustomDefectType}
                      onChange={(e) => setFormCustomDefectType(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                )}
              </div>

              {/* Severity */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1 text-left">
                  Mức Độ Nghiêm Trọng
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setFormSeverity("mild")}
                    className={`py-2 px-3 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                      formSeverity === "mild"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Nhẹ (Mild)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormSeverity("moderate")}
                    className={`py-2 px-3 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                      formSeverity === "moderate"
                        ? "bg-amber-50 border-amber-500 text-amber-800"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Vừa (Moderate)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormSeverity("critical")}
                    className={`py-2 px-3 rounded-xl text-xs font-black cursor-pointer transition-all border ${
                      formSeverity === "critical"
                        ? "bg-purple-50 border-purple-500 text-purple-800"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Nghiêm Trọng
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1">
                  Ghi Chú Chi Tiết / Biện Pháp Khắc Phục
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Yêu cầu công nhân may chậm lại, chỉnh lại lực căng chỉ..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-900 p-2.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-100 placeholder-gray-400"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t border-gray-50">
                <button
                  type="button"
                  onClick={() => setIsOpenModal(false)}
                  className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Huỷ bỏ
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs cursor-pointer shadow-md shadow-indigo-100"
                >
                  {isEditing ? "Cập Nhật Phiếu" : "Lưu Phiếu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quality Report Modal */}
      {isOpenReportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl max-w-4xl w-full max-h-[92vh] overflow-y-auto flex flex-col animate-fade-in">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-emerald-50/40">
              <div className="flex items-center gap-2 text-emerald-950">
                <FileText className="text-emerald-600" size={20} />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Báo Cáo Tổng Hợp Chất Lượng Chi Tiết
                </h3>
              </div>
              <button 
                onClick={() => setIsOpenReportModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold cursor-pointer"
              >
                Đóng ✕
              </button>
            </div>

            {/* Modal Controls / Filters */}
            <div className="bg-gray-50/50 p-4 border-b border-gray-100 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                {/* Period Selector inside Report */}
                <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-2xl border border-gray-150 max-w-xs shadow-sm">
                  <button
                    type="button"
                    onClick={() => setReportPeriod("day")}
                    className={`py-1.5 px-3 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                      reportPeriod === "day" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Ngày
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportPeriod("week")}
                    className={`py-1.5 px-3 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                      reportPeriod === "week" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Tuần
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportPeriod("month")}
                    className={`py-1.5 px-3 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                      reportPeriod === "month" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Tháng
                  </button>
                </div>

                {/* Date Navigator inside Report */}
                <div className="flex items-center justify-between bg-white p-1 rounded-2xl border border-gray-150 min-w-[160px] shadow-sm">
                  <button
                    type="button"
                    onClick={handlePrevReportPeriod}
                    className="p-1.5 hover:bg-gray-50 rounded-xl text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[11px] font-black text-gray-900 truncate px-2">
                    {reportPeriod === "day" && safeFormatDate(reportDate, "dd/MM/yyyy")}
                    {reportPeriod === "week" && `Tuần: ${safeFormatDate(reportDate, "dd/MM/yyyy")}`}
                    {reportPeriod === "month" && `Tháng: ${safeFormatDate(reportDate, "MM/yyyy")}`}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextReportPeriod}
                    className="p-1.5 hover:bg-gray-50 rounded-xl text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Line filter inside report */}
                <select
                  value={reportLine}
                  onChange={(e) => setReportLine(e.target.value)}
                  className="bg-white border border-gray-150 text-[11px] font-black text-gray-900 py-2 px-3 rounded-2xl appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-100 shadow-sm"
                >
                  <option value="Tất cả">Tất cả Chuyền</option>
                  {lines.map(line => (
                    <option key={line} value={line}>{line}</option>
                  ))}
                </select>
              </div>

              {/* Export Quick Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyReportText}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-black px-3 py-2 rounded-xl flex items-center gap-1 transition-all text-xs cursor-pointer shadow-md shadow-amber-100"
                >
                  {copiedSuccess ? <Check size={13} /> : <Clipboard size={13} />}
                  <span>{copiedSuccess ? "Đã sao chép" : "Zalo / Chat"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-3 py-2 rounded-xl flex items-center gap-1 transition-all text-xs cursor-pointer shadow-md shadow-emerald-100"
                >
                  <FileSpreadsheet size={13} />
                  <span>Tải Excel</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-3 py-2 rounded-xl flex items-center gap-1 transition-all text-xs cursor-pointer shadow-md shadow-indigo-100"
                >
                  <Printer size={13} />
                  <span>In báo cáo</span>
                </button>
              </div>
            </div>

            {/* Modal Body: Styled Printable Report Area */}
            <div className="p-6 space-y-6 flex-1">
              <div className="text-center pb-2 border-b border-gray-100">
                <h2 className="text-lg font-black text-gray-900 uppercase">
                  Báo Cáo Tổng Hợp Chất Lượng Đường May
                </h2>
                <p className="text-xs text-gray-500 font-semibold mt-1">
                  Kỳ báo cáo: {reportPeriod === "day" ? `Ngày ${safeFormatDate(reportDate, "dd/MM/yyyy")}` : reportPeriod === "week" ? `Tuần ${safeFormatDate(reportDate, "dd/MM/yyyy")}` : `Tháng ${safeFormatDate(reportDate, "MM/yyyy")}`}
                  &nbsp;&bull;&nbsp; Chuyền: {reportLine === "Tất cả" ? "Tất cả các chuyền" : reportLine}
                </p>
              </div>

              {/* 4 Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-emerald-50/40 border border-emerald-100 p-4 rounded-2xl text-center">
                  <span className="text-[9px] font-black uppercase text-emerald-700 tracking-wider block">
                    Đã Kiểm Tra
                  </span>
                  <span className="text-lg font-black text-emerald-950 mt-1 block">
                    {repTotalChecked.toLocaleString()} <span className="text-[10px] text-emerald-600">pcs</span>
                  </span>
                </div>
                <div className="bg-rose-50/40 border border-rose-100 p-4 rounded-2xl text-center">
                  <span className="text-[9px] font-black uppercase text-rose-700 tracking-wider block">
                    Số Sản Phẩm Lỗi
                  </span>
                  <span className="text-lg font-black text-rose-950 mt-1 block">
                    {repTotalDefects.toLocaleString()} <span className="text-[10px] text-rose-600">pcs</span>
                  </span>
                </div>
                <div className="bg-amber-50/40 border border-amber-100 p-4 rounded-2xl text-center">
                  <span className="text-[9px] font-black uppercase text-amber-700 tracking-wider block">
                    Tỷ Lệ Sai Hỏng
                  </span>
                  <span className="text-lg font-black text-amber-950 mt-1 block">
                    {repAverageDefectRate.toFixed(2)}%
                  </span>
                </div>
                <div className="bg-purple-50/40 border border-purple-100 p-4 rounded-2xl text-center">
                  <span className="text-[9px] font-black uppercase text-purple-700 tracking-wider block">
                    Lỗi Nghiêm Trọng
                  </span>
                  <span className="text-lg font-black text-purple-950 mt-1 block">
                    {repCriticalCount.toLocaleString()} <span className="text-[10px] text-purple-600">pcs</span>
                  </span>
                </div>
              </div>

              {/* Two Column Layout for breakdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Workers with defects */}
                <div className="bg-white border border-gray-150 rounded-2xl p-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-2 mb-3 flex items-center gap-1.5">
                    👷 Top 5 Công Nhân Lỗi Nhiều Nhất
                  </h4>
                  {repWorkerStatsList.length === 0 ? (
                    <p className="text-xs font-medium text-gray-400 text-center py-6">Không phát hiện lỗi trong kỳ</p>
                  ) : (
                    <div className="space-y-2">
                      {repWorkerStatsList.slice(0, 5).map((w, index) => (
                        <div key={w.code} className="flex justify-between items-center p-2 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                          <div>
                            <span className="font-black text-gray-700 mr-2">{index + 1}.</span>
                            <span className="font-bold text-gray-900">{w.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono ml-2">({w.code} - {w.line})</span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-rose-600 block">{w.defectCount} lỗi</span>
                            <span className="text-[9px] text-gray-400 block">{w.defectRate.toFixed(1)}% tỷ lệ</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Defect types distribution */}
                <div className="bg-white border border-gray-150 rounded-2xl p-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-2 mb-3 flex items-center gap-1.5">
                    🧵 Cơ Cấu Các Loại Lỗi Gặp Phải
                  </h4>
                  {repDefectList.length === 0 ? (
                    <p className="text-xs font-medium text-gray-400 text-center py-6">Không có loại lỗi phát sinh</p>
                  ) : (
                    <div className="space-y-2">
                      {repDefectList.slice(0, 5).map((d, index) => {
                        const percent = repTotalDefects > 0 ? (d.count / repTotalDefects) * 100 : 0;
                        return (
                          <div key={d.type} className="text-xs">
                            <div className="flex justify-between font-bold text-gray-800 mb-1">
                              <span>Lỗi: {d.type}</span>
                              <span>{d.count} pcs ({percent.toFixed(1)}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Operations Stats */}
              <div className="bg-white border border-gray-150 rounded-2xl p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-gray-900 border-b border-gray-100 pb-2 mb-3">
                  ✂️ Thống Kê Theo Từng Công Đoạn May
                </h4>
                {repOpStatsList.length === 0 ? (
                  <p className="text-xs font-medium text-gray-400 text-center py-6">Không có công đoạn lỗi</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {repOpStatsList.slice(0, 6).map((o, index) => (
                      <div key={o.code} className="p-2 rounded-xl bg-gray-50 border border-gray-100 text-xs flex justify-between items-center">
                        <div>
                          <span className="font-black text-gray-400 mr-1">#{index + 1}</span>
                          <span className="font-bold text-gray-900">{o.name}</span>
                          <span className="text-[10px] text-gray-400 block mt-0.5">Mã: {o.code}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-indigo-950 block">{o.defectCount} lỗi</span>
                          <span className="text-[9px] text-gray-400 block">{o.defectRate.toFixed(1)}% tỉ lệ</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Detailed entries in the report */}
              <div className="bg-white border border-gray-150 rounded-2xl overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-150">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-900">
                    📜 Danh Sách Phiếu Kiểm Lỗi Trong Kỳ ({reportLogs.length})
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-500 border-b border-gray-150">
                        <th className="p-3">Ngày</th>
                        <th className="p-3">Chuyền</th>
                        <th className="p-3">Công Nhân</th>
                        <th className="p-3">Công Đoạn</th>
                        <th className="p-3">Loại Lỗi</th>
                        <th className="p-3 text-center">Lượng Lỗi / Kiểm</th>
                        <th className="p-3 text-center">Tỷ Lệ Lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center font-semibold text-gray-400">
                            Không tìm thấy phiếu kiểm lỗi nào trong kỳ báo cáo đã chọn.
                          </td>
                        </tr>
                      ) : (
                        reportLogs.map(log => {
                          const w = workers.find(item => item.id === log.workerId);
                          const op = operations.find(item => item.id === log.operationId);
                          const rate = log.totalChecked > 0 ? (log.defectCount / log.totalChecked) * 100 : 0;
                          return (
                            <tr key={log.id} className="hover:bg-gray-50/50">
                              <td className="p-3 font-semibold text-gray-600">{log.date}</td>
                              <td className="p-3 font-black text-gray-900">{log.line}</td>
                              <td className="p-3">
                                <span className="font-bold text-gray-950 block">{w?.name}</span>
                                <span className="text-[9px] font-mono text-gray-400">{w?.code}</span>
                              </td>
                              <td className="p-3">
                                <span className="font-semibold text-gray-800 block">{op?.name}</span>
                                <span className="text-[9px] font-mono text-gray-400">{op?.code}</span>
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  log.severity === "critical"
                                    ? "bg-purple-50 text-purple-700 border border-purple-100"
                                    : log.severity === "moderate"
                                      ? "bg-amber-50 text-amber-700 border border-amber-100"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                }`}>
                                  {log.defectType}
                                </span>
                              </td>
                              <td className="p-3 text-center font-black text-gray-900">
                                {log.defectCount} / {log.totalChecked}
                              </td>
                              <td className="p-3 text-center font-black text-rose-600">
                                {rate.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
              <span className="text-[10px] font-semibold text-gray-400">
                Khởi tạo tự động bởi Hệ Thống May Mặc &bull; {new Date().toLocaleDateString('vi-VN')}
              </span>
              <button
                type="button"
                onClick={() => setIsOpenReportModal(false)}
                className="py-2 px-5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
              >
                Đóng báo cáo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
