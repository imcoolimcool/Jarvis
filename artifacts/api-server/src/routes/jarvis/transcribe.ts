import { Router } from "express";
import multer from "multer";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { randomUUID } from "crypto";
import { jarvisConfig } from "../../config/jarvis.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const GRPC_SERVER = "grpc.nvcf.nvidia.com:443";
// FLAC = 2 per riva_audio.proto AudioEncoding enum
const AUDIO_ENCODING_FLAC = 2;

/** Resolve the proto directory whether CWD is the package root or the workspace root. */
function getProtoDir(): string {
  const fromPackage = path.resolve(process.cwd(), "src/proto");
  if (existsSync(fromPackage)) return fromPackage;
  return path.resolve(process.cwd(), "artifacts/api-server/src/proto");
}

function buildRivaClient(): any {
  const protoDir = getProtoDir();
  const protoPath = path.join(protoDir, "riva/proto/riva_asr.proto");

  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    includeDirs: [protoDir],
  });

  const descriptor = grpc.loadPackageDefinition(packageDef) as any;
  const RivaSpeechRecognition =
    descriptor.nvidia.riva.asr.RivaSpeechRecognition;

  const creds = grpc.credentials.createSsl();
  return new RivaSpeechRecognition(GRPC_SERVER, creds);
}

/** Convert any browser audio (webm/opus, wav, ogg) to 16 kHz mono FLAC via ffmpeg. */
async function convertToFlac(
  inputBuffer: Buffer,
  mimeType: string,
): Promise<Buffer> {
  const id = randomUUID();
  const ext = mimeType.includes("wav")
    ? "wav"
    : mimeType.includes("ogg")
      ? "ogg"
      : "webm";
  const inputPath = path.join(tmpdir(), `jarvis-in-${id}.${ext}`);
  const outputPath = path.join(tmpdir(), `jarvis-out-${id}.flac`);

  await writeFile(inputPath, inputBuffer);

  await new Promise<void>((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-i", inputPath, "-ar", "16000", "-ac", "1", "-y", outputPath],
      (_err, _stdout, stderr) => {
        if (_err) reject(new Error(`ffmpeg conversion failed: ${stderr}`));
        else resolve();
      },
    );
  });

  const flacBuffer = await readFile(outputPath);
  await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  return flacBuffer;
}

/** Call NVIDIA Riva Whisper via gRPC over NVCF. */
function transcribeWithRiva(
  client: any,
  audioBuffer: Buffer,
  apiKey: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    metadata.add("function-id", jarvisConfig.whisperFunctionId);
    metadata.add("authorization", `Bearer ${apiKey}`);

    const request = {
      config: {
        encoding: AUDIO_ENCODING_FLAC,
        sample_rate_hertz: 16000,
        language_code: "en-US",
        enable_automatic_punctuation: true,
        model: "whisper-large-v3",
      },
      audio: audioBuffer,
    };

    client.Recognize(
      request,
      metadata,
      (err: grpc.ServiceError | null, response: any) => {
        if (err) {
          reject(err);
        } else {
          const transcript =
            response?.results?.[0]?.alternatives?.[0]?.transcript ?? "";
          resolve(transcript);
        }
      },
    );
  });
}

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No audio file provided" });
    return;
  }

  const apiKey = process.env["OPENAI_WHISPER_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_WHISPER_API_KEY is not set" });
    return;
  }

  try {
    const mimeType = req.file.mimetype || "audio/webm";

    req.log.info(
      { mimeType, size: req.file.size },
      "Converting audio to FLAC for Riva",
    );
    const flacBuffer = await convertToFlac(req.file.buffer, mimeType);

    req.log.info(
      { flacBytes: flacBuffer.length },
      "Sending to NVIDIA Riva via gRPC",
    );
    const client = buildRivaClient();
    const transcript = await transcribeWithRiva(client, flacBuffer, apiKey);

    req.log.info({ transcript }, "Transcription complete");
    res.json({ transcript });
  } catch (err) {
    req.log.error({ err }, "Whisper/Riva transcription failed");
    res.status(500).json({ error: "Transcription failed. Please try again." });
  }
});

export default router;
