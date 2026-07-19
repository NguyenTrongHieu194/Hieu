export interface Worker {
  id: string;
  name: string;
  code: string;
  skills: string[]; // e.g., ["Tra khóa", "Sườn", "Gấu"]
  line: string;
  performance: number; // Percentage
  gender?: 'nam' | 'nữ';
}

export interface Operation {
  id: string;
  name: string;
  code: string;
  style?: string; // Mã hàng liên kết
  sam: number; // Standard Allowed Minutes
  targetPerHour: number;
}

export interface ProductionLog {
  id: string;
  date: string; // ISO Date
  line?: string; // New field for manual entry
  workerId?: string; // Optional for legacy
  operationId?: string; // Optional for legacy
  orderId: string;
  actualQuantity: number;
  hour: number; // Keep for some sorting/chart consistency if needed
  targetQuantity?: number;
}

export interface ProductionOrder {
  id: string;
  customer: string;
  styleName: string;
  job?: string; // New field
  orderQuantity: number;
  producedQuantity: number;
  deadline: string;
  status: 'planning' | 'in_progress' | 'completed';
}

export interface TimeStudyRecord {
  id: string;
  date: string;
  workerId: string;
  operationId: string;
  operationId2?: string; // Optional second operation for merged operations
  style: string;
  times: number[];
  averageTime: number;
  targetPerHour: number;
  targetPerDay: number;
  needsCheck?: boolean;
  needsCheckTimes?: boolean[]; // Marks which sub-times [first, second, third] need checks
}

export interface PlanFeedItem {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string; // base64 representation of uploaded image/file
  fileName?: string;
  fileType?: string;
  fileSize?: string;
  createdAt: string; // ISO date string or formatted date
}

export interface QualityLog {
  id: string;
  date: string; // "yyyy-MM-dd"
  workerId: string;
  operationId: string;
  line: string;
  totalChecked: number; // Total pieces checked
  defectCount: number; // Defective pieces
  defectType: string; // e.g. "Bỏ mũi", "Lệch đường may", etc.
  severity: 'mild' | 'moderate' | 'critical'; // Mild, Moderate, Critical
  notes?: string;
}

