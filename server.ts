import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "DUMMY_KEY",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  if (!process.env.GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is not set in environment variables. AI features will fail.");
  }

  // API Route for AI Extraction - Operations
  app.post("/api/extract-operation", async (req, res) => {
    console.log("POST /api/extract-operation - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ." });
    }
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Clean base64 string - remove any whitespace or potential prefix
      const cleanBase64 = typeof image === 'string' 
        ? image.replace(/^data:image\/[a-z]+;base64,/, "").replace(/[\s\r\n]/g, "") 
        : "";

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

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      
      const errorMessage = error.message || "";
      
      if (errorMessage.includes("429") || errorMessage.includes("quota")) {
        return res.status(429).json({ 
          error: "Hệ thống AI đang tạm thời quá tải hoặc hết hạn mức miễn phí (Quota exceeded). Vui lòng thử lại sau ít phút hoặc ngày mai." 
        });
      }

      if (errorMessage.includes("expected pattern")) {
        return res.status(400).json({
          error: "Định dạng hình ảnh không hợp lệ hoặc quá lớn. Vui lòng thử nén ảnh hoặc chụp lại."
        });
      }
      
      res.status(500).json({ error: "Có lỗi xảy ra khi xử lý bằng AI: " + (error.message || "Unknown error") });
    }
  });

  // API Route for AI Extraction - Workers
  app.post("/api/extract-worker", async (req, res) => {
    console.log("POST /api/extract-worker - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ." });
    }
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Clean base64 string
      const cleanBase64 = typeof image === 'string' 
        ? image.replace(/^data:image\/[a-z]+;base64,/, "").replace(/[\s\r\n]/g, "") 
        : "";

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

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      
      const errorMessage = error.message || "";

      if (errorMessage.includes("429") || errorMessage.includes("quota")) {
        return res.status(429).json({ 
          error: "Hệ thống AI đang tạm thời quá tải. Vui lòng thử lại sau ít phút hoặc ngày mai." 
        });
      }

      if (errorMessage.includes("expected pattern")) {
        return res.status(400).json({
          error: "Định dạng hình ảnh không hợp lệ hoặc quá lớn. Vui lòng thử nén ảnh hoặc chụp lại."
        });
      }
      
      res.status(500).json({ error: "Có lỗi xảy ra khi xử lý bằng AI: " + (error.message || "Unknown error") });
    }
  });

  // API Route for AI Extraction - Hourly %EFF Scoreboard
  app.post("/api/extract-efficiency-board", async (req, res) => {
    console.log("POST /api/extract-efficiency-board - Request received");
    if (!process.env.GEMINI_API_KEY) {
      console.error("AI Error: GEMINI_API_KEY is missing from environment");
      return res.status(500).json({ error: "Chưa cấu hình GEMINI_API_KEY trên máy chủ." });
    }
    try {
      const { image, mimeType } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No image provided" });
      }

      // Clean base64 string
      const cleanBase64 = typeof image === 'string' 
        ? image.replace(/^data:image\/[a-z]+;base64,/, "").replace(/[\s\r\n]/g, "") 
        : "";

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

      const result = await ai.models.generateContent({
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
      
      const errorMessage = error.message || "";

      if (errorMessage.includes("429") || errorMessage.includes("quota")) {
        return res.status(429).json({ 
          error: "Hệ thống AI đang tạm thời quá tải. Vui lòng thử lại sau ít phút hoặc ngày mai." 
        });
      }

      if (errorMessage.includes("expected pattern")) {
        return res.status(400).json({
          error: "Định dạng hình ảnh không hợp lệ hoặc quá lớn. Vui lòng thử nén ảnh hoặc chụp lại."
        });
      }
      
      res.status(500).json({ error: "Có lỗi xảy ra khi xử lý bằng AI: " + (error.message || "Unknown error") });
    }
  });

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

startServer();
