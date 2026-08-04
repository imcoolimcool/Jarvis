import { Router } from "express";
import transcribeRouter from "./transcribe";
import chatRouter from "./chat";
import speakRouter from "./speak";
import conversationsRouter from "./conversations";
import settingsRouter from "./settings";
import memoriesRouter from "./memories";
import gmailRouter from "./gmail";
import spotifyRouter from "./spotify";
import browseRouter from "./browse";
import generateImageRouter from "./generate-image";
import codeRouter from "./code";
import researchRouter from "./research";
import pushRouter from "./push";
import llmKeysRouter from "./llm-keys";
import terminalRouter from "./terminal";
import verifyRouter from "./verify";

const router = Router();

router.use(conversationsRouter);
router.use(settingsRouter);
router.use(memoriesRouter);
router.use(transcribeRouter);
router.use(chatRouter);
router.use(speakRouter);
router.use(gmailRouter);
router.use(spotifyRouter);
router.use("/browse", browseRouter);
router.use(generateImageRouter);
router.use(codeRouter);
router.use(researchRouter);
router.use(pushRouter);
router.use(llmKeysRouter);
router.use(terminalRouter);
router.use(verifyRouter);

export default router;
