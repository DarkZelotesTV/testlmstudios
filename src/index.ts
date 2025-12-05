import { LMStudioClient, tool } from "@lmstudio/sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";
import os from "os";

// --- KONFIGURATION ---
const SD_API_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img";
// Wir speichern die Bilder im "Bilder/LM Studio Output" Ordner des Benutzers
const OUTPUT_DIR = path.join(os.homedir(), "Pictures", "LM Studio Output");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Tool-Definition (Was kann das Plugin?)
const sdTool = tool({
  name: "generate_image",
  description: "Generates an image using a local Stable Diffusion server. Call this whenever the user wants to visualize something.",
  parameters: {
    prompt: z.string().describe("Highly detailed, descriptive prompt for the image generation (English). Include style, lighting, and mood."),
  },
  implementation: async ({ prompt }) => {
    console.log(`🎨 [SD-Bridge] Generiere Bild für: "${prompt}"...`);
    try {
      const imagePath = await callStableDiffusion(prompt);
      return `SUCCESS: Image generated. Tell the user it is saved at: ${imagePath}`;
    } catch (error) {
      console.error("Fehler:", error);
      return `ERROR: Could not generate image. Is Stable Diffusion running with --api? Details: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// 2. Hauptfunktion (Plugin Registrierung)
async function main() {
  const client = new LMStudioClient();
  console.log("🔌 [SD-Bridge] Verbinde mit LM Studio...");

  try {
    // Der "as any" Trick umgeht die strikten Typ-Checks der Beta-Version,
    // sendet aber genau das, was der Server erwartet (runner, owner, etc.).
    await client.plugins.registerDevelopmentPlugin({
      manifest: {
        name: "sd-bridge",
        displayName: "Stable Diffusion Bridge",
        description: "Generiert Bilder lokal via Automatic1111",
        
        // Die Pflichtfelder für LM Studio 0.3.x:
        type: "plugin",
        runner: "ecmascript",
        owner: "localuser", 
      } as any,
      
      tools: [sdTool],
    });

    console.log("✅ [SD-Bridge] Erfolgreich registriert!");
    console.log(`📂 Speicherort: ${OUTPUT_DIR}`);
    console.log("👉 Schau jetzt in LM Studio in die rechte Sidebar (Puzzleteil/Tools) und aktiviere 'Stable Diffusion Bridge'.");

  } catch (error) {
    console.error("❌ Registrierungs-Fehler:", error);
  }
}

// 3. API Helper (Kommunikation mit Automatic1111)
async function callStableDiffusion(prompt: string): Promise<string> {
  const payload = {
    prompt: prompt,
    negative_prompt: "ugly, blurry, low quality, deformed, watermark, text, signature",
    steps: 25,
    width: 512,
    height: 512,
    cfg_scale: 7,
    sampler_name: "Euler a"
  };

  const response = await fetch(SD_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`SD API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { images: string[] };
  const base64Image = data.images[0];
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `SD_${timestamp}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);
  
  const buffer = Buffer.from(base64Image, "base64"); 
  fs.writeFileSync(filepath, buffer);
  
  console.log(`💾 Bild gespeichert: ${filepath}`);
  return filepath;
}

main().catch(console.error);
