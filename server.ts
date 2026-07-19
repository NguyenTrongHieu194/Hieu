import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

let lastApiKey: string | null = null;
let aiClient: GoogleGenAI | null = null;

function formatAIError(error: any): string {
  const errMsg = String(error?.message || error || "");
  const errStr = JSON.stringify(error) || errMsg;

  if (errStr.includes("API key not valid") || errStr.includes("API_KEY_INVALID") || errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
    return "Khóa API Gemini (GEMINI_API_KEY) của bạn không hợp lệ hoặc chưa chính xác. Vui lòng truy cập Settings (Cấu hình) > Secrets (Bí mật) trên AI Studio, hoặc Environment Variables trên Vercel, tạo một khóa API mới và cập nhật lại.";
  }

  if (errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota") || errStr.includes("limit") || errMsg.includes("quota") || errMsg.includes("limit")) {
    return "Hạn mức (Quota) cuộc gọi API Gemini của bạn hiện tại đã hết hoặc bị giới hạn. Vui lòng nâng cấp tài khoản hoặc thử lại sau ít phút hoặc ngày mai.";
  }

  if (errStr.includes("UNAVAILABLE") || errStr.includes("503") || errStr.includes("overload") || errMsg.includes("overload")) {
    return "Dịch vụ AI hiện đang quá tải hoặc tạm thời không khả dụng. Vui lòng thử lại sau vài giây.";
  }

  return errMsg || "Lỗi không xác định khi kết nối với AI.";
}

