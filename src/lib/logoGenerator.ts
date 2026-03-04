import { GoogleGenAI } from "@google/genai";

export async function generateLogo() {
  const apiKey = (process.env as any).API_KEY || process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: [
        {
          text: "A high-resolution, professional 4K technology logo for 'SecureGC'. On the left, there is a stylized icon combining a lock and a shield in vibrant blue and teal gradients. To the right, the text 'SECUREGC' in a bold, modern, high-contrast dark blue sans-serif font. The letter 'G' in 'SECUREGC' is uniquely integrated into a dark blue shield icon that matches the height of the text. The background must be perfectly transparent. The final output should be sharp, clean, and suitable for a high-end security application.",
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "4K"
      }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}