function getGoogleGenAI(): GoogleGenAI {
  let apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    apiKey = apiKey.trim();
  }
  console.log("=== DIAGNOSTIC GEMINI_API_KEY ===");
  console.log("Key exists:", !!apiKey);
  console.log("Key length:", apiKey ? apiKey.length : 0);
  console.log("Key prefix (first 6 chars):", apiKey ? apiKey.substring(0, 6) : "none");
  console.log("=================================");

  if (!apiKey) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY trên môi trường máy chủ. Vui lòng cập nhật trong Settings > Secrets trên AI Studio hoặc Project Settings trên Vercel.");
  }
  
  // Validate key pattern so we throw a clean human-readable error instead of "The string did not match the expected pattern"
  if (apiKey.startsWith("AQ.Ab8")) {
    throw new Error(`Khóa GEMINI_API_KEY không đúng định dạng (khóa của bạn bắt đầu bằng 'AQ.Ab8' nhưng khóa Gemini hợp lệ phải bắt đầu bằng 'AIzaSy'). Vui lòng cấu hình lại trong mục Settings -> Secrets.`);
  }

  if (apiKey.length < 10) {
    throw new Error(`Khóa GEMINI_API_KEY không đúng định dạng hoặc quá ngắn. Vui lòng cấu hình lại.`);
  }

  if (!aiClient || lastApiKey !== apiKey) {
    lastApiKey = apiKey;
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function generateContentWithRetry(params: {
  model: string;
  contents: any[];
  config?: any;
}): Promise<any> {
  let lastError: any = null;
  const modelsToTry = [params.model, "gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
  const uniqueModels = Array.from(new Set(modelsToTry.filter(Boolean)));
  
  for (const currentModel of uniqueModels) {
    let attempt = 0;
    const maxRetries = 2;
    while (attempt <= maxRetries) {
      try {
        console.log(`[AI Gen] Dang goi model: ${currentModel} (Thu lan ${attempt + 1}/${maxRetries + 1})`);
        const result = await getGoogleGenAI().models.generateContent({
          ...params,
          model: currentModel,
        });
        return result;
      } catch (err: any) {
        lastError = err;
        
        const errMsg = String(err?.message || err || "");
        const errStr = JSON.stringify(err) || errMsg;
        const errCode = String(err?.status || err?.code || (err?.error && (err?.error?.code || err?.error?.status)) || "");
        
        console.error(`[AI Error] Calling ${currentModel} error on attempt ${attempt + 1}:`, errMsg);
        
        const isHardQuotaLimit = errMsg.includes("current quota") ||
                                 errMsg.includes("plan and billing") ||
                                 errMsg.includes("quota_free_tier") ||
                                 errMsg.includes("daily limit") ||
                                 errMsg.includes("RESOURCE_EXHAUSTED") ||
                                 errMsg.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier") ||
                                 errStr.includes("RESOURCE_EXHAUSTED") ||
                                 errStr.includes("GenerateRequestsPerDayPerProjectPerModel-FreeTier");

        if (isHardQuotaLimit) {
          console.log(`[AI Gen] Model ${currentModel} da het dinh muc/quota. Chuyen ngay sang model fallback ma khong thu lai.`);
          break;
        }

        const isTransient = errMsg.includes("503") || 
                            errMsg.includes("UNAVAILABLE") || 
                            errMsg.includes("429") ||
                            errMsg.includes("overload") ||
                            errMsg.includes("quota") ||
                            errMsg.includes("limit") ||
                            errMsg.includes("high demand") ||
                            errMsg.includes("temporary") ||
                            errMsg.includes("try again later") ||
                            errCode.includes("503") ||
                            errCode.includes("UNAVAILABLE") ||
                            errCode.includes("500") ||
                            errCode.includes("429") ||
                            errStr.includes("503") ||
                            errStr.includes("UNAVAILABLE") ||
                            errStr.includes("429") ||
                            errStr.includes("overload") ||
                            errStr.includes("limit") ||
                            errStr.includes("high demand") ||
                            errStr.includes("temporary");
                            
        if (isTransient && attempt < maxRetries) {
          attempt++;
          const waitTime = 1500 * attempt;
          console.log(`[AI Gen] Gap loi tam thoi (${currentModel}). Dang cho ${waitTime}ms de thu lai (Lan thu ${attempt + 1})...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else {
          console.log(`[AI Gen] Loi khong phai tam thoi hoac da het luot thu lai cho model ${currentModel}. Chuyen doi sang luot thu models khac...`);
          break;
        }
      }
    }
  }
  throw lastError || new Error("Khong the thuc hien yeu cau voi tat ca model va lan thu.");
}


  // API Route for AI Extraction - Operations
  app.post("/api/extract-operation", async (req, res) => {
    console.log("POST /api/extract-operation - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên môi trường máy chủ. Vui lòng thêm biến môi trường này (GEMINI_API_KEY) trong phần thiết lập (Project Settings > Environment Variables) của Vercel." });
    }
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Clean base64 string - safety split and remove whitespace
      let cleanBase64 = typeof image === 'string' ? image : "";
      if (cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }
      cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, "");

      if (!cleanBase64) {
        return res.status(400).json({ error: "Invalid image data" });
      }

      const prompt = `
        You are an industrial engineer in a garment factory. 
        Analyze the attached image or document which contains operation definitions or SAM data.
        Extract the following information for EACH operation found:
        - name: The name of the operation
        - code: The unique code for the operation
        - style: The style name or code (Mã hàng) if present in the document.
        - sam: Standard Allowed Minutes (a number)
        - target: Target per hour (a number)

        Return ONLY a JSON array of objects with these keys: name, code, style, sam, target.
      `;

      const result = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: cleanBase64,
              },
            },
          ],
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                code: { type: Type.STRING },
                style: { type: Type.STRING },
                sam: { type: Type.NUMBER },
                target: { type: Type.NUMBER },
              },
              required: ["name", "code", "sam", "target"],
            },
          },
        }
      });

      let text = result.text || "[]";
      if (typeof text === 'string') {
        text = text.trim();
        // Remove markdown formatting if still present
        if (text.startsWith("```")) {
          text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        }
      }
      
      try {
        const extractedData = typeof text === 'string' ? JSON.parse(text) : text;
        res.json(extractedData);
      } catch (parseError) {
        console.error("JSON Parse Error. Data received:", text);
        res.status(500).json({ error: "Dữ liệu AI trả về không đúng định dạng. Vui lòng thử lại với ảnh rõ nét hơn." });
      }
    } catch (error: any) {
      console.error("AI Extraction Error:", error);
      const friendlyMessage = formatAIError(error);
      res.status(500).json({ error: "Có lỗi xảy ra khi xử lý bằng AI: " + friendlyMessage });
    }
  });

  // API Route for AI Extraction - Workers
  app.post("/api/extract-worker", async (req, res) => {
    console.log("POST /api/extract-worker - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên môi trường máy chủ. Vui lòng thêm biến môi trường này (GEMINI_API_KEY) trong phần thiết lập (Project Settings > Environment Variables) của Vercel." });
    }
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Clean base64 string - safety split and remove whitespace
      let cleanBase64 = typeof image === 'string' ? image : "";
      if (cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }
      cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, "");

      if (!cleanBase64) {
        return res.status(400).json({ error: "Invalid image data" });
      }

      const prompt = `
        You are an HR manager in a garment factory. 
        Analyze the attached image or document which contains a list of workers or employees.
        Extract the following information for EACH worker found:
        - name: The full name of the worker
        - code: The worker ID or code
        - line: The sewing line name (e.g. "Chuyền 1", "Line A"). If not specified per worker, look for a header indicating the line for the whole sheet.
        - skills: A comma-separated list of their sewing skills (e.g. "1 kim, 2 kim, vắt sổ")

        Return ONLY a JSON array of objects with these keys: name, code, line, skills.
      `;

      const result = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: cleanBase64,
              },
            },
          ],
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                code: { type: Type.STRING },
                line: { type: Type.STRING },
                skills: { type: Type.STRING },
              },
              required: ["name", "code", "line", "skills"],
            },
          },
        }
      });

      let text = result.text || "[]";
      if (typeof text === 'string') {
        text = text.trim();
        // Remove markdown formatting if still present
        if (text.startsWith("```")) {
          text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        }
      }
      
      try {
        const extractedData = typeof text === 'string' ? JSON.parse(text) : text;
        res.json(extractedData);
      } catch (parseError) {
        console.error("JSON Parse Error. Data received:", text);
        res.status(500).json({ error: "Dữ liệu AI trả về không đúng định dạng. Vui lòng thử lại với ảnh rõ nét hơn." });
      }
    } catch (error: any) {
      console.error("AI Worker Extraction Error:", error);
      const friendlyMessage = formatAIError(error);
      res.status(500).json({ error: "Có lỗi xảy ra khi xử lý bằng AI: " + friendlyMessage });
    }
  });

  // API Route for AI Extraction - Hourly %EFF Scoreboard
  app.post("/api/extract-efficiency-board", async (req, res) => {
    console.log("POST /api/extract-efficiency-board - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên môi trường máy chủ. Vui lòng thêm biến môi trường này (GEMINI_API_KEY) trong phần thiết lập (Project Settings > Environment Variables) của Vercel." });
    }
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Clean base64 string - safety split and remove whitespace
      let cleanBase64 = typeof image === 'string' ? image : "";
      if (cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }
      cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, "");

      if (!cleanBase64) {
        return res.status(400).json({ error: "Invalid image data" });
      }

      const prompt = `
        You are an industrial engineer in a garment/apparel factory.
        Analyze the attached image of a production tracking whiteboard (Bảng Theo Dõi Năng Suất Giờ / Bảng Kiểm Soát Sản Lượng Giờ).
        
        Extract the following fields carefully:
        - line: The Line or Chuyền identification name/number (e.g. "464"). Look under "LINE" or "CHUYỀN".
        - style: The Style name, Job, or Mã hàng (e.g. "NESS 0351 W/10/022-B"). Look under "STYLE/JOB" or "MÃ HÀNG".
        - sam: The Standard Allowed Minutes (SAM) value (e.g. 8.915, parsed as a decimal Number). Often written near "SAM/NGƯỜI" or "SAM" as something like "8,915/18" or "8.915". If it is written with a comma like "8,915", parse compile it as a decimal 8.915.
        - operators: The number of operators or workers (Số người) currently working (e.g. 18). Oftentimes written as the denominator in "SAM/NGƯỜI" (like "8,915/18" means 18 people) or in a dedicated "NGƯỜI" column. Parsed as an integer Number.
        - hourlyLogs: An array of hourly logging rows. Locate the rows in the main tracking table under "GIỜ GHI" or similar:
          - time: The hour mark or interval (e.g. "08:30", "09:30", etc.)
          - target: The target quantity for that hour (usually under "CHỈ TIÊU" or "TARGET", e.g. 95)
          - actual: The actual quantity produced in that hour (usually under "MAY ĐƯỢC", "SẢN LƯỢNG", or "ACTUAL", e.g. 55)

        Return ONLY a JSON object indicating these details. Ensure numerical fields are parsed as numbers.
      `;

      const result = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: cleanBase64,
              },
            },
          ],
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              line: { type: Type.STRING },
              style: { type: Type.STRING },
              sam: { type: Type.NUMBER },
              operators: { type: Type.NUMBER },
              hourlyLogs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    target: { type: Type.NUMBER },
                    actual: { type: Type.NUMBER },
                  },
                  required: ["time", "actual"],
                },
              },
            },
            required: ["line", "style", "sam", "operators", "hourlyLogs"],
          },
        }
      });

      let text = result.text || "{}";
      if (typeof text === 'string') {
        text = text.trim();
        // Remove markdown formatting if still present
        if (text.startsWith("```")) {
          text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
        }
      }
      
      try {
        const extractedData = typeof text === 'string' ? JSON.parse(text) : text;
        res.json(extractedData);
      } catch (parseError) {
        console.error("JSON Parse Error. Data received:", text);
        res.status(500).json({ error: "Dữ liệu AI trả về không đúng định dạng. Vui lòng thử lại với ảnh rõ nét hơn." });
      }
    } catch (error: any) {
      console.error("AI Efficiency Board Extraction Error:", error);
      const friendlyMessage = formatAIError(error);
      res.status(500).json({ error: "Có lỗi xảy ra khi xử lý bằng AI: " + friendlyMessage });
    }
  });

  // API Route for Gemini Chat with File and action Proposals
  app.post("/api/gemini/chat", async (req, res) => {
    console.log("POST /api/gemini/chat - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên môi trường máy chủ. Vui lòng thêm biến môi trường này (GEMINI_API_KEY) trong phần thiết lập (Project Settings > Environment Variables) của Vercel." });
    }

    try {
      const { message, history, file, context } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Safeguard current context metadata
      const workersCount = context?.workersCount || 0;
      const operationsCount = context?.operationsCount || 0;
      const ordersCount = context?.ordersCount || 0;
      const logsCount = context?.logsCount || 0;
      const linesList = context?.lines || [];
      const workersSample = context?.workersSample || [];
      const ordersSample = context?.ordersSample || [];
      const operationsSample = context?.operationsSample || [];

      // Construct dynamic system instructions loaded with immediate Firestore counts/data
      const systemInstruction = `
Bạn là "Trợ lý ảo AI Garment Ops" - Chuyên gia thông thái về thiết kế định mức, kỹ thuật công nghiệp (IE), tính toán năng suất và chuyển đổi số quy trình may mặc.
Nhiệm vụ chính: Giải đáp thắc mắc, phân tích hình ảnh/tài liệu đính kèm, tư vấn bố trí chuyền và thực hiện trực tiếp yêu cầu của người dùng bằng hành động thực tế.

HỆ THỐNG ĐANG QUẢN LÝ DỮ LIỆU ĐANG CHẠY:
----------------------------------------
- Số công nhân trên chuyền: ${workersCount} người.
- Số công đoạn đã thiết lập: ${operationsCount} công đoạn.
- Số đơn hàng/kế hoạch sản xuất: ${ordersCount} đơn hàng.
- Số bản ghi tiến độ sản lượng: ${logsCount} bản ghi.
- Danh sách chuyền hoạt động: ${JSON.stringify(linesList)}
- Danh sách công nhân hiện tại: ${JSON.stringify(workersSample)}
- Danh sách các đơn hàng hiện có: ${JSON.stringify(ordersSample)}
- Danh sách các công đoạn nổi bật: ${JSON.stringify(operationsSample)}
----------------------------------------

KHI NGƯỜI DÙNG YÊU CẦU THỰC HIỆN HÀNH ĐỘNG THAY ĐỔI DỮ LIỆU (ví dụ: "thêm công nhân", "tạo đơn hàng polo", "thêm công đoạn tra khóa", "ghi nhận chuyền 1 may được 100 cái", ...):
Bạn hãy phân tích mục đích của họ thật chính xác, tư vấn ngắn gọn bằng ngôn ngữ tiếng Việt lịch sự, đồng thời BẮT BUỘC phải tạo ra danh sách các hành động có cấu trúc dạng JSON và đính kèm ở NHỮNG DÒNG CUỐI CÙNG của câu trả lời của bạn, kẹp chính xác ở giữa thẻ viết hoa:

\`\`\`actions
[
  {
    "type": "add_worker",
    "data": { "name": "Nguyễn Văn A", "code": "CN105", "line": "Chuyền 1", "skills": "Vắt sổ, Tra khóa" }
  }
]
\`\`\`

Dưới đây là danh sách đặc tả các loại hành động được hỗ trợ:

1. "add_worker" (Thêm công nhân mới):
   - name: string (bắt buộc)
   - code: string (mã công nhân dạng CNxxx, ví dụ "CN302", hãy tự tăng số ngẫu nhiên nếu không điền)
   - line: string (chuyền làm việc, ví dụ: "Chuyền 1", "Chuyền 2". Luôn khớp với danh sách chuyền đang có hoặc tạo mới)
   - skills: string (danh sách kỹ năng phẩy ngăn cách, ví dụ: "1 kim, Vắt sổ, Xuống gấu")

2. "add_operation" (Thêm công đoạn kỹ thuật):
   - name: string (bài viết tên công đoạn, ví dụ: "Tra khóa chính", bắt buộc)
   - code: string (mã công đoạn ví dụ "CD102", tự sinh dạng CDxxx nếu không có)
   - sam: number (số phút chu kỳ may tiêu chuẩn, số thực, ví dụ: 0.85). Nếu người dùng nói "1.2 phút", sam = 1.2. Mặc định: 1.0.
   - targetPerHour: number (sản lượng mục tiêu một giờ, tự động tính bằng Math.round(60 / sam) nếu không điền)
   - style: string (mã hàng liên kết nếu có, ví dụ "Polo 01")

3. "add_order" (Tạo kế hoạch/đơn hàng sản xuất):
   - customer: string (Khách hàng đặt hàng, ví dụ: "Uniqlo", mặc định "Khách lẻ")
   - styleName: string (Kiểu dáng/Mã hàng, bắt buộc, ví dụ: "Sơ mi dài tay")
   - job: string (Chi tiết công việc ví dụ "May sơ mi trơn măng sét")
   - orderQuantity: number (Số lượng đơn đặt hàng cần may, số nguyên, mặc định: 1000)
   - deadline: string (Ngày hạn giao hàng dạng YYYY-MM-DD, mặc định lấy ngày hôm nay cộng 15 ngày, ví dụ: "2026-06-20")

4. "add_log" (Ghi nhận sản lượng tiến độ theo giờ):
   - date: string (Ngày ghi nhận dạng YYYY-MM-DD, mặc định ngày hôm nay)
   - line: string (Mã chuyền may ghi nhận sản lượng, ví dụ: "Chuyền 1")
   - orderId: string (ID của đơn hàng từ danh sách các đơn hàng hiện có ở trên. Hãy chọn khớp chính xác ID nếu tên mã hàng người dùng nói trùng khớp, ví dụ 'X8Kws9df')
   - actualQuantity: number (sản lượng may được thực tế, ví dụ: 85, số nguyên)
   - hour: number (Giờ làm việc ghi nhận, số nguyên biểu thị ca giờ từ 1-24, ví dụ: 9)

LƯU Ý VỀ TỆP ĐÍNH KÈM:
- Nếu người dùng đính kèm hình ảnh hoặc tài liệu, hãy phân tích kỹ nội dung, số liệu trong tệp để phản hồi tốt nhất hoặc tạo hành động đề xuất đúng đắn nhất.

NẾU NGƯỜI DÙNG CHỈ HỎI ĐÁP THƯỜNG (ví dụ: "Ai đạt hiệu suất cao nhất?", "Năng suất chuyền 1 hôm nay ra sao?", "Kỹ thuật IE là gì?", "Chào bạn", ...):
Bạn chỉ cần phân tích giải đáp trực quan, phân tích sâu sắc, thân thiện và KHÔNG kèm theo khối \`\`\`actions ở cuối.

Hãy giữ vững tinh thần giúp việc hiệu quả, chuyên nghiệp, luôn hỗ trợ giải quyết vấn đề thực tế sản xuất tối đa!
`;

      const contents: any[] = [];

      // Append chat history formatted to Gemini requirements
      if (history && Array.isArray(history)) {
        history.forEach((h: any) => {
          if (h.role && h.parts && Array.isArray(h.parts)) {
            contents.push({
              role: h.role,
              parts: h.parts.map((p: any) => ({ text: p.text })),
            });
          }
        });
      }

      // Add actual current message multipart structure (message + potential file)
      const parts: any[] = [{ text: message }];

      if (file && file.data) {
        let cleanBase64 = file.data;
        if (cleanBase64.includes(",")) {
          cleanBase64 = cleanBase64.split(",")[1];
        }
        cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, "");

        if (cleanBase64) {
          parts.push({
            inlineData: {
              mimeType: file.mimeType || "image/jpeg",
              data: cleanBase64,
            },
          });
        }
      }

      contents.push({
        role: "user",
        parts: parts,
      });

      console.log("[AI Chat] Dang truy quan cuoc hoi thoai voi model gemini-3.5-flash");
      const result = await generateContentWithRetry({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.25, // Slightly lower temp for highly reliable actions extraction
        },
      });

      const responseText = result.text || "";
      res.json({ text: responseText });
    } catch (err: any) {
      console.error("AI Chat API Error:", err);
      const friendlyMessage = formatAIError(err);
      res.status(500).json({ error: "Có lỗi xảy ra khi trò chuyện với AI: " + friendlyMessage });
    }
  });

  // Export app as default for Serverless Environments (Vercel)
  export default app;

  // Only bind port and run file server if not on Vercel serverless functions
  if (!process.env.VERCEL) {
    async function startLocalServer() {
      // Vite middleware for development
      if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => {
          res.sendFile(path.join(distPath, "index.html"));
        });
      }

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }

    startLocalServer();
  }
